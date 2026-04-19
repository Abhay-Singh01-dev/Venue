"""Basic response-time guardrails for critical endpoints in offline mode."""

from time import perf_counter

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes_system import router as system_router
import app.api.routes_system as routes_system


def _client() -> TestClient:
    routes_system.db = None
    app = FastAPI()
    app.include_router(system_router)
    return TestClient(app)


def test_root_response_time_under_threshold() -> None:
    client = _client()

    start = perf_counter()
    response = client.get("/")
    elapsed_ms = (perf_counter() - start) * 1000

    assert response.status_code == 200
    assert elapsed_ms < 2000


def test_system_metrics_response_time_under_threshold() -> None:
    client = _client()

    start = perf_counter()
    response = client.get("/system/metrics")
    elapsed_ms = (perf_counter() - start) * 1000

    assert response.status_code == 200
    assert elapsed_ms < 2000
