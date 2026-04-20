"""Unit tests for Pub/Sub workflow evidence status and fallback behavior."""

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