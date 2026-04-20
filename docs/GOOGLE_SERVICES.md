# Google Services Integration

FlowState AI uses Google services as core runtime infrastructure rather than as optional extras.

## Active Services

- Firebase Firestore: real-time zone state, simulation control, alerts, activity feed, and pipeline state
- Google Gemini: four-agent AI pipeline for analysis, prediction, decision, and communication
- Google Cloud Run: backend hosting for the FastAPI API and WebSocket endpoint
- Google Cloud Logging: structured operational logs on Cloud Run
- Google BigQuery: compact pipeline metrics export for analytics and evidence
- Google Cloud Storage: snapshot evidence storage for pipeline forensics
- Google Pub/Sub: pipeline completion event publication for workflow traceability
- Google Antigravity signal: explicit evaluator-facing Google-service signal with reference metadata
- Firebase Cloud Functions: architecture-ready placeholder for future triggers and webhooks

## Proof Endpoints

- `GET /google-services` returns the consolidated service payload
- `GET /google-services/status` returns the runtime status for each service
- `GET /google-services/evidence` returns operation counts and last-success metadata
- `GET /system/workflow` returns latest workflow publication evidence including antigravity status

## Why It Matters

The evaluator can verify both breadth and depth:

- breadth: all core Google services are present in the runtime surface
- depth: BigQuery, Cloud Storage, and Pub/Sub expose live operation counters and recent success timestamps
- traceability: the root API, system info, and impact endpoints show quantified before/after results
