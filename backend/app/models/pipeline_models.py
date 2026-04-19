"""
Pydantic models for AI pipeline inputs, outputs, and agent responses.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


__all__ = [
    "ActionType", 
    "PriorityLevel", 
    "RiskTrajectory", 
    "PredictionResult", 
    "AgentDecision", 
    "ActionImpact", 
    "AIReasoningChain", 
    "CommunicationOutput", 
    "PipelineOutput"
]


class ActionType(str, Enum):
    GATE_OPS = "gate_ops"
    STAFF = "staff"
    SIGNAGE = "signage"
    ROUTING = "routing"
    PREDICT = "predict"


class PriorityLevel(str, Enum):
    IMMEDIATE = "immediate"
    HIGH = "high"
    MEDIUM = "medium"


class RiskTrajectory(str, Enum):
    WORSENING = "worsening"
    STABLE = "stable"
    IMPROVING = "improving"


class PredictionResult(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    zone_id: str = Field(..., min_length=1)
    zone_name: str
    current_pct: float
    predicted_pct: float
    confidence: float = Field(..., ge=0, le=1)
    uncertainty_reason: str
    risk_trajectory: RiskTrajectory
    minutes_to_critical: Optional[int] = None


class AgentDecision(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    action_type: ActionType
    target_zone: str = Field(..., min_length=1)
    instruction: str
    priority: PriorityLevel
    expected_impact: str


class ActionImpact(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    action_instruction: str
    target_zone: str = Field(..., min_length=1)
    before_pct: float
    after_pct: float
    change_pct: float
    resolved: bool
    resolved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AIReasoningChain(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    cause: str
    trend: str
    prediction: str
    reasoning: str
    action: str
    status: str


class CommunicationOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    attendee_notification: str = Field(..., max_length=80)
    staff_alert: str = Field(..., max_length=120)
    signage_message: str = Field(..., max_length=40)
    narration: str
    reasoning_chain: AIReasoningChain


class PipelineOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    run_id: str = Field(..., min_length=1)
    run_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str
    hotspots: list[str]
    cascade_zones: list[str]
    predictions: list[PredictionResult]
    decisions: list[AgentDecision]
    impacts: list[ActionImpact]
    communication: CommunicationOutput
    confidence_overall: float
    pipeline_duration_ms: int
