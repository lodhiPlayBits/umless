# umless

Speech-practice web app. You keep a list of practice questions, record a spoken answer in the browser, and get a Deepgram transcript that keeps filler words ("um", "uh", "mhmm") and marks pauses of 1 s or more as dots, plus a summary (pace, filler counts, pauses). You can replay and download the audio and a `.txt` transcript.

v1.0.0 is released: local, single user, no auth, nothing about a recording stored on the server.

## Where things are

| Need | Read |
|---|---|
| Current build status, phases, decisions log | `docs/BUILD.md` (v1.1 "attempt history", phase 1 design in progress) |
| v1.0.0 build history and every decision behind it | `docs/builds/v1.0.0-BUILD.md` |
| Requirements and acceptance criteria | `docs/prd.md` |
| API contract (source of truth) | `docs/api/openapi.yaml` |
| Data rules (questions file, transcript and summary fields) | `docs/data-model.md` |
| Architecture | `docs/adr/0001-architecture.md` (backend, overall), `docs/adr/0002-frontend-architecture.md` (frontend requests, errors, loading) |
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
frontend/           React 19 + TypeScript + Vite 6, Vitest, Playwright
  src/client.ts     openapi-fetch client + ApiError; src/generated/ is generated, never edit
  src/apiErrors.ts  classifies failures: unreachable / validation / server
  src/router.ts     small History-API router with a navigation guard
  src/questions/    question list screens; questionsApi.ts
  src/practice/     record, review, transcribe, result; practiceApi.ts
  src/components/   dialogs, toast, error banners, ErrorBoundary
  src/styles/theme.css  design tokens from docs/design/tokens.md
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

Run without a Deepgram key: set `UMLESS_TRANSCRIBER=fake`. The real key goes in `backend/.env` (see `backend/.env.example`). `pytest --run-live` makes one real Deepgram call.

Ports: your dev servers use 8000 and 5173; e2e uses 8766 and 5175; manual checks during development used 8765 and 5174. Never test against 8000 with real data: point `UMLESS_DATA_FILE` at a scratch file and use another port.

## Rules that aren't obvious from the code

- **Contract first.** `docs/api/openapi.yaml` wins over the code. Changing it needs the user's OK and a line in the `docs/BUILD.md` decisions log. After a change, run `npm run gen:api` and commit the regenerated `src/generated/openapi.d.ts`.
- **One error body.** Every non-2xx response is `{code, detail, fields?}` with a code from `ErrorCode`. Raise `ApiError` in app code, never `HTTPException`.
- **Security shape** (ADR 0001): bound to 127.0.0.1, only `localhost`/`127.0.0.1` Host headers, no CORS (Vite `server.cors: false` too), JSON-only question writes. Don't loosen these.
- **Frontend requests** (ADR 0002): only `*Api.ts` modules import the client (ESLint enforces it). Sort failures with `classifyApiError`. No hand-written `fetch` to contract endpoints.
- **Pause dots** use the raw gap between words: `floor(gap + 0.001)` dots. The same rule drives `text`, `pause_count`, `longest_pause_seconds` and the frontend's highlighting (`summaryText.ts`). Change it everywhere or nowhere.
- **Fillers** are exactly `um`, `uh`, `mhmm`. Deepgram's uh-huh, uh-uh, mm-mm and nuh-uh are yes/no answers and count as ordinary words.
- **Styling:** plain CSS with tokens from `theme.css`; no hard-coded colours. Where `flows.md` and the wireframe disagree on wording, the wireframe wins.
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

- v1.1 attempt history: phase 1 design is waiting on 8 interview questions (what a take stores, when it's saved, deletion, views, SQLite, questions migration). Agreed order: history before auth; auth only when the app is deployed or multi-user.
- Not verified: a live Deepgram check with a real voice, Firefox and Safari.
- Known minor issues from the v1.0.0 reviews are listed in `docs/builds/v1.0.0-BUILD.md`; check whether the refactor PRs (#4, #5) already fixed each one before working on it.
