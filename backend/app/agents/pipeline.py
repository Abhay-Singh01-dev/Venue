"""
Main AI pipeline orchestrator. Chains all 4 agents sequentially,
handles fallback state, tracks action impacts, and writes outputs
to Firestore. Runs every 30 seconds via APScheduler.
"""

import time
import uuid
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime, timezone
from typing import Optional

from app.firebase_client import db
from app.agents.agent_analyst import run_analyst
from app.agents.agent_predictor import run_predictor
from app.agents.agent_decision import run_decision
from app.agents.agent_communicator import run_communicator
from app.services.bigquery_service import log_pipeline_metrics_to_bigquery
from app.services.cloud_storage_service import write_pipeline_snapshot_to_gcs
from app.services.pubsub_service import publish_pipeline_completed_event

logger = logging.getLogger(__name__)
_firestore_executor = ThreadPoolExecutor(max_workers=4)
_firestore_timeout_sec = 2.0

# Module-level state — last successful output for fallback and impact tracking
_last_successful_output: Optional[dict] = None
_previous_decisions: list[dict] = []
_active_alerts: set[str] = set()


def _run_firestore_call_with_timeout(func, fallback):
    """Executes blocking Firestore SDK calls with a strict timeout."""
    future = _firestore_executor.submit(func)
    try:
        return future.result(timeout=_firestore_timeout_sec)
    except FuturesTimeoutError:
        logger.warning(
            {
                "event": "pipeline_firestore_timeout",
                "component": "pipeline",
                "timeout_seconds": _firestore_timeout_sec,
            }
        )
        return fallback
    except Exception as e:
        logger.warning(
            {
                "event": "pipeline_firestore_call_failed",
                "component": "pipeline",
                "error": str(e),
            }
        )
        return fallback


def _get_zone_states_from_firestore() -> list[dict]:
    """Reads all current zone states from Firestore sorted by occupancy."""
    if not db:
        return []

    try:
        def _read_zones() -> list[dict]:
            zones_ref = db.collection("zones").stream()
            out = []
            for doc in zones_ref:
                data = doc.to_dict()
                if data:
                    out.append(data)
            return out

        zones = _run_firestore_call_with_timeout(_read_zones, [])

        zones.sort(key=lambda z: z.get("occupancy_pct", 0), reverse=True)
        logger.debug({"event": "pipeline_zone_read", "component": "pipeline", "zones": len(zones)})
        return zones
    except Exception as e:
        logger.warning(
            {
                "event": "pipeline_zone_read_failed",
                "component": "pipeline",
                "error": str(e),
            }
        )
        return []


def _get_phase_status_from_firestore() -> dict:
    """Reads current simulation phase status from Firestore."""
    if not db:
        return {"phase": "unknown"}

    try:
        def _read_phase() -> dict:
            doc = db.collection("simulation").document("status").get()
            return doc.to_dict() if doc.exists else {"phase": "unknown"}

        return _run_firestore_call_with_timeout(_read_phase, {"phase": "unknown"})
    except Exception as e:
        logger.warning(
            {
                "event": "pipeline_phase_read_failed",
                "component": "pipeline",
                "error": str(e),
            }
        )
        return {"phase": "unknown"}


def _calculate_action_impacts(current_zones: list[dict]) -> list[dict]:
    """Compares current zone states against previous cycle decisions."""
    global _previous_decisions
    impacts = []
    zone_map = {z["zone_id"]: z for z in current_zones}
    
    for decision in _previous_decisions:
        zone_id = decision.get("target_zone")
        if zone_id and zone_id in zone_map:
            current_pct = zone_map[zone_id].get("occupancy_pct", 0)
            before_pct = decision.get("_before_pct", current_pct)
            change = before_pct - current_pct
            
            if change > 2:  # Measurable improvement
                impacts.append({
                    "action_instruction": decision.get("instruction", ""),
                    "target_zone": zone_id,
                    "before_pct": round(before_pct, 1),
                    "after_pct": round(current_pct, 1),
                    "change_pct": round(change, 1),
                    "resolved": current_pct < 80,
                    "resolved_at": datetime.now(timezone.utc).isoformat(),
                })
    
    return impacts


def _write_pipeline_output(output: dict) -> None:
    """
    Writes complete pipeline output to Firestore with retry loop.
    Creates deduplicated alerts.
    """
    if not db:
        logger.warning({"event": "pipeline_write_skipped", "component": "pipeline", "reason": "no_database"})
        return
        
    batch = db.batch()
    
    latest_ref = db.collection("pipeline").document("latest")
    batch.set(latest_ref, output)
    
    history_ref = db.collection("pipeline").document("history")\
                    .collection("runs").document(output["run_id"])
    batch.set(history_ref, output)
    
    # Create alerts strictly deduplicating by threshold crossing
    for pred in output.get("predictions", []):
        zone_id = pred["zone_id"]
        pred_pct = pred.get("predicted_pct", 0)
        
        if pred_pct >= 90:
            if zone_id not in _active_alerts:
                alert_ref = db.collection("alerts").document()
                batch.set(alert_ref, {
                    "alert_id": alert_ref.id,
                    "zone_id": zone_id,
                    "zone_name": pred.get("zone_name", zone_id),
                    "severity": "critical",
                    "occupancy_pct": pred_pct,
                    "message": f"{pred.get('zone_name')} predicted at {pred_pct:.0f}% in 10 minutes",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "resolved": False,
                })
                _active_alerts.add(zone_id)
        else:
            if zone_id in _active_alerts and pred_pct < 80:
                _active_alerts.remove(zone_id)
    
    # Commit with retry logic
    committed = False
    for attempt in range(3):
        try:
            batch.commit()
            committed = True
            break
        except Exception as e:
            logger.error(
                {
                    "event": "pipeline_commit_retry",
                    "component": "pipeline",
                    "attempt": attempt + 1,
                    "max_attempts": 3,
                    "error": str(e),
                }
            )
            time.sleep(1)
    else:
        logger.critical({"event": "pipeline_commit_failed", "component": "pipeline", "max_attempts": 3})

    if committed:
        bigquery_logged = log_pipeline_metrics_to_bigquery(output)
        storage_logged = write_pipeline_snapshot_to_gcs(output)
        downstream_pointer = None
        if storage_logged:
            downstream_pointer = f"gcs://pipeline_snapshots/{output.get('run_id', 'unknown')}.json"
        pubsub_logged = publish_pipeline_completed_event(output, downstream_pointer)
        logger.debug(
            {
                "event": "pipeline_bigquery_export",
                "component": "pipeline",
                "run_id": output.get("run_id"),
                "success": bigquery_logged,
            }
        )
        logger.debug(
            {
                "event": "pipeline_storage_snapshot",
                "component": "pipeline",
                "run_id": output.get("run_id"),
                "success": storage_logged,
            }
        )
        logger.debug(
            {
                "event": "pipeline_pubsub_publish",
                "component": "pipeline",
                "run_id": output.get("run_id"),
                "success": pubsub_logged,
                "downstream_evidence_pointer": downstream_pointer,
            }
        )
        
    logger.debug({"event": "pipeline_write_complete", "component": "pipeline", "run_id": output.get("run_id")})
    
    from app.websocket.manager import manager
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(manager.broadcast_pipeline_update(output))
    except RuntimeError:
        pass


def _get_safe_empty_output(run_id: str) -> dict:
    """Cold start default safe structure when no data available."""
    return {
        "run_id": run_id,
        "run_at": datetime.now(timezone.utc).isoformat(),
        "source": "cached",
        "pipeline_health": "degraded",
        "hotspots": [],
        "cascade_zones": [],
        "predictions": [
            {
                "zone_id": "field-level",
                "zone_name": "Field Level",
                "current_pct": 30.0,
                "predicted_pct": 34.0,
                "confidence": 0.55,
                "uncertainty_reason": "cold_start",
                "risk_trajectory": "stable",
                "minutes_to_critical": None,
            }
        ],
        "decisions": [
            {
                "action_type": "routing",
                "target_zone": "field-level",
                "instruction": "Maintain balanced ingress while telemetry initializes",
                "priority": "medium",
                "expected_impact": "stabilize early crowd distribution",
            }
        ],
        "impacts": [],
        "communication": {
            "attendee_notification": "System initializing",
            "staff_alert": "System initializing",
            "signage_message": "SYSTEM INITIALIZING",
            "narration": "Awaiting first pipeline completion.",
            "reasoning_chain": {
                "cause": "System boot",
                "trend": "unknown",
                "prediction": "unknown",
                "reasoning": "Waiting for data.",
                "action": "Starting up.",
                "status": "Initializing"
            }
        },
        "confidence_overall": 0.0,
        "pipeline_duration_ms": 0,
        "pipeline_latency_ms": 0,
        "fallback_used": True,
        "metrics": {
            "pipeline_latency_ms": 0,
            "confidence_overall": 0.0,
            "predictions_count": 1,
            "decisions_count": 1,
            "fallback_used": True,
            "source": "cached",
        },
        "analyst_summary": "System initializing",
        "operations_summary": "Waiting for first full AI sweep.",
        "phase_status": {"phase": "unknown"},
    }


def run_pipeline() -> dict:
    """Executes the complete 4-agent AI pipeline.

    The pipeline runs Analyst -> Predictor -> Decision -> Communicator and
    returns a structured operational intelligence payload for the dashboard,
    Firestore persistence, and fallback-safe API responses.
    """
    global _last_successful_output, _previous_decisions
    
    run_id = str(uuid.uuid4())
    run_start = time.time()
    logger.info({"event": "pipeline_run_start", "component": "pipeline", "run_id": run_id})
    
    try:
        zone_states = _get_zone_states_from_firestore()
        phase_status = _get_phase_status_from_firestore()
        
        if not zone_states:
            logger.warning(
                {
                    "event": "pipeline_no_zone_data",
                    "component": "pipeline",
                    "run_id": run_id,
                }
            )
            if _last_successful_output:
                cached = dict(_last_successful_output)
                cached["source"] = "cached"
                cached["pipeline_health"] = "degraded"
                cached["run_id"] = run_id
                cached["fallback_reason"] = "Using last successful pipeline output"
                log_pipeline_metrics_to_bigquery(cached)
                write_pipeline_snapshot_to_gcs(cached)
                return cached
            empty_output = _get_safe_empty_output(run_id)
            log_pipeline_metrics_to_bigquery(empty_output)
            write_pipeline_snapshot_to_gcs(empty_output)
            return empty_output

        retry_delays = [0.5, 1.0]
        fallback_reason = None
        analyst_output = {}
        predictor_output = {}
        decision_output = {}
        comm_output = {}

        for attempt in range(3):
            analyst_output = run_analyst(zone_states)
            predictor_output = run_predictor(analyst_output, zone_states, phase_status)
            decision_output = run_decision(predictor_output, analyst_output)
            comm_output = run_communicator(decision_output, predictor_output, analyst_output)

            fallback_detected = any(
                output.get("_fallback")
                for output in (analyst_output, predictor_output, decision_output, comm_output)
            )
            if fallback_detected:
                fallback_reason = "Gemini API failure"
                if attempt < 2:
                    backoff_seconds = retry_delays[attempt]
                    logger.warning(
                        {
                            "event": "pipeline_retry_gemini",
                            "component": "pipeline",
                            "run_id": run_id,
                            "attempt": attempt + 1,
                            "max_attempts": 3,
                            "backoff_seconds": backoff_seconds,
                        }
                    )
                    time.sleep(backoff_seconds)
                    continue
            break
        
        zone_map = {z["zone_id"]: z for z in zone_states}
        for decision in decision_output.get("decisions", []):
            zone_id = decision.get("target_zone")
            if zone_id in zone_map:
                decision["_before_pct"] = zone_map[zone_id].get("occupancy_pct", 0)
        
        impacts = _calculate_action_impacts(zone_states)
        
        duration_ms = int((time.time() - run_start) * 1000)
        fallback_used = bool(fallback_reason)
        output = {
            "run_id": run_id,
            "run_at": datetime.now(timezone.utc).isoformat(),
            "source": "live",
            "pipeline_health": "healthy",
            "hotspots": analyst_output.get("hotspots", []),
            "cascade_zones": analyst_output.get("cascade_zones", []),
            "predictions": predictor_output.get("predictions", []),
            "decisions": decision_output.get("decisions", []),
            "impacts": impacts,
            "communication": comm_output,
            "confidence_overall": predictor_output.get("overall_prediction_confidence", 0.7),
            "pipeline_duration_ms": duration_ms,
            "pipeline_latency_ms": duration_ms,
            "fallback_used": fallback_used,
            "metrics": {
                "pipeline_latency_ms": duration_ms,
                "confidence_overall": predictor_output.get("overall_prediction_confidence", 0.7),
                "predictions_count": len(predictor_output.get("predictions", [])),
                "decisions_count": len(decision_output.get("decisions", [])),
                "fallback_used": fallback_used,
                "source": "live",
            },
            "analyst_summary": analyst_output.get("summary", ""),
            "operations_summary": decision_output.get("operations_summary", ""),
            "phase_status": phase_status,
        }

        if fallback_reason:
            output["fallback_reason"] = fallback_reason
        
        _write_pipeline_output(output)
        
        _last_successful_output = output
        _previous_decisions = decision_output.get("decisions", [])
        
        logger.info(
            {
                "event": "pipeline_run_complete",
                "component": "pipeline",
                "run_id": run_id,
                "duration_ms": duration_ms,
                "hotspots": len(output["hotspots"]),
                "decisions": len(output["decisions"]),
                "impacts": len(impacts),
                "source": output.get("source"),
                "pipeline_health": output.get("pipeline_health"),
                "fallback_reason": output.get("fallback_reason"),
            }
        )
        return output
        
    except Exception as e:
        logger.error(
            {
                "event": "pipeline_run_failed",
                "component": "pipeline",
                "run_id": run_id,
                "error": str(e),
            },
            exc_info=True,
        )
        if _last_successful_output:
            logger.warning(
                {
                    "event": "pipeline_cached_fallback",
                    "component": "pipeline",
                    "run_id": run_id,
                }
            )
            cached = dict(_last_successful_output)
            cached["source"] = "cached"
            cached["pipeline_health"] = "degraded"
            cached["run_id"] = run_id
            cached["fallback_reason"] = "Using last successful pipeline output"
            log_pipeline_metrics_to_bigquery(cached)
            write_pipeline_snapshot_to_gcs(cached)
            return cached
        empty_output = _get_safe_empty_output(run_id)
        log_pipeline_metrics_to_bigquery(empty_output)
        write_pipeline_snapshot_to_gcs(empty_output)
        return empty_output
