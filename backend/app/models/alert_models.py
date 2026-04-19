"""
Pydantic models for system alerts and resolution tracking.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


__all__ = ["AlertSeverity", "Alert", "ActivityEvent"]


class AlertSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"


class Alert(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    alert_id: str = Field(..., min_length=1)
    zone_id: str = Field(..., min_length=1)
    zone_name: str
    severity: AlertSeverity
    occupancy_pct: float
    message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolution_note: Optional[str] = None


class ActivityEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    event_id: str = Field(..., min_length=1)
    event_type: str
    message: str
    zone_id: Optional[str] = None
    severity: Optional[AlertSeverity] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    color: str
