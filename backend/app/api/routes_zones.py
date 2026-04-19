"""Zone data endpoints — current states and zone history."""

from fastapi import APIRouter, HTTPException
from app.firebase_client import db
from app.models.api_response_models import ZonesResponse, ZoneSummaryResponse, ZoneResponse
from app.simulation.zone_config import ZONE_CONFIG
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/zones", tags=["zones"])


def _risk_from_occupancy(occupancy_pct: float) -> str:
    if occupancy_pct >= 90:
        return "critical"
    if occupancy_pct >= 80:
        return "high"
    if occupancy_pct >= 60:
        return "medium"
    return "low"


def _build_synthetic_zones() -> list[dict]:
    """Builds deterministic pre-match zone states when DB is unavailable."""
    zones: list[dict] = []
    for zone_id, config in ZONE_CONFIG.items():
        occupancy_pct = float(config["baseline"]["pre_match"])
        capacity = int(config["capacity"])
        current_count = int((occupancy_pct / 100.0) * capacity)
        zones.append(
            {
                "zone_id": zone_id,
                "name": config["name"],
                "type": config["type"],
                "occupancy_pct": occupancy_pct,
                "flow_rate": 120.0,
                "queue_depth": max(0, int(occupancy_pct // 8)),
                "risk_level": _risk_from_occupancy(occupancy_pct),
                "trend": "stable",
                "capacity": capacity,
                "current_count": current_count,
                "adjacent_zones": config["adjacent"],
            }
        )
    zones.sort(key=lambda z: z.get("occupancy_pct", 0), reverse=True)
    return zones

@router.get("/", response_model=ZonesResponse)
async def get_all_zones() -> dict:
    """
    Returns all 12 zone states sorted by occupancy descending.
    Used by frontend map and zone occupancy table.
    """
    try:
        if not db:
            synthetic_zones = _build_synthetic_zones()
            return {
                "zones": synthetic_zones,
                "count": len(synthetic_zones),
                "status": "synthetic_no_db",
            }
            
        zones_ref = db.collection("zones").stream()
        zones = []
        for doc in zones_ref:
            data = doc.to_dict()
            if data:
                zones.append(data)
        zones.sort(key=lambda z: z.get("occupancy_pct", 0), reverse=True)
        return {"zones": zones, "count": len(zones)}
    except Exception as e:
        logger.error(f"GET /zones failed: {e}", exc_info=True)
        synthetic_zones = _build_synthetic_zones()
        return {
            "zones": synthetic_zones,
            "count": len(synthetic_zones),
            "status": "synthetic_fallback",
        }

@router.get("/summary", response_model=ZoneSummaryResponse)
async def get_zones_summary() -> dict:
    """
    Returns aggregate venue statistics.
    Total attendees, zone count by risk level, avg occupancy.
    """
    try:
        if not db:
            return {"error": "No database connection available"}
            
        zones_ref = db.collection("zones").stream()
        zones = [doc.to_dict() for doc in zones_ref if doc.to_dict()]
        
        if not zones:
            return {"error": "No zone data available"}
        
        risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        total_count = 0
        total_pct = 0.0
        
        for z in zones:
            risk = z.get("risk_level", "low")
            if risk in risk_counts:
                risk_counts[risk] += 1
            total_count += z.get("current_count", 0)
            total_pct += z.get("occupancy_pct", 0)
        
        return {
            "total_attendees": total_count,
            "avg_occupancy_pct": round(total_pct / len(zones), 1),
            "zone_count": len(zones),
            "risk_distribution": risk_counts,
        }
    except Exception as e:
        logger.error(f"GET /zones/summary failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: str) -> dict:
    """Returns single zone state by ID."""
    try:
        if not db:
            raise HTTPException(status_code=503, detail="Database unavailable")
            
        doc = db.collection("zones").document(zone_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found")
        return doc.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"GET /zones/{zone_id} failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
