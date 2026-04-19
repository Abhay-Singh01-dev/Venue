"""
Agent 4: Communication Generator. Translates operational decisions
into audience-specific messages: attendees, staff, signage, dashboard.
"""

import json
import time
import logging

from app.core.gemini_client import communicator_model, safe_json_load

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


def run_communicator(decision_output: dict,
                     predictor_output: dict,
                     analyst_output: dict) -> dict:
    """
    Runs Agent 4 to generate all communication outputs.
    
    Args:
        decision_output: Full output from run_decision()
        predictor_output: Full output from run_predictor()
        analyst_output: Full output from run_analyst()
        
    Returns:
        Dict matching COMMUNICATOR_SYSTEM_PROMPT schema
    """
    user_message = f"""Operational decisions made:
{json.dumps(decision_output, indent=2, default=str)}

Predictions driving these decisions:
{json.dumps(predictor_output.get("predictions", [])[:5], indent=2, default=str)}

Current situation:
{analyst_output.get("summary", "No summary available")}

Generate all 5 communication outputs. Ensure the attendee 
notification is reassuring and action-oriented."""

    global _last_cooldown_log_at

    now = time.time()
    if now < _cooldown_until:
        # Throttle cooldown logging to avoid repetitive log spam.
        if now - _last_cooldown_log_at > 30:
            remaining = int(_cooldown_until - now)
            logger.info(f"Agent 4 in Gemini cooldown ({remaining}s remaining); using fallback communication")
            _last_cooldown_log_at = now
        return _communicator_fallback()

    start = now
    try:
        response = communicator_model.generate_content(user_message, request_options={"timeout": 15})
        result = safe_json_load(response.text)
        
        if not result:
            logger.warning("Agent 4 returned empty/invalid structured dict")
            return _communicator_fallback()

        # Hard enforcement of max_lengths to prevent UI overflows
        if "attendee_notification" in result:
            result["attendee_notification"] = result["attendee_notification"][:80]
        if "staff_alert" in result:
            result["staff_alert"] = result["staff_alert"][:120]
        if "signage_message" in result:
            result["signage_message"] = result["signage_message"][:40]

        duration = int((time.time() - start) * 1000)
        _record_success()
        logger.info(f"Agent 4 (Communicator) completed in {duration}ms")
        return result
    except Exception as e:
        if _is_quota_error(e):
            cooldown_seconds = _record_quota_failure()
            logger.warning(
                f"Agent 4 Gemini unavailable; backing off for {cooldown_seconds}s and using fallback"
            )
        else:
            logger.error(f"Agent 4 Gemini call failed: {e}", exc_info=True)
        return _communicator_fallback()


def _communicator_fallback() -> dict:
    """Returns safe default communication when Gemini unavailable."""
    return {
        "attendee_notification": "All areas monitored — check app for shortest queues",
        "staff_alert": "System in fallback mode — apply standard protocols",
        "signage_message": "SYSTEM MONITORING ACTIVE",
        "narration": "FlowState AI is actively monitoring all venue zones. "
                    "Automated analysis running in fallback mode. "
                    "Manual oversight recommended.",
        "reasoning_chain": {
            "cause": "System operating in fallback mode",
            "trend": "Monitoring continues across all zones",
            "prediction": "Standard crowd patterns expected",
            "reasoning": "Gemini API temporarily unavailable",
            "action": "Rule-based decisions applied as fallback",
            "status": "System stable — awaiting API recovery",
        },
    }
