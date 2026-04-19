import os
import sys

# Ensure backend package is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.simulation.simulator import VenueSimulator

def test_simulator_execution():
    """
    Test that the VenueSimulator initializes cleanly, sets up
    the required zones, and successfully completes a logic run cycle.
    """
    try:
        simulator = VenueSimulator()
        
        # Test 1: Instantiation should configure baseline zones
        assert len(simulator.zone_states) > 0, "Simulator did not initialize zones state."
        
        # Store a snapshot to confirm mutability
        zone_keys = list(simulator.zone_states.keys())
        first_zone = zone_keys[0]
        initial_tick = simulator.zone_states[first_zone].get("tick_id")
        
        # Test 2: Ensure the cycle executes
        simulator.run_cycle()
        
        # Ensure the tick_id changed
        updated_tick = simulator.zone_states[first_zone].get("tick_id")
        assert updated_tick is not None, "Simulation state tick_id missing!"
        assert initial_tick != updated_tick, "Tick ID did not advance!"
        
        print("[PASS] Simulator execution test successfully completed!")
        
    except Exception as e:
        print(f"[FAIL] Simulator execution test failed: {e}")
        raise

if __name__ == "__main__":
    test_simulator_execution()
