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

    assert payload["firestore"]["sdk"] == "google-cloud-firestore"
    assert payload["gemini"]["sdk"] == "google-generativeai"
    assert payload["cloud_logging"]["sdk"] == "google-cloud-logging"


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
