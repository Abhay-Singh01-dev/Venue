"""Extended coverage tests for zones routes and helper logic."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from _fake_firestore import FakeFirestore
from app.api.routes_zones import router as zones_router
import app.api.routes_zones as routes_zones


@pytest.fixture
def zones_client() -> TestClient:
    app = FastAPI()
    app.include_router(zones_router)
    return TestClient(app)


@pytest.mark.parametrize(
    ("occupancy", "expected"),
    [
        (95.0, "critical"),
        (85.0, "high"),
        (65.0, "medium"),
        (45.0, "low"),
    ],
)
def test_risk_from_occupancy_boundaries(occupancy: float, expected: str) -> None:
    assert routes_zones._risk_from_occupancy(occupancy) == expected


def test_build_synthetic_zones_sorted_desc() -> None:
    zones = routes_zones._build_synthetic_zones()
    occupancy = [float(zone["occupancy_pct"]) for zone in zones]
    assert occupancy == sorted(occupancy, reverse=True)


def test_get_all_zones_live_and_fallback(
    monkeypatch: pytest.MonkeyPatch,
    zones_client: TestClient,
) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "zones",
        stream_docs=[
            {
                "zone_id": "north",
                "name": "North Concourse",
                "occupancy_pct": 88.0,
            },
            {
                "zone_id": "south",
                "name": "South Concourse",
                "occupancy_pct": 64.0,
            },
        ],
    )
    monkeypatch.setattr(routes_zones, "db", db)

    live_response = zones_client.get("/zones/")

    assert live_response.status_code == 200
    assert live_response.json()["count"] == 2

    class BrokenDB:
        def collection(self, _name: str) -> object:
            raise RuntimeError("boom")

    monkeypatch.setattr(routes_zones, "db", BrokenDB())

    fallback_response = zones_client.get("/zones/")

    assert fallback_response.status_code == 200
    assert fallback_response.json()["status"] == "synthetic_fallback"


def test_get_zones_summary_success_and_empty(
    monkeypatch: pytest.MonkeyPatch,
    zones_client: TestClient,
) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "zones",
        stream_docs=[
            {
                "zone_id": "north",
                "current_count": 1000,
                "occupancy_pct": 80.0,
                "risk_level": "high",
            },
            {
                "zone_id": "south",
                "current_count": 500,
                "occupancy_pct": 50.0,
                "risk_level": "low",
            },
        ],
    )
    monkeypatch.setattr(routes_zones, "db", db)

    response = zones_client.get("/zones/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_attendees"] == 1500
    assert payload["avg_occupancy_pct"] == 65.0
    assert payload["risk_distribution"]["high"] == 1

    db.seed_collection("zones", stream_docs=[])

    empty_response = zones_client.get("/zones/summary")
    assert empty_response.status_code == 200
    assert empty_response.json()["error"] == "No zone data available"


def test_get_zone_success_and_not_found(
    monkeypatch: pytest.MonkeyPatch,
    zones_client: TestClient,
) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "zones",
        docs={
            "north": {
                "zone_id": "north",
                "name": "North",
                "occupancy_pct": 82.0,
                "flow_rate": 120.0,
                "queue_depth": 5,
                "risk_level": "high",
                "trend": "rising",
                "capacity": 5000,
                "current_count": 4100,
                "adjacent_zones": ["east"],
            }
        },
    )
    monkeypatch.setattr(routes_zones, "db", db)

    success_response = zones_client.get("/zones/north")
    assert success_response.status_code == 200
    assert success_response.json()["zone_id"] == "north"

    missing_response = zones_client.get("/zones/west")
    assert missing_response.status_code == 404
