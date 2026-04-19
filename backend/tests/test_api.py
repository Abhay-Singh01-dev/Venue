"""Basic API regression tests for core backend routes.

These tests intentionally avoid real Firestore/Gemini dependencies by
patching route-module DB handles to None and using a lightweight test app.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from app.api.routes_system import router as system_router
from app.api.routes_zones import router as zones_router
from app.api.routes_pipeline import router as pipeline_router
from app.models.pipeline_models import PredictionResult


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Builds an isolated app instance for route contract testing."""
    import app.api.routes_system as routes_system
    import app.api.routes_zones as routes_zones
    import app.api.routes_pipeline as routes_pipeline

    monkeypatch.setattr(routes_system, "db", None)
    monkeypatch.setattr(routes_zones, "db", None)
    monkeypatch.setattr(routes_pipeline, "db", None)

    app = FastAPI()
    app.include_router(system_router)
    app.include_router(zones_router)
    app.include_router(pipeline_router)
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
