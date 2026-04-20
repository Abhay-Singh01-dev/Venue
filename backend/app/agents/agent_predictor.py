"""
Agent 2: Prediction Engine. Forecasts zone occupancy in 10 minutes
with confidence scores and uncertainty reasoning.
"""

import json
import time
import logging

from app.core.gemini_client import predictor_model, safe_json_load

logger = logging.getLogger(__name__)

_cooldown_until = 0.0
_consecutive_429_failures = 0
_last_cooldown_log_at = 0.0


def _is_quota_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "resourceexhausted" in text
        or "429" in text
        or "quota" in text
        or "deadlineexceeded" in text
        or "504" in text
        or "permissiondenied" in text
        or "403" in text
        or "notfound" in text
        or "404" in text
    )


def _record_quota_failure() -> int:
    global _cooldown_until, _consecutive_429_failures

    _consecutive_429_failures += 1
    cooldown_seconds = min(180, 20 * (2 ** (_consecutive_429_failures - 1)))
    _cooldown_until = time.time() + cooldown_seconds
    return cooldown_seconds


def _record_success() -> None:
    global _consecutive_429_failures, _cooldown_until
    _consecutive_429_failures = 0
    _cooldown_until = 0.0


def run_predictor(analyst_output: dict, 
                  zone_states: list[dict],
                  phase_status: dict) -> dict:
    """
    Runs Agent 2 prediction based on analyst output and zone history.
    
    Args:
        analyst_output: Full output dict from run_analyst()
        zone_states: Current zone states list
        phase_status: Current simulation phase info
        
    Returns:
        Dict matching PREDICTOR_SYSTEM_PROMPT schema
    """
    user_message = f"""Current crowd analysis:
{json.dumps(analyst_output, indent=2, default=str)}

Current zone states (with trends):
{json.dumps(zone_states, indent=2, default=str)}

Current match phase:
{json.dumps(phase_status, indent=2, default=str)}

Predict occupancy for ALL 12 zones in exactly 10 minutes.
Include every zone in the predictions array."""

    global _last_cooldown_log_at

    now = time.time()
    if now < _cooldown_until:
        if now - _last_cooldown_log_at > 30:
            remaining = int(_cooldown_until - now)
            logger.info(f"Agent 2 in Gemini cooldown ({remaining}s remaining); using fallback predictions")
            _last_cooldown_log_at = now
        fallback = _predictor_fallback(zone_states)
        fallback["_fallback_reason"] = "cooldown"
        return fallback

    start = now
    try:
        response = predictor_model.generate_content(user_message, request_options={"timeout": 15})
        result = safe_json_load(response.text)
        
        if not result:
            logger.warning("Agent 2 returned empty/invalid structured dict")
            fallback = _predictor_fallback(zone_states)
            fallback["_fallback_reason"] = "invalid_model_payload"
            return fallback

        # Enforce all zones prediction completeness
        predictions = result.get("predictions", [])
        if len(predictions) < 12:
            logger.warning(f"Incomplete predictions ({len(predictions)}). Filling missing zones.")
            present_zones = {p.get("zone_id") for p in predictions}
            for z in zone_states:
                if z["zone_id"] not in present_zones:
                    predictions.append({
                        "zone_id": z["zone_id"],
                        "zone_name": z.get("name", z["zone_id"]),
                        "current_pct": z.get("occupancy_pct", 0),
                        "predicted_pct": z.get("occupancy_pct", 0),
                        "confidence": 0.5,
                        "uncertainty_reason": "Copied from current - missed by model",
                        "risk_trajectory": "stable",
                        "minutes_to_critical": None
                    })
            result["predictions"] = predictions

        duration = int((time.time() - start) * 1000)
        _record_success()
        logger.info(f"Agent 2 (Predictor) completed in {duration}ms. "
                   f"Highest risk: {result.get('highest_risk_zone')}")
        return result
    except Exception as e:
        if _is_quota_error(e):
            cooldown_seconds = _record_quota_failure()
            logger.warning(
                f"Agent 2 Gemini unavailable; backing off for {cooldown_seconds}s and using fallback"
            )
        else:
            logger.error(f"Agent 2 Gemini call failed: {e}", exc_info=True)
        fallback = _predictor_fallback(zone_states)
        fallback["_fallback_reason"] = str(e)
        return fallback


def _predictor_fallback(zone_states: list[dict]) -> dict:
    """Rule-based prediction fallback when Gemini unavailable."""
    predictions = []
    highest_risk_zone = None
    highest_pct = 0
    
    for zone in zone_states:
        current = zone.get("occupancy_pct", 50)
        trend = zone.get("trend", "stable")
        delta = 5 if trend == "rising" else -3 if trend == "falling" else 0
        predicted = min(99.0, max(0.0, current + delta))
        
        if predicted > highest_pct:
            highest_pct = predicted
            highest_risk_zone = zone["zone_id"]
        
        predictions.append({
            "zone_id": zone["zone_id"],
            "zone_name": zone.get("name", zone["zone_id"]),
            "current_pct": current,
            "predicted_pct": round(predicted, 1),
            "confidence": 0.5,
            "uncertainty_reason": "Fallback prediction — Gemini unavailable",
            "risk_trajectory": (
                "worsening" if trend == "rising" 
                else "improving" if trend == "falling" 
                else "stable"
            ),
            "minutes_to_critical": None,
            "_fallback": True,
        })
    
    return {
        "predictions": predictions,
        "highest_risk_zone": highest_risk_zone,
        "phase_transition_warning": None,
        "overall_prediction_confidence": 0.5,
    }
