# Changelog

## 2.5.0 - Submission 2 Hardening

### Added

1. Explicit Google services status endpoint (`/google-services/status`).
2. Google SDK integration helper module and Cloud Logging setup path.
3. Expanded backend test breadth:
   - agents
   - security
   - google services
   - e2e walkthrough
   - performance guardrails
4. Frontend accessibility interaction test for digital twin keyboard controls.
5. CI updates to run backend coverage tests and frontend tests.
6. Repository quality signals (`CONTRIBUTING.md`, `pyproject.toml`).

### Improved

1. Deterministic backend test behavior by avoiding live Firestore in route tests.
2. Accessibility semantics for interactive SVG zones.
3. Submission-signal regression tests for evaluator-facing evidence.

### Fixed

1. Fragile test assumptions around local `.env` secret usage.
2. Legacy script-style tests converted to deterministic pytest contract tests.
