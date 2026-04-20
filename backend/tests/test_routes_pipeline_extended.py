"""Extended coverage tests for pipeline route helpers and fallbacks."""

from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from _fake_firestore import FakeFirestore
from app.api.routes_pipeline import router as pipeline_router
import app.api.routes_pipeline as routes_pipeline


@pytest.fixture
def pipeline_client() -> TestClient:
    app = FastAPI()
    app.include_router(pipeline_router)
    return TestClient(app)


def test_enrich_pipeline_payload_adds_metrics() -> None:
    payload = {
        "pipeline_duration_ms": "510",
        "confidence_overall": "0.87",
        "predictions": [{"zone_id": "north"}],
        "decisions": [{"action_type": "reroute"}, {"action_type": "notify"}],
        "source": "cached",
    }

    enriched = routes_pipeline._enrich_pipeline_payload(payload)

    assert enriched["pipeline_latency_ms"] == 510
    assert enriched["fallback_used"] is True
    assert enriched["metrics"]["predictions_count"] == 1
    assert enriched["metrics"]["decisions_count"] == 2


def test_safe_pipeline_latest_get_success(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeFirestore()
    db.seed_collection("pipeline", docs={"latest": {"run_id": "live-1"}})
    monkeypatch.setattr(routes_pipeline, "db", db)

    payload, exists = asyncio.run(routes_pipeline._safe_pipeline_latest_get())

    assert exists is True
    assert payload["run_id"] == "live-1"


def test_safe_pipeline_latest_get_handles_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    class BrokenDB:
        def collection(self, _name: str) -> object:
            raise RuntimeError("down")

    monkeypatch.setattr(routes_pipeline, "db", BrokenDB())

    payload, exists = asyncio.run(routes_pipeline._safe_pipeline_latest_get())

    assert payload == {}
    assert exists is False


def test_safe_pipeline_history_get_maps_data(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "pipeline/history/runs",
        stream_docs=[
            {
                "run_id": "run-1",
                "run_at": "2026-01-01T00:00:00Z",
                "source": "live",
                "hotspots": ["north"],
                "decisions": [{"action_type": "reroute"}],
                "confidence_overall": 0.9,
                "communication": {"narration": "ok"},
                "pipeline_duration_ms": 700,
            }
        ],
    )
    monkeypatch.setattr(routes_pipeline, "db", db)

    history = asyncio.run(routes_pipeline._safe_pipeline_history_get(limit=20))

    assert len(history) == 1
    assert history[0]["run_id"] == "run-1"
    assert history[0]["decisions_count"] == 1


def test_get_latest_pipeline_live_and_missing(
    monkeypatch: pytest.MonkeyPatch,
    pipeline_client: TestClient,
) -> None:
    live_db = FakeFirestore()
    live_db.seed_collection(
        "pipeline",
        docs={
            "latest": {
                "run_id": "run-live",
                "source": "live",
                "confidence_overall": 0.95,
                "predictions": [],
                "decisions": [],
            }
        },
    )
    monkeypatch.setattr(routes_pipeline, "db", live_db)

    live_response = pipeline_client.get("/pipeline/latest")
    assert live_response.status_code == 200
    assert live_response.json()["run_id"] == "run-live"

    missing_db = FakeFirestore()
    missing_db.seed_collection("pipeline", docs={})
    monkeypatch.setattr(routes_pipeline, "db", missing_db)

    missing_response = pipeline_client.get("/pipeline/latest")
    assert missing_response.status_code == 200
    assert "No pipeline output yet" in missing_response.json()["message"]


def test_get_latest_pipeline_exception_returns_cached(
    monkeypatch: pytest.MonkeyPatch,
    pipeline_client: TestClient,
) -> None:
    monkeypatch.setattr(routes_pipeline, "db", object())

    async def boom() -> tuple[dict, bool]:
        raise RuntimeError("timeout")

    monkeypatch.setattr(routes_pipeline, "_safe_pipeline_latest_get", boom)

    response = pipeline_client.get("/pipeline/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "cached"
    assert payload["pipeline_health"] == "degraded"


def test_get_pipeline_history_live_and_error(
    monkeypatch: pytest.MonkeyPatch,
    pipeline_client: TestClient,
) -> None:
    db = FakeFirestore()
    db.seed_collection(
        "pipeline/history/runs",
        stream_docs=[{"run_id": "r1", "run_at": "t1", "communication": {}}],
    )
    monkeypatch.setattr(routes_pipeline, "db", db)

    response = pipeline_client.get("/pipeline/history")
    assert response.status_code == 200
    assert response.json()["count"] == 1

    monkeypatch.setattr(routes_pipeline, "db", object())

    async def boom_history(_limit: int) -> list[dict]:
        raise RuntimeError("bad")

    monkeypatch.setattr(routes_pipeline, "_safe_pipeline_history_get", boom_history)

    error_response = pipeline_client.get("/pipeline/history")
    assert error_response.status_code == 500


def test_trigger_pipeline_success(monkeypatch: pytest.MonkeyPatch, pipeline_client: TestClient) -> None:
    routes_pipeline._last_manual_trigger_ts = 0.0
    monkeypatch.setattr(routes_pipeline, "run_pipeline", lambda: None)

    response = pipeline_client.post("/pipeline/trigger")

    assert response.status_code == 200
    payload = response.json()
    assert payload["message"] == "Pipeline cycle triggered"
    assert payload["check"] == "/pipeline/latest"
