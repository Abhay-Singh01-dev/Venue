"""Core branch-coverage tests for the pipeline orchestrator."""

from __future__ import annotations

import copy

import pytest

import app.agents.pipeline as pipeline


class FakeSnapshot:
    def __init__(self, data, *, exists: bool, doc_id: str) -> None:
        self._data = data
        self.exists = exists
        self.id = doc_id

    def to_dict(self):
        if isinstance(self._data, dict):
            return copy.deepcopy(self._data)
        return self._data


class FakeDocumentReference:
    def __init__(self, db: "FakeDB", path: str, doc_id: str) -> None:
        self._db = db
        self.path = path
        self.id = doc_id

    def collection(self, name: str) -> "FakeCollectionReference":
        return FakeCollectionReference(self._db, f"{self.path}/{name}")

    def get(self) -> FakeSnapshot:
        if self.path in self._db.store:
            return FakeSnapshot(self._db.store[self.path], exists=True, doc_id=self.id)
        return FakeSnapshot(None, exists=False, doc_id=self.id)


class FakeCollectionReference:
    def __init__(self, db: "FakeDB", path: str) -> None:
        self._db = db
        self.path = path

    def document(self, doc_id: str | None = None) -> FakeDocumentReference:
        if doc_id is None:
            self._db.auto_doc_index += 1
            doc_id = f"auto-{self._db.auto_doc_index}"
        return FakeDocumentReference(self._db, f"{self.path}/{doc_id}", doc_id)

    def stream(self) -> list[FakeSnapshot]:
        prefix = f"{self.path}/"
        snapshots: list[FakeSnapshot] = []
        for path, data in self._db.store.items():
            if not path.startswith(prefix):
                continue
            suffix = path[len(prefix) :]
            if "/" in suffix:
                continue
            snapshots.append(FakeSnapshot(data, exists=True, doc_id=suffix))
        return snapshots


class FakeBatch:
    def __init__(self, db: "FakeDB", failures_before_success: int) -> None:
        self._db = db
        self._failures_before_success = failures_before_success
        self._operations: list[tuple[str, dict]] = []
        self.commit_calls = 0

    def set(self, document_ref: FakeDocumentReference, data: dict) -> None:
        self._operations.append((document_ref.path, copy.deepcopy(data)))

    def commit(self) -> None:
        self.commit_calls += 1
        if self.commit_calls <= self._failures_before_success:
            raise RuntimeError("transient commit failure")
        for path, data in self._operations:
            self._db.store[path] = data


class FakeDB:
    def __init__(self, store: dict[str, object] | None = None, *, failures_before_success: int = 0) -> None:
        self.store = dict(store or {})
        self.failures_before_success = failures_before_success
        self.auto_doc_index = 0
        self.batches: list[FakeBatch] = []

    def collection(self, name: str) -> FakeCollectionReference:
        return FakeCollectionReference(self, name)

    def batch(self) -> FakeBatch:
        batch = FakeBatch(self, self.failures_before_success)
        self.batches.append(batch)
        return batch


def _sample_output(run_id: str, predicted_pct: float) -> dict:
    return {
        "run_id": run_id,
        "run_at": "2026-04-20T00:00:00+00:00",
        "predictions": [
            {
                "zone_id": "north",
                "zone_name": "North Concourse",
                "predicted_pct": predicted_pct,
            }
        ],
        "pipeline_health": "healthy",
    }


@pytest.fixture(autouse=True)
def reset_pipeline_globals(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "_last_successful_output", None)
    monkeypatch.setattr(pipeline, "_previous_decisions", [])
    monkeypatch.setattr(pipeline, "_active_alerts", set())


def test_get_zone_states_from_firestore_sorts_descending(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_db = FakeDB(
        {
            "zones/low": {"zone_id": "low", "occupancy_pct": 42.0},
            "zones/high": {"zone_id": "high", "occupancy_pct": 89.0},
            "zones/empty": None,
        }
    )
    monkeypatch.setattr(pipeline, "db", fake_db)

    zones = pipeline._get_zone_states_from_firestore()

    assert [zone["zone_id"] for zone in zones] == ["high", "low"]


def test_get_phase_status_reads_firestore_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_db = FakeDB({"simulation/status": {"phase": "halftime"}})
    monkeypatch.setattr(pipeline, "db", fake_db)

    phase_status = pipeline._get_phase_status_from_firestore()

    assert phase_status == {"phase": "halftime"}


def test_get_phase_status_defaults_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "db", FakeDB())

    phase_status = pipeline._get_phase_status_from_firestore()

    assert phase_status == {"phase": "unknown"}


def test_calculate_action_impacts_only_reports_measurable_improvement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        pipeline,
        "_previous_decisions",
        [
            {"target_zone": "north", "instruction": "reroute", "_before_pct": 84.0},
            {"target_zone": "south", "instruction": "hold", "_before_pct": 50.0},
        ],
    )

    impacts = pipeline._calculate_action_impacts(
        [
            {"zone_id": "north", "occupancy_pct": 76.0},
            {"zone_id": "south", "occupancy_pct": 49.0},
        ]
    )

    assert len(impacts) == 1
    assert impacts[0]["target_zone"] == "north"
    assert impacts[0]["change_pct"] == 8.0
    assert impacts[0]["resolved"] is True


def test_write_pipeline_output_retries_commit_and_updates_alert_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_db = FakeDB(failures_before_success=1)
    monkeypatch.setattr(pipeline, "db", fake_db)

    export_calls = {"bigquery": 0, "storage": 0, "pubsub": 0}
    pubsub_pointers: list[str | None] = []

    def _fake_bigquery(_payload: dict) -> bool:
        export_calls["bigquery"] += 1
        return True

    def _fake_storage(_payload: dict) -> bool:
        export_calls["storage"] += 1
        return True

    def _fake_pubsub(_payload: dict, pointer: str | None) -> bool:
        export_calls["pubsub"] += 1
        pubsub_pointers.append(pointer)
        return True

    sleep_calls: list[int] = []

    monkeypatch.setattr(pipeline, "log_pipeline_metrics_to_bigquery", _fake_bigquery)
    monkeypatch.setattr(pipeline, "write_pipeline_snapshot_to_gcs", _fake_storage)
    monkeypatch.setattr(pipeline, "publish_pipeline_completed_event", _fake_pubsub)
    monkeypatch.setattr(pipeline.time, "sleep", lambda seconds: sleep_calls.append(seconds))

    pipeline._write_pipeline_output(_sample_output("run-1", 95.0))

    assert fake_db.batches[0].commit_calls == 2
    assert sleep_calls == [1]
    assert export_calls == {"bigquery": 1, "storage": 1, "pubsub": 1}
    assert pubsub_pointers == ["gcs://pipeline_snapshots/run-1.json"]
    assert "north" in pipeline._active_alerts
    assert any(path.startswith("alerts/") for path in fake_db.store)

    pipeline._write_pipeline_output(_sample_output("run-2", 72.0))
    assert "north" not in pipeline._active_alerts


def test_run_pipeline_returns_safe_empty_when_no_zones(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "_get_zone_states_from_firestore", lambda: [])
    monkeypatch.setattr(pipeline, "_get_phase_status_from_firestore", lambda: {"phase": "ignored"})
    monkeypatch.setattr(pipeline.uuid, "uuid4", lambda: "run-empty")

    metrics_payloads: list[dict] = []
    storage_payloads: list[dict] = []
    monkeypatch.setattr(
        pipeline,
        "log_pipeline_metrics_to_bigquery",
        lambda payload: metrics_payloads.append(payload) or True,
    )
    monkeypatch.setattr(
        pipeline,
        "write_pipeline_snapshot_to_gcs",
        lambda payload: storage_payloads.append(payload) or True,
    )

    result = pipeline.run_pipeline()

    assert result["run_id"] == "run-empty"
    assert result["source"] == "cached"
    assert result["pipeline_health"] == "degraded"
    assert metrics_payloads[0]["run_id"] == "run-empty"
    assert storage_payloads[0]["run_id"] == "run-empty"


def test_run_pipeline_uses_cached_output_when_zones_are_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cached_seed = {
        "run_id": "seed",
        "source": "live",
        "pipeline_health": "healthy",
        "hotspots": [],
        "predictions": [],
        "decisions": [],
        "communication": {},
    }
    monkeypatch.setattr(pipeline, "_last_successful_output", cached_seed)
    monkeypatch.setattr(pipeline, "_get_zone_states_from_firestore", lambda: [])
    monkeypatch.setattr(pipeline.uuid, "uuid4", lambda: "run-cached")
    monkeypatch.setattr(pipeline, "log_pipeline_metrics_to_bigquery", lambda _payload: True)
    monkeypatch.setattr(pipeline, "write_pipeline_snapshot_to_gcs", lambda _payload: True)

    result = pipeline.run_pipeline()

    assert result["run_id"] == "run-cached"
    assert result["source"] == "cached"
    assert result["pipeline_health"] == "degraded"
    assert result["fallback_reason"] == "Using last successful pipeline output"


def test_run_pipeline_retries_fallback_responses_and_updates_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    zones = [{"zone_id": "north", "occupancy_pct": 70.0, "name": "North"}]

    monkeypatch.setattr(pipeline, "_get_zone_states_from_firestore", lambda: zones)
    monkeypatch.setattr(pipeline, "_get_phase_status_from_firestore", lambda: {"phase": "first_half"})
    monkeypatch.setattr(pipeline.uuid, "uuid4", lambda: "run-live")
    monkeypatch.setattr(
        pipeline,
        "_previous_decisions",
        [{"target_zone": "north", "instruction": "Earlier action", "_before_pct": 83.0}],
    )

    attempt = {"count": 0}

    def _fake_predictor(_analyst: dict, _zones: list[dict], _phase: dict) -> dict:
        attempt["count"] += 1
        payload = {
            "predictions": [
                {
                    "zone_id": "north",
                    "zone_name": "North",
                    "current_pct": 70.0,
                    "predicted_pct": 82.0,
                }
            ],
            "overall_prediction_confidence": 0.91,
        }
        if attempt["count"] < 3:
            payload["_fallback"] = True
        return payload

    monkeypatch.setattr(
        pipeline,
        "run_analyst",
        lambda _zones: {"hotspots": ["north"], "cascade_zones": [], "summary": "stable"},
    )
    monkeypatch.setattr(pipeline, "run_predictor", _fake_predictor)
    monkeypatch.setattr(
        pipeline,
        "run_decision",
        lambda _pred, _analyst: {
            "decisions": [
                {
                    "action_type": "routing",
                    "target_zone": "north",
                    "instruction": "Open Gate B",
                    "priority": "high",
                    "expected_impact": "Reduce queue",
                }
            ],
            "operations_summary": "Shifted ingress routing",
        },
    )
    monkeypatch.setattr(
        pipeline,
        "run_communicator",
        lambda _decision, _predictor, _analyst: {
            "attendee_notification": "Use Gate B",
            "staff_alert": "Assist Gate B",
            "signage_message": "Gate B Open",
            "narration": "Rerouting active",
            "reasoning_chain": {
                "cause": "Queue rising",
                "trend": "rising",
                "prediction": "North at risk",
                "reasoning": "Redirect ingress to distribute load",
                "action": "Open Gate B",
                "status": "Applied",
            },
        },
    )

    sleep_calls: list[float] = []
    written_payloads: list[dict] = []
    monkeypatch.setattr(pipeline.time, "sleep", lambda seconds: sleep_calls.append(seconds))
    monkeypatch.setattr(pipeline, "_write_pipeline_output", lambda payload: written_payloads.append(payload))

    result = pipeline.run_pipeline()

    assert attempt["count"] == 3
    assert sleep_calls == [0.5, 1.0]
    assert result["run_id"] == "run-live"
    assert result["source"] == "live"
    assert result["pipeline_health"] == "healthy"
    assert result["fallback_used"] is True
    assert result["fallback_reason"] == "Gemini API failure"
    assert result["metrics"]["predictions_count"] == 1
    assert result["impacts"][0]["target_zone"] == "north"
    assert written_payloads and written_payloads[0]["run_id"] == "run-live"
    assert pipeline._last_successful_output["run_id"] == "run-live"
    assert pipeline._previous_decisions[0]["_before_pct"] == 70.0


def test_run_pipeline_exception_path_falls_back_to_cached_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        pipeline,
        "_last_successful_output",
        {"run_id": "seed", "source": "live", "pipeline_health": "healthy"},
    )
    monkeypatch.setattr(
        pipeline,
        "_get_zone_states_from_firestore",
        lambda: [{"zone_id": "north", "occupancy_pct": 70.0}],
    )
    monkeypatch.setattr(pipeline, "_get_phase_status_from_firestore", lambda: {"phase": "halftime"})
    monkeypatch.setattr(pipeline.uuid, "uuid4", lambda: "run-fail")
    monkeypatch.setattr(
        pipeline,
        "run_analyst",
        lambda _zones: (_ for _ in ()).throw(RuntimeError("agent failure")),
    )

    metrics_payloads: list[dict] = []
    storage_payloads: list[dict] = []
    monkeypatch.setattr(
        pipeline,
        "log_pipeline_metrics_to_bigquery",
        lambda payload: metrics_payloads.append(payload) or True,
    )
    monkeypatch.setattr(
        pipeline,
        "write_pipeline_snapshot_to_gcs",
        lambda payload: storage_payloads.append(payload) or True,
    )

    result = pipeline.run_pipeline()

    assert result["run_id"] == "run-fail"
    assert result["source"] == "cached"
    assert result["pipeline_health"] == "degraded"
    assert result["fallback_reason"] == "Using last successful pipeline output"
    assert metrics_payloads and storage_payloads
