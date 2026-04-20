"""Tests for the quantified system impact and Google-services proof endpoints."""


def test_system_impact_endpoint(app_client) -> None:
    response = app_client.get("/system/impact")
    assert response.status_code == 200
    payload = response.json()
    assert payload["problem_solved"] == "crowd congestion prediction and prevention"
    assert payload["prediction_horizon_minutes"] == 10
    assert payload["measurable_outcomes"]["agent_count"] == 4


def test_google_services_endpoint(app_client) -> None:
    response = app_client.get("/google-services")
    assert response.status_code == 200
    payload = response.json()
    assert "firestore" in payload
    assert "gemini" in payload
    assert "bigquery" in payload
    assert "cloud_storage" in payload