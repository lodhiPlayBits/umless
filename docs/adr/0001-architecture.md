# ADR 0001: umless v1 architecture

- Status: proposed (phase 2 of the build, awaiting approval)
- Date: 2026-10-19

## Context

umless v1 is a local, single-user speech practice app (`docs/prd.md`). A FastAPI backend already serves `GET /api/health` and `POST /api/transcriptions` (Deepgram via `httpx`), and a Vite + React practice-screen prototype calls it through the dev-server proxy. The approved design adds a question list with create, edit, delete and undo, a transcript summary, and filler highlighting. Nothing about a take may be stored on the server. The API contract in `docs/api/openapi.yaml` must be strict enough to drive contract tests in phase 4 and a typed client in phase 5.

## Decision

### Stack
As in `docs/BUILD.md`: Python 3.12 + FastAPI + uvicorn (single process), pytest; React 19 + TypeScript + Vite 6 with plain CSS custom properties from `docs/design/tokens.md`; Deepgram nova-3 over plain `httpx`; REST described by OpenAPI 3.1. No database in v1.

### Contract first
`docs/api/openapi.yaml` is the source of truth. FastAPI's generated schema at `/openapi.json` is not; where the two differ, the code is wrong. Changes to the contract after approval are logged in the BUILD.md decisions log.

### Project layout
```
backend/
  app/
    main.py            create_app(): middleware, error handlers, routers
    config.py          Settings from env (.env files), Deepgram constants
    errors.py          ApiError, error codes, exception handlers  (new)
    questions/         (new)
      models.py        Pydantic request/response models
      repository.py    QuestionRepository Protocol + JsonFileQuestionRepository
      router.py        /api/questions routes
    transcription.py   Transcriber Protocol, Deepgram + Fake, pause dots
    summary.py         filler detection and TranscriptSummary  (new)
  data/questions.json  runtime data, git-ignored
  tests/
frontend/
  src/
    api/               generated schema types + thin fetch wrapper (phase 5)
    screens/, components/, styles/
docs/
```
Existing modules stay where they are; only the new ones are added.

### Auth
None in v1. Safety comes from the deployment shape instead:
- uvicorn binds to `127.0.0.1` only (already in `run.py`).
- Starlette's `TrustedHostMiddleware` (part of FastAPI, no new dependency) allows only `localhost` and `127.0.0.1`, which blocks DNS-rebinding attacks from web pages. A rejected host gets the shared error body (400 `invalid_host`), not Starlette's plain-text default, so the check is a small custom middleware or a wrapper around it.
- No CORS middleware: the browser reaches the API through the Vite proxy, so it's same-origin, and other origins can't read responses or send non-simple requests.
- JSON write endpoints reject any `Content-Type` other than `application/json` with 415, so a cross-site `<form>` post (a "simple" request that skips preflight) can't create or change questions. `DELETE`, `PATCH` and audio uploads always need a preflight, which fails.

The contract declares no security schemes, sets `security: []` at the top level, and repeats `security: []` on every operation. When accounts arrive (later), a session cookie scheme is added and `security: []` stays only on `getHealth`.

### Error format
Every non-2xx response, including FastAPI's own validation errors, unknown routes and unhandled exceptions, uses one body:
```json
{"code": "validation_error", "detail": "Question text must be 500 characters or fewer.", "fields": [{"field": "text", "message": "Must be 500 characters or fewer."}]}
```
- `code`: a stable machine-readable enum (listed in the contract's `ErrorCode` schema). The frontend switches on `code` and status, never on `detail`.
- `detail`: one human-readable sentence. Keeping the name `detail` means the current frontend, which reads `body.detail`, keeps working.
- `fields`: only on `validation_error` (422), one entry per invalid input, with `field` as a dotted path (`text`, `position`, `body`).
- Implemented by exception handlers for `HTTPException`/`StarletteHTTPException`, `RequestValidationError` and `Exception` in `app/errors.py`. The 500 handler logs the exception and returns `internal_error` without details.
- Malformed question ids on `PATCH`/`DELETE` return 404 `question_not_found`, not 422: to the client, a bad id and a deleted one mean the same thing.

### Pagination
None. `GET /api/questions` returns the whole list as `{"items": [...]}`. One user's question list is small (the design plans for 100+, the performance target is 1,000), and the frontend filters client-side. The wrapper object lets `next_cursor` be added later without breaking clients.

### Storage
`QuestionRepository` Protocol with a `JsonFileQuestionRepository` (details in `docs/data-model.md`). The repository is injected with a FastAPI dependency so tests use a temp file. A corrupt file stops startup rather than being overwritten.

### Transcription
The request body is the raw audio (no multipart, so no `python-multipart`), streamed with a 25 MB cap. The server adds `mip_opt_out=true` to the Deepgram parameters, builds the pause-dot `text`, flags fillers, and computes the summary (`app/summary.py`), so these rules are unit-tested in one place and the frontend only renders. Audio is held in memory for the request only.

### Typed client
In phase 5 the frontend generates TypeScript types from the contract with `openapi-typescript` (dev dependency, generated file committed so builds don't need the generator) and wraps `fetch` in a small typed helper in `frontend/src/api/`. A check (`npm run gen:api` then `git diff --exit-code`) catches drift. The dependency is proposed at the start of phase 5 and added only with approval.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| SQLite in v1 | One small list for one user; a JSON file behind a Protocol meets the need, and the Protocol keeps the SQLite migration cheap. Already decided in the roadmap. |
| Code-first contract (FastAPI's `/openapi.json` as the spec) | The generated schema is loose (no examples, default 422 shape, no `x-screen`), and the design must drive the API, not the implementation. |
| RFC 9457 `application/problem+json` | Standard, but it renames `detail`'s siblings (`type`, `title`) and adds fields no client uses; the small `{code, detail, fields}` body keeps the existing frontend working. |
| FastAPI's default error shapes | 422 returns `detail` as an array while other errors return a string; the client would need two parsers. |
| Server-side session or summary storage | Breaks the privacy decision (nothing stored on the server). |
| Computing the summary in the browser | Splits filler and pause rules across Python (dots) and TypeScript (counts); one Python implementation keeps `text`, flags and counts consistent. |
| Pagination or cursor on day one | No screen needs it; adds client complexity for no benefit. |
| `deepgram-sdk` | `httpx` is already a dependency and the call is one POST. |
| Multipart audio upload | Needs `python-multipart`; the raw body plus `Content-Type` carries the same information. |
| CORS with an allowlist | Not needed behind the proxy; any CORS config widens what other origins can do. |
| Hand-written TypeScript types | Drift from the contract silently; generation makes drift a failing check. |

## Consequences

- The existing endpoints change in small ways: error bodies gain `code`; the transcription response gains `punctuated_word`, `is_filler` and `pause_before_seconds` on each word, plus `summary`. All additions; existing fields keep their names and types.
- The pause-dots work (`feat/pause-dots`, commit `24b7d60`) is a prerequisite for the transcription group and must be on the branch phase 3 builds on.
- Without auth, anything running locally as the user can call the API. Acceptable for a localhost tool; revisited with accounts.
- The JSON file rewrites the whole list on each mutation: fine up to thousands of questions, wrong for concurrent multi-process use (not supported: single uvicorn process).
- Phase 4 picks a contract-testing tool that reads `docs/api/openapi.yaml`; the strict schemas (`additionalProperties: false`, bounds, enums) are what make it useful.
