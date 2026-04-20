"""
Shared Gemini client initialization and pre-configured model singletons.
Eliminates overhead of creating new model bindings per request.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import google.generativeai as genai

from app.core.settings import settings


logger = logging.getLogger(__name__)

# Bind globally once
genai.configure(api_key=settings.gemini_api_key)

_DEFAULT_MODEL_LADDER = (
  "gemini-2.5-flash-lite",
  "gemma-3-4b-it",
  "gemma-3-1b-it",
)

_MODEL_FAILOVER_MARKERS = (
  "resourceexhausted",
  "quota",
  "429",
  "permissiondenied",
  "403",
  "notfound",
  "404",
  "deadlineexceeded",
  "504",
  "unavailable",
  "internal",
)


def _parse_model_ladder(raw: str | None) -> list[str]:
  if not raw:
    return []

  models: list[str] = []
  for item in raw.split(","):
    candidate = item.strip()
    if candidate and candidate not in models:
      models.append(candidate)
  return models


def _resolve_model_ladder(agent_env_var: str) -> list[str]:
  per_agent = _parse_model_ladder(os.getenv(agent_env_var))
  if per_agent:
    return per_agent

  shared = _parse_model_ladder(os.getenv("GEMINI_MODEL_LADDER"))
  if shared:
    return shared

  return list(_DEFAULT_MODEL_LADDER)


class _ModelRouter:
  """Tries configured models in order and switches away from exhausted quotas."""

  def __init__(
    self,
    role: str,
    model_names: list[str],
    generation_config: Any,
    system_instruction: str,
  ) -> None:
    self._role = role
    self._model_names = model_names
    self._generation_config = generation_config
    self._system_instruction = system_instruction
    self._models: dict[str, Any] = {}
    self._preferred_model_name = model_names[0]
    self._active_model_name = model_names[0]

  @property
  def active_model_name(self) -> str:
    return self._active_model_name

  @property
  def model_ladder(self) -> list[str]:
    return list(self._model_names)

  def _ordered_candidates(self) -> list[str]:
    ordered = [self._preferred_model_name]
    for model_name in self._model_names:
      if model_name not in ordered:
        ordered.append(model_name)
    return ordered

  def _bind_model(self, model_name: str) -> Any:
    model = self._models.get(model_name)
    if model is not None:
      return model

    model = genai.GenerativeModel(
      model_name=model_name,
      generation_config=self._generation_config,
      system_instruction=self._system_instruction,
    )
    self._models[model_name] = model
    return model

  def _should_failover(self, exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in _MODEL_FAILOVER_MARKERS)

  def generate_content(self, prompt: str, request_options: dict[str, Any] | None = None) -> Any:
    candidates = self._ordered_candidates()
    last_exc: Exception | None = None

    for idx, model_name in enumerate(candidates):
      try:
        model = self._bind_model(model_name)
        response = model.generate_content(prompt, request_options=request_options)
        self._active_model_name = model_name
        self._preferred_model_name = model_name
        return response
      except Exception as exc:
        last_exc = exc
        can_retry_with_another_model = idx < (len(candidates) - 1) and self._should_failover(exc)
        if can_retry_with_another_model:
          logger.warning(
            "Gemini model %s failed for %s; trying next model in ladder.",
            model_name,
            self._role,
          )
          continue
        raise

    if last_exc is not None:
      raise last_exc
    raise RuntimeError(f"No Gemini models configured for role={self._role}")

# Global helper for robust JSON parsing
def safe_json_load(text: str) -> dict:
    import json

    try:
        # Simple extraction heuristics to find JSON blocks mapping
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.rfind("```")
            text = text[start:end].strip()
        elif "{" in text:
            start = text.find("{")
            end = text.rfind("}") + 1
            text = text[start:end].strip()
            
        return json.loads(text)
    except Exception as e:
        logger.warning("JSON parsing failed, attempting recovery: %s", e)
        return {}

# -------------------------------------------------------------
# Agent 1 (Analyst) - Strict JSON rules
# -------------------------------------------------------------
ANALYST_SYSTEM_PROMPT = """You are an expert crowd safety analyst 
at a major 50,000-seat sporting venue. You analyze real-time zone 
occupancy data and identify risks with precision and urgency.

Your analysis must be specific, not generic. Name exact zones.
Use percentages. Identify cascade risks (when one zone fills, 
adjacent zones receive spillover crowd pressure).

Dangerous patterns to detect even at moderate occupancy:
- Rising trend + flow_rate > 300 = dangerous momentum
- Two adjacent zones both above 75% = cascade imminent
- Gate zone above 80% during match = exit bottleneck

You MUST return valid JSON matching this exact schema:
{
  "hotspots": ["zone_id1", "zone_id2"],
  "cascade_zones": ["zone_id3"],
  "dangerous_patterns": [
    {
      "zone_id": "string",
      "pattern_type": "string",
      "detail": "string"
    }
  ],
  "overall_risk": "low|medium|high|critical",
  "summary": "2-3 sentence specific summary of current situation"
}"""

analyst_model = _ModelRouter(
  role="analyst",
  model_names=_resolve_model_ladder("GEMINI_ANALYST_MODELS"),
  generation_config=genai.GenerationConfig(
    temperature=0.2,
    response_mime_type="application/json",
  ),
  system_instruction=ANALYST_SYSTEM_PROMPT,
)


# -------------------------------------------------------------
# Agent 2 (Predictor)
# -------------------------------------------------------------
PREDICTOR_SYSTEM_PROMPT = """You are a crowd flow prediction specialist 
at a major sporting venue. Given current hotspot analysis and zone 
trend data, you predict exact occupancy percentages 10 minutes 
into the future for every zone.

Your predictions must account for:
1. Current momentum (rising zones continue rising unless intervened)
2. Match phase transitions (halftime surge peaks then normalizes)
3. Cascade effects (overflow from critical zones hits adjacent ones)
4. Historical patterns (gate zones spike at full-time)

Confidence score rules:
- 0.9+ only when trend is stable and phase is steady
- 0.7-0.9 for rising/falling trends with clear momentum  
- 0.5-0.7 when phase transition is imminent or cascade uncertain
- Below 0.5 when multiple conflicting signals present

You MUST return valid JSON matching this exact schema:
{
  "predictions": [
    {
      "zone_id": "string",
      "zone_name": "string", 
      "current_pct": number,
      "predicted_pct": number,
      "confidence": number,
      "uncertainty_reason": "string",
      "risk_trajectory": "worsening|stable|improving",
      "minutes_to_critical": number or null
    }
  ],
  "highest_risk_zone": "zone_id",
  "phase_transition_warning": "string or null",
  "overall_prediction_confidence": number
}"""

predictor_model = _ModelRouter(
  role="predictor",
  model_names=_resolve_model_ladder("GEMINI_PREDICTOR_MODELS"),
  generation_config=genai.GenerationConfig(
    temperature=0.2,
    response_mime_type="application/json",
  ),
  system_instruction=PREDICTOR_SYSTEM_PROMPT,
)


# -------------------------------------------------------------
# Agent 3 (Decision)
# -------------------------------------------------------------
DECISION_SYSTEM_PROMPT = """You are the operations director of a 
50,000-seat stadium. You receive crowd predictions and generate 
specific, immediately actionable operational decisions.

Decision quality rules:
- Name exact gates, zones, and staff numbers
- Each action must be executable in under 2 minutes
- Prioritize actions that prevent problems over reactions
- Consider downstream effects of every action

Action types and when to use:
- gate_ops: opening/closing gates, redirecting entry flows
- staff: deploying, redeploying, or briefing staff members
- signage: updating digital signs to guide crowd movement
- routing: changing recommended pedestrian flow paths
- predict: communicating predictions to ops team proactively

Expected impact must be specific:
- "Reduce North Concourse load by ~15% in 8 minutes"
- "Increase Gate C throughput by 40% immediately"
- NOT "improve crowd flow" (too vague)

You MUST return valid JSON matching this exact schema:
{
  "decisions": [
    {
      "action_type": "gate_ops|staff|signage|routing|predict",
      "target_zone": "zone_id",
      "instruction": "specific actionable instruction",
      "priority": "immediate|high|medium",
      "expected_impact": "specific measurable impact description"
    }
  ],
  "total_actions": number,
  "highest_priority_zone": "zone_id",
  "operations_summary": "2 sentence summary for ops team"
}"""

decision_model = _ModelRouter(
  role="decision",
  model_names=_resolve_model_ladder("GEMINI_DECISION_MODELS"),
  generation_config=genai.GenerationConfig(
    temperature=0.4,
    response_mime_type="application/json",
  ),
  system_instruction=DECISION_SYSTEM_PROMPT,
)


# -------------------------------------------------------------
# Agent 4 (Communicator)
# -------------------------------------------------------------
COMMUNICATOR_SYSTEM_PROMPT = """You are the communications director
for a smart stadium AI system. You translate complex operational 
decisions into clear, audience-appropriate messages.

Tone rules per output:
- attendee_notification: Friendly, helpful, never alarming. 
  Focus on benefit ("shorter queues") not problem ("congestion").
  Max 80 characters. No technical jargon.
- staff_alert: Direct, urgent when needed. Use exact zone names.
  Include specific action required. Max 120 characters.
- signage_message: ALL CAPS. Max 40 characters. Simple directive.
  E.g. "USE GATE C — 2 MIN WAIT"
- narration: Dashboard display. 2-3 sentences. Technical but readable.
  Structure: what was detected, what was predicted, what action taken.
- reasoning_chain: Structured breakdown for the AI Reasoning panel.
  Each field is one clear sentence.

Vary your language each response — never use identical phrasing
as a previous cycle. The system runs every 30 seconds.

You MUST return valid JSON matching this exact schema:
{
  "attendee_notification": "string (max 80 chars)",
  "staff_alert": "string (max 120 chars)",
  "signage_message": "string (max 40 chars)",
  "narration": "string",
  "reasoning_chain": {
    "cause": "string",
    "trend": "string",
    "prediction": "string",
    "reasoning": "string",
    "action": "string",
    "status": "string"
  }
}"""

communicator_model = _ModelRouter(
  role="communicator",
  model_names=_resolve_model_ladder("GEMINI_COMMUNICATOR_MODELS"),
  generation_config=genai.GenerationConfig(
    temperature=0.4,
    response_mime_type="application/json",
  ),
  system_instruction=COMMUNICATOR_SYSTEM_PROMPT,
)


def get_runtime_model_status() -> dict[str, Any]:
  """Returns active and configured Gemini models for evaluator-facing diagnostics."""
  agent_ladders = {
    "analyst": analyst_model.model_ladder,
    "predictor": predictor_model.model_ladder,
    "decision": decision_model.model_ladder,
    "communicator": communicator_model.model_ladder,
  }
  active_models = {
    "analyst": analyst_model.active_model_name,
    "predictor": predictor_model.active_model_name,
    "decision": decision_model.active_model_name,
    "communicator": communicator_model.active_model_name,
  }

  return {
    "default_model_ladder": _resolve_model_ladder("GEMINI_MODEL_LADDER"),
    "agent_model_ladders": agent_ladders,
    "active_models": active_models,
    "active_model": active_models.get("analyst"),
  }
