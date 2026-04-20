"""Pub/Sub integration helpers for pipeline workflow evidence."""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any

try:
    from google.cloud import pubsub_v1  # type: ignore
except Exception:  # pragma: no cover - optional dependency import guard
    pubsub_v1 = None

_operation_count = 0
_last_published_at: str | None = None
_last_error: str | None = None
_last_event_id: str | None = None
_last_run_id: str | None = None
_last_downstream_evidence_pointer: str | None = None


def _get_firestore_db() -> Any | None:
    """Returns the current Firestore client, if initialized."""
    try:
        from app.firebase_client import db as firestore_db

        return firestore_db
    except Exception:
        return None


def _persist_pubsub_evidence() -> None:
    """Stores latest Pub/Sub proof in Firestore for cross-instance visibility."""
    firestore_db = _get_firestore_db()
    if firestore_db is None:
        return

    try:
        firestore_db.collection("system").document("workflow_proof").set(
            {
                "last_event_id": _last_event_id,
                "last_run_id": _last_run_id,
                "last_published_at": _last_published_at,
                "last_downstream_evidence_pointer": _last_downstream_evidence_pointer,
                "operation_count": _operation_count,
                "last_error": _last_error,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            merge=True,
        )
    except Exception:
        # Firestore persistence is best-effort and should never fail publication.
        return


def _hydrate_pubsub_evidence_from_firestore() -> None:
    """Loads last known Pub/Sub evidence from Firestore for stable status payloads."""
    global _last_published_at, _last_event_id, _last_run_id, _last_downstream_evidence_pointer, _operation_count
    global _last_error

    firestore_db = _get_firestore_db()
    if firestore_db is None:
        return

    try:
        doc = firestore_db.collection("system").document("workflow_proof").get()
        if not doc.exists:
            return

        payload = doc.to_dict() or {}
        _last_published_at = payload.get("last_published_at") or _last_published_at
        _last_event_id = payload.get("last_event_id") or _last_event_id
        _last_run_id = payload.get("last_run_id") or _last_run_id
        _last_downstream_evidence_pointer = (
            payload.get("last_downstream_evidence_pointer") or _last_downstream_evidence_pointer
        )
        if "last_error" in payload:
            _last_error = payload.get("last_error")

        persisted_count = payload.get("operation_count")
        if isinstance(persisted_count, int):
            _operation_count = max(_operation_count, persisted_count)
    except Exception:
        return


def _is_enabled() -> bool:
    enabled_raw = os.getenv("PUBSUB_ENABLED", "true").strip().lower()
    return enabled_raw not in {"0", "false", "no", "off"}


def _topic_name() -> str:
    return os.getenv("PUBSUB_TOPIC", "pipeline-run-completed")


def _project_name() -> str | None:
    return (
        os.getenv("PUBSUB_PROJECT_ID")
        or os.getenv("GOOGLE_CLOUD_PROJECT")
        or os.getenv("GCP_PROJECT")
        or os.getenv("FIREBASE_PROJECT_ID")
    )


def _publish_timeout_seconds() -> float:
    raw = os.getenv("PUBSUB_PUBLISH_TIMEOUT_SECONDS", "5.0").strip()
    try:
        timeout = float(raw)
    except ValueError:
        timeout = 5.0
    return min(max(timeout, 1.0), 15.0)


def _publish_attempts() -> int:
    raw = os.getenv("PUBSUB_PUBLISH_ATTEMPTS", "2").strip()
    try:
        attempts = int(raw)
    except ValueError:
        attempts = 2
    return min(max(attempts, 1), 3)


def _format_error(exc: Exception) -> str:
    message = str(exc).strip()
    return message if message else exc.__class__.__name__


def get_pubsub_status() -> dict[str, Any]:
    """Returns runtime status and workflow evidence for Pub/Sub publication."""
    running_on_cloud_run = bool(os.getenv("K_SERVICE"))
    configured = bool(_project_name()) and _is_enabled()
    sdk_available = pubsub_v1 is not None

    status = "inactive"
    if configured and sdk_available:
        status = "active"
    elif configured and not sdk_available:
        status = "sdk_unavailable"
    elif not _is_enabled():
        status = "disabled"

    if status == "active" and (running_on_cloud_run or _last_event_id is None or _last_published_at is None):
        _hydrate_pubsub_evidence_from_firestore()

    return {
        "status": status,
        "project": _project_name() or "unknown",
        "topic": _topic_name(),
        "enabled": _is_enabled(),
        "sdk": "google-cloud-pubsub",
        "sdk_import": "available" if sdk_available else "unavailable",
        "operation_count": _operation_count,
        "last_published_at": _last_published_at,
        "last_error": _last_error,
        "last_event_id": _last_event_id,
        "last_run_id": _last_run_id,
        "last_downstream_evidence_pointer": _last_downstream_evidence_pointer,
    }


def publish_pipeline_completed_event(
    pipeline_output: dict[str, Any],
    downstream_evidence_pointer: str | None = None,
) -> bool:
    """Best-effort publish of a pipeline completion event to Pub/Sub."""
    global _operation_count, _last_published_at, _last_error, _last_event_id, _last_run_id
    global _last_downstream_evidence_pointer

    _operation_count += 1

    if not _is_enabled() or pubsub_v1 is None:
        return False

    project = _project_name()
    if not project:
        _last_error = "missing_project"
        _persist_pubsub_evidence()
        return False

    run_id = str(pipeline_output.get("run_id", "unknown"))
    event_id = f"{run_id}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}"

    try:
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project, _topic_name())
        attempts = _publish_attempts()
        timeout_seconds = _publish_timeout_seconds()

        for attempt in range(attempts):
            message = {
                "event_id": event_id,
                "event_type": "pipeline.run.completed",
                "run_id": run_id,
                "run_at": str(pipeline_output.get("run_at", datetime.now(timezone.utc).isoformat())),
                "pipeline_health": str(pipeline_output.get("pipeline_health", "unknown")),
                "source": str(pipeline_output.get("source", "unknown")),
                "downstream_evidence_pointer": downstream_evidence_pointer or _last_downstream_evidence_pointer,
                "published_at": datetime.now(timezone.utc).isoformat(),
            }

            try:
                future = publisher.publish(topic_path, json.dumps(message).encode("utf-8"))
                future.result(timeout=timeout_seconds)

                _last_published_at = message["published_at"]
                _last_event_id = event_id
                _last_run_id = run_id
                _last_downstream_evidence_pointer = message["downstream_evidence_pointer"]
                _last_error = None
                _persist_pubsub_evidence()
                return True
            except Exception as publish_exc:  # pragma: no cover - defensive runtime path
                _last_error = _format_error(publish_exc)
                if attempt < attempts - 1:
                    time.sleep(0.25 * (attempt + 1))
                    continue
                _persist_pubsub_evidence()
                return False
    except Exception as exc:  # pragma: no cover - defensive runtime path
        _last_error = _format_error(exc)
        _persist_pubsub_evidence()
        return False

    return False