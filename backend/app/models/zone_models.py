"""
Pydantic models for stadium zone data, occupancy states, and flow metrics.
"""

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict


__all__ = ["RiskLevel", "TrendDirection", "ZoneState", "ZoneReading", "ZoneHistory", "VenueSnapshot"]


class RiskLevel(str, Enum):
    LOW = "low"           # occupancy < 60%
    MEDIUM = "medium"     # occupancy 60-79%
    HIGH = "high"         # occupancy 80-89%
    CRITICAL = "critical" # occupancy >= 90%


class TrendDirection(str, Enum):
    RISING = "rising"
    FALLING = "falling"
    STABLE = "stable"


class ZoneState(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    zone_id: str = Field(..., min_length=1)
    name: str
    type: str
    tick_id: str
    occupancy_pct: float = Field(..., ge=0, le=100)
    flow_rate: float
    queue_depth: int
    queue_wait_minutes: float = 0.0
    risk_level: RiskLevel
    trend: TrendDirection
    capacity: int
    current_count: int
    adjacent_zones: list[str]
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ZoneReading(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    occupancy_pct: float
    flow_rate: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ZoneHistory(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    zone_id: str = Field(..., min_length=1)
    readings: list[ZoneReading]


class VenueSnapshot(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    venue_id: str = Field(..., min_length=1)
    zones: list[ZoneState]
    total_attendees: int
    snapshot_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
