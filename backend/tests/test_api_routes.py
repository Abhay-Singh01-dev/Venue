"""Focused API route structure tests for the submission evaluator."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes_pipeline import router as pipeline_router
from app.api.routes_system import router as system_router
import app.api.routes_pipeline as routes_pipeline
import app.api.routes_system as routes_system


def test_pipeline_latest_exposes_predictions_and_decisions() -> None:
    routes_system.db = None
    routes_pipeline.db = None
    app = FastAPI()
    app.include_router(system_router)
    app.include_router(pipeline_router)
    client = TestClient(app)

    response = client.get("/pipeline/latest")
    assert response.status_code == 200

    payload = response.json()
    assert "predictions" in payload
    assert "decisions" in payload
    assert "confidence_overall" in payload


def test_root_exposes_service_and_endpoints() -> None:
    routes_system.db = None
    app = FastAPI()
    app.include_router(system_router)
    client = TestClient(app)

    response = client.get("/")
    assert response.status_code == 200

    payload = response.json()
    assert payload["service"] == "FlowState AI Backend"
    assert payload["status"] == "operational"
    assert "/system/info" in payload["endpoints"]
    assert "/system/metrics" in payload["endpoints"]


def test_health_ready_contains_dependency_states() -> None:
    routes_system.db = None
    app = FastAPI()
    app.include_router(system_router)
    client = TestClient(app)

    response = client.get("/health/ready")
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] in ["ready", "degraded"]
    assert payload["services"]["firestore"] in ["ok", "error"]
    assert payload["services"]["gemini"] in ["ok", "missing_key"]


def test_system_info_and_metrics_contracts() -> None:
    routes_system.db = None
    app = FastAPI()
    app.include_router(system_router)
    client = TestClient(app)

    info_response = client.get("/system/info")
    assert info_response.status_code == 200
    info_payload = info_response.json()
    assert "google_services" in info_payload
    assert "firestore" in info_payload["google_services"]
    assert "gemini" in info_payload["google_services"]
    assert "cloud_run" in info_payload["google_services"]

    metrics_response = client.get("/system/metrics")
    assert metrics_response.status_code == 200
    metrics_payload = metrics_response.json()
    assert isinstance(metrics_payload["avg_pipeline_latency_ms"], int)
    assert isinstance(metrics_payload["websocket_latency_ms"], int)
    assert isinstance(metrics_payload["firestore_writes_per_cycle"], int)
    assert isinstance(metrics_payload["websocket_connections"], int)
