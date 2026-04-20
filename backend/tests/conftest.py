"""Shared test fixtures for FlowState AI backend tests."""

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routes_pipeline import router as pipeline_router
from app.api.routes_simulation import router as simulation_router
from app.api.routes_system import router as system_router
from app.api.routes_zones import router as zones_router
import app.api.routes_pipeline as routes_pipeline
import app.api.routes_simulation as routes_simulation
import app.api.routes_system as routes_system
import app.api.routes_zones as routes_zones


@pytest.fixture
def app_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Builds an isolated app instance with all public routers mounted."""
    monkeypatch.setattr(routes_pipeline, "db", None)
    monkeypatch.setattr(routes_simulation, "db", None)
    monkeypatch.setattr(routes_system, "db", None)
    monkeypatch.setattr(routes_zones, "db", None)

    app = FastAPI()
    app.include_router(system_router)
    app.include_router(pipeline_router)
    app.include_router(simulation_router)
    app.include_router(zones_router)
    return TestClient(app)


@pytest.fixture
def sample_zones() -> list[dict]:
    """Sample zone state for targetted contract tests."""
    return [
        {
            "zone_id": "north",
            "name": "North Concourse",
            "occupancy_pct": 85.0,
            "flow_rate": 320.0,
            "queue_depth": 12,
            "risk_level": "high",
            "trend": "rising",
            "capacity": 5000,
            "current_count": 4250,
        },
        {
            "zone_id": "south",
            "name": "South Concourse",
            "occupancy_pct": 45.0,
            "flow_rate": 120.0,
            "queue_depth": 3,
            "risk_level": "low",
            "trend": "stable",
            "capacity": 5000,
            "current_count": 2250,
        },
    ]