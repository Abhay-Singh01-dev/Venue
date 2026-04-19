"""Basic API regression tests for core backend routes.

These tests intentionally avoid real Firestore/Gemini dependencies by
patching route-module DB handles to None and using a lightweight test app.
"""

import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError
from starlette.websockets import WebSocketState

from app.api.routes_system import router as system_router
from app.api.routes_zones import router as zones_router
from app.api.routes_pipeline import router as pipeline_router
from app.api.routes_simulation import router as simulation_router
from app.models.pipeline_models import PredictionResult


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Builds an isolated app instance for route contract testing."""
    import app.api.routes_system as routes_system
    import app.api.routes_zones as routes_zones
    import app.api.routes_pipeline as routes_pipeline
    import app.api.routes_simulation as routes_simulation

    monkeypatch.setattr(routes_system, "db", None)
    monkeypatch.setattr(routes_zones, "db", None)
    monkeypatch.setattr(routes_pipeline, "db", None)
    monkeypatch.setattr(routes_simulation, "db", None)

    app = FastAPI()
    app.include_router(system_router)
    app.include_router(zones_router)
    app.include_router(pipeline_router)
    app.include_router(simulation_router)
    return TestClient(app)


def test_root_health(client: TestClient) -> None:
    """Root health should return operational status payload."""
    response = client.get("/")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("status") == "operational"


def test_zones_endpoint(client: TestClient) -> None:
    """Zones endpoint should always provide zones array contract."""
    response = client.get("/zones/")
    assert response.status_code == 200
    payload = response.json()
    assert "zones" in payload
    assert isinstance(payload["zones"], list)


def test_pipeline_latest(client: TestClient) -> None:
    """Latest pipeline endpoint should return contract-compatible payload."""
    response = client.get("/pipeline/latest")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, dict)
    assert "message" in payload or "run_id" in payload


def test_stats_endpoint(client: TestClient) -> None:
    """Stats endpoint should expose all required dashboard fields."""
    response = client.get("/stats")
    assert response.status_code == 200
    payload = response.json()
    required = {
        "total_attendees",
        "active_alerts",
        "avg_queue_wait_min",
        "highest_risk_zone",
        "last_pipeline_run",
        "pipeline_source",
    }
    assert required.issubset(payload.keys())


def test_health_ready(client: TestClient) -> None:
    """Readiness endpoint should report ready or degraded status."""
    response = client.get("/health/ready")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("status") in ["ready", "degraded"]
    services = payload.get("services", {})
    assert services.get("firestore") in ["ok", "error"]
    assert services.get("gemini") in ["ok", "missing_key"]


def test_simulation_status_contract(client: TestClient) -> None:
    """Simulation status endpoint should always return contract-safe numeric fields."""
    response = client.get("/simulation/status")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("simulated_minutes"), (int, float))
    assert isinstance(payload.get("simulation_progress_pct"), (int, float))
    assert isinstance(payload.get("simulation_speed"), (int, float))


def test_simulation_heartbeat_contract(client: TestClient) -> None:
    """Simulation heartbeat endpoint should return contract-safe fallback payload in no-DB mode."""
    response = client.get("/simulation/heartbeat")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("simulated_minutes"), (int, float))
    assert isinstance(payload.get("simulation_speed"), (int, float))


def test_simulation_phase_rejects_invalid_input(client: TestClient) -> None:
    """Simulation phase endpoint should reject unknown phase values."""
    response = client.post("/simulation/phase", json={"phase": "not_a_real_phase"})
    assert response.status_code == 400


def test_prediction_result_confidence_contract() -> None:
    """Prediction confidence should remain normalized to the 0..1 contract."""
    prediction = PredictionResult(
        zone_id="zone-1",
        zone_name="Zone 1",
        current_pct=42.0,
        predicted_pct=48.0,
        confidence=0.85,
        uncertainty_reason="test",
        risk_trajectory="stable",
    )
    assert prediction.confidence == 0.85

    with pytest.raises(ValidationError):
        PredictionResult(
            zone_id="zone-1",
            zone_name="Zone 1",
            current_pct=42.0,
            predicted_pct=48.0,
            confidence=1.2,
            uncertainty_reason="test",
            risk_trajectory="stable",
        )


def test_websocket_snapshot_failure_skips_receive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If initial snapshot fails, websocket endpoint should exit without calling receive."""
    import app.main as app_main

    events = {
        "connected": False,
        "disconnected": False,
        "receive_called": False,
    }

    async def fake_connect(_ws: object) -> None:
        events["connected"] = True

    async def fake_send_snapshot(_ws: object, _snapshot: dict) -> bool:
        return False

    async def fake_disconnect(_ws: object) -> None:
        events["disconnected"] = True

    class DummyWebSocket:
        client_state = WebSocketState.CONNECTED

        async def receive_text(self) -> str:
            events["receive_called"] = True
            return "ping"

    monkeypatch.setattr(app_main, "db", None)
    monkeypatch.setattr(app_main.manager, "connect", fake_connect)
    monkeypatch.setattr(app_main.manager, "send_snapshot", fake_send_snapshot)
    monkeypatch.setattr(app_main.manager, "disconnect", fake_disconnect)

    asyncio.run(app_main.websocket_endpoint(DummyWebSocket()))

    assert events["connected"] is True
    assert events["disconnected"] is True
    assert events["receive_called"] is False


def test_websocket_not_connected_runtime_error_breaks_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Runtime not-connected races should break loop gracefully and disconnect."""
    import app.main as app_main

    events = {
        "connected": False,
        "disconnected": False,
    }

    async def fake_connect(_ws: object) -> None:
        events["connected"] = True

    async def fake_send_snapshot(_ws: object, _snapshot: dict) -> bool:
        return True

    async def fake_disconnect(_ws: object) -> None:
        events["disconnected"] = True

    class DummyWebSocket:
        client_state = WebSocketState.CONNECTED

        async def receive_text(self) -> str:
            raise RuntimeError('WebSocket is not connected. Need to call "accept" first.')

    monkeypatch.setattr(app_main, "db", None)
    monkeypatch.setattr(app_main.manager, "connect", fake_connect)
    monkeypatch.setattr(app_main.manager, "send_snapshot", fake_send_snapshot)
    monkeypatch.setattr(app_main.manager, "disconnect", fake_disconnect)

    asyncio.run(app_main.websocket_endpoint(DummyWebSocket()))

    assert events["connected"] is True
    assert events["disconnected"] is True
