"""
Agent 3: Decision Engine. Generates specific operational actions
to address predicted congestion, with expected impact estimates.
"""

import json
import time
import logging

from app.core.gemini_client import decision_model, safe_json_load

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
    # Exponential backoff capped to avoid prolonged lockout.
    cooldown_seconds = min(180, 20 * (2 ** (_consecutive_429_failures - 1)))
    _cooldown_until = time.time() + cooldown_seconds
    return cooldown_seconds


def _record_success() -> None:
    global _consecutive_429_failures, _cooldown_until
    _consecutive_429_failures = 0
    _cooldown_until = 0.0


def run_decision(predictor_output: dict,
                 analyst_output: dict) -> dict:
    """
    Runs Agent 3 to generate operational decisions.
    
    Args:
        predictor_output: Full output from run_predictor()
        analyst_output: Full output from run_analyst()
        
    Returns:
        Dict matching DECISION_SYSTEM_PROMPT schema
    """
    user_message = f"""Crowd prediction for next 10 minutes:
{json.dumps(predictor_output, indent=2, default=str)}

Current situation analysis:
{json.dumps(analyst_output, indent=2, default=str)}

Generate all necessary operational decisions. 
Include at minimum one decision per zone rated high or critical risk.
Ensure variety: include gate, staff, signage, and routing actions."""

    global _last_cooldown_log_at

    now = time.time()
    if now < _cooldown_until:
        # Throttle cooldown logging to avoid repetitive log spam.
        if now - _last_cooldown_log_at > 30:
            remaining = int(_cooldown_until - now)
            logger.info(f"Agent 3 in Gemini cooldown ({remaining}s remaining); using fallback decisions")
            _last_cooldown_log_at = now
        return _decision_fallback(predictor_output)

    start = now
    try:
        response = decision_model.generate_content(user_message, request_options={"timeout": 15})
        result = safe_json_load(response.text)
        
        if not result:
            logger.warning("Agent 3 returned empty/invalid structured dict")
            return _decision_fallback(predictor_output)
            
        decisions = result.get("decisions", [])
        if not decisions:
            logger.warning("Agent 3 returned missing decisions array, injecting defaults.")
            fallback = _decision_fallback(predictor_output)
            result["decisions"] = fallback["decisions"]
            result["total_actions"] = len(fallback["decisions"])

        duration = int((time.time() - start) * 1000)
        _record_success()
        logger.info(f"Agent 3 (Decision) completed in {duration}ms. "
                   f"Actions generated: {result.get('total_actions', 0)}")
        return result
    except Exception as e:
        if _is_quota_error(e):
            cooldown_seconds = _record_quota_failure()
            logger.warning(
                f"Agent 3 Gemini unavailable; backing off for {cooldown_seconds}s and using fallback"
            )
        else:
            logger.error(f"Agent 3 Gemini call failed: {e}", exc_info=True)
        return _decision_fallback(predictor_output)


def _decision_fallback(predictor_output: dict) -> dict:
    """Rule-based decision fallback."""
    decisions = []
    predictions = predictor_output.get("predictions", [])
    
    for pred in predictions:
        if pred.get("predicted_pct", 0) >= 85:
            decisions.append({
                "action_type": "staff",
                "target_zone": pred["zone_id"],
                "instruction": f"Deploy 3 staff to {pred.get('zone_name', pred['zone_id'])} for crowd management",
                "priority": "immediate",
                "expected_impact": "Improve flow management by ~10%",
            })
    
    return {
        "decisions": decisions,
        "total_actions": len(decisions),
        "highest_priority_zone": predictor_output.get("highest_risk_zone", ""),
        "operations_summary": "Fallback mode — rule-based decisions applied.",
    }
