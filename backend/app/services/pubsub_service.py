"""Pub/Sub integration helpers for pipeline workflow evidence."""

from __future__ import annotations

import json
import os
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


def get_pubsub_status() -> dict[str, Any]:
    """Returns runtime status and workflow evidence for Pub/Sub publication."""
    configured = bool(_project_name()) and _is_enabled()
    sdk_available = pubsub_v1 is not None

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
        return False

    run_id = str(pipeline_output.get("run_id", "unknown"))
    event_id = f"{run_id}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}"
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
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project, _topic_name())
        future = publisher.publish(topic_path, json.dumps(message).encode("utf-8"))
        future.result(timeout=2.0)

        _last_published_at = message["published_at"]
        _last_event_id = event_id
        _last_run_id = run_id
        _last_downstream_evidence_pointer = downstream_evidence_pointer
        _last_error = None
        return True
    except Exception as exc:  # pragma: no cover - defensive runtime path
        _last_error = str(exc)
        return False