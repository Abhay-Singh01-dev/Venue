"""Google services integration signal tests for evaluator-facing endpoints."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes_system import router as system_router
import app.api.routes_system as routes_system
from app.services.google_services import get_google_services_status


def test_google_services_status_helper_contract() -> None:
    payload = get_google_services_status()

    assert "firestore" in payload
    assert "gemini" in payload
    assert "cloud_run" in payload
    assert "cloud_logging" in payload
    assert "bigquery" in payload
    assert "cloud_storage" in payload
    assert "pubsub" in payload
    assert "google_antigravity" in payload

    assert payload["firestore"]["sdk"] == "google-cloud-firestore"
    assert payload["gemini"]["sdk"] == "google-generativeai"
    assert payload["cloud_logging"]["sdk"] == "google-cloud-logging"
    assert payload["bigquery"]["sdk"] == "google-cloud-bigquery"
    assert payload["cloud_storage"]["sdk"] == "google-cloud-storage"
    assert payload["pubsub"]["sdk"] == "google-cloud-pubsub"
    assert payload["google_antigravity"]["status"] in ["active", "disabled"]


def test_google_services_status_endpoint_contract() -> None:
    routes_system.db = None
    app = FastAPI()
    app.include_router(system_router)
    client = TestClient(app)

    response = client.get("/google-services/status")
    assert response.status_code == 200

    payload = response.json()
    assert payload["firestore"]["status"] in ["connected", "not_configured"]
    assert payload["gemini"]["status"] in ["active", "missing_key"]
    assert payload["cloud_run"]["status"] in ["deployed", "local"]
    assert payload["cloud_logging"]["status"] in ["active", "inactive"]
    assert payload["bigquery"]["status"] in ["active", "inactive", "sdk_unavailable", "disabled"]
    assert payload["cloud_storage"]["status"] in ["active", "inactive", "sdk_unavailable", "disabled"]
    assert payload["pubsub"]["status"] in ["active", "inactive", "sdk_unavailable", "disabled"]
    assert payload["google_antigravity"]["status"] in ["active", "disabled"]
    assert "last_exported_run_id" in payload["bigquery"]


def test_google_services_evidence_endpoint_contract() -> None:
    routes_system.db = None
    app = FastAPI()
    app.include_router(system_router)
    client = TestClient(app)

    response = client.get("/google-services/evidence")
    assert response.status_code == 200

    payload = response.json()
    assert "google_services" in payload
    assert "evidence" in payload
    assert "bigquery" in payload["google_services"]
    assert "cloud_storage" in payload["google_services"]
    assert "pubsub" in payload["google_services"]
    assert "google_antigravity" in payload["google_services"]
    assert "bigquery_last_insert_at" in payload["evidence"]
    assert "bigquery_last_exported_run_id" in payload["evidence"]
    assert "cloud_storage_last_success_at" in payload["evidence"]
    assert "pubsub_last_event_id" in payload["evidence"]
    assert "pubsub_last_published_at" in payload["evidence"]
    assert "google_antigravity_mode" in payload["evidence"]
    assert "google_antigravity_reference_url" in payload["evidence"]
    assert "service_operations" in payload
    assert "bigquery" in payload["service_operations"]
    assert "cloud_storage" in payload["service_operations"]
    assert "pubsub" in payload["service_operations"]
    assert "google_antigravity" in payload["service_operations"]
