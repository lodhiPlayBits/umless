# Build: umless

umless is a speech practice web app for individuals rehearsing on their own: job interviews, presentations, exams and language practice. A user builds a list of their own practice questions, picks one, records a spoken answer in the browser, and gets a Deepgram transcript that keeps filler words ("um", "uh") and marks pauses with dots, plus a filler summary. They can replay the recording and download both the audio and the transcript. v1 is local and single-user: no accounts, no database, nothing stored on the server.

## Stack
| Layer | Choice | Notes |
|---|---|---|
| Backend | Python 3.12 + FastAPI | already in `backend/`; speech-to-text via Deepgram nova-3 (`filler_words=true`) |
| Database | none in v1 (questions in a JSON file behind a `QuestionRepository` interface) | later: SQLite + SQLAlchemy + Alembic |
| Frontend | React 19 + TypeScript + Vite 6 | already in `frontend/` |
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
| E2E tests | TBD |
| Generate API client | TBD |

## Phases
| # | Phase | Skill | Status | Date | Notes |
|---|---|---|---|---|---|
| 1 | UI/UX design | /kit:design | approved | 2026-10-19 | docs/design/: 23 screen states, flows with 24 edge cases, tokens, clickable wireframe |
| 2 | Docs + API contract | /kit:contract | approved | 2026-10-19 | prd, data-model, ADR 0001, openapi.yaml (6 ops, Redocly lint clean); plan-critic: PROCEED WITH CHANGES, blocking item applied |
| 3 | Backend | /kit:feature (per endpoint group) | approved | 2026-10-19 | platform, questions, transcriptions done; 329 passed, 1 skipped; each group code- and security-reviewed |
| 4 | API testing | /kit:api-test | in-progress | 2026-10-19 | contract tests written (Schemathesis); 1 fuzz case waits on the AudioBody contract decision |
| 5 | Frontend | /kit:frontend | not-started | | practice screen prototype exists (feat/practice-recorder) |
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
