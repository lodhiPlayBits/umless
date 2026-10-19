# Build: umless

umless is a speech practice web app for individuals rehearsing on their own: job interviews, presentations, exams and language practice. A user builds a list of their own practice questions, picks one, records a spoken answer in the browser, and gets a Deepgram transcript that keeps filler words ("um", "uh") and marks pauses with dots, plus a filler summary. They can replay the recording and download both the audio and the transcript. v1 is local and single-user: no accounts, no database, nothing stored on the server.

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
| 1 | UI/UX design | /kit:design | approved | 2026-10-19 | docs/design/: 23 screen states, flows with 24 edge cases, tokens, clickable wireframe |
| 2 | Docs + API contract | /kit:contract | approved | 2026-10-19 | prd, data-model, ADR 0001, openapi.yaml (6 ops, Redocly lint clean); plan-critic: PROCEED WITH CHANGES, blocking item applied |
| 3 | Backend | /kit:feature (per endpoint group) | approved | 2026-10-19 | platform, questions, transcriptions done; 329 passed, 1 skipped; each group code- and security-reviewed |
| 4 | API testing | /kit:api-test | approved | 2026-10-19 | Schemathesis contract tests green (28 explicit + 6 fuzz); live CLI run 547/547; security LOW |
| 5 | Frontend | /kit:frontend | awaiting-approval | 2026-10-19 | all 10 screens done and browser-checked; 188 unit + 82 e2e passing; code review blocking item fixed |
| 6 | Ship | /kit:ship | not-started | | |

Phase status values: not-started, in-progress, awaiting-approval, approved, blocked.
Row status values (endpoint groups, frontend screens): not-started, in-progress, done.

## Backend endpoint groups
<!-- Filled in phase 2. One row per group; phase 3 builds them in order. -->
| Group | Endpoints | Status |
|---|---|---|
| platform | `getHealth`, plus the shared error format, `invalid_host` guard, 404/405/500 handlers for every route | done |
| questions | `listQuestions`, `createQuestion`, `updateQuestion`, `deleteQuestion` (+ `JsonFileQuestionRepository`) | done |
| transcriptions | `createTranscription` (pause dots from `feat/pause-dots`, filler flags, summary, `mip_opt_out=true`) | done |

## Frontend screens
<!-- Filled in phase 5. One row per screen in build order; lets phase 5 resume after /clear. -->
| Screen | Route | Flow | Status | Browser-checked |
|---|---|---|---|---|
| Question list (loading, empty, error, filter) | `/` | F1 | done | yes: 375 px and 1280 px in Chromium (Playwright screenshots), no console errors |
| Add / edit question (validation, duplicate, save error) | `/` | F1, F2 | done | yes: 375 px and 1280 px in Chromium (Playwright screenshots), no console errors |
| Delete confirm + Undo toast | `/` | F2 | done | yes: 375 px and 1280 px in Chromium (Playwright screenshots), no console errors |
| Practice ready (health banner, "2 of 5") | `/practice/:id` | F3 | done | yes: 375 px and 1280 px in Chromium with a fake mic (denied / no-mic / unsupported simulated, countdown via a fast-forwarded clock); "Allow microphone access" hint and empty take not shown in the browser (covered by unit tests) |
| Mic states (permission, denied, no mic, unsupported) | `/practice/:id` | F3, E1–E3 | done | yes: 375 px and 1280 px in Chromium with a fake mic (denied / no-mic / unsupported simulated, countdown via a fast-forwarded clock); "Allow microphone access" hint and empty take not shown in the browser (covered by unit tests) |
| Recording + countdown + leave-while-recording | `/practice/:id` | F3, E15 | done | yes: 375 px and 1280 px in Chromium with a fake mic (denied / no-mic / unsupported simulated, countdown via a fast-forwarded clock); "Allow microphone access" hint and empty take not shown in the browser (covered by unit tests) |
| Review, empty, transcribing, transcribe error | `/practice/:id` | F3, E4–E11 | done | yes: 375 px and 1280 px in Chromium with a fake mic (denied / no-mic / unsupported simulated, countdown via a fast-forwarded clock); "Allow microphone access" hint and empty take not shown in the browser (covered by unit tests) |
| Result (summary, transcript, downloads, copy) + empty result | `/practice/:id` | F4, E12–E13 | done | yes: 375 px and 1280 px in Chromium; .txt contents, clipboard and empty result checked; no console errors |
| Leave without saving (dialog + native prompt) | any | E14 | done | yes: dialog on Back link and Practise again, gone after a download; native "Leave site?" prompt not checked (headless Chromium) |
| Not found | `*`, unknown id | E16 | done | yes: unknown URL at 1280 px and unknown question id at 375 px |

## Decisions log
<!-- One line per decision that changed the plan: date, decision, why. -->
- 2026-10-18: Deepgram for speech-to-text (filler_words option, $200 free credit), called with plain httpx. See docs/roadmap/2026-10-18-umless-mvp.md.
- 2026-10-18: Pauses of 1 s or more shown as dots, one per second (feat/pause-dots).
- 2026-10-19: Design defaults accepted: users practice alone; v1 has a question list, record, playback, transcript with filler and pause highlighting, filler summary and downloads. No auth, no DB, no attempt history in v1 (history needs server storage).
- 2026-10-19: Filler summary moved into v1 (it is what makes the app "umless", and it only needs the transcript already returned).
- 2026-10-19: Privacy: nothing stored on the server in v1; recordings go to Deepgram with `mip_opt_out=true`; a short privacy note on the practice screen.
- 2026-10-19: Styling is plain CSS with design tokens; desktop and mobile web; light and dark mode.
- 2026-10-19: Phase 1 approved with the design's defaults for its open questions: question editing (PATCH) and Undo-with-position stay in v1; summary = length, words per minute, per-filler counts, fillers per minute, long-pause count and longest pause; "Record again" confirms when the take wasn't downloaded; routing approach (small custom router vs react-router) decided in phase 5.
- 2026-10-19: Phase 2 approved as written. Practice route loads from `listQuestions` (no `getQuestion`), per the plan-critic's blocking objection. Critic's should-change items not applied. Still open for phase 3: base branch (develop lacks feat/practice-recorder and feat/pause-dots), `mip_opt_out` price, filler set. The user creates branches and commits themselves in WSL.
- 2026-10-19: Platform group: FastAPI's generated /docs, /redoc and /openapi.json are disabled (docs/api/openapi.yaml is the contract). FastAPI's 400 body-parse error maps to `validation_error` (field `body`). Project `verify` skill added at .claude/skills/verify/SKILL.md. Not yet agreed: listing 404/405 on each operation in the contract.
- 2026-10-19: Questions group: text is trimmed with JavaScript's `trim()` whitespace set (matches the contract's `\S`); the 500 limit applies before trimming. `position` accepts integral floats (OpenAPI 3.1). Any Content-Type except `application/json` is 415, but a malformed body with no or `+json` Content-Type gets 422 (FastAPI parses first; accepted). Writes go to disk before memory; a file with an invalid question (bad shape, over 500, blank, lone surrogate) stops startup and is never overwritten. `UMLESS_DATA_FILE` relative paths resolve against backend/. Not yet agreed: trailing-slash URLs return Starlette's 307 (no `Error` body); question routes have no body-size cap (security review, LOW).
- 2026-10-19: Contract change (user accepted recommendations): `FillerWord` is now um, uh, mhmm (uh-huh, uh-uh, mm-mm, nuh-uh are yes/no answers, counted as ordinary words); `fillers` maxItems 7 → 3. `mip_opt_out=true` kept. feat/pause-dots (24b7d60) applied to the working tree as uncommitted changes, since a7a4172 didn't include it. 404/405 are not listed per operation: they come from undeclared URLs and methods, which OpenAPI can't attach to an operation; phase 4 handles them in the tool's config.
- 2026-10-19: Transcriptions group (contract descriptions only, no schema change): dots, `pause_count` and `longest_pause_seconds` all use the raw gap with `floor(g + 0.001)`; `pause_before_seconds` is display only. Rates fall back to the last word's end when Deepgram's duration is null or 0 (`duration_seconds` returned unchanged). An unusable Deepgram duration or a word the contract forbids is a 502. No words gives `text == ""`. Rounding uses Python's `round()`.
- 2026-10-19: Transcriptions group done. A per-minute rate that would be infinite (near-zero Deepgram duration) is a 502, like other unusable upstream data (security review). Not fixed (needs a hostile Deepgram response): words whose timings jump backwards can inflate the pause dots; confidence and timings accept numeric strings.
- 2026-10-19: Phase 3 approved by the user. Live Deepgram check not run.
- 2026-10-19: Phase 4: Schemathesis 4.32.1 added (dev-only, user OK); pytest bumped 8.3.5 -> 8.4.2 because Schemathesis needs >= 8.4. Fixed: 405 `Allow` header now lists every method on the path (found by fuzzing). Security review LOW: Vite dev server's default CORS lets other localhost origins call the API through :5173 (contradicts ADR 0001 Auth); not fixed in this phase.
- 2026-10-19: Contract change (user chose option a): `AudioBody` loses `maxLength` (keeps `minLength: 1`); the 25 MB cap stays in its description and the documented 413. Schemathesis couldn't generate a body past the cap and flagged valid uploads; removing `minLength` too made it flag the documented 400 for an empty body. No behaviour change. Vite `server.cors: false` agreed for the start of phase 5.
- 2026-10-19: Phase 4 approved by the user.
- 2026-10-19: Phase 5 (user OK): openapi-typescript + openapi-fetch for the typed client, @playwright/test 1.64.1 for e2e, a small built-in router (no dependency). Vite `server.cors: false`. npm audit: 3 pre-existing vitest advisories (2 critical, dev-only), not fixed here.
- 2026-10-19: Questions screens follow the wireframe where flows.md differs: the delete dialog says "Delete this question?" with "You can undo for a few seconds afterwards" (flows.md F2.3 says "This can't be undone", which contradicts the Undo toast); the too-long message is "Keep questions under 500 characters." with a "512 / 500" counter. Vite's /api proxy target is overridable with UMLESS_API_URL (used by e2e).
- 2026-10-19: Practice screens follow the wireframe where flows.md wording differs (E2, E3, E10 messages); the countdown switches at 9:00 showing "Time left 1:00"; Transcribe is hidden (not just disabled) while transcribing. Recorder errors now carry a kind (denied / no-mic / unsupported / failed) and auto-stop a reason (limit / device-lost). The old prototype (PracticeScreen.tsx, api.ts and their tests) is no longer routed; removal waits for the user's OK.
- 2026-10-19: Leave-without-saving asks only while nothing from the take has been downloaded (flows F4.6/F4.8); the wireframe note said "unless both files were downloaded". The old practice prototype (PracticeScreen.tsx, api.ts and their tests) was removed with the user's OK; transcription is covered by the new practice tests.
- 2026-10-19: Phase 5 code review (REQUEST CHANGES, 1 blocking): an auto-stop while "Stop and discard?" was open left the dialog up and Discard dropped the take without the unsaved-take question; fixed with a regression test. Also fixed: no Try again for 415 / invalid_host, transcript region role, IME Enter in edit, stale list loads. Not fixed (listed for the user): blocked Back re-pushes history instead of history.go, dev-only object-URL leak under StrictMode, a few hard-coded CSS sizes, limit notice lost if Stop races the auto-stop.
