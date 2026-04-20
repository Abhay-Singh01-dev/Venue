"""Unit tests for BigQuery integration status and fallback-safe behavior."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services import bigquery_service


def test_bigquery_status_disabled(monkeypatch) -> None:
    monkeypatch.setenv("BQ_ENABLED", "false")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "promptwarsonline")

    payload = bigquery_service.get_bigquery_status()
    assert payload["status"] == "disabled"
    assert payload["enabled"] is False


def test_bigquery_status_missing_project(monkeypatch) -> None:
    monkeypatch.setenv("BQ_ENABLED", "true")
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)

    ok = bigquery_service.log_pipeline_metrics_to_bigquery({"run_id": "abc"})
    assert ok is False

    payload = bigquery_service.get_bigquery_status()
    assert payload["last_error"] in ["missing_project", None]


def test_bigquery_status_contract_keys() -> None:
    payload = bigquery_service.get_bigquery_status()
    expected_keys = {
        "status",
        "project",
        "dataset",
        "table",
        "enabled",
        "sdk",
        "sdk_import",
        "runtime",
        "last_insert_at",
        "last_error",
    }
    assert expected_keys.issubset(payload.keys())


def test_bigquery_status_active_and_write_succeeds(monkeypatch) -> None:
    class FakeDataset:
        def __init__(self, dataset_id: str) -> None:
            self.dataset_id = dataset_id

    class FakeSchemaField:
        def __init__(self, name: str, field_type: str, mode: str = "NULLABLE") -> None:
            self.name = name
            self.field_type = field_type
            self.mode = mode

    class FakeTable:
        def __init__(self, table_id: str, schema: list[FakeSchemaField]) -> None:
            self.table_id = table_id
            self.schema = schema

    fake_client = MagicMock()
    fake_client.insert_rows_json.return_value = []
    fake_bigquery = SimpleNamespace(
        Dataset=FakeDataset,
        SchemaField=FakeSchemaField,
        Table=FakeTable,
        Client=MagicMock(return_value=fake_client),
    )

    monkeypatch.setattr(bigquery_service, "bigquery", fake_bigquery)
    monkeypatch.setenv("BQ_ENABLED", "true")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "promptwarsonline")

    payload = bigquery_service.get_bigquery_status()
    assert payload["status"] == "active"

    ok = bigquery_service.log_pipeline_metrics_to_bigquery(
        {
            "run_id": "run-123",
            "run_at": "2026-04-20T00:00:00Z",
            "source": "cached",
            "pipeline_health": "degraded",
            "pipeline_duration_ms": 1234,
            "confidence_overall": 0.88,
            "predictions": [1, 2],
            "decisions": [1],
            "fallback_used": True,
        }
    )

    assert ok is True
    fake_bigquery.Client.assert_called_once_with(project="promptwarsonline")
    fake_client.insert_rows_json.assert_called_once()

    payload = bigquery_service.get_bigquery_status()
    assert payload["last_exported_run_id"] == "run-123"
    assert payload["last_error"] is None
