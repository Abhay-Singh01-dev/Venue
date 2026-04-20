"""Tests for the quantified system impact and Google-services proof endpoints."""


def test_system_impact_endpoint(app_client) -> None:
    response = app_client.get("/system/impact")
    assert response.status_code == 200
    payload = response.json()
    assert payload["problem_solved"] == "crowd congestion prediction and prevention"
    assert payload["prediction_horizon_minutes"] == 10
    assert payload["measurable_outcomes"]["agent_count"] == 4
    assert "historical" in payload["rolling_metrics"]
    assert payload["rolling_metrics"]["historical"]["history_runs"] >= 0


def test_google_services_endpoint(app_client) -> None:
    response = app_client.get("/google-services")
    assert response.status_code == 200
    payload = response.json()
    assert "firestore" in payload
    assert "gemini" in payload
    assert "bigquery" in payload
    assert "cloud_storage" in payload
    assert "pubsub" in payload


def test_workflow_proof_endpoint(app_client) -> None:
    response = app_client.get("/system/workflow")
    assert response.status_code == 200
    payload = response.json()
    assert "checked_at" in payload
    assert "latest_published_event_id" in payload
    assert "downstream_evidence_pointer" in payload
    assert "pubsub" in payload["service_operations"]