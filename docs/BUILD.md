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
- 2026-11-01: Free trial becomes 90 minutes of time (was 3 transcriptions of any length), charged per second, free first then paid; the server measures every recording (PyAV) before Deepgram and refuses unreadable audio (`unreadable_audio`), over 10 minutes (`recording_too_long`) and longer than the time left (402 with numbers). Contract: `Account.free_transcriptions_left` → `free_seconds_left`. Existing users: each remaining free transcription → 30 min. Why: owner's new free-trial model, and a review found that 1 s of paid time plus a 25 MB upload got a 1–2 h Deepgram call for free (`docs/roadmap/2026-11-01-metered-free-time.md`).
- 2026-11-01: Contract: `POST /api/contact` (`sendContactMessage`) for complaints and suggestions; new `ErrorCode`s `contact_unavailable` (503, no email provider) and `contact_failed` (502). Emails the owner's inbox through Resend with the sender's address as Reply-To; sign-in required (security shape: only health is open), 5 per user per hour. Why: owner asked for a contact page for complaints and suggestions that lands in their Gmail (option A of the email options).
- 2026-11-01: Prices and refund policy (owner's decision). Packs: 1 session ₹49 (was ₹40), 5 sessions ₹199 (was ₹120); orders already paid keep their amount. Refunds: within 3 days (was 7), and only if no paid practice time has been used since the pack was bought: using even one session of a 5-session pack ends the refund; free transcriptions don't count. Built with `accounts.last_paid_use_at` (migration 0006), set whenever paid time is charged; `refund_refusal()` refuses packs bought at or before it. Contract wording of `requestRefund`/`Purchase.refundable` updated (no shape change). Privacy policy now covers refunds, per-transcription logs, the hourly limit counters, 30-day backups and processing outside India.
- 2026-10-31: Contract: self-serve refunds (`docs/roadmap/2026-10-31-self-serve-refunds.md`). `POST /api/payments/{orderId}/refund` (`requestRefund`); `Purchase.status` (`paid`, `refund_pending`, `refunded`) and `Purchase.refundable`; `listPurchases` includes refunded purchases; new `ErrorCode` `refund_not_allowed`; the webhook handles `refund.processed` and `refund.failed`. Rule: paid within 7 days and the balance still covers the pack, as the published policy says. Why: refunds were all manual (email, dashboard, SQL), and the owner doesn't want to start every refund by hand.
- 2026-10-30: Redis added for transcription limits (ADR 0006), reversing the entry below for this job only. Contract: `createTranscription` answers 409 `transcription_in_progress` (one at a time per user) and 429 `rate_limited` (30 per user per hour). Why: parallel uploads all passed the balance check, so a user with seconds left got several paid Deepgram calls free; nothing capped calls per user. Redis keeps both limits across workers; it fails open.
- 2026-10-30: Contract: `GET /api/payments` (`listPurchases`), the user's paid orders with their Razorpay payment id, shown on Settings → Billing. Why: a ₹40 purchase looked lost because nothing listed it (it was credited), and the refund policy asks for the payment id. The balance label now shows free and paid time together ("3 free + 1 h left"). Redis considered and not added: the data was correct in MySQL, one worker, atomic updates.
- 2026-10-28: Frontend v2 build approved (ADR 0005, `docs/roadmap/2026-10-28-frontend-v2-build.md`): layered `app/pages/features/shared/content` folders, route table, TanStack Query, Clerk components for auth, live pack pricing kept. Contract change approved for Phase 7: `GET /api/takes` (all takes across questions, for History and the Dashboard).
- 2026-10-20: New build cycle for v1.1 (attempt history) after the v1.0.0 release; v1.0.0 BUILD.md archived in docs/builds/. Order agreed: history (database) before auth, which waits until the app is deployed or multi-user.
