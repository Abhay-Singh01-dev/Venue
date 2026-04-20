"""Runtime-path coverage tests for Gemini-backed agent modules."""

from __future__ import annotations

import time

import pytest

import app.agents.agent_analyst as analyst
import app.agents.agent_predictor as predictor
import app.agents.agent_decision as decision
import app.agents.agent_communicator as communicator


class _FakeResponse:
    def __init__(self, text: str) -> None:
        self.text = text


class _FakeModel:
    def __init__(self, *, text: str = "{}", exc: Exception | None = None) -> None:
        self._text = text
        self._exc = exc

    def generate_content(self, _prompt: str, request_options: dict | None = None) -> _FakeResponse:
        if self._exc is not None:
            raise self._exc
        return _FakeResponse(self._text)


def _zones(count: int = 12) -> list[dict]:
    zones: list[dict] = []
    for i in range(count):
        zones.append(
            {
                "zone_id": f"zone-{i}",
                "name": f"Zone {i}",
                "occupancy_pct": 70.0 + (i % 4),
                "trend": "rising" if i % 2 else "stable",
            }
        )
    return zones


@pytest.fixture(autouse=True)
def _reset_agent_state(monkeypatch: pytest.MonkeyPatch) -> None:
    for module in (analyst, predictor, decision, communicator):
        monkeypatch.setattr(module, "_cooldown_until", 0.0)
        monkeypatch.setattr(module, "_consecutive_429_failures", 0)
        monkeypatch.setattr(module, "_last_cooldown_log_at", 0.0)


def test_analyst_success_path_resets_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(analyst, "analyst_model", _FakeModel(text="irrelevant"))
    monkeypatch.setattr(
        analyst,
        "safe_json_load",
        lambda _text: {
            "hotspots": ["zone-1"],
            "cascade_zones": [],
            "dangerous_patterns": [],
            "overall_risk": "high",
            "summary": "ok",
        },
    )
    monkeypatch.setattr(analyst, "_consecutive_429_failures", 2)
    monkeypatch.setattr(analyst, "_cooldown_until", time.time() - 1)

    payload = analyst.run_analyst(_zones(2))

    assert payload["hotspots"] == ["zone-1"]
    assert analyst._consecutive_429_failures == 0
    assert analyst._cooldown_until == 0.0


def test_analyst_quota_error_fallback_sets_cooldown(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(analyst, "analyst_model", _FakeModel(exc=RuntimeError("429 quota exceeded")))

    payload = analyst.run_analyst(_zones(2))

    assert payload.get("_fallback") is True
    assert analyst._consecutive_429_failures == 1
    assert analyst._cooldown_until > time.time()


def test_predictor_fills_missing_zones(monkeypatch: pytest.MonkeyPatch) -> None:
    zone_states = _zones(12)
    monkeypatch.setattr(predictor, "predictor_model", _FakeModel(text="irrelevant"))
    monkeypatch.setattr(
        predictor,
        "safe_json_load",
        lambda _text: {
            "predictions": [
                {
                    "zone_id": "zone-0",
                    "zone_name": "Zone 0",
                    "current_pct": 70.0,
                    "predicted_pct": 78.0,
                    "confidence": 0.9,
                    "uncertainty_reason": "baseline",
                    "risk_trajectory": "worsening",
                    "minutes_to_critical": None,
                }
            ],
            "highest_risk_zone": "zone-0",
            "overall_prediction_confidence": 0.9,
        },
    )

    payload = predictor.run_predictor({"summary": "ok"}, zone_states, {"phase": "first_half"})

    assert len(payload["predictions"]) == 12
    assert any("missed by model" in p["uncertainty_reason"] for p in payload["predictions"])


def test_predictor_cooldown_path_short_circuits_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(predictor, "_cooldown_until", time.time() + 60)
    monkeypatch.setattr(predictor, "predictor_model", _FakeModel(exc=RuntimeError("should not be called")))

    payload = predictor.run_predictor({}, _zones(3), {"phase": "halftime"})

    assert len(payload["predictions"]) == 3
    assert payload["overall_prediction_confidence"] == 0.5


def test_decision_injects_fallback_when_decisions_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(decision, "decision_model", _FakeModel(text="irrelevant"))
    monkeypatch.setattr(
        decision,
        "safe_json_load",
        lambda _text: {
            "decisions": [],
            "total_actions": 0,
            "highest_priority_zone": "zone-1",
            "operations_summary": "empty",
        },
    )

    payload = decision.run_decision(
        {
            "highest_risk_zone": "zone-1",
            "predictions": [
                {
                    "zone_id": "zone-1",
                    "zone_name": "Zone 1",
                    "predicted_pct": 90.0,
                }
            ],
        },
        {"summary": "risk"},
    )

    assert payload["decisions"]
    assert payload["total_actions"] >= 1


def test_decision_quota_error_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(decision, "decision_model", _FakeModel(exc=RuntimeError("RESOURCE_EXHAUSTED 429")))

    payload = decision.run_decision({"predictions": []}, {"summary": "none"})

    assert payload["operations_summary"].startswith("Fallback mode")
    assert decision._consecutive_429_failures == 1


def test_communicator_truncates_messages(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(communicator, "communicator_model", _FakeModel(text="irrelevant"))
    monkeypatch.setattr(
        communicator,
        "safe_json_load",
        lambda _text: {
            "attendee_notification": "A" * 200,
            "staff_alert": "B" * 240,
            "signage_message": "C" * 120,
            "narration": "runtime narrative",
            "reasoning_chain": {
                "cause": "queue",
                "trend": "up",
                "prediction": "risk",
                "reasoning": "load",
                "action": "reroute",
                "status": "active",
            },
        },
    )

    payload = communicator.run_communicator({"decisions": []}, {"predictions": []}, {"summary": "ok"})

    assert len(payload["attendee_notification"]) == 80
    assert len(payload["staff_alert"]) == 120
    assert len(payload["signage_message"]) == 40


def test_communicator_quota_error_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(communicator, "communicator_model", _FakeModel(exc=RuntimeError("429")))

    payload = communicator.run_communicator({"decisions": []}, {"predictions": []}, {"summary": "ok"})

    assert payload["reasoning_chain"]["status"].startswith("System stable")
    assert communicator._consecutive_429_failures == 1
