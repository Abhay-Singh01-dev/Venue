"""
Core stadium crowd simulator. Generates realistic occupancy data
for all 12 zones across all match phases and writes to Firestore.
"""

import time
import uuid
import random
import logging
from datetime import datetime, timezone

from app.firebase_client import db
from app.simulation.zone_config import ZONE_CONFIG
from app.simulation.phase_controller import PhaseController, MatchPhase
from app.models.zone_models import ZoneState, RiskLevel, TrendDirection

logger = logging.getLogger(__name__)

__all__ = ["VenueSimulator"]


class VenueSimulator:
    def __init__(self) -> None:
        self.db = db  # Module instance fetched from client singleton
        self.phase_controller = PhaseController()
        self.zone_states: dict[str, dict] = {}
        self.previous_zone_states: dict[str, dict] = {}
        self.last_activity_events: list[dict] = []
        self._last_event_time: dict[str, float] = {}  # Anti-spam cooldown mapping
        
        self._initialize_zones()
        logger.info({"event": "simulator_initialized", "component": "simulator", "zones": len(self.zone_states)})
    
    def _initialize_zones(self) -> None:
        """
        Builds initial zone state dictionary from ZONE_CONFIG.
        Sets all occupancies to pre-match baseline values.
        """
        self.zone_states.clear()
        for zone_id, config in ZONE_CONFIG.items():
            baseline_pct = config["baseline"]["pre_match"]
            count = int((baseline_pct / 100) * config["capacity"])
            self.zone_states[zone_id] = {
                "zone_id": zone_id,
                "name": config["name"],
                "type": config["type"],
                "tick_id": str(uuid.uuid4()),
                "occupancy_pct": float(baseline_pct),
                "flow_rate": float(random.uniform(50, 200)),
                "queue_depth": random.randint(0, 5),
                "risk_level": self._calculate_risk(baseline_pct),
                "trend": TrendDirection.STABLE.value,
                "capacity": config["capacity"],
                "current_count": count,
                "adjacent_zones": config["adjacent"],
            }
    
    def _calculate_risk(self, occupancy_pct: float) -> str:
        """Calculates strict risk level from occupancy percentage."""
        if occupancy_pct >= 90:
            return RiskLevel.CRITICAL.value
        if occupancy_pct >= 80:
            return RiskLevel.HIGH.value
        if occupancy_pct >= 60:
            return RiskLevel.MEDIUM.value
        return RiskLevel.LOW.value
    
    def _calculate_trend(self, zone_id: str, current_pct: float) -> str:
        """
        Compares current occupancy to previous cycle to determine trend.
        Rising if delta > 2%, falling if delta < -2%, else stable.
        """
        if zone_id not in self.previous_zone_states:
            return TrendDirection.STABLE.value
            
        prev_pct = self.previous_zone_states[zone_id]["occupancy_pct"]
        delta = current_pct - prev_pct
        
        if delta > 2:
            return TrendDirection.RISING.value
        if delta < -2:
            return TrendDirection.FALLING.value
        return TrendDirection.STABLE.value
    
    def _get_target_occupancy(self, zone_id: str) -> float:
        """
        Gets target occupancy for a zone based on current match phase.
        Applies cascade effect: if adjacent zone is critical, this zone
        receives +5 to +15% spillover pressure.
        """
        phase = self.phase_controller.get_current_phase().value
        baseline = ZONE_CONFIG[zone_id]["baseline"]
        # Fallback for phases that have no explicit baseline entry
        # (for example, post_match) so cycles keep progressing safely.
        base_target = baseline.get(phase, baseline.get("final_whistle", 0.0))
        
        cascade_bonus = 0.0
        for adj_zone_id in ZONE_CONFIG[zone_id]["adjacent"]:
            if adj_zone_id in self.zone_states:
                adj_occupancy = self.zone_states[adj_zone_id]["occupancy_pct"]
                if adj_occupancy >= 90:
                    cascade_bonus += random.uniform(5, 15)
                elif adj_occupancy >= 80:
                    cascade_bonus += random.uniform(2, 7)
        
        # Prevent unrealistic spikes by capping cascade bonus
        cascade_bonus = min(cascade_bonus, 25.0)
        return min(99.0, base_target + cascade_bonus)
    
    def _add_noise(self, value: float) -> float:
        """
        Adds realistic organic noise to occupancy values.
        Uses gaussian noise centered at 0 with std dev 3.
        Occasionally (5% chance) adds a micro-event spike of 8-15%.
        """
        noise = random.gauss(0, 3)
        micro_event = 0.0
        rand_val = random.random()
        if rand_val < 0.08:
            micro_event = random.uniform(10, 20)
            logger.debug(f"Micro-event spike applied: +{micro_event:.1f}%")
        elif rand_val < 0.12:  # 4% chance (from 0.08 to 0.12)
            micro_event = random.uniform(-15, -8)
            logger.debug(f"Crowd dispersal event applied: {micro_event:.1f}%")
            
        return value + noise + micro_event
    
    def _update_zone(self, zone_id: str) -> None:
        """
        Updates a single zone's state for the current simulation cycle.
        Moves current occupancy 15% toward target (smooth interpolation)
        then applies localized noise. Updates all derived fields.
        """
        current = self.zone_states[zone_id]
        target = self._get_target_occupancy(zone_id)
        
        # Smooth interpolation: faster 0.25 step for visible dramatic changes
        raw_new_pct = current["occupancy_pct"] + 0.25 * (target - current["occupancy_pct"])
        new_pct = max(0.0, min(99.0, self._add_noise(raw_new_pct)))
        
        # Update flow rate based on phase and type realistically
        phase = self.phase_controller.get_current_phase()
        if current["type"] == "concourse" and phase == MatchPhase.HALFTIME:
            raw_flow = random.uniform(400, 800)
        elif current["type"] == "gate" and phase == MatchPhase.FINAL_WHISTLE:
            raw_flow = random.uniform(500, 900)
        elif current["type"] == "seating" and phase in (MatchPhase.FIRST_HALF, MatchPhase.SECOND_HALF):
            raw_flow = random.uniform(50, 150)
        else:
            pct_delta = new_pct - current["occupancy_pct"]
            raw_flow = current["flow_rate"] + (pct_delta * 10) + random.gauss(0, 20)
            
        new_flow_rate = max(10.0, min(1000.0, raw_flow))
        
        # Queue depths cannot dip into negatives
        new_queue = max(0, int((new_pct / 100) * 25 + random.gauss(0, 3)))
        queue_wait_minutes = round(max(0.5, new_queue * 0.4 + (new_pct / 100) * 8), 1)
        
        new_risk = self._calculate_risk(new_pct)
        new_trend = self._calculate_trend(zone_id, new_pct)
        new_count = int((new_pct / 100) * current["capacity"])
        
        self.zone_states[zone_id].update({
            "tick_id": str(uuid.uuid4()),
            "occupancy_pct": round(new_pct, 2),
            "flow_rate": round(new_flow_rate, 1),
            "queue_depth": new_queue,
            "queue_wait_minutes": queue_wait_minutes,
            "risk_level": new_risk,
            "trend": new_trend,
            "current_count": new_count,
        })
        
        # Spam-controlled threshold warning events
        prev_risk = self.previous_zone_states.get(zone_id, {}).get("risk_level", RiskLevel.LOW.value)
        if new_risk != prev_risk and new_risk in (RiskLevel.HIGH.value, RiskLevel.CRITICAL.value):
            now_ts = time.time()
            last_event = self._last_event_time.get(zone_id, 0)
            
            # Require 10 second cooldown between severity change popups on same zone
            if now_ts - last_event > 10:
                templates = [
                    f"{current['name']} occupancy crossing {new_pct:.0f}% threshold",
                    f"Crowd compression risk detected at {current['name']}",
                    f"Flow velocity spiking at {current['name']} — {new_flow_rate:.0f} people/min",
                    f"AI routing override triggered for {current['name']}",
                    f"Staff deployment recommended: {current['name']} at {new_pct:.0f}%",
                    f"Adjacent zone pressure building toward {current['name']}",
                    f"Queue depth critical at {current['name']}: {new_queue} deep"
                ]
                self._add_activity_event(
                    event_type="detection",
                    message=random.choice(templates),
                    zone_id=zone_id,
                    severity=new_risk,
                )
                self._last_event_time[zone_id] = now_ts
    
    def _add_activity_event(self, event_type: str, message: str,
                            zone_id: str | None = None, 
                            severity: str | None = None) -> None:
        """Creates an activity event dict and appends to cyclic buffer."""
        color_map = {
            "detection": "#ef4444",
            "action": "#3b82f6",
            "resolution": "#22c55e",
            "system": "#64748b",
        }
        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "message": message,
            "zone_id": zone_id,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc),
            "color": color_map.get(event_type, "#64748b"),
        }
        self.last_activity_events.append(event)
        if len(self.last_activity_events) > 5:
            self.last_activity_events = self.last_activity_events[-5:]
    
    def _write_to_firestore(self) -> None:
        """
        Strictly translates untyped active mapping into strict Pydantic ZoneState forms
        before committing all zone status snapshots to Firestore inside a safe batch
        retry loop. Gracefully skirts crashes in test environments.
        """
        if self.db is None:
            logger.warning({"event": "simulator_firestore_skipped", "component": "simulator", "reason": "no_database"})
            self.last_activity_events.clear()
            return
            
        batch = self.db.batch()
        now_ts = datetime.now(timezone.utc)
        
        # Strictly marshal all states through the type-safe Pydantic model
        for zone_id, state in self.zone_states.items():
            zone_model = ZoneState(**state, updated_at=now_ts)
            zone_ref = self.db.collection("zones").document(zone_id)
            batch.set(zone_ref, zone_model.model_dump(exclude_none=True))
            
        status_ref = self.db.collection("simulation").document("status")
        batch.set(status_ref, {
            **self.phase_controller.get_status(),
            "updated_at": now_ts,
        })
        
        # 3-Attempt Commit Rescue Wrapper
        for attempt in range(3):
            try:
                batch.commit()
                break
            except Exception:
                logger.error(
                    {
                        "event": "simulator_firestore_commit_retry",
                        "component": "simulator",
                        "attempt": attempt + 1,
                        "max_attempts": 3,
                    }
                )
                time.sleep(1)
        else:
            logger.critical({"event": "simulator_firestore_commit_failed", "component": "simulator", "max_attempts": 3})
            
        for event in self.last_activity_events:
            self.db.collection("activity_feed").add(event)
        self.last_activity_events.clear()
        
        logger.debug({"event": "simulator_firestore_write_complete", "component": "simulator", "zones": len(self.zone_states)})
    
    def run_cycle(self) -> None:
        """
        Executes one full synchronized simulation tick step.
        """
        try:
            self.previous_zone_states = {
                k: dict(v) for k, v in self.zone_states.items()
            }
            for zone_id in self.zone_states:
                self._update_zone(zone_id)
            self._write_to_firestore()
        except Exception as e:
            logger.error({"event": "simulator_cycle_failed", "component": "simulator", "error": str(e)}, exc_info=True)
    
    def seed_initial_data(self) -> None:
        """Writes initial zone layouts to DB upon load sync."""
        logger.info({"event": "simulator_seed_start", "component": "simulator"})
        try:
            self._write_to_firestore()
            logger.info({"event": "simulator_seed_complete", "component": "simulator"})
        except Exception as e:
            logger.error({"event": "simulator_seed_failed", "component": "simulator", "error": str(e)}, exc_info=True)
            raise
    
    def force_phase(self, phase_name: str) -> None:
        """Forces matching progression."""
        phase = MatchPhase(phase_name)
        self.phase_controller.force_phase(phase)
        self._add_activity_event(
            event_type="system",
            message=f"Simulation forced to phase: {phase_name}",
        )
    
    def reset(self) -> None:
        """Erases memory and regenerates early bounds."""
        self.phase_controller.reset()
        self._initialize_zones()
        self.seed_initial_data()
        logger.info({"event": "simulator_reset_complete", "component": "simulator"})
