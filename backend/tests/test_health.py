"""Health endpoint regression tests for explicit system signals."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes_system import router as system_router
import app.api.routes_system as routes_system


def test_root_exposes_explicit_google_signals() -> None:
    routes_system.db = None
    app = FastAPI()
    app.include_router(system_router)
    client = TestClient(app)

    response = client.get("/")
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] == "operational"
    assert payload["ai"] == "gemini-powered"
    assert payload["database"] == "firestore"
    assert payload["deployment"] == "cloud_run"
    assert payload["problem_solved"] == "crowd congestion prediction and prevention"
    assert payload["prediction_horizon_minutes"] == 10


def test_system_info_exposes_google_services() -> None:
    routes_system.db = None
    app = FastAPI()
    app.include_router(system_router)
    client = TestClient(app)

    response = client.get("/system/info")
    assert response.status_code == 200

    payload = response.json()
    assert payload["platform"] == "FlowState AI"
    assert payload["google_services"]["firestore"] in ["connected", "not_configured"]
    assert payload["google_services"]["gemini"] in ["active", "missing_key"]
    assert payload["google_services"]["cloud_run"] in ["deployed", "local"]
    assert payload["google_services"]["cloud_storage"] in ["active", "inactive", "sdk_unavailable", "disabled"]
    assert payload["google_services"]["cloud_logging"] in ["active", "inactive"]


def test_system_metrics_contract() -> None:
    routes_system.db = None
    app = FastAPI()
    app.include_router(system_router)
    client = TestClient(app)

    response = client.get("/system/metrics")
    assert response.status_code == 200

    payload = response.json()
    assert isinstance(payload["avg_pipeline_latency_ms"], int)
    assert isinstance(payload["websocket_latency_ms"], int)
    assert isinstance(payload["firestore_writes_per_cycle"], int)
    assert isinstance(payload["pipeline_source"], str)
