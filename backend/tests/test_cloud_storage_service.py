"""Unit tests for Cloud Storage integration status and fallback behavior."""

from app.services import cloud_storage_service


def test_cloud_storage_status_disabled(monkeypatch) -> None:
    monkeypatch.setenv("GCS_ENABLED", "false")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "promptwarsonline")

    payload = cloud_storage_service.get_cloud_storage_status()
    assert payload["status"] == "disabled"
    assert payload["enabled"] is False


def test_cloud_storage_missing_project(monkeypatch) -> None:
    monkeypatch.setenv("GCS_ENABLED", "true")
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)

    ok = cloud_storage_service.write_pipeline_snapshot_to_gcs({"run_id": "abc"})
    assert ok is False

    payload = cloud_storage_service.get_cloud_storage_status()
    assert payload["last_error"] in ["missing_project", None]


def test_cloud_storage_status_contract_keys() -> None:
    payload = cloud_storage_service.get_cloud_storage_status()
    expected_keys = {
        "status",
        "project",
        "bucket",
        "enabled",
        "sdk",
        "sdk_import",
        "operation_count",
        "last_success_at",
        "last_error",
        "last_object_path",
    }
    assert expected_keys.issubset(payload.keys())
