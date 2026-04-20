"""Simulation control route tests covering the fallback contract."""

import pytest


def test_simulation_status_no_db_returns_synthetic(app_client) -> None:
    response = app_client.get("/simulation/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["phase"] == "pre_match"
    assert payload["status"] in ["synthetic_no_db", "idle", "paused"]


def test_simulation_heartbeat_no_db(app_client) -> None:
    response = app_client.get("/simulation/heartbeat")
    assert response.status_code == 200
    payload = response.json()
    assert payload["current_phase"] == "pre_match"


@pytest.mark.parametrize(
    ("phase"),
    ["pre_match", "first_half", "halftime", "second_half", "final_whistle"],
)
def test_simulation_phase_valid_phases_accepted(app_client, phase: str) -> None:
    response = app_client.post("/simulation/phase", json={"phase": phase})
    assert response.status_code == 200
    assert response.json()["phase"] == phase


def test_simulation_phase_invalid_rejected(app_client) -> None:
    response = app_client.post("/simulation/phase", json={"phase": "invalid_phase"})
    assert response.status_code == 400


def test_simulation_play_returns_seconds(app_client) -> None:
    response = app_client.post("/simulation/play")
    assert response.status_code == 200
    assert response.json()["run_for_seconds"] == 60


def test_simulation_pause_succeeds(app_client) -> None:
    response = app_client.post("/simulation/pause")
    assert response.status_code == 200
    assert response.json()["message"].startswith("Simulation paused")


def test_simulation_play_rate_limited(app_client, monkeypatch) -> None:
    import app.api.routes_simulation as routes_simulation

    monkeypatch.setitem(routes_simulation._last_control_action_ts, "play", 0.0)

    first = app_client.post("/simulation/play")
    second = app_client.post("/simulation/play")

    assert first.status_code == 200
    assert second.status_code == 429