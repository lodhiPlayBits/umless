# umless

Speech-practice web app. You keep a list of practice questions, record a spoken answer in the browser, and get a Deepgram transcript that keeps filler words ("um", "uh", "mhmm") and marks pauses of 1 s or more as dots, plus a summary (pace, filler counts, pauses). You can replay and download the audio and a `.txt` transcript.

Live at https://umless.in (Docker: nginx gateway, FastAPI backend, static frontend; `deploy/`). Sign-in with Clerk (ADR 0003), MySQL HeatWave, transcripts saved per user in an OCI bucket (audio never stored), Razorpay practice-time packs (ADR 0004). The v2 frontend (ADR 0005, roadmap `docs/roadmap/2026-10-28-frontend-v2-build.md`) is built: marketing site, dashboard, questions, practice, history, settings and billing. Without the `.env` keys it still runs as v1 did: local, single user, nothing stored but the questions file.

## Where things are

| Need | Read |
|---|---|
| Current build status, phases, decisions log | `docs/BUILD.md` (v1.1 "attempt history", phase 1 design in progress) |
| v1.0.0 build history and every decision behind it | `docs/builds/v1.0.0-BUILD.md` |
| Requirements and acceptance criteria | `docs/prd.md` |
| API contract (source of truth) | `docs/api/openapi.yaml` |
| Data rules (questions file, transcript and summary fields) | `docs/data-model.md` |
| Architecture | `docs/adr/0001-architecture.md` (backend, overall), `docs/adr/0002-frontend-architecture.md` (frontend requests, errors, loading), `docs/adr/0006-redis-limits.md` (Redis) |
| Screens, flows, tokens, wireframe | `docs/design/` |
| Roadmaps | `docs/roadmap/` |
| Hand-runnable requests | `docs/api/requests.http` |

## Layout

```
backend/            FastAPI (Python 3.12), pytest
  app/main.py       create_app(): middleware, error handlers, routers, lifespan loads the repository
  app/config.py     Settings from env and .env files
  app/errors.py     ApiError, the shared {code, detail, fields?} body, localhost-only Host guard
  app/http.py       request helpers shared by routers
  app/questions/    domain.py (text rules), models.py (request validation), repository.py (JSON file), router.py
  app/transcription/ Transcriber interface, deepgram.py, fake.py, text.py (pause dots), router.py
  app/summary.py    filler flags, pauses, summary for the 200 body
  app/log.py        queue logging (QueueHandler + listener thread to stdout), started by the lifespan; UMLESS_LOG_LEVEL
  app/contact/      contact form: POST /api/contact → Resend email to CONTACT_TO, Reply-To the sender, 5/hour per user
  app/client_errors/ browser crash reports: POST /api/client-errors → logged at ERROR, 30/hour per user (sent by src/shared/lib/reportError.ts when signed in)
  app/monitoring.py Sentry, off unless SENTRY_DSN: ERROR logs and unhandled errors become events; never bodies, cookies, tokens, frame vars or IPs (docs/runbooks/monitoring.md)
  app/free_cap.py   site-wide daily cap on free-trial time (600 min per India day, UMLESS_FREE_MINUTES_PER_DAY); 503 free_time_paused; paying users exempt
  app/limits.py     transcription limits: one at a time and 30/hour per user, Redis or in memory (ADR 0006)
backup/             nightly mysqldump to an OCI bucket, restore-test.sh (docs/runbooks/backups.md)
redis/              Redis service (compose + redis.conf), for the transcription limits; password in redis/.env
frontend/           React 19 + TypeScript + Vite 6, Vitest, Playwright (layers: ADR 0005; imports only go down)
  src/app/          main.tsx, App (access check + layout), routes.ts (route table), access.ts, layouts/, session/ClerkSession
  src/pages/        one thin component per route
  src/features/<x>/ questions, practice, takes, progress, history, billing, marketing, legal: api/ (*Api.ts), model/ (logic), ui/; index.ts is the public surface
  src/shared/api/   client.ts (openapi-fetch + ApiError), apiErrors.ts; generated/ is generated, never edit
  src/shared/lib/   router.ts (matchPath, navigate, navigation guard), formatting, small hooks
  src/shared/config/paths.ts  every URL pattern; features build links from it
  src/shared/ui/    dialogs, toast, error banners, ErrorBoundary, Link
  src/shared/theme/ design tokens
  src/content/      business details and copy as data
  tests/e2e/        Playwright specs, one per flow (F1–F4)
```

## Commands

Git Bash on Windows. The backend venv is the Windows one; WSL uses `.venv/Scripts/python.exe` too.

| Task | Command |
|---|---|
| Backend dev server | `cd backend && .venv/Scripts/python.exe run.py` (127.0.0.1:8000) |
| Frontend dev server | `cd frontend && npm run dev` (localhost:5173, proxies `/api` to 8000) |
| Backend tests (incl. Schemathesis contract tests) | `cd backend && .venv/Scripts/python.exe -m pytest -q` |
| Frontend unit tests / lint / build | `cd frontend && npm test` / `npm run lint` / `npm run build` |
| E2E | `cd frontend && npm run e2e` (starts its own servers) |
| Regenerate the API client | `cd frontend && npm run gen:api` |
| Everything before a commit | the project `verify` skill (`.claude/skills/verify/SKILL.md`) |
| CI/CD | `.github/workflows/ci.yml`: tests, Trivy, SonarCloud, ARM images; a merge to `main` pushes to OCIR, deploys over SSH, smoke-tests and rolls back on failure |

Run without a Deepgram key: set `UMLESS_TRANSCRIBER=fake`. The real key goes in `backend/.env` (see `backend/.env.example`). `pytest --run-live` makes one real Deepgram call.

On the Oracle server there is no Node or Python on the host: run checks in containers (`node:22-alpine` for the frontend, `python:3.12-slim` for the backend, `mcr.microsoft.com/playwright:v1.64.1-noble` for e2e with `UMLESS_PYTHON` pointing at a venv inside it), then `sudo chown -R ubuntu:ubuntu` what they wrote. Merging into `main` deploys (CI runs `deploy/deploy.sh <sha>` over SSH, then a smoke test, and rolls back on failure; `docs/runbooks/deploys.md`). Never edit or build on the server (`deploy.sh` refuses a dirty checkout); the one exception is the backup image, which CI doesn't build: rebuild it on the server when `backup/` changes (`docs/runbooks/deploys.md`). Never `docker compose up --build nginx`: it also rebuilds the backend and frontend images. MySQL tests need `UMLESS_TEST_DATABASE_URL` pointing at a throwaway database (every table is dropped): a temporary `mysql:8.4` container works. Redis tests need `UMLESS_TEST_REDIS_URL` (a temporary `redis:7.4-alpine` container). `backend/.env` on the server has `DB_HOST`, so importing the app there needs `REDIS_URL` set too.

Ports: your dev servers use 8000 and 5173; e2e uses 8766 and 5175; manual checks during development used 8765 and 5174. Never test against 8000 with real data: point `UMLESS_DATA_FILE` at a scratch file and use another port.

## Rules that aren't obvious from the code

- **Contract first.** `docs/api/openapi.yaml` wins over the code. Changing it needs the user's OK and a line in the `docs/BUILD.md` decisions log. After a change, run `npm run gen:api` and commit the regenerated `src/shared/api/generated/openapi.d.ts`.
- **One error body.** Every non-2xx response is `{code, detail, fields?}` with a code from `ErrorCode`. Raise `ApiError` in app code, never `HTTPException`.
- **Security shape** (ADR 0001, 0003): the backend is reached only through the nginx gateway (which sends `Host: localhost`), only `localhost`/`127.0.0.1` Host headers are accepted, no CORS (Vite `server.cors: false` too), JSON-only question writes, and every endpoint but health needs a Clerk session when sign-in is on. Don't loosen these.
- **Frontend layers** (ADR 0005): `app → pages → features → shared/content`. Another feature is imported only through `@/features/<name>`; inside a feature, imports are relative. ESLint enforces both.
- **Frontend requests** (ADR 0002): only `*Api.ts` modules import the client (ESLint enforces it). Sort failures with `classifyApiError`. No hand-written `fetch` to contract endpoints.
- **Pause dots** use the raw gap between words: `floor(gap + 0.001)` dots. The same rule drives `text`, `pause_count`, `longest_pause_seconds` and the frontend's highlighting (`summaryText.ts`). Change it everywhere or nowhere.
- **Fillers** are exactly `um`, `uh`, `mhmm`. Deepgram's uh-huh, uh-uh, mm-mm and nuh-uh are yes/no answers and count as ordinary words.
- **Styling:** plain CSS with tokens from `src/shared/theme/tokens.css` (the only file with colour values; light, dark and system). Build screens from `@/shared/ui` primitives (`ui-` classes, style guide at `/_ui` in dev); `app/index.css` is the old global layer, removed in Phase 6. Where `flows.md` and the wireframe disagree on wording, the wireframe wins.
- **Logging:** use `logging.getLogger(__name__)`; `app/log.py` puts every record on a queue, so log calls never block a request. Never log transcript text or keys. Tests build `Settings()` directly (no `log_level`), which leaves logging alone so `caplog` works.
- **Order statuses** `created → paid → refund_pending → refunded`: only a `created` order is ever credited (`mark_paid`), so late payment webhooks can't credit a refunded one. The refund rule is `refund_refusal()` in `app/billing/store.py` (3 days, and no paid time used since buying: `accounts.last_paid_use_at`), used by the list (`refundable`) and the endpoint alike. Free time and prices live only in `app/billing/packs.py` and, as copy, `src/content/business.ts`: change both together. Normal: 20 free minutes, ₹49 / ₹199. **Launch offer (2026-11-03, until the owner ends it): 60 free minutes, ₹29 / ₹119**, behind `LAUNCH_OFFER` in both files (`docs/runbooks/launch-offer.md`). On metered servers every recording is measured (`app/transcription/duration.py`, PyAV) before Deepgram (max 10 min, no longer than the time left) and charged exactly, free seconds first.
- **Questions file** `backend/data/questions.json` is git-ignored. A corrupt file stops startup and is never overwritten.

## Working with the user

- The user creates branches, commits and pushes themselves, from WSL. Don't commit; hand over the commands and Conventional Commit messages.
- Feature branches come off `develop`; the user merges to `main`. Don't switch branches in `D:\umless` (it breaks the running dev servers); use a worktree if another branch is needed.
- Plan first for anything touching more than ~3 files or a public interface, and wait for an OK.
- Bug fixes get a regression test that fails before the fix. Never weaken, skip or delete tests without asking.
- Phases are run with `/kit:build`; `docs/BUILD.md` is its source of truth. Never mark a phase `approved` without the user saying so.

## Gotchas

- Playwright on Windows runs `webServer` commands through `cmd.exe`: build paths with `path.join`, not forward slashes.
- Vitest runs in jsdom: its `Blob` isn't one Node's `Request` can read (it sends `"[object Blob]"`). Use `await new Response(data).blob()` in tests.
- The kit policy hook blocks piping `curl` into an interpreter. Write to a file, or print the raw output.
- Line endings are mixed (CRLF and LF) and there's no `.gitattributes` yet; keep each file's existing endings when editing.
- Chrome's WebM recordings have no duration metadata; the UI shows the measured take length instead.

## Open items

- Deleting a Clerk account doesn't delete that user's questions, takes, transcripts or balance: needs a Clerk `user.deleted` webhook (decision pending).
- Launch: tracked in `docs/roadmap/2026-10-30-launch-readiness.md`. Clerk is on its production instance and the Razorpay webhook is live (2026-10-30). Refunds of unused packs are self-serve; exceptions by hand (`docs/runbooks/refunds.md`).
- E2E (`tests/e2e/a11y.spec.ts`) gates WCAG 2.2 AA on every signed-in and public page; the landing and sign-in pages only render signed out, so check them against the live site.
- Not verified: Firefox and Safari.
- Known minor issues from the v1.0.0 reviews are listed in `docs/builds/v1.0.0-BUILD.md`; check whether the refactor PRs (#4, #5) already fixed each one before working on it.
