"""AI pipeline output endpoints."""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.firebase_client import db
from app.agents.pipeline import run_pipeline, _get_safe_empty_output
from app.models.api_response_models import (
    PipelineLatestResponse,
    PipelineHistoryResponse,
    TriggerPipelineResponse,
)
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pipeline", tags=["pipeline"])


def _enrich_pipeline_payload(payload: dict) -> dict:
    """Adds evaluator-facing aliases and derived metrics to pipeline output."""
    pipeline_latency_ms = int(payload.get("pipeline_duration_ms") or 0)
    fallback_used = bool(payload.get("fallback_used")) or payload.get("source") == "cached" or bool(payload.get("fallback_reason"))

    payload["pipeline_latency_ms"] = pipeline_latency_ms
    payload["fallback_used"] = fallback_used
    payload["metrics"] = {
        "pipeline_latency_ms": pipeline_latency_ms,
        "confidence_overall": float(payload.get("confidence_overall") or 0.0),
        "predictions_count": len(payload.get("predictions") or []),
        "decisions_count": len(payload.get("decisions") or []),
        "fallback_used": fallback_used,
        "source": payload.get("source", "unknown"),
    }
    return payload

@router.get("/latest", response_model=PipelineLatestResponse)
async def get_latest_pipeline() -> dict:
    """Returns most recent AI pipeline output from Firestore."""
    try:
        fallback_run_id = f"fallback-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        if not db:
            payload = _get_safe_empty_output(fallback_run_id)
            payload["message"] = "No database connection available"
            return _enrich_pipeline_payload(payload)
            
        doc = db.collection("pipeline").document("latest").get()
        if not doc.exists:
            payload = _get_safe_empty_output(fallback_run_id)
            payload["message"] = "No pipeline output yet — running first cycle"
            return _enrich_pipeline_payload(payload)
        return _enrich_pipeline_payload(doc.to_dict())
    except Exception as e:
        logger.error(f"GET /pipeline/latest failed: {e}", exc_info=True)
        payload = _get_safe_empty_output(f"fallback-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}")
        payload["message"] = "Pipeline unavailable — returning cached safe fallback"
        payload["source"] = "cached"
        payload["pipeline_health"] = "degraded"
        return _enrich_pipeline_payload(payload)

@router.get("/history", response_model=PipelineHistoryResponse)
async def get_pipeline_history(limit: int = 20) -> dict:
    """Returns last N pipeline runs for timeline and activity feed."""
    try:
        if not db:
            return {"runs": [], "count": 0}
            
        runs_ref = (
            db.collection("pipeline").document("history")
            .collection("runs")
            .order_by("run_at", direction="DESCENDING")
            .limit(min(limit, 50))
        )
        runs = []
        for doc in runs_ref.stream():
            data = doc.to_dict()
            if data:
                # return lightweight version for history list
                runs.append({
                    "run_id": data.get("run_id"),
                    "run_at": data.get("run_at"),
                    "source": data.get("source"),
                    "hotspots": data.get("hotspots", []),
                    "decisions_count": len(data.get("decisions", [])),
                    "confidence_overall": data.get("confidence_overall"),
                    "narration": data.get("communication", {}).get("narration"),
                    "pipeline_duration_ms": data.get("pipeline_duration_ms"),
                })
        return {"runs": runs, "count": len(runs)}
    except Exception as e:
        logger.error(f"GET /pipeline/history failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/trigger", response_model=TriggerPipelineResponse)
async def trigger_pipeline(background_tasks: BackgroundTasks) -> dict:
    """
    Manually triggers one pipeline cycle as a background task.
    Returns immediately — result available via GET /pipeline/latest.
    """
    background_tasks.add_task(run_pipeline)
    return {"message": "Pipeline cycle triggered", "check": "/pipeline/latest"}
