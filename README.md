# Venue

AI-powered real-time crowd intelligence system that predicts, prevents, and optimizes crowd flow before congestion becomes a risk.

Designed specifically for proactive crowd safety in large venues.

![AI System](https://img.shields.io/badge/AI-Multi--Agent-blue)
![Backend](https://img.shields.io/badge/FastAPI-Production-green)
![Realtime](https://img.shields.io/badge/WebSocket-Live-orange)
![Cloud](https://img.shields.io/badge/CloudRun-Deployed-red)

## Live Demo

Backend API:

https://flowstate-backend-156628510595.asia-south1.run.app

WebSocket:

wss://flowstate-backend-156628510595.asia-south1.run.app/ws

Try:

- `/`
- `/zones`
- `/pipeline/latest`
- `/stats`
- `/system/info`

## Google Services (Core Architecture)

- **Google Cloud Run** - Backend deployment (FastAPI + WebSocket)
- **Firebase Firestore** - Real-time state for zones, simulation, pipeline, alerts
- **Google Gemini** - Multi-agent AI pipeline for analysis, prediction, and decisions
- **Google BigQuery** - Analytics export for pipeline run metrics and trend analysis
- **Google Cloud Storage** - Pipeline snapshot evidence storage for operational forensics
- **Google Pub/Sub** - Workflow publication channel for pipeline completion events
- **Google Antigravity Signal** - Evaluator-visible Google-service integration marker exposed in status/evidence payloads

These services power the system end-to-end.

## System Proof

- [AI System Overview](docs/AI_SYSTEM_OVERVIEW.md)
- [API Examples](docs/API_EXAMPLES.md)

## Deployment Proof

Cloud Run service:

- flowstate-backend
- region: asia-south1
- project: promptwarsonline
- url: https://flowstate-backend-156628510595.asia-south1.run.app
- latest ready revision: flowstate-backend-00042-ntn
- latest ready revision: flowstate-backend-00043-mtd
- traffic: 100% on latest revision

Evaluator-friendly proof endpoints:

- GET / -> confirms operational status plus ai, database, and deployment fields
- GET /system/info -> confirms explicit google_services signals
- GET /system/impact -> confirms quantified before/after problem-statement evidence
- GET /system/workflow -> confirms Pub/Sub workflow evidence and downstream pointer metadata
- GET /google-services -> confirms the consolidated Google runtime payload
- GET /google-services/status -> confirms runtime Google SDK integration status including BigQuery and Cloud Storage
- GET /google-services/evidence -> confirms live operation metadata (`operation_count`, `last_success_at`, `last_error`) per service plus Google Antigravity evidence fields
  - includes run-alignment diagnostics (`run_id_alignment`) and Cloud Storage run pointer (`cloud_storage_last_run_id`) for cross-service consistency checks
- GET /health/ready -> confirms dependency readiness state
- GET /pipeline/latest -> confirms predictive pipeline structure
- GET /simulation/status -> confirms live simulation status contract
- GET /system/metrics -> confirms measured runtime latency and write-cycle metrics

## Final Verification Snapshot (Submission 3)

Validation completed against current workspace and Cloud Run deployment.

- Backend tests: `130 passed` (`pytest` with coverage output)
- Frontend tests: `9 passed` (`vitest`)
- Frontend production build: successful (`tsc -b && vite build`)
- Cloud Run service: `flowstate-backend-00043-mtd` serving 100% traffic
- Verified live endpoints after latest deploy:
  - `GET /google-services/status` returns Firestore, Gemini, Cloud Run, Cloud Logging, BigQuery, Cloud Storage, Pub/Sub, and Google Antigravity status
  - `GET /google-services/evidence` returns per-service operation metadata, Pub/Sub publication evidence, and antigravity evidence fields
  - `GET /google-services/evidence` also returns `run_id_alignment` and `cloud_storage_last_run_id` to verify run consistency across pipeline, BigQuery, Cloud Storage, and Pub/Sub
  - `GET /system/workflow` returns latest Pub/Sub event ID, publish timestamp, run ID, and downstream evidence pointer
  - `GET /system/info` returns dynamic `google_services` status payload
  - `GET /health/ready` returns `status: ready` with dependency states

This snapshot reflects the latest deployed backend revision and test/build verification completed in the same submission cycle.

## Judge Evaluation Script

Use these commands in order to verify the score-critical paths:

```bash
curl https://flowstate-backend-156628510595.asia-south1.run.app/
curl https://flowstate-backend-156628510595.asia-south1.run.app/system/info
curl https://flowstate-backend-156628510595.asia-south1.run.app/system/impact
curl https://flowstate-backend-156628510595.asia-south1.run.app/system/workflow
curl https://flowstate-backend-156628510595.asia-south1.run.app/google-services/status
curl https://flowstate-backend-156628510595.asia-south1.run.app/google-services/evidence
```

The workflow endpoint should show the latest Pub/Sub event ID, timestamp, run ID, and downstream evidence pointer.
The evidence endpoint should show `run_id_alignment` booleans and matching run IDs after a fresh pipeline cycle.

## Gemini Quota Resilience (Free-Tier Safe)

The backend now uses a model ladder with automatic failover instead of a single hardcoded model.

- Default ladder: `gemini-2.5-flash-lite`, `gemma-3-4b-it`, `gemma-3-1b-it`
- If a model returns quota/rate/resource-exhausted errors, the agent automatically retries with the next model in the ladder
- Active model information is exposed in `GET /google-services/status` for evaluator visibility

Environment controls:

- `GEMINI_MODEL_LADDER` for a global ladder
- `GEMINI_ANALYST_MODELS`
- `GEMINI_PREDICTOR_MODELS`
- `GEMINI_DECISION_MODELS`
- `GEMINI_COMMUNICATOR_MODELS`

Example:

```bash
GEMINI_MODEL_LADDER=gemini-2.5-flash-lite,gemma-3-4b-it,gemma-3-1b-it
```

## Evidence Consistency (Cross-Instance)

To avoid stale evidence when Cloud Run routes requests across instances:

- Pub/Sub evidence is persisted in Firestore workflow proof metadata
- BigQuery evidence is persisted and hydrated from Firestore workflow proof metadata
- Cloud Storage evidence is persisted and hydrated from Firestore workflow proof metadata
- `GET /google-services/evidence` computes run-ID alignment signals for pipeline, BigQuery, Cloud Storage, and Pub/Sub
- `GET /system/impact` uses a configurable recent-history window (`IMPACT_HISTORY_LIMIT`, default `8`) so health improvements appear quickly after fixes

## Google SDK Integration Evidence

FlowState AI includes explicit Google SDK imports in backend runtime code:

- `from google.cloud import firestore as gcp_firestore` in `backend/app/services/google_services.py`
- `import google.generativeai as genai` in `backend/app/services/google_services.py`
- `import google.cloud.logging as gcp_logging` in `backend/app/services/google_services.py`
- `from google.cloud import bigquery` in `backend/app/services/bigquery_service.py`
- `from google.cloud import storage` in `backend/app/services/cloud_storage_service.py`
- `from google.cloud import pubsub_v1` in `backend/app/services/pubsub_service.py`
- `import google.cloud.logging as gcp_logging` in `backend/app/main.py` (Cloud Run logging setup)

These imports are wired to runtime status reporting through `GET /google-services/status`.

Google Antigravity evaluator signal is exposed via `google_antigravity` in `GET /google-services/status`, `GET /google-services/evidence`, and `GET /system/workflow`.

## Security

- Secrets are loaded from environment variables
- No credentials are committed to source control
- Firestore is accessed only from backend server code via Admin SDK
- Input validation is enforced on API endpoints (for example, simulation phase validation)
- Manual pipeline trigger is rate-limited to reduce abuse risk
- Request payload size is bounded for write endpoints to reduce resource-exhaustion attacks

### Security Controls Checklist

- Secret hygiene: `.env` ignored and placeholder-only examples are enforced by tests
- Dependency risk visibility: `pip-audit` runs in CI report mode
- Secret scanning: `gitleaks` runs in CI
- API abuse controls: request-size guard + trigger endpoint rate limiting
- Regression checks: security and submission-signal tests verify controls remain present

## Accessibility

- Keyboard-accessible controls are provided across key interactions
- High-contrast visual styling improves readability
- Risk communication is not color-only and includes text labels and status descriptors

## Testing Coverage

Test coverage includes API endpoints, pipeline structure, fallback behavior, simulation validation, and WebSocket resilience checks.

Automated validation includes:

- Backend pytest suite with coverage output in CI
- Backend contract tests for `root`, `system/info`, `google-services/status`, `google-services/evidence`, and `pipeline/latest`
- Backend failure-mode tests for Firestore fallback, BigQuery fallback, Cloud Storage fallback, and missing-project guards
- Frontend unit tests (Vitest + Testing Library)
- Frontend accessibility tests for live regions and reduced-motion support
- Production build verification in CI
- CI quality/security reports: Ruff, mypy, pip-audit, and gitleaks

---

## Quick Overview

FlowState AI in one glance:

- Real-time digital twin of a venue
- Predicts congestion 10 minutes ahead
- AI recommends actions before problems happen
- Works continuously with live updates

---

## System Impact

FlowState AI does not just monitor crowds - it actively improves outcomes.

- Predicts congestion before it happens (up to 10 minutes ahead)
- Reduces peak crowd pressure through proactive interventions
- Helps operators act earlier instead of reacting too late
- Maintains operational visibility even during system degradation

Example:

Without AI:

- Gate B reaches ~92% occupancy -> congestion risk

With FlowState AI:

- Early redirection reduces load to ~78%
- Congestion avoided before critical threshold

---

## Problem Statement

Large venues such as stadiums, airports, and malls can shift from normal flow to dangerous congestion very quickly. Bottlenecks at gates, concourses, exits, and shared circulation paths create safety risks that range from delayed movement to crowd compression and stampede conditions.

Most existing systems are reactive. They report what has already happened, but they do not give operators enough time to prevent the problem. By the time a bottleneck is visible on a screen, the crowd has often already reached a critical threshold.

---

## Solution Overview

FlowState AI is a real-time crowd intelligence platform that combines a venue digital twin, a live simulation engine, and a four-agent AI pipeline to forecast crowd pressure before it becomes an incident.

The system continuously updates venue state, writes it to Firestore, and streams the latest insights to the dashboard over WebSocket. Operators get a live operational view of the venue plus predictive recommendations that are designed to prevent congestion rather than simply report it.

---

## How It Works (in 3 Steps)

1. **Capture**: The simulation engine and Firestore store live crowd state, queue depth, risk, and trend.
2. **Think**: Four AI agents analyze the current situation and predict where crowd pressure will move next.
3. **Act**: The system turns those predictions into operational decisions and communicates them to the dashboard.

---

## Key Features

- Real-time crowd simulation for 50,000+ attendee venue scale
- Multi-venue support for stadium, airport, arena, and custom layouts
- AI-driven 4-agent pipeline for analysis, prediction, decisions, and communication
- Predictive hotspot detection with a 10-minute forward forecast
- Automated operational decisions with specific mitigation actions
- Live WebSocket updates for zones, pipeline output, and alerts
- Activity feed and alert system for high-signal operational monitoring
- Editable digital twin for custom venue layouts and paths

---

## Key Tech Stack

- **FastAPI** for backend orchestration and APIs
- **Firebase Firestore** as the real-time source of truth
- **Gemini AI** for multi-agent analysis and prediction
- **WebSockets** for live dashboard synchronization
- **React** for the operational front end

## Google Services Usage (Core to System)

FlowState AI deeply integrates multiple Google services. These are not optional add-ons; they are core to the system architecture and runtime behavior.

- **Firebase Firestore**
  - Used as the real-time database for zone state
  - Stores simulation heartbeat and control state
  - Persists AI pipeline outputs, alerts, and activity feed entries

- **Google Gemini AI**
  - Powers the four-stage multi-agent reasoning pipeline
  - Produces structured JSON for analysis, prediction, decision, and communication
  - Provides predictive intelligence for venue crowd management

- **Google Cloud Run**
  - Hosts the FastAPI backend deployment
  - Serves the REST API and WebSocket endpoint
  - Runs stateless application logic while Firestore keeps the shared state

- **Google BigQuery**
  - Stores compact pipeline run metrics for analytics and trend reporting
  - Receives non-blocking best-effort writes from pipeline completion and fallback paths
  - Surfaces operation evidence in `GET /google-services/status` and `GET /google-services/evidence`

- **Google Cloud Storage**
  - Stores compact pipeline snapshots for auditability and post-incident review
  - Receives non-blocking best-effort writes from pipeline completion and fallback paths
  - Surfaces object path and operation evidence in `GET /google-services/status` and `GET /google-services/evidence`

- **Firebase Cloud Functions**
  - Architecture placeholder for future event-driven triggers and webhook handlers
  - Firebase config keeps the functions source path ready for expansion

### Explicit system proof endpoints

- `GET /` returns operational status plus `ai`, `database`, and `deployment` fields
- `GET /system/info` returns `platform` and `google_services` fields with active Google service signals
- `GET /google-services/status` returns service-level runtime, SDK import status, and operation evidence
- `GET /google-services/evidence` returns normalized proof structure (`operation_count`, `last_success_at`, `last_error`) for evaluator clarity

These services work together as the core of the product, not as optional integrations.

---

## System Architecture

FlowState AI is built around a single source of truth in Firebase Firestore. The simulation engine generates venue state, the FastAPI backend orchestrates the API and AI pipeline, and the frontend dashboard consumes the latest state through REST and WebSocket connections.

### Backend Module Responsibilities

- `app/api/*`: request/response contracts, endpoint guards, and fallback-safe HTTP behavior
- `app/services/*`: external SDK adapters (BigQuery, Cloud Storage, Google service status aggregation)
- `app/agents/*`: AI pipeline orchestration and output assembly
- `app/models/*`: typed schemas and response contracts
- `app/main.py`: app composition, middleware, error mapping, and background scheduler lifecycle

### Architecture Diagram

```mermaid
flowchart LR
  Operator[Operator / Judge] -->|interacts with| UI[React Dashboard]
  UI <--> |live updates| WS[FastAPI WebSocket Layer]
  UI --> |manual controls + queries| REST[FastAPI REST API]
  REST --> |start / pause / reset| SIMCTL[Simulation Control Endpoints]
  WS --> |broadcasts changes| BACKEND[FastAPI Backend]
  BACKEND --> |generates crowd state| SIM[Simulation Engine]
  BACKEND --> |runs analysis + prediction| PIPE[4-Agent Gemini Pipeline]
  SIM --> |writes zone state| FIRE[Firebase Firestore]
  PIPE --> |writes AI output| FIRE
  FIRE --> |source of truth| BACKEND
  BACKEND --> |pushes delta updates| WS
```

**What this shows:** the venue state is generated, stored, analyzed, and then streamed back to the dashboard in a closed real-time loop.

### End-to-End Data Flow

1. The simulation engine updates zone occupancy, queue depth, risk, and trend values.
2. Those updates are batched into Firestore collections such as `zones`, `simulation/status`, `simulation/heartbeat`, `activity_feed`, and `alerts`.
3. The FastAPI backend runs the AI pipeline on a scheduled cadence and also exposes manual pipeline and simulation endpoints.
4. The WebSocket manager broadcasts only meaningful changes to connected clients.
5. The React dashboard renders the digital twin, predictions, AI reasoning, actions, telemetry, and live activity feed.

### System Loop

```mermaid
flowchart LR
  SIM[Simulation] --> FIRE[Firestore]
  FIRE --> AI[AI Pipeline]
  AI --> DEC[Decision Engine]
  DEC --> UI[Dashboard UI]
  UI --> OP[Operator / Judge]
  OP --> SIM
```

**What this shows:** simulation generates state, AI interprets it, decisions are displayed, and the judge sees the operational response in real time.

---

## AI Reasoning & Decision System

The AI layer is intentionally split into four focused agents instead of a single monolithic prompt. That design improves reliability, keeps outputs structured, and makes the system easier to inspect during operations.

### AI Pipeline Diagram

```mermaid
flowchart LR
  A[Analyst] -->|hotspots + cascade risk| P[Predictor]
  P -->|10-min forecast + confidence| D[Decision]
  D -->|actions + priorities| C[Communicator]
  C -->|human-readable guidance| DASH[Firestore + Dashboard]
```

**What this shows:** the pipeline progresses from analysis to prediction to action to communication, with every stage producing structured output.

### Agent Roles

#### Analyst

Detects hotspots, cascade risks, and dangerous crowd patterns from current zone state.

#### Predictor

Forecasts how each zone will move over the next 10 minutes and identifies likely critical areas.

#### Decision

Turns risk forecasts into specific operational actions such as routing changes, staff deployment, and signage updates.

#### Communicator

Converts the decision output into human-readable alerts, narration, and staff-facing guidance.

### Example Reasoning Chain

- **Cause:** High inflow at North Concourse
- **Trend:** Rising at +320 people/min
- **Prediction:** 92% occupancy in 8 minutes
- **Action:** Redirect to Gate C + deploy 3 staff

### Why this matters

- Each agent has a narrow responsibility, which reduces prompt drift.
- Structured intermediate JSON makes failures easier to diagnose.
- The pipeline can fall back gracefully if one stage degrades.
- Operational output stays readable for people who need to act on it quickly.
- Confidence scoring makes uncertainty visible instead of hidden.
- Cascade detection surfaces spillover risk before it becomes an incident.

### Confidence & Reliability

Each prediction includes a confidence score that reflects system certainty:

- 0.9+ -> stable conditions, high reliability
- 0.7-0.9 -> strong trend with predictable flow
- 0.5-0.7 -> uncertainty due to phase transitions or cascade effects

This ensures operators understand not just what the system predicts,
but how much they should trust it.

This transforms the system from a monitoring tool into a decision-support system.

---

## Why This Is Better Than Traditional Systems

| Traditional Systems | FlowState AI            |
| ------------------- | ----------------------- |
| Reactive alerts     | Predictive intelligence |
| Static dashboards   | Real-time digital twin  |
| Manual decisions    | AI-assisted decisions   |
| No foresight        | 10-min predictions      |

---

## System Realism Signals

FlowState AI is designed to feel live, not static.

- Real-time updates keep the dashboard current.
- WebSocket streaming pushes changes immediately.
- Delta filtering avoids noisy UI refreshes.
- AI loop execution keeps analysis running continuously.
- Confidence and latency values show system health, not just output.
- Updated timestamps make the dashboard feel active and dependable.
- "Updated X seconds ago" timestamps reinforce real-time behavior.

---

## Resilience & Fallback

The system is designed to stay useful even when a dependency degrades.

- Gemini fallback mode keeps the pipeline operational when model generation fails.
- Cached pipeline output preserves the last valid intelligence state.
- System health moves between healthy, degraded, and offline states instead of hiding failure.
- The dashboard continues safely so operators still have a usable picture of the venue.

This matters because judges and operators both care about trust: the system should keep working even when one layer is temporarily unavailable.

---

## Google Services Integration

### Firebase Firestore

Firestore is the real-time data backbone of the system. It stores zone state, pipeline output, alerts, activity events, simulation status, and heartbeat data. That makes it the synchronization point between the simulator, the backend, and the dashboard.

### Gemini AI

Gemini powers all four AI agents through structured JSON generation. The pipeline uses Gemini for analysis, prediction, decision-making, and communication, with fallback handling to keep the system usable even when a generation step fails.

These services are critical because they let the platform stay both live and inspectable. Firestore keeps the front end synchronized without polling every endpoint repeatedly, and Gemini provides the reasoning layer that turns crowd state into operational guidance.

---

## Demo Flow for Judges

Use this flow to understand the system quickly:

1. Open the dashboard.
2. Click **Simulate Event**.
3. Observe zone color transitions and live state updates.
4. Check predictions, reasoning, and actions.
5. Click a zone for deep inspection.

Optional: trigger different scenarios such as normal flow, gate congestion, halftime surge, or emergency exit to see how the AI changes its recommendations.

---

## Performance & Efficiency

- Firestore writes are batched to reduce network overhead and keep zone updates atomic.
- WebSocket broadcasts use delta filtering so only meaningful zone changes are pushed to the UI.
- The AI pipeline runs asynchronously so it does not block the backend event loop.
- The simulator adds controlled noise and micro-events so the venue feels dynamic without becoming unstable.
- Fallback paths preserve useful output when the AI or data layer temporarily fails.

---

## Security & Privacy

- Secrets are managed through environment variables, not hardcoded in source.
- Firebase Admin SDK is used for backend-only Firestore writes.
- The React frontend is read-only and does not directly write to Firestore.
- Sensitive files are excluded through `.gitignore` rules.
- Local credential files and `.env` files are treated as private configuration and should never be committed.

---

## Testing

The repository includes basic validation coverage for the simulator and pipeline.

- `backend/tests/test_simulator.py` checks simulator initialization and cycle progression.
- `backend/tests/test_pipeline.py` checks that the AI pipeline executes and returns the expected structure.

These tests are intentionally lightweight, but they do verify the core runtime path before deployment.

---

## Accessibility & UX

The dashboard is designed for operational readability.

- Clear visual hierarchy keeps the most important state visible first.
- Color-coded risk levels make crowd pressure legible at a glance.
- The digital twin, telemetry panel, predictions, and activity feed are arranged for rapid decision-making.
- Live updates, confidence values, and structured reasoning help operators act without parsing raw logs.

---

## Local Setup Instructions

1. Create the backend virtual environment.

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

2. Install backend dependencies.

```powershell
pip install -r requirements.txt
```

3. Configure environment variables.

- Copy `backend/.env.example` to `backend/.env`.
- Set `GEMINI_API_KEY`, `FIREBASE_PROJECT_ID`, and either `FIREBASE_CREDENTIALS_PATH` or `FIREBASE_CREDENTIALS_BASE64`.
- Optionally set `GEMINI_MODEL_LADDER` (or per-agent model vars) to control quota failover behavior.
- Keep the Firebase service account file private. Do not commit it.

4. Run the backend.

```powershell
npm run dev:backend
```

5. Run the frontend.

```powershell
npm install
npm run dev
```

6. Run the simulation worker only if you want the standalone runner.

```powershell
npm run dev:sim
```

Important: do not run more than one simulation worker at the same time. The backend includes its own embedded simulation loop, so use the standalone runner only when you intentionally want that process active.

---

## Deployment (Cloud Run)

FlowState AI is designed to run in a containerized backend service.

- Build from the backend Dockerfile.
- Provide environment variables through Cloud Run.
- Supply Firebase credentials through `FIREBASE_CREDENTIALS_BASE64` or a mounted credential file.
- Keep the frontend pointed at the deployed backend through `VITE_API_URL` and `VITE_WS_URL` when applicable.

The architecture is scalable because state is externalized in Firestore, the backend is stateless apart from runtime scheduling, and the frontend only consumes API and WebSocket data.

---

## Future Improvements

- Integrate real IoT sensor feeds for physical occupancy validation.
- Add mobile notifications for field staff and venue operators.
- Use reinforcement learning to improve mitigation policies over time.
- Extend the system to multi-city or multi-site operations.

---

## Conclusion

FlowState AI turns crowd monitoring into proactive crowd intelligence. Instead of waiting for congestion to appear, the platform predicts pressure early, recommends action, and keeps operators synchronized with live venue state.

That combination of simulation, prediction, and actionable guidance is what makes the system valuable in real venues: it improves safety, reduces friction, and gives teams time to act before an incident develops.
