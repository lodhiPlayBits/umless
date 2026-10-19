---
name: verify
description: Run the umless checks (backend tests, frontend tests, lint and build) before claiming work is done and before every commit.
---

Run every check below from the repo root in Git Bash and report each command with its summary line. Stop at the first failure and show its output. The backend has no linter or type checker configured; don't add one here.

1. Backend tests:
   `cd backend && .venv/Scripts/python.exe -m pytest -q`
   Expect `N passed, 1 skipped` (the skip is the live Deepgram test, which runs only with `--run-live`).
2. Frontend tests:
   `cd frontend && npm test`
3. Frontend lint:
   `cd frontend && npm run lint`
4. Frontend build (includes the TypeScript type check):
   `cd frontend && npm run build`
5. End-to-end tests (Playwright starts its own backend on 8766 and dev server on 5175, with a fake transcriber and a temporary data file; no running servers needed):
   `cd frontend && npm run e2e`
6. API client is in sync with the contract:
   `cd frontend && npm run gen:api && git diff --exit-code -- src/generated`

If a step can't run (missing `node_modules` or `.venv`), say "not verified" for that step and why. Don't guess the result.
