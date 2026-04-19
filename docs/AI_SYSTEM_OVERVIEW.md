# AI System Overview

FlowState AI uses a 4-agent pipeline:

1. Analyst -> detects hotspots and cascade risks
2. Predictor -> forecasts 10-minute occupancy
3. Decision -> generates operational actions
4. Communicator -> produces human-readable outputs

## Key Properties

- Structured JSON outputs for each stage
- Deterministic behavior with low temperature settings
- Fallback mode when AI is unavailable
- Confidence scoring for predictions

## Example Output

```json
{
  "zone_id": "north_concourse",
  "current_pct": 82,
  "predicted_pct": 92,
  "confidence": 0.78,
  "risk_trajectory": "worsening"
}
```

## Why This Matters

The system is not just generating text - it produces structured,
actionable intelligence that can be directly used by operations teams.
