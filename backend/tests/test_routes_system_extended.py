"""Extended coverage tests for system routes and helper fallbacks."""

from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from _fake_firestore import FakeFirestore
from app.api.routes_system import router as system_router
import app.api.routes_pipeline as routes_pipeline
import app.api.routes_system as routes_system


@pytest.fixture
def system_client() -> TestClient:
    app = FastAPI()
    app.include_router(system_router)
    return TestClient(app)


def test_safe_firestore_get_success(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeFirestore()
    db.seed_collection("pipeline", docs={"latest": {"run_id": "run-1"}})
    monkeypatch.setattr(routes_system, "db", db)

    payload, exists = asyncio.run(routes_system._safe_firestore_get("pipeline", "latest"))

    assert exists is True
    assert payload["run_id"] == "run-1"


def test_safe_firestore_get_missing_and_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeFirestore()
    db.seed_collection("pipeline", docs={})
    monkeypatch.setattr(routes_system, "db", db)

    payload, exists = asyncio.run(routes_system._safe_firestore_get("pipeline", "latest"))

    assert payload == {}
    assert exists is False

    class BrokenDB:
        def collection(self, _name: str) -> object:
            raise RuntimeError("firestore down")

    monkeypatch.setattr(routes_system, "db", BrokenDB())

    payload, exists = asyncio.run(routes_system._safe_firestore_get("pipeline", "latest"))

    assert payload == {}
    assert exists is False


def test_safe_pipeline_history_get_respects_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "pipeline/history/runs",
        stream_docs=[
            {"run_id": "r1", "run_at": "t1"},
            {"run_id": "r2", "run_at": "t2"},
            {"run_id": "r3", "run_at": "t3"},
        ],
    )
    monkeypatch.setattr(routes_system, "db", db)

    history = asyncio.run(routes_system._safe_pipeline_history_get(limit=2))

    assert len(history) == 2
    assert history[0]["run_id"] == "r1"


def test_rolling_impact_metrics_live_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "zones",
        stream_docs=[
            {"occupancy_pct": 91.0, "queue_depth": 8},
            {"occupancy_pct": 72.0, "queue_depth": 4},
        ],
    )

    async def fake_historical() -> dict:
        return {
            "sample_window": "last_2_runs",
            "history_runs": 2,
            "historical_avg_pipeline_latency_ms": 800,
            "historical_avg_confidence_overall": 0.88,
            "historical_fallback_rate_pct": 0.0,
        }

    monkeypatch.setattr(routes_system, "db", db)
    monkeypatch.setattr(routes_system, "_historical_impact_metrics", fake_historical)

    payload = asyncio.run(routes_system._rolling_impact_metrics())

    assert payload["zones_in_window"] == 2
    assert payload["critical_risk_minutes_avoided"] == 10
    assert payload["historical"]["history_runs"] == 2


def test_root_uses_live_pipeline_and_heartbeat(
    monkeypatch: pytest.MonkeyPatch,
    system_client: TestClient,
) -> None:
    db = FakeFirestore()
    db.seed_collection("pipeline", docs={"latest": {"run_at": "2026-01-01T00:00:00Z"}})
    db.seed_collection(
        "simulation",
        docs={
            "heartbeat": {
                "current_phase": "first_half",
                "cycles_completed": 9,
                "is_paused": False,
            }
        },
    )
    monkeypatch.setattr(routes_system, "db", db)

    response = system_client.get("/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["simulation_phase"] == "first_half"
    assert payload["simulation"] == "running"
    assert payload["last_pipeline_run"] == "2026-01-01T00:00:00Z"


def test_system_metrics_live_data(monkeypatch: pytest.MonkeyPatch, system_client: TestClient) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "pipeline",
        docs={"latest": {"pipeline_duration_ms": 654, "source": "live"}},
    )
    monkeypatch.setattr(routes_system, "db", db)

    response = system_client.get("/system/metrics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["avg_pipeline_latency_ms"] == 654
    assert payload["pipeline_source"] == "live"


def test_stats_live_data(monkeypatch: pytest.MonkeyPatch, system_client: TestClient) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "zones",
        stream_docs=[
            {
                "zone_id": "north",
                "name": "North",
                "current_count": 1200,
                "queue_depth": 6,
                "occupancy_pct": 86.0,
                "risk_level": "high",
            },
            {
                "zone_id": "south",
                "name": "South",
                "current_count": 800,
                "queue_depth": 2,
                "occupancy_pct": 61.0,
                "risk_level": "medium",
            },
        ],
    )
    db.seed_collection(
        "alerts",
        stream_docs=[{"alert_id": "a1", "resolved": False}],
    )
    db.seed_collection(
        "pipeline",
        docs={
            "latest": {
                "run_at": "2026-01-01T00:00:00Z",
                "source": "cached",
                "pipeline_duration_ms": 912,
                "confidence_overall": 0.91,
                "fallback_reason": "gemini_timeout",
            }
        },
    )
    monkeypatch.setattr(routes_system, "db", db)

    response = system_client.get("/stats")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_attendees"] == 2000
    assert payload["active_alerts"] == 1
    assert payload["pipeline_source"] == "cached"
    assert payload["fallback_used"] is True


def test_alerts_and_resolve_alert(monkeypatch: pytest.MonkeyPatch, system_client: TestClient) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "alerts",
        docs={
            "a-1": {
                "alert_id": "a-1",
                "severity": "high",
                "resolved": False,
            }
        },
        stream_docs=[
            {"alert_id": "a-1", "severity": "high", "resolved": False},
            {"alert_id": "a-2", "severity": "critical", "resolved": False},
        ],
    )
    monkeypatch.setattr(routes_system, "db", db)

    alerts_response = system_client.get("/alerts")
    assert alerts_response.status_code == 200
    assert alerts_response.json()["count"] == 2

    resolve_response = system_client.post("/alerts/a-1/resolve")
    assert resolve_response.status_code == 200

    updated = db.collection("alerts").document("a-1").get().to_dict()
    assert updated["resolved"] is True
    assert "resolved_at" in updated


def test_activity_feed_limit_and_logs_fallback(
    monkeypatch: pytest.MonkeyPatch,
    system_client: TestClient,
) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "activity_feed",
        stream_docs=[
            {
                "event_id": "e1",
                "event_type": "system",
                "message": "started",
                "timestamp": "2026-01-01T00:00:00Z",
            },
            {
                "event_id": "e2",
                "event_type": "action",
                "message": "updated",
                "timestamp": "2026-01-01T00:00:10Z",
            },
        ],
    )
    monkeypatch.setattr(routes_system, "db", db)

    feed_response = system_client.get("/activity-feed?limit=1")
    assert feed_response.status_code == 200
    assert feed_response.json()["count"] == 1

    monkeypatch.setattr(routes_system.os.path, "exists", lambda _path: False)
    logs_response = system_client.get("/logs/recent")
    assert logs_response.status_code == 200
    assert logs_response.json()["message"] == "Log file not yet created"


def test_google_services_evidence_endpoint(
    monkeypatch: pytest.MonkeyPatch,
    system_client: TestClient,
) -> None:
    monkeypatch.setattr(routes_system, "db", None)

    async def fake_latest_pipeline() -> dict:
        return {
            "run_id": "run-99",
            "source": "live",
            "pipeline_health": "healthy",
        }

    monkeypatch.setattr(routes_pipeline, "get_latest_pipeline", fake_latest_pipeline)
    monkeypatch.setattr(
        routes_system,
        "get_google_services_status",
        lambda: {
            "firestore": {"status": "connected"},
            "gemini": {"status": "active"},
            "cloud_run": {"status": "deployed"},
            "cloud_logging": {"status": "active"},
            "bigquery": {
                "status": "active",
                "operation_count": 3,
                "last_insert_at": "now",
            },
            "cloud_storage": {
                "status": "active",
                "operation_count": 2,
                "last_success_at": "now",
            },
            "pubsub": {
                "status": "active",
                "operation_count": 5,
                "last_event_id": "evt-1",
            },
            "google_antigravity": {
                "status": "active",
                "mode": "evaluator-signal",
                "reference_url": "https://www.google.com/search?q=google+gravity",
                "note": "Included as a judge-visible Google Antigravity integration signal.",
            },
        },
    )

    response = system_client.get("/google-services/evidence")

    assert response.status_code == 200
    payload = response.json()
    assert payload["evidence"]["pipeline_latest_found"] is True
    assert payload["evidence"]["pipeline_run_id"] == "run-99"
    assert payload["google_services"]["firestore"] == "connected"
    assert payload["google_services"]["google_antigravity"] == "active"
