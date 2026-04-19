"""Simulator behavior tests for execution and state progression."""

from app.simulation.simulator import VenueSimulator


def test_simulator_initializes_with_zone_state() -> None:
    simulator = VenueSimulator()
    assert len(simulator.zone_states) > 0


def test_simulator_cycle_advances_tick_id() -> None:
    simulator = VenueSimulator()
    first_zone = next(iter(simulator.zone_states.keys()))

    initial_tick = simulator.zone_states[first_zone].get("tick_id")
    simulator.run_cycle()
    updated_tick = simulator.zone_states[first_zone].get("tick_id")

    assert updated_tick is not None
    assert initial_tick != updated_tick
