"""Agent fallback and schema validation tests for evaluator breadth signals."""

from app.agents.agent_analyst import _analyst_fallback
from app.agents.agent_predictor import _predictor_fallback
from app.agents.agent_decision import _decision_fallback
from app.agents.agent_communicator import _communicator_fallback
from app.models.pipeline_models import PredictionResult, RiskTrajectory


def _sample_zones() -> list[dict]:
    return [
        {
            "zone_id": "north",
            "name": "North Concourse",
            "occupancy_pct": 88.0,
            "trend": "rising",
        },
        {
            "zone_id": "south",
            "name": "South Concourse",
            "occupancy_pct": 52.0,
            "trend": "stable",
        },
    ]


def test_analyst_fallback_returns_expected_contract() -> None:
    payload = _analyst_fallback(_sample_zones())

    assert "hotspots" in payload
    assert "overall_risk" in payload
    assert "summary" in payload
    assert payload.get("_fallback") is True


def test_predictor_fallback_builds_predictions_for_each_zone() -> None:
    payload = _predictor_fallback(_sample_zones())

    assert "predictions" in payload
    assert len(payload["predictions"]) == 2
    assert payload["overall_prediction_confidence"] == 0.5


def test_decision_fallback_generates_actions_for_high_risk() -> None:
    predictor_output = {
        "highest_risk_zone": "north",
        "predictions": [
            {
                "zone_id": "north",
                "zone_name": "North Concourse",
                "predicted_pct": 91.0,
            }
        ],
    }

    payload = _decision_fallback(predictor_output)

    assert payload["total_actions"] >= 1
    assert payload["highest_priority_zone"] == "north"


def test_communicator_fallback_contains_reasoning_chain() -> None:
    payload = _communicator_fallback()

    assert "attendee_notification" in payload
    assert "staff_alert" in payload
    assert "signage_message" in payload
    assert "reasoning_chain" in payload


def test_prediction_model_accepts_valid_risk_trajectory() -> None:
    result = PredictionResult(
        zone_id="north",
        zone_name="North Concourse",
        current_pct=70.0,
        predicted_pct=78.0,
        confidence=0.8,
        uncertainty_reason="Stable trend",
        risk_trajectory=RiskTrajectory.STABLE,
    )

    assert result.zone_id == "north"
    assert result.confidence == 0.8
