# Roadmap: umless MVP (no auth, no database)

Approved 2026-10-18. Each phase is built with `/kit:feature` (or `/kit:spec` first).

## Goal

A local web app where a user adds their own practice questions, picks one, records an answer in the browser, and gets a Deepgram transcript that keeps the filler words ("um", "uh"). The user can download the transcript (`.txt`) and the raw audio. No auth, no database.

## Success measure

1. With backend and frontend running on localhost, a user in Chrome can add a question, select it, record ~15 s while deliberately saying "um" and "uh", stop, and see a transcript containing those fillers. Each browser's result is reported as pass, fail or "not verified".
2. The user can download a `.txt` transcript and the audio file, and the audio plays in the browser or VLC.
3. Questions survive a backend restart.
4. `pytest` (backend), `npm test` and `npm run build` (frontend) pass. No test calls the real Deepgram API unless explicitly opted in.
5. `backend/.env` is git-ignored, and the Deepgram key never appears in any response sent to the browser.

## Decisions (open questions answered with defaults on approval)

| # | Question | Decision |
|---|---|---|
| 1 | Question storage | JSON file on the backend, behind a `QuestionRepository` Protocol |
| 2 | Filler-word summary (Phase 4) | Optional; decide after Phase 3 |
| 3 | Recording cap | 10 minutes, 25 MB request body |
| 4 | Mic testing | Manual checklist; no Playwright |
| 5 | Transcript download | `.txt` only |
| 6 | Git | Local branches, stacked; the user merges into `main` |
| 7 | Language | TypeScript |
| 8 | Privacy (`mip_opt_out`) | Decide after the Phase 0 spike reports its effect and price |
| 9 | "Raw voice" | Browser echo cancellation, noise suppression and auto-gain **off** |
| 10 | Server copy of recordings | No; downloads are built in the browser and lost on refresh |
| 11 | Firefox | Not installed at the default path on 2026-10-18, so success is checked in Chrome only |
| 12 | No Deepgram combination keeps fillers | Stop and ask the user |

## Assumptions

- **A1** Local, single user, localhost only (a secure context for `getUserMedia`). No deployment or HTTPS.
- **A2** English only.
- **A3** 10-minute client auto-stop with a countdown in the final minute; server rejects bodies over 25 MB with 413. The Deepgram timeout is at least 60 s, or 3x the turnaround measured in Phase 0.
- **A4** No server-side storage of audio or transcripts. The backend only forwards audio to Deepgram.
- **A5** One `JsonFileQuestionRepository`: loaded once at startup, mutations under a `threading.Lock`, write-through via temp file + `os.replace` with up to 5 retries on Windows `PermissionError`.
- **A6** Vite + React + TypeScript, no router, state library or UI kit.
- **A7** venv + pip + `requirements.txt`.
- **A8** Deepgram is called with plain `httpx` (already needed by FastAPI's `TestClient`), not `deepgram-sdk`.
- **A9** Audio is uploaded as the raw request body with the recorder's `Content-Type`, so `python-multipart` isn't needed.
- **A10** Target: desktop Chrome/Edge. Firefox if installed later; Safari best-effort.
- **A11** The backend waits synchronously for Deepgram's pre-recorded response.
- **A13** Stacked branches: each phase branches from the tip of the previous one. Nothing is committed to `main`; only the user merges.
- **A14** `.txt` download with the question text as the header line.
- **A15** The key lives only on the backend. `UMLESS_TRANSCRIBER=fake` runs everything without a key.
- **A16** Audio processing off by default (see decision 9).
- **A17** Single uvicorn process.
- **A18** Spike clips and raw Deepgram JSON stay in git-ignored `spike/`. Only a trimmed, secret-free fixture is committed in Phase 1.

## Phases

Order: 0 → 1 → 2 → 3 → 4 (optional). Each is a branch stacked on the previous one.

### Phase 0: Repo scaffold and Deepgram/browser spike (S) — branch `chore/scaffold`

- `git init -b chore/scaffold`; `.gitignore` for secrets, `.venv/`, `node_modules/`, `dist/`, `backend/data/`, `spike/`; `backend/.env.example`.
- Throwaway recorder page in `spike/` that records in two modes (browser defaults, and all three processing constraints off), logs `track.getSettings()` and `recorder.mimeType`, and saves the clip.
- Send every ~15 s clip through {nova-3, nova-2} × {`smart_format` on/off}, always with `filler_words=true`. Time one ~10-minute clip. Check `mip_opt_out=true`.
- **Decision rule:** the first combination that keeps at least one filler in every clip wins, preferring nova-3, then processing off, then `smart_format` on. If none passes, stop and ask the user.
- **Done when:** current branch is `chore/scaffold` and `main` doesn't exist; `backend/.env` and `spike/` are ignored; a commit body records the matrix, the winning combination, mimeTypes, response shape and the 10-minute turnaround.

### Phase 1: Transcription API behind a `Transcriber` seam (M) — branch `feat/transcription-api`

- `POST /api/transcriptions` takes raw audio, returns `{text, words[{word,start,end,confidence}], duration_seconds}`. `GET /api/health`.
- `Transcriber` Protocol with `DeepgramTranscriber` (httpx `AsyncClient`, configured timeout, model and params from `app/config.py`) and `FakeTranscriber`.
- Status codes: 503 missing key, 400 empty body, 413 over cap (enforced while streaming), 415 unsupported type, 502 upstream error or timeout (key never echoed).
- Tests: API via `dependency_overrides`; `DeepgramTranscriber` via `httpx.MockTransport` asserting query (from config constants), `Token` header, content type, and parsing a fixture built from real Phase 0 JSON; one live test behind `--run-live`.
- **Done when:** `pytest` passes for all of the above, and a real clip POSTed with curl returns text containing "um".

### Phase 2: Record, transcribe and download UI (L) — branch `feat/practice-recorder`

- Vite React-TS in `frontend/`, proxy `/api` → `http://127.0.0.1:8000`. Vitest, jsdom, Testing Library.
- `recorder.ts` and `recorder.test.ts` first: mic requested only on click, explicit constraints, mimeType fallback (webm/opus → ogg/opus → mp4), Blob built in `onstop`, all tracks stopped, auto-stop at the cap (tested with fake timers).
- Practice screen state machine: idle → recording → recorded → transcribing → done | error. Visible errors; "Transcribe" disabled when the Blob is empty. Client-side downloads named `<prompt-slug>-<timestamp>.<ext>`.
- README with the manual checklist and a note that Chrome WebM lacks duration/seek metadata.
- **Done when:** `npm test` and `npm run build` pass, and the 8-item manual checklist result is stated per browser as pass, fail or "not verified".

### Phase 3: Practice questions behind a `QuestionRepository` seam (M) — branch `feat/practice-questions`

- Protocol with `list`, `add`, `get`, `delete`; `Question` = UUID `id`, trimmed `text` (1–500 chars), `created_at`.
- `JsonFileQuestionRepository` per A5. Contract suite parametrized over a repository factory (CRUD, persistence after reload, 20 concurrent adds, stale temp file ignored, `PermissionError` retry).
- `GET/POST/DELETE /api/questions[/{id}]` with 422 and 404 tests. Frontend question list with add, delete, select.
- **Done when:** tests pass and questions survive a manual uvicorn restart.

### Phase 4 (optional): Filler-word summary (S) — branch `feat/filler-summary`

- `count_fillers(words)` normalising case and punctuation; `fillers` field added to the transcription response; counts and highlighting in the UI.
- **Done when:** tests pass, and three deliberate "um"s show as `um ×3`.

## Out of scope

- Auth and any database. Later: SQLAlchemy + Alembic on SQLite with a `SqlQuestionRepository` that passes the same contract suite, a `practice_sessions` table and a `RecordingStore`; then a `users` table, a `current_user` dependency and `owner_id` scoping.
- Deployment, HTTPS, Docker, CI, multiple workers.
- Streaming transcription, mobile layouts, Safari fixes, non-English languages.
- Fixing Chrome WebM duration metadata (needs ffmpeg).
- Editing questions in place, tags, history, analytics.
- Automated real-browser E2E; Python linters.

## Challenged by plan-critic

Verdict: **PROCEED WITH CHANGES**, no blocking objections. One revision round.

Accepted:
1. Branch model made explicit: stacked branches, only the user merges, `git init -b chore/scaffold`.
2. `recorder.ts` gets its own unit tests, not just the manual checklist.
3. "Raw voice" vs. browser audio processing: the spike compares both; default is processing off.
4. JSON repository race and Windows `os.replace` failure: load once, lock, retry on `PermissionError`, concurrency test.
5. Recording cap raised from 5 to 10 minutes, with a final-minute countdown.
6. Spike gets a model fallback (nova-2) and a written decision rule; model and params become config constants.
7. Test-only `InMemoryQuestionRepository` dropped.
8. Empty recordings rejected with 400 and blocked in the UI; Chrome WebM metadata quirk documented.

Rejected: none.
