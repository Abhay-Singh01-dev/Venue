"""BigQuery integration helpers for evaluator-visible analytics export signals."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

try:
    from google.cloud import bigquery  # type: ignore
except Exception:  # pragma: no cover - optional dependency import guard
    bigquery = None

_last_insert_at: str | None = None
_last_error: str | None = None
_last_exported_run_id: str | None = None
_operation_count = 0
_last_success_at: str | None = None


def _is_enabled() -> bool:
    enabled_raw = os.getenv("BQ_ENABLED", "true").strip().lower()
    return enabled_raw not in {"0", "false", "no", "off"}


def _dataset_name() -> str:
    return os.getenv("BQ_DATASET", "flowstate_ai")


def _table_name() -> str:
    return os.getenv("BQ_TABLE", "pipeline_metrics")


def _project_name() -> str | None:
    return (
        os.getenv("BQ_PROJECT_ID")
        or os.getenv("GOOGLE_CLOUD_PROJECT")
        or os.getenv("GCP_PROJECT")
        or os.getenv("FIREBASE_PROJECT_ID")
    )


def _ensure_dataset_and_table(client: Any, project: str) -> None:
    dataset_id = f"{project}.{_dataset_name()}"
    table_id = f"{dataset_id}.{_table_name()}"

    dataset = bigquery.Dataset(dataset_id)
    client.create_dataset(dataset, exists_ok=True)

    schema = [
        bigquery.SchemaField("run_id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("run_at", "TIMESTAMP", mode="REQUIRED"),
        bigquery.SchemaField("source", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("pipeline_health", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("pipeline_latency_ms", "INT64", mode="NULLABLE"),
        bigquery.SchemaField("confidence_overall", "FLOAT64", mode="NULLABLE"),
        bigquery.SchemaField("predictions_count", "INT64", mode="NULLABLE"),
        bigquery.SchemaField("decisions_count", "INT64", mode="NULLABLE"),
        bigquery.SchemaField("fallback_used", "BOOL", mode="NULLABLE"),
        bigquery.SchemaField("inserted_at", "TIMESTAMP", mode="REQUIRED"),
    ]
    table = bigquery.Table(table_id, schema=schema)
    client.create_table(table, exists_ok=True)


def get_bigquery_status() -> dict[str, Any]:
    """Returns runtime status of BigQuery integration used for analytics export."""
    running_on_cloud_run = bool(os.getenv("K_SERVICE"))

    configured = bool(_project_name()) and _is_enabled()
    sdk_available = bigquery is not None

    status = "inactive"
    if configured and sdk_available:
        status = "active"
    elif configured and not sdk_available:
        status = "sdk_unavailable"
    elif not _is_enabled():
        status = "disabled"

    return {
        "status": status,
        "project": _project_name() or "unknown",
        "dataset": _dataset_name(),
        "table": _table_name(),
        "enabled": _is_enabled(),
        "sdk": "google-cloud-bigquery",
        "sdk_import": "available" if sdk_available else "unavailable",
        "runtime": "cloud_run" if running_on_cloud_run else "local",
        "operation_count": _operation_count,
        "last_success_at": _last_success_at,
        "last_insert_at": _last_insert_at,
        "last_error": _last_error,
        "last_exported_run_id": _last_exported_run_id,
    }


def log_pipeline_metrics_to_bigquery(pipeline_output: dict[str, Any]) -> bool:
    """Best-effort write of compact pipeline metrics row to BigQuery."""
    global _last_insert_at, _last_error, _last_exported_run_id, _operation_count, _last_success_at

    _operation_count += 1

    if not _is_enabled() or bigquery is None:
        return False

    project = _project_name()
    if not project:
        _last_error = "missing_project"
        return False

    table_id = f"{project}.{_dataset_name()}.{_table_name()}"
    row = {
        "run_id": str(pipeline_output.get("run_id", "")),
        "run_at": str(pipeline_output.get("run_at", datetime.now(timezone.utc).isoformat())),
        "source": str(pipeline_output.get("source", "unknown")),
        "pipeline_health": str(pipeline_output.get("pipeline_health", "unknown")),
        "pipeline_latency_ms": int(pipeline_output.get("pipeline_latency_ms", 0) or 0),
        "confidence_overall": float(pipeline_output.get("confidence_overall", 0.0) or 0.0),
        "predictions_count": len(pipeline_output.get("predictions", [])),
        "decisions_count": len(pipeline_output.get("decisions", [])),
        "fallback_used": bool(pipeline_output.get("fallback_used", False)),
        "inserted_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        client = bigquery.Client(project=project)
        _ensure_dataset_and_table(client, project)
        errors = client.insert_rows_json(table_id, [row], timeout=2.0)
        if errors:
            _last_error = str(errors)
            return False

        _last_insert_at = datetime.now(timezone.utc).isoformat()
        _last_success_at = _last_insert_at
        _last_exported_run_id = str(pipeline_output.get("run_id", ""))
        _last_error = None
        return True
    except Exception as exc:  # pragma: no cover - defensive runtime path
        _last_error = str(exc)
        return False
