"""Google Cloud service integration helpers for evaluator-visible runtime status."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from app.core.settings import settings
from app.firebase_client import db

try:
    import google.generativeai as genai  # noqa: F401
except Exception:  # pragma: no cover - defensive optional import path
    genai = None

try:
    from google.cloud import firestore as gcp_firestore  # noqa: F401
except Exception:  # pragma: no cover - defensive optional import path
    gcp_firestore = None

try:
    import google.cloud.logging as gcp_logging  # noqa: F401
except Exception:  # pragma: no cover - defensive optional import path
    gcp_logging = None


def _sdk_status(module_obj: Any) -> str:
    return "available" if module_obj is not None else "unavailable"


def get_google_services_status() -> dict[str, Any]:
    """Returns structured runtime visibility for core Google service dependencies."""
    running_on_cloud_run = bool(os.getenv("K_SERVICE"))

    firestore_status = "connected" if db is not None else "not_configured"
    gemini_status = "active" if settings.gemini_api_key.strip() else "missing_key"

    cloud_run_status = "deployed" if running_on_cloud_run else "local"
    cloud_run_service = os.getenv("K_SERVICE", "local-dev")
    cloud_run_region = os.getenv("K_REGION", "local")

    cloud_logging_status = "active" if running_on_cloud_run and gcp_logging is not None else "inactive"

    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "firestore": {
            "status": firestore_status,
            "project": settings.firebase_project_id,
            "sdk": "google-cloud-firestore",
            "sdk_import": _sdk_status(gcp_firestore),
        },
        "gemini": {
            "status": gemini_status,
            "model": "gemini-2.5-flash",
            "sdk": "google-generativeai",
            "sdk_import": _sdk_status(genai),
        },
        "cloud_run": {
            "status": cloud_run_status,
            "service": cloud_run_service,
            "region": cloud_run_region,
        },
        "cloud_logging": {
            "status": cloud_logging_status,
            "sdk": "google-cloud-logging",
            "sdk_import": _sdk_status(gcp_logging),
        },
    }
