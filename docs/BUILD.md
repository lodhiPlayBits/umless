# Build: umless v1.1 (attempt history)

Adds practice history to umless v1.0.0: keep past takes of each question and show whether fillers and pauses go down over time. Still local and single-user. The v1.0.0 build (phases, decisions, review notes) is archived in `docs/builds/v1.0.0-BUILD.md`.

## Stack
| Layer | Choice | Notes |
|---|---|---|
| Backend | Python 3.12 + FastAPI | already in `backend/`; speech-to-text via Deepgram nova-3 (`filler_words=true`) |
| Database | none in v1 (questions in a JSON file behind a `QuestionRepository` interface) | later: SQLite + SQLAlchemy + Alembic |
| Frontend | React 19 + TypeScript + Vite 6 | already in `frontend/` |
| API client | openapi-typescript 7.13.0 (dev) + openapi-fetch 0.17.0 | types generated from docs/api/openapi.yaml; typed fetch |
| Routing | small built-in router (History API), no dependency | routes `/`, `/practice/:id`, not-found |
| Styling | plain CSS with custom properties from `docs/design/tokens.md` | no UI kit, no Tailwind |
| API style | REST + OpenAPI 3.1 | contract lives in docs/api/openapi.yaml |
| Backend test runner | pytest | |
| API contract testing | Schemathesis 4.32.1 (pytest, in-process) | dev-only, in backend/requirements-dev.txt; reads docs/api/openapi.yaml, fuzzes every operation; pytest pinned to 8.4.2 (Schemathesis needs >= 8.4) |
| E2E testing | Playwright | browser with a fake microphone (`--use-fake-device-for-media-stream`) |

## Commands
| Task | Command |
|---|---|
| Backend dev server | `cd backend; .venv\Scripts\python run.py` (WSL: `.venv/Scripts/python.exe run.py`) |
| Backend tests | `cd backend; .venv\Scripts\python -m pytest -q` |
| API contract tests | `cd backend; .venv\Scripts\python -m pytest -q tests/test_contract.py` (no server needed; also part of the backend tests and `verify`) |
| Manual API requests | `docs/api/requests.http` (VS Code REST Client / JetBrains HTTP Client) |
| Frontend dev server | `cd frontend; npm run dev` (http://localhost:5173, proxies `/api` to 127.0.0.1:8000) |
| Frontend tests | `cd frontend; npm test` (also `npm run build`, `npm run lint`) |
| E2E tests | `cd frontend; npm run e2e` (Playwright starts its own backend on 8766 and Vite on 5175, fake transcriber, temp data file) |
| Generate API client | `cd frontend; npm run gen:api` (openapi-typescript → `src/generated/openapi.d.ts`, never edited by hand) |

## Phases
| # | Phase | Skill | Status | Date | Notes |
|---|---|---|---|---|---|
| 1 | UI/UX design | /kit:design | in-progress | 2026-10-20 | interview: what history stores (privacy), retention, views |
| 2 | Docs + API contract | /kit:contract | not-started | | |
| 3 | Backend | /kit:feature (per endpoint group) | not-started | | |
| 4 | API testing | /kit:api-test | not-started | | |
| 5 | Frontend | /kit:frontend | not-started | | |
| 6 | Ship | /kit:ship | not-started | | |

Phase status values: not-started, in-progress, awaiting-approval, approved, blocked.
Row status values (endpoint groups, frontend screens): not-started, in-progress, done.

## Backend endpoint groups
<!-- Filled in phase 2. One row per group; phase 3 builds them in order. -->
| Group | Endpoints | Status |
|---|---|---|

## Frontend screens
<!-- Filled in phase 5. One row per screen in build order; lets phase 5 resume after /clear. -->
| Screen | Route | Flow | Status | Browser-checked |
|---|---|---|---|---|

## Decisions log
<!-- One line per decision that changed the plan: date, decision, why. -->
- 2026-10-30: Redis added for transcription limits (ADR 0006), reversing the entry below for this job only. Contract: `createTranscription` answers 409 `transcription_in_progress` (one at a time per user) and 429 `rate_limited` (30 per user per hour). Why: parallel uploads all passed the balance check, so a user with seconds left got several paid Deepgram calls free; nothing capped calls per user. Redis keeps both limits across workers; it fails open.
- 2026-10-30: Contract: `GET /api/payments` (`listPurchases`), the user's paid orders with their Razorpay payment id, shown on Settings → Billing. Why: a ₹40 purchase looked lost because nothing listed it (it was credited), and the refund policy asks for the payment id. The balance label now shows free and paid time together ("3 free + 1 h left"). Redis considered and not added: the data was correct in MySQL, one worker, atomic updates.
- 2026-10-28: Frontend v2 build approved (ADR 0005, `docs/roadmap/2026-10-28-frontend-v2-build.md`): layered `app/pages/features/shared/content` folders, route table, TanStack Query, Clerk components for auth, live pack pricing kept. Contract change approved for Phase 7: `GET /api/takes` (all takes across questions, for History and the Dashboard).
- 2026-10-20: New build cycle for v1.1 (attempt history) after the v1.0.0 release; v1.0.0 BUILD.md archived in docs/builds/. Order agreed: history (database) before auth, which waits until the app is deployed or multi-user.
