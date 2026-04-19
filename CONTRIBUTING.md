# Contributing

## Development Setup

1. Install frontend dependencies:
   - `npm ci`
2. Install backend dependencies:
   - `cd backend`
   - `venv\\Scripts\\python.exe -m pip install -r requirements.txt`

## Run Locally

1. Start full local stack:
   - `npm run dev:all`

## Quality Gates

Before opening a pull request, run:

1. Backend tests:
   - `cd backend`
   - `venv\\Scripts\\python.exe -m pytest tests -q --cov-fail-under=0`
2. Frontend tests:
   - `npm run test:run`
3. Frontend production build:
   - `npm run build`

## Pull Request Checklist

1. Keep API contracts backward-compatible unless explicitly planned.
2. Avoid changes to simulation loop timing without benchmarking evidence.
3. Add or update tests for every behavior change.
4. Never commit real credentials to tracked files.
5. Keep README deployment and service evidence sections current.
