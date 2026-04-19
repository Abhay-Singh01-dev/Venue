"""
Agent 1: Crowd Analyst. Identifies current hotspots, cascade risks,
and dangerous patterns from raw zone state data.
"""

import json
import time
import logging

from app.core.gemini_client import analyst_model, safe_json_load

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


def run_analyst(zone_states: list[dict]) -> dict:
    """
    Runs Agent 1 analysis on current zone states.
    Returns parsed JSON dict. On failure returns safe fallback dict.
    
    Args:
        zone_states: List of zone state dicts from Firestore
        
    Returns:
        Dict matching ANALYST_SYSTEM_PROMPT schema
    """
    user_message = f"""Analyze these real-time zone states:

{json.dumps(zone_states, indent=2, default=str)}

Identify all hotspots, cascade risks, and dangerous patterns.
Return analysis as JSON."""

    global _last_cooldown_log_at

    now = time.time()
    if now < _cooldown_until:
        if now - _last_cooldown_log_at > 30:
            remaining = int(_cooldown_until - now)
            logger.info(f"Agent 1 in Gemini cooldown ({remaining}s remaining); using fallback analysis")
            _last_cooldown_log_at = now
        return _analyst_fallback(zone_states)

    start = now
    try:
        response = analyst_model.generate_content(user_message, request_options={"timeout": 15})
        result = safe_json_load(response.text)
        if not result:
            logger.warning("Agent 1 returned empty/invalid structured dict")
            return _analyst_fallback(zone_states)
            
        duration = int((time.time() - start) * 1000)
        _record_success()
        logger.info(f"Agent 1 (Analyst) completed in {duration}ms. "
                   f"Hotspots: {result.get('hotspots', [])}")
        return result
    except Exception as e:
        if _is_quota_error(e):
            cooldown_seconds = _record_quota_failure()
            logger.warning(
                f"Agent 1 Gemini unavailable; backing off for {cooldown_seconds}s and using fallback"
            )
        else:
            logger.error(f"Agent 1 Gemini call failed: {e}", exc_info=True)
        return _analyst_fallback(zone_states)


def _analyst_fallback(zone_states: list[dict]) -> dict:
    """
    Generates a basic analysis without Gemini when API fails.
    Uses rule-based logic on zone occupancy values.
    """
    hotspots = [z["zone_id"] for z in zone_states 
                if z.get("occupancy_pct", 0) >= 80]
    overall = "critical" if any(
        z.get("occupancy_pct", 0) >= 90 for z in zone_states
    ) else "high" if hotspots else "medium"
    
    return {
        "hotspots": hotspots,
        "cascade_zones": [],
        "dangerous_patterns": [],
        "overall_risk": overall,
        "summary": f"Rule-based fallback: {len(hotspots)} zones above 80% capacity.",
        "_fallback": True,
    }
