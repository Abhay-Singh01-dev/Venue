# API Examples

## GET /pipeline/latest

```json
{
  "run_id": "a1b2c3d4",
  "source": "live",
  "hotspots": ["gate_a"],
  "decisions": [
    {
      "action_type": "staff",
      "target_zone": "gate_a",
      "priority": "immediate"
    }
  ],
  "confidence_overall": 0.81
}
```

## GET /system/info

```json
{
  "ai_agents": 4,
  "prediction_horizon_minutes": 10,
  "pipeline_interval_sec": 30,
  "fallback_enabled": true,
  "data_source": "simulation + firestore"
}
```

## GET /zones

```json
{
  "count": 12,
  "zones": [
    {
      "zone_id": "gate-a",
      "occupancy_pct": 84.2,
      "risk_level": "high"
    }
  ]
}
```

## Why This Matters

Structured outputs, deterministic schemas, and explicit fallback support make the API ready for integration and judge review.
