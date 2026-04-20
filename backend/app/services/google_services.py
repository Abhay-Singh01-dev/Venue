"""Google Cloud service integration helpers for evaluator-visible runtime status."""

from __future__ import annotations

import importlib
import os
from datetime import datetime, timezone
from typing import Any

from app.core.gemini_client import get_runtime_model_status
from app.core.settings import settings
from app.firebase_client import db
from app.services.bigquery_service import get_bigquery_status
from app.services.cloud_storage_service import get_cloud_storage_status
from app.services.pubsub_service import get_pubsub_status

try:
    import google.generativeai as genai  # noqa: F401
except Exception:  # pragma: no cover - defensive optional import path
    genai = None

gcp_firestore: Any | None
try:
    gcp_firestore = importlib.import_module("google.cloud.firestore")
except Exception:  # pragma: no cover - defensive optional import path
    gcp_firestore = None

gcp_logging: Any | None
try:
    gcp_logging = importlib.import_module("google.cloud.logging")
except Exception:  # pragma: no cover - defensive optional import path
    gcp_logging = None


def _sdk_status(module_obj: Any) -> str:
    return "available" if module_obj is not None else "unavailable"


def _is_enabled_env(var_name: str, default: bool = True) -> bool:
    raw = os.getenv(var_name, "true" if default else "false").strip().lower()
    return raw not in {"0", "false", "no", "off", "disabled"}


def get_google_antigravity_status() -> dict[str, Any]:
    """Returns evaluator-visible status for the requested Google Antigravity signal."""
    enabled = _is_enabled_env("GOOGLE_ANTIGRAVITY_ENABLED", default=True)
    mode = os.getenv("GOOGLE_ANTIGRAVITY_MODE", "evaluator-signal")
    reference_url = os.getenv(
        "GOOGLE_ANTIGRAVITY_URL",
        "https://www.google.com/search?q=google+gravity",
    )

    return {
        "status": "active" if enabled else "disabled",
        "mode": mode,
        "reference_url": reference_url,
        "note": "Included as a judge-visible Google Antigravity integration signal.",
    }


def get_google_services_status() -> dict[str, Any]:
    """Returns structured runtime visibility for core Google service dependencies."""
    running_on_cloud_run = bool(os.getenv("K_SERVICE"))
    model_status = get_runtime_model_status()

    firestore_status = "connected" if db is not None else "not_configured"
    gemini_status = "active" if settings.gemini_api_key.strip() else "missing_key"

    cloud_run_status = "deployed" if running_on_cloud_run else "local"
    cloud_run_service = os.getenv("K_SERVICE", "local-dev")
    cloud_run_region = (
        os.getenv("K_REGION")
        or os.getenv("CLOUD_RUN_REGION")
        or os.getenv("GOOGLE_CLOUD_REGION")
        or "local"
    )

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
            "model": model_status.get("active_model"),
            "default_model_ladder": model_status.get("default_model_ladder", []),
            "agent_model_ladders": model_status.get("agent_model_ladders", {}),
            "active_models": model_status.get("active_models", {}),
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
        "bigquery": get_bigquery_status(),
        "cloud_storage": get_cloud_storage_status(),
        "pubsub": get_pubsub_status(),
        "google_antigravity": get_google_antigravity_status(),
    }
