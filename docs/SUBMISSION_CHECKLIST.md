# Submission Checklist

Use this checklist before each submission attempt.

## Core Proof Endpoints

- [ ] GET / returns status, ai, database, and deployment fields
- [ ] GET /system/info returns platform and google_services fields
- [ ] GET /system/metrics returns latency and write-cycle metrics
- [ ] GET /health/ready returns firestore and gemini service status
- [ ] GET /pipeline/latest returns predictions and decisions arrays
- [ ] GET /simulation/status returns stable simulation contract

## Google Services Visibility

- [ ] README includes top-level Google Services section
- [ ] README includes live Cloud Run URL and WebSocket URL
- [ ] README includes Deployment Proof section with endpoint evidence
- [ ] /google-services/status and /google-services/evidence include google_antigravity signal fields

## Security and Accessibility Signals

- [ ] README includes Security section
- [ ] README includes Accessibility section
- [ ] API validation paths return 400 for invalid inputs

## Testing

- [ ] Run backend tests: python -m pytest tests -q
- [ ] Verify tests include API, fallback, health, simulation, websocket, and metrics checks
- [ ] Confirm all tests pass with no failures

## Deployment

- [ ] Deploy latest backend revision to Cloud Run
- [ ] Verify live root endpoint returns operational status
- [ ] Verify live /system/info and /system/metrics responses
- [ ] Confirm endpoint outputs are evaluator-friendly and explicit

## Final Manual Pass

- [ ] Start frontend and backend locally and sanity-check key workflows
- [ ] Trigger one simulation scenario and observe stable 60-second run state
- [ ] Confirm no repeated ASGI validation/runtime errors in logs
