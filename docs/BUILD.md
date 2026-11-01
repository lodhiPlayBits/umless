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
- 2026-11-01: Launch roadmap Phase 3 steps 2 and 5. Backend Sentry (`app/monitoring.py`, `sentry-sdk==2.73.0`), off unless `SENTRY_DSN` is set: every ERROR log line and unhandled exception becomes an event; `data_collection` sends no user info, cookies, request bodies, query strings or frame variables and only three harmless headers, and `scrub()` strips them again (a test found frame variables leaking the session token, hence both). Errors only, no tracing. The frontend keeps reporting through `POST /api/client-errors` instead of the Sentry browser SDK, so the browser never talks to Sentry. Watchdog `deploy/watchdog.sh` (cron, every 10 min): disk > 80%, any umless container down or unhealthy, health check failing; emails through Resend with the contact form's key; repeats every 6 h, mails on recovery. Runbook `docs/runbooks/monitoring.md`. Why: until now nothing told the owner when something broke.
- 2026-11-01: Launch roadmap Phase 7 step 2: site-wide daily cap on free-trial time (`app/free_cap.py`), 600 min per India day by default (`UMLESS_FREE_MINUTES_PER_DAY`, ≈ ₹220 of Deepgram; 0 pauses free time). Checked after measuring, before Deepgram: a take that needs free time once the cap is used up gets 503 `free_time_paused` (new `ErrorCode`, owner's message "paused for today … back after midnight, or buy a session"); users whose paid time covers the whole take are never stopped or counted. Free seconds are reserved atomically (Redis Lua, or in memory) and given back if the take isn't charged. The first refusal each day logs at ERROR. Fails open on a Redis outage, like ADR 0006. Why: scripted sign-ups could each burn 20 free minutes with no overall limit.
- 2026-11-01: Launch roadmap Phase 7 step 4: `pip-audit` found 14 advisories in starlette 0.46.2 and one in python-dotenv 1.1.0; upgraded FastAPI 0.115.12 → 0.162.0, starlette → 1.10.0 (now pinned on its own), python-dotenv → 1.2.4. `pip-audit` and `npm audit --omit=dev` are clean. FastAPI now wraps included routers, so the 405 `Allow` header asks the router per method instead of reading route `methods`. Why: security review before launch.
- 2026-11-01: Launch roadmap Phase 7 step 1, first half: `Content-Security-Policy-Report-Only` in the gateway (`deploy/nginx/snippets/security-headers.conf`: self, Clerk on clerk.umless.in + Turnstile, Razorpay Checkout; no Sentry, which isn't used). Violations reach the backend log through `POST /api/client-errors`, whose `ClientErrorReport.kind` gains `csp` (contract change, owner's go-ahead to "do what you can"); signed-out pages (landing, sign-in) only show them in the browser console. The inline theme script moved to `public/theme-init.js` so the policy needs no hash or `'unsafe-inline'` for scripts. HSTS `includeSubDomains`/`preload` left for the owner. Why: security review before launch; Report-Only can't break anything while the policy is tuned.
- 2026-11-01: Contract: `POST /api/client-errors` (`reportClientError`, schema `ClientErrorReport`): the frontend's `reportError` (render errors, plus new `window` `error`/`unhandledrejection` listeners) sends each crash to the server, which logs it at ERROR and stores nothing. Signed-in users only (security shape unchanged; signed-out pages keep errors in the console), 30 per user per hour (429 `rate_limited`), at most 5 per page load with repeats skipped, pathname without the query string. No new `ErrorCode`. Why: launch review found browser crashes on umless.in went only to the user's console; owner chose an own endpoint over Sentry (no new processor, no privacy-policy change).
- 2026-11-01: Free trial 20 minutes (was 90 for under an hour). Why: 90 min cost ≈ ₹33 of Deepgram per account and beat the ₹49 / 60-min pack, so throwaway emails were worth ≈ ₹33 and short-term users never needed to buy; 20 min ≈ ₹7, 6–8 answers. Migration 0008 caps existing unused free time at 20 min.
- 2026-11-01: Takes with no words are charged their measured time (Deepgram bills them), except under 15 s (muted mic). Why: review found 10-minute silent takes ×30/hour were free to the user but cost Deepgram minutes. Contract wording of `createTranscription` updated; no shape change.
- 2026-11-01: Free trial becomes 90 minutes of time (was 3 transcriptions of any length), charged per second, free first then paid; the server measures every recording (PyAV) before Deepgram and refuses unreadable audio (`unreadable_audio`), over 10 minutes (`recording_too_long`) and longer than the time left (402 with numbers). Contract: `Account.free_transcriptions_left` → `free_seconds_left`. Existing users: each remaining free transcription → 30 min. Why: owner's new free-trial model, and a review found that 1 s of paid time plus a 25 MB upload got a 1–2 h Deepgram call for free (`docs/roadmap/2026-11-01-metered-free-time.md`).
- 2026-11-01: Contract: `POST /api/contact` (`sendContactMessage`) for complaints and suggestions; new `ErrorCode`s `contact_unavailable` (503, no email provider) and `contact_failed` (502). Emails the owner's inbox through Resend with the sender's address as Reply-To; sign-in required (security shape: only health is open), 5 per user per hour. Why: owner asked for a contact page for complaints and suggestions that lands in their Gmail (option A of the email options).
- 2026-11-01: Prices and refund policy (owner's decision). Packs: 1 session ₹49 (was ₹40), 5 sessions ₹199 (was ₹120); orders already paid keep their amount. Refunds: within 3 days (was 7), and only if no paid practice time has been used since the pack was bought: using even one session of a 5-session pack ends the refund; free transcriptions don't count. Built with `accounts.last_paid_use_at` (migration 0006), set whenever paid time is charged; `refund_refusal()` refuses packs bought at or before it. Contract wording of `requestRefund`/`Purchase.refundable` updated (no shape change). Privacy policy now covers refunds, per-transcription logs, the hourly limit counters, 30-day backups and processing outside India.
- 2026-10-31: Contract: self-serve refunds (`docs/roadmap/2026-10-31-self-serve-refunds.md`). `POST /api/payments/{orderId}/refund` (`requestRefund`); `Purchase.status` (`paid`, `refund_pending`, `refunded`) and `Purchase.refundable`; `listPurchases` includes refunded purchases; new `ErrorCode` `refund_not_allowed`; the webhook handles `refund.processed` and `refund.failed`. Rule: paid within 7 days and the balance still covers the pack, as the published policy says. Why: refunds were all manual (email, dashboard, SQL), and the owner doesn't want to start every refund by hand.
- 2026-10-30: Redis added for transcription limits (ADR 0006), reversing the entry below for this job only. Contract: `createTranscription` answers 409 `transcription_in_progress` (one at a time per user) and 429 `rate_limited` (30 per user per hour). Why: parallel uploads all passed the balance check, so a user with seconds left got several paid Deepgram calls free; nothing capped calls per user. Redis keeps both limits across workers; it fails open.
- 2026-10-30: Contract: `GET /api/payments` (`listPurchases`), the user's paid orders with their Razorpay payment id, shown on Settings → Billing. Why: a ₹40 purchase looked lost because nothing listed it (it was credited), and the refund policy asks for the payment id. The balance label now shows free and paid time together ("3 free + 1 h left"). Redis considered and not added: the data was correct in MySQL, one worker, atomic updates.
- 2026-10-28: Frontend v2 build approved (ADR 0005, `docs/roadmap/2026-10-28-frontend-v2-build.md`): layered `app/pages/features/shared/content` folders, route table, TanStack Query, Clerk components for auth, live pack pricing kept. Contract change approved for Phase 7: `GET /api/takes` (all takes across questions, for History and the Dashboard).
- 2026-10-20: New build cycle for v1.1 (attempt history) after the v1.0.0 release; v1.0.0 BUILD.md archived in docs/builds/. Order agreed: history (database) before auth, which waits until the app is deployed or multi-user.
