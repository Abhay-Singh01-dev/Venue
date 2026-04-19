"""Deterministic pipeline contract tests without external dependencies."""

import app.agents.pipeline as pipeline


def test_pipeline_returns_safe_contract_without_db(monkeypatch) -> None:
    """Pipeline should produce a stable fallback contract when DB is unavailable."""
    monkeypatch.setattr(pipeline, "db", None)

    result = pipeline.run_pipeline()

    assert isinstance(result, dict)
    assert "run_id" in result
    assert "hotspots" in result
    assert "decisions" in result
    assert "communication" in result
    assert "pipeline_health" in result


def test_safe_empty_output_contains_required_keys() -> None:
    """Safe empty payload should remain schema-compatible for frontend consumers."""
    payload = pipeline._get_safe_empty_output("unit-test-run")

    required_keys = {
        "run_id",
        "run_at",
        "source",
        "pipeline_health",
        "hotspots",
        "predictions",
        "decisions",
        "communication",
        "metrics",
    }

    assert required_keys.issubset(payload.keys())
    assert payload["run_id"] == "unit-test-run"
    assert isinstance(payload["predictions"], list)
    assert isinstance(payload["decisions"], list)
