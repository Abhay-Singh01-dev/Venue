"""Unit tests for Pub/Sub workflow evidence status and fallback behavior."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services import pubsub_service


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