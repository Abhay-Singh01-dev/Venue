"""Lightweight end-to-end API flow checks in offline mode."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes_pipeline import router as pipeline_router
from app.api.routes_simulation import router as simulation_router
from app.api.routes_system import router as system_router
from app.api.routes_zones import router as zones_router
import app.api.routes_pipeline as routes_pipeline
import app.api.routes_simulation as routes_simulation
import app.api.routes_system as routes_system
import app.api.routes_zones as routes_zones


def _offline_client() -> TestClient:
    routes_system.db = None
    routes_zones.db = None
    routes_pipeline.db = None
    routes_simulation.db = None

    app = FastAPI()
    app.include_router(system_router)
    app.include_router(zones_router)
    app.include_router(pipeline_router)
    app.include_router(simulation_router)
    return TestClient(app)


def test_judge_walkthrough_offline_contract() -> None:
    client = _offline_client()

    root = client.get("/")
    assert root.status_code == 200
    assert root.json()["status"] == "operational"

    zones = client.get("/zones/")
    assert zones.status_code == 200
    assert isinstance(zones.json().get("zones"), list)

    pipeline_latest = client.get("/pipeline/latest")
    assert pipeline_latest.status_code == 200
    assert isinstance(pipeline_latest.json(), dict)

    sim_status = client.get("/simulation/status")
    assert sim_status.status_code == 200
    assert "simulation_speed" in sim_status.json()
