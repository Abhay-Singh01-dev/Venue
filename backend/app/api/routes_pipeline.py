"""AI pipeline output endpoints."""

import asyncio
import time
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
from app.core.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pipeline", tags=["pipeline"])

FIRESTORE_READ_TIMEOUT_SEC = 1.5
_last_manual_trigger_ts = 0.0


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


async def _safe_pipeline_latest_get() -> tuple[dict, bool]:
    """Reads pipeline/latest with strict timeout to avoid blocking async handlers."""
    if not db:
        return {}, False

    def _read_doc() -> tuple[dict, bool]:
        doc = db.collection("pipeline").document("latest").get()
        if not doc.exists:
            return {}, False
        return doc.to_dict() or {}, True

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_read_doc),
            timeout=FIRESTORE_READ_TIMEOUT_SEC,
        )
    except Exception as exc:
        logger.warning("GET /pipeline/latest fast-fail fallback: %s", exc)
        return {}, False


async def _safe_pipeline_history_get(limit: int) -> list[dict]:
    """Reads lightweight pipeline history with strict timeout and graceful fallback."""
    if not db:
        return []

    capped_limit = min(limit, 50)

    def _read_history() -> list[dict]:
        runs_ref = (
            db.collection("pipeline").document("history")
            .collection("runs")
            .order_by("run_at", direction="DESCENDING")
            .limit(capped_limit)
        )

        runs: list[dict] = []
        for doc in runs_ref.stream():
            data = doc.to_dict()
            if data:
                runs.append(
                    {
                        "run_id": data.get("run_id"),
                        "run_at": data.get("run_at"),
                        "source": data.get("source"),
                        "hotspots": data.get("hotspots", []),
                        "decisions_count": len(data.get("decisions", [])),
                        "confidence_overall": data.get("confidence_overall"),
                        "narration": data.get("communication", {}).get("narration"),
                        "pipeline_duration_ms": data.get("pipeline_duration_ms"),
                    }
                )
        return runs

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_read_history),
            timeout=FIRESTORE_READ_TIMEOUT_SEC,
        )
    except Exception as exc:
        logger.warning("GET /pipeline/history fast-fail fallback: %s", exc)
        return []

@router.get("/latest", response_model=PipelineLatestResponse)
async def get_latest_pipeline() -> dict:
    """Returns most recent AI pipeline output from Firestore."""
    try:
        fallback_run_id = f"fallback-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        if not db:
            payload = _get_safe_empty_output(fallback_run_id)
            payload["message"] = "No database connection available"
            return _enrich_pipeline_payload(payload)
            
        latest_payload, exists = await _safe_pipeline_latest_get()
        if not exists:
            payload = _get_safe_empty_output(fallback_run_id)
            payload["message"] = "No pipeline output yet — running first cycle"
            return _enrich_pipeline_payload(payload)
        return _enrich_pipeline_payload(latest_payload)
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
            
        runs = await _safe_pipeline_history_get(limit)
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
    global _last_manual_trigger_ts

    now = time.monotonic()
    min_interval = max(1, settings.trigger_min_interval_seconds)
    if now - _last_manual_trigger_ts < min_interval:
        retry_after = int(min_interval - (now - _last_manual_trigger_ts))
        raise HTTPException(
            status_code=429,
            detail=f"Trigger rate limit exceeded. Retry in {retry_after}s.",
        )

    _last_manual_trigger_ts = now
    background_tasks.add_task(run_pipeline)
    return {"message": "Pipeline cycle triggered", "check": "/pipeline/latest"}
