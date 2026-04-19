"""
Controls match phase progression and calculates target occupancy
values for each zone based on elapsed simulated time.
"""

import time
import logging
from enum import Enum

from app.config import settings


logger = logging.getLogger(__name__)

__all__ = ["MatchPhase", "PHASE_TRANSITIONS", "PHASE_DISPLAY_NAMES", "PhaseController"]


class MatchPhase(str, Enum):
    PRE_MATCH = "pre_match"
    FIRST_HALF = "first_half"
    HALFTIME = "halftime"
    SECOND_HALF = "second_half"
    FINAL_WHISTLE = "final_whistle"
    POST_MATCH = "post_match"


PHASE_TRANSITIONS = {
    # simulated minutes at which each phase starts
    MatchPhase.PRE_MATCH: 0,
    MatchPhase.FIRST_HALF: 20,
    MatchPhase.HALFTIME: 45,
    MatchPhase.SECOND_HALF: 55,
    MatchPhase.FINAL_WHISTLE: 90,
    MatchPhase.POST_MATCH: 95,
}

PHASE_DISPLAY_NAMES = {
    MatchPhase.PRE_MATCH: "Pre-match arrival",
    MatchPhase.FIRST_HALF: "First half",
    MatchPhase.HALFTIME: "Halftime surge",
    MatchPhase.SECOND_HALF: "Second half",
    MatchPhase.FINAL_WHISTLE: "Final whistle exodus",
    MatchPhase.POST_MATCH: "Post-match",
}

# Pre-sorted phases global for efficient lookups
SORTED_PHASES = sorted(PHASE_TRANSITIONS.items(), key=lambda x: x[1])


class PhaseController:
    """
    Tracks simulated match time and determines the current phase.
    Uses SIMULATION_SPEED to compress real time into simulated time.
    """
    
    # Compresses 90 simulated minutes into 60 real seconds. Use SIMULATION_SPEED=90 in .env for judge demo mode.
    ONE_MINUTE_MATCH_SPEED = 90.0

    def __init__(self) -> None:
        self.start_real_time: float = time.time()
        self.simulation_speed: float = settings.simulation_speed
        logger.info("PhaseController initialized", extra={"speed": self.simulation_speed})
    
    def get_simulated_minutes(self) -> float:
        """Returns elapsed simulated minutes since start, capped at 120 minutes."""
        real_elapsed_seconds = time.time() - self.start_real_time
        simulated_seconds = real_elapsed_seconds * self.simulation_speed
        minutes = simulated_seconds / 60.0
        return max(0.0, min(minutes, 120.0))
        
    def get_phase_start_minute(self, phase: MatchPhase) -> float:
        """Returns start minute of a given phase."""
        return PHASE_TRANSITIONS[phase]
    
    def get_current_phase(self) -> MatchPhase:
        """Determines current match phase based on simulated elapsed time."""
        minutes = self.get_simulated_minutes()
        current_phase = MatchPhase.PRE_MATCH
        
        for phase, start_minute in SORTED_PHASES:
            if minutes >= start_minute:
                current_phase = phase
            else:
                break
                
        return current_phase
    
    def get_phase_progress_pct(self) -> float:
        """Returns progress through current phase as 0-100 percentage."""
        minutes = self.get_simulated_minutes()
        current_phase = self.get_current_phase()
        phase_start = PHASE_TRANSITIONS[current_phase]
        
        # Get purely the minutes thresholds in order
        phases_sorted = [minute for _, minute in SORTED_PHASES]
        phase_idx = phases_sorted.index(phase_start)
        
        if phase_idx + 1 < len(phases_sorted):
            phase_end = phases_sorted[phase_idx + 1]
            duration = phase_end - phase_start
            
            if duration <= 0:
                return 100.0
                
            elapsed_in_phase = minutes - phase_start
            return min(100.0, (elapsed_in_phase / duration) * 100)
            
        return 100.0
    
    def get_status(self) -> dict:
        """Returns complete phase status for /simulation/status endpoint."""
        phase = self.get_current_phase()
        return {
            "phase": phase.value,
            "phase_display": PHASE_DISPLAY_NAMES[phase],
            "simulated_minutes": round(self.get_simulated_minutes(), 1),
            "phase_progress_pct": round(self.get_phase_progress_pct(), 1),
            "simulation_speed": self.simulation_speed,
            "total_match_duration_min": 90,
            "real_seconds_per_simulated_minute": round(60 / self.simulation_speed, 2) if self.simulation_speed > 0 else 0,
            "estimated_real_seconds_remaining": round((95 - min(self.get_simulated_minutes(), 95)) * (60 / self.simulation_speed), 1) if self.simulation_speed > 0 else 0,
            "next_phase": self._get_next_phase_info(self.get_simulated_minutes())
        }

    def _get_next_phase_info(self, current_minutes: float) -> str:
        """Helper to get string detailing the next phase."""
        for phase, start_minute in SORTED_PHASES:
            if start_minute > current_minutes:
                return f"{PHASE_DISPLAY_NAMES[phase]} in {round(start_minute - current_minutes, 1)} sim-min"
        return "None (Match Complete)"

    def get_phase_timeline(self) -> list[dict]:
        """
        Returns all 6 phases and their timing details.
        Powers the timeline bar on the frontend.
        """
        current_phase = self.get_current_phase()
        timeline = []
        
        for phase, start_minute in SORTED_PHASES:
            real_start_second = (start_minute * 60) / self.simulation_speed if self.simulation_speed > 0 else 0
            is_completed = start_minute < PHASE_TRANSITIONS[current_phase]
            is_current = phase == current_phase
            
            timeline.append({
                "phase": phase.value,
                "phase_display": PHASE_DISPLAY_NAMES[phase],
                "start_minute": start_minute,
                "real_start_second": round(real_start_second, 1),
                "is_current": is_current,
                "is_completed": is_completed
            })
            
        return timeline
    
    def reset(self) -> None:
        """Resets simulation back to minute zero (pre-match)."""
        self.start_real_time = time.time()
        logger.info("Simulation reset to pre-match phase")
    
    def force_phase(self, phase: MatchPhase) -> None:
        """Forces simulation to a specific phase by adjusting start time."""
        target_minutes = PHASE_TRANSITIONS[phase]
        target_real_seconds = (target_minutes * 60) / self.simulation_speed
        self.start_real_time = time.time() - target_real_seconds
        logger.info("Simulation forced to phase", extra={"phase": phase.value})
