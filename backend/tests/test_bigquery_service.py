"""Unit tests for BigQuery integration status and fallback-safe behavior."""

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
