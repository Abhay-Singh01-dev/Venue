"""Fallback behavior tests for degraded backend responses."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes_pipeline import router as pipeline_router
from app.api.routes_system import router as system_router
import app.api.routes_pipeline as routes_pipeline
import app.api.routes_system as routes_system


def test_pipeline_latest_still_returns_structured_payload_without_db(monkeypatch) -> None:
    routes_system.db = None
    monkeypatch.setattr(routes_pipeline, "db", None)

    app = FastAPI()
    app.include_router(system_router)
    app.include_router(pipeline_router)
    client = TestClient(app)

    response = client.get("/pipeline/latest")
    assert response.status_code == 200

    payload = response.json()
    assert isinstance(payload, dict)
    assert payload.get("source") in [None, "offline", "cached", "live"]
