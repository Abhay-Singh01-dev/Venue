"""Cloud Storage integration helpers for pipeline evidence snapshots."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

try:
    from google.cloud import storage  # type: ignore
except Exception:  # pragma: no cover - optional dependency import guard
    storage = None

_operation_count = 0
_last_success_at: str | None = None
_last_error: str | None = None
_last_object_path: str | None = None
_last_run_id: str | None = None


def _get_firestore_db() -> Any | None:
    """Returns the Firestore client when available without hard dependency."""
    try:
        from app.firebase_client import db as firestore_db

        return firestore_db
    except Exception:
        return None


def _persist_cloud_storage_evidence() -> None:
    """Stores latest Cloud Storage proof in Firestore for cross-instance reads."""
    firestore_db = _get_firestore_db()
    if firestore_db is None:
        return

    try:
        firestore_db.collection("system").document("workflow_proof").set(
            {
                "cloud_storage_last_success_at": _last_success_at,
                "cloud_storage_last_error": _last_error,
                "cloud_storage_last_object_path": _last_object_path,
                "cloud_storage_last_run_id": _last_run_id,
                "cloud_storage_operation_count": _operation_count,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            merge=True,
        )
    except Exception:
        return


def _hydrate_cloud_storage_evidence_from_firestore() -> None:
    """Loads Cloud Storage evidence from Firestore to avoid stale instance-local data."""
    global _last_success_at, _last_error, _last_object_path, _last_run_id, _operation_count

    firestore_db = _get_firestore_db()
    if firestore_db is None:
        return

    try:
        doc = firestore_db.collection("system").document("workflow_proof").get()
        if not doc.exists:
            return

        payload = doc.to_dict() or {}
        _last_success_at = payload.get("cloud_storage_last_success_at") or _last_success_at
        _last_object_path = payload.get("cloud_storage_last_object_path") or _last_object_path
        _last_run_id = payload.get("cloud_storage_last_run_id") or _last_run_id
        if "cloud_storage_last_error" in payload:
            _last_error = payload.get("cloud_storage_last_error")

        persisted_count = payload.get("cloud_storage_operation_count")
        if isinstance(persisted_count, int):
            _operation_count = max(_operation_count, persisted_count)
    except Exception:
        return


def _is_enabled() -> bool:
    enabled_raw = os.getenv("GCS_ENABLED", "true").strip().lower()
    return enabled_raw not in {"0", "false", "no", "off"}


def _bucket_name() -> str:
    return os.getenv("GCS_BUCKET", "flowstate-ai-evidence")


def _project_name() -> str | None:
    return (
        os.getenv("GCS_PROJECT_ID")
        or os.getenv("GOOGLE_CLOUD_PROJECT")
        or os.getenv("GCP_PROJECT")
        or os.getenv("FIREBASE_PROJECT_ID")
    )


def get_cloud_storage_status() -> dict[str, Any]:
    """Returns runtime status and operation evidence for Cloud Storage snapshots."""
    global _last_success_at, _last_error, _last_object_path, _last_run_id

    running_on_cloud_run = bool(os.getenv("K_SERVICE"))
    configured = bool(_project_name()) and _is_enabled()
    sdk_available = storage is not None

    status = "inactive"
    if configured and sdk_available:
        status = "active"
    elif configured and not sdk_available:
        status = "sdk_unavailable"
    elif not _is_enabled():
        status = "disabled"

    if status == "active" and running_on_cloud_run:
        _hydrate_cloud_storage_evidence_from_firestore()

    # Derive proof from bucket contents when evidence has not yet been hydrated.
    if status == "active" and (_last_object_path is None or _last_run_id is None):
        try:
            client = storage.Client(project=_project_name())
            bucket = client.bucket(_bucket_name())
            blobs = list(bucket.list_blobs(prefix="pipeline_snapshots/", max_results=1, timeout=2.0))
            if blobs:
                _last_object_path = blobs[0].name
                _last_success_at = blobs[0].updated.isoformat() if blobs[0].updated else _last_success_at
                if _last_object_path.endswith(".json"):
                    _last_run_id = _last_object_path.rsplit("/", 1)[-1].removesuffix(".json")
        except Exception as exc:  # pragma: no cover - defensive runtime path
            _last_error = str(exc)

    return {
        "status": status,
        "project": _project_name() or "unknown",
        "bucket": _bucket_name(),
        "enabled": _is_enabled(),
        "sdk": "google-cloud-storage",
        "sdk_import": "available" if sdk_available else "unavailable",
        "operation_count": _operation_count,
        "last_success_at": _last_success_at,
        "last_error": _last_error,
        "last_object_path": _last_object_path,
        "last_run_id": _last_run_id,
    }


def write_pipeline_snapshot_to_gcs(pipeline_output: dict[str, Any]) -> bool:
    """Best-effort write of compact pipeline snapshot JSON to Cloud Storage."""
    global _operation_count, _last_success_at, _last_error, _last_object_path, _last_run_id

    _operation_count += 1

    if not _is_enabled() or storage is None:
        return False

    project = _project_name()
    if not project:
        _last_error = "missing_project"
        _persist_cloud_storage_evidence()
        return False

    run_id = str(pipeline_output.get("run_id", "unknown"))
    run_day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    object_path = f"pipeline_snapshots/{run_day}/{run_id}.json"

    compact_snapshot = {
        "run_id": run_id,
        "run_at": str(pipeline_output.get("run_at", datetime.now(timezone.utc).isoformat())),
        "source": str(pipeline_output.get("source", "unknown")),
        "pipeline_health": str(pipeline_output.get("pipeline_health", "unknown")),
        "hotspots": pipeline_output.get("hotspots", []),
        "predictions_count": len(pipeline_output.get("predictions", [])),
        "decisions_count": len(pipeline_output.get("decisions", [])),
        "pipeline_latency_ms": int(pipeline_output.get("pipeline_latency_ms", 0) or 0),
        "confidence_overall": float(pipeline_output.get("confidence_overall", 0.0) or 0.0),
        "fallback_used": bool(pipeline_output.get("fallback_used", False)),
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        client = storage.Client(project=project)
        bucket = client.bucket(_bucket_name())
        if not bucket.exists(timeout=2.0):
            bucket = client.create_bucket(_bucket_name())

        blob = bucket.blob(object_path)
        blob.upload_from_string(
            json.dumps(compact_snapshot, separators=(",", ":")),
            content_type="application/json",
            timeout=2.0,
        )

        _last_success_at = datetime.now(timezone.utc).isoformat()
        _last_object_path = object_path
        _last_run_id = run_id
        _last_error = None
        _persist_cloud_storage_evidence()
        return True
    except Exception as exc:  # pragma: no cover - defensive runtime path
        _last_error = str(exc)
        _persist_cloud_storage_evidence()
        return False
