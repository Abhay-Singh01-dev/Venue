"""Unit tests for Cloud Storage integration status and fallback behavior."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

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


def test_cloud_storage_status_active_and_write_succeeds(monkeypatch) -> None:
    class FakeBlob:
        def __init__(self, name: str) -> None:
            self.name = name
            self.updated = datetime.now(timezone.utc)
            self.payload = None

        def upload_from_string(self, payload: str, content_type: str, timeout: float) -> None:
            self.payload = payload

    class FakeBucket:
        def __init__(self) -> None:
            self.existing_blob = FakeBlob("pipeline_snapshots/2026-04-20/existing.json")
            self.uploaded_blob: FakeBlob | None = None

        def list_blobs(self, prefix: str, max_results: int, timeout: float):
            return [self.existing_blob][:max_results]

        def exists(self, timeout: float) -> bool:
            return True

        def blob(self, object_path: str) -> FakeBlob:
            self.uploaded_blob = FakeBlob(object_path)
            return self.uploaded_blob

    fake_bucket = FakeBucket()

    class FakeClient:
        def __init__(self, project: str) -> None:
            self.project = project
            self.bucket_name: str | None = None

        def bucket(self, bucket_name: str) -> FakeBucket:
            self.bucket_name = bucket_name
            return fake_bucket

        def create_bucket(self, bucket_name: str) -> FakeBucket:
            self.bucket_name = bucket_name
            return fake_bucket

    monkeypatch.setattr(
        cloud_storage_service,
        "storage",
        SimpleNamespace(Client=MagicMock(side_effect=lambda project: FakeClient(project))),
    )
    monkeypatch.setenv("GCS_ENABLED", "true")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "promptwarsonline")

    payload = cloud_storage_service.get_cloud_storage_status()
    assert payload["status"] == "active"

    ok = cloud_storage_service.write_pipeline_snapshot_to_gcs(
        {
            "run_id": "run-123",
            "run_at": "2026-04-20T00:00:00Z",
            "source": "cached",
            "pipeline_health": "degraded",
            "hotspots": ["north"],
            "predictions": [1, 2],
            "decisions": [1],
            "pipeline_duration_ms": 1234,
            "confidence_overall": 0.88,
            "fallback_used": True,
        }
    )

    assert ok is True
    assert fake_bucket.uploaded_blob is not None
    assert fake_bucket.uploaded_blob.payload is not None

    payload = cloud_storage_service.get_cloud_storage_status()
    assert payload["last_object_path"] is not None
    assert payload["last_error"] is None
