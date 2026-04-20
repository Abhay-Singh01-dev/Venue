"""Unit tests for Pub/Sub workflow evidence status and fallback behavior."""

import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services import pubsub_service


@pytest.fixture(autouse=True)
def _reset_pubsub_runtime_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pubsub_service, "_operation_count", 0)
    monkeypatch.setattr(pubsub_service, "_last_published_at", None)
    monkeypatch.setattr(pubsub_service, "_last_error", None)
    monkeypatch.setattr(pubsub_service, "_last_event_id", None)
    monkeypatch.setattr(pubsub_service, "_last_run_id", None)
    monkeypatch.setattr(pubsub_service, "_last_downstream_evidence_pointer", None)
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("PUBSUB_PUBLISH_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("PUBSUB_PUBLISH_ATTEMPTS", raising=False)


def test_pubsub_status_disabled(monkeypatch) -> None:
    monkeypatch.setenv("PUBSUB_ENABLED", "false")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "promptwarsonline")

    payload = pubsub_service.get_pubsub_status()
    assert payload["status"] == "disabled"
    assert payload["enabled"] is False


def test_pubsub_missing_project(monkeypatch) -> None:
    monkeypatch.setenv("PUBSUB_ENABLED", "true")
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)

    ok = pubsub_service.publish_pipeline_completed_event({"run_id": "abc"})
    assert ok is False

    payload = pubsub_service.get_pubsub_status()
    assert payload["last_error"] in ["missing_project", None]


def test_pubsub_status_contract_keys() -> None:
    payload = pubsub_service.get_pubsub_status()
    expected_keys = {
        "status",
        "project",
        "topic",
        "enabled",
        "sdk",
        "sdk_import",
        "operation_count",
        "last_published_at",
        "last_error",
        "last_event_id",
        "last_run_id",
        "last_downstream_evidence_pointer",
    }
    assert expected_keys.issubset(payload.keys())


def test_pubsub_status_active_and_publish_succeeds(monkeypatch) -> None:
    class FakeFuture:
        def result(self, timeout: float) -> None:
            return None

    class FakePublisherClient:
        def __init__(self) -> None:
            self.published: list[tuple[str, bytes]] = []

        def topic_path(self, project: str, topic: str) -> str:
            return f"projects/{project}/topics/{topic}"

        def publish(self, topic_path: str, data: bytes) -> FakeFuture:
            self.published.append((topic_path, data))
            return FakeFuture()

    fake_pubsub = SimpleNamespace(PublisherClient=MagicMock(side_effect=FakePublisherClient))

    monkeypatch.setattr(pubsub_service, "pubsub_v1", fake_pubsub)
    monkeypatch.setenv("PUBSUB_ENABLED", "true")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "promptwarsonline")

    payload = pubsub_service.get_pubsub_status()
    assert payload["status"] == "active"

    ok = pubsub_service.publish_pipeline_completed_event(
        {
            "run_id": "run-123",
            "run_at": "2026-04-20T00:00:00Z",
            "source": "cached",
            "pipeline_health": "degraded",
        },
        downstream_evidence_pointer="gcs://pipeline_snapshots/2026-04-20/run-123.json",
    )

    assert ok is True
    fake_pubsub.PublisherClient.assert_called_once()

    payload = pubsub_service.get_pubsub_status()
    assert payload["last_run_id"] == "run-123"
    assert payload["last_downstream_evidence_pointer"] == "gcs://pipeline_snapshots/2026-04-20/run-123.json"
    assert payload["last_error"] is None


def test_pubsub_publish_retries_after_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeFuture:
        def __init__(self, should_timeout: bool) -> None:
            self.should_timeout = should_timeout

        def result(self, timeout: float) -> None:
            assert timeout == 5.0
            if self.should_timeout:
                raise TimeoutError()

    class FakePublisherClient:
        def __init__(self) -> None:
            self.publish_calls = 0

        def topic_path(self, project: str, topic: str) -> str:
            return f"projects/{project}/topics/{topic}"

        def publish(self, topic_path: str, data: bytes) -> FakeFuture:
            self.publish_calls += 1
            return FakeFuture(should_timeout=self.publish_calls == 1)

    fake_client = FakePublisherClient()
    fake_pubsub = SimpleNamespace(PublisherClient=MagicMock(return_value=fake_client))

    monkeypatch.setattr(pubsub_service, "pubsub_v1", fake_pubsub)
    monkeypatch.setattr(pubsub_service.time, "sleep", lambda _: None)
    monkeypatch.setenv("PUBSUB_ENABLED", "true")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "promptwarsonline")
    monkeypatch.setenv("PUBSUB_PUBLISH_ATTEMPTS", "2")
    monkeypatch.setenv("PUBSUB_PUBLISH_TIMEOUT_SECONDS", "5")

    ok = pubsub_service.publish_pipeline_completed_event({"run_id": "run-456"})

    assert ok is True
    assert fake_client.publish_calls == 2
    payload = pubsub_service.get_pubsub_status()
    assert payload["last_run_id"] == "run-456"
    assert payload["last_error"] is None


def test_pubsub_status_hydrates_on_cloud_run_with_cached_values(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeDoc:
        exists = True

        def to_dict(self) -> dict[str, object]:
            return {
                "last_event_id": "fresh-event",
                "last_run_id": "fresh-run",
                "last_published_at": "2026-04-20T15:21:30Z",
                "last_downstream_evidence_pointer": "gcs://pipeline_snapshots/2026-04-20/fresh-run.json",
                "operation_count": 9,
                "last_error": "TimeoutError",
            }

    class FakeDocumentRef:
        def get(self) -> FakeDoc:
            return FakeDoc()

    class FakeCollectionRef:
        def document(self, _doc: str) -> FakeDocumentRef:
            return FakeDocumentRef()

    class FakeDB:
        def collection(self, _name: str) -> FakeCollectionRef:
            return FakeCollectionRef()

    monkeypatch.setattr(pubsub_service, "pubsub_v1", SimpleNamespace())
    monkeypatch.setattr(pubsub_service, "_get_firestore_db", lambda: FakeDB())
    monkeypatch.setattr(pubsub_service, "_last_event_id", "stale-event")
    monkeypatch.setattr(pubsub_service, "_last_run_id", "stale-run")
    monkeypatch.setattr(pubsub_service, "_last_published_at", "2026-04-20T10:00:00Z")
    monkeypatch.setattr(pubsub_service, "_last_downstream_evidence_pointer", "gcs://pipeline_snapshots/stale.json")
    monkeypatch.setattr(pubsub_service, "_operation_count", 1)
    monkeypatch.setattr(pubsub_service, "_last_error", None)
    monkeypatch.setenv("PUBSUB_ENABLED", "true")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "promptwarsonline")
    monkeypatch.setenv("K_SERVICE", "flowstate-backend")

    payload = pubsub_service.get_pubsub_status()

    assert payload["status"] == "active"
    assert payload["last_event_id"] == "fresh-event"
    assert payload["last_run_id"] == "fresh-run"
    assert payload["operation_count"] == 9
    assert payload["last_error"] == "TimeoutError"