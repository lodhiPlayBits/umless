# ADR 0002: Frontend conventions for requests, errors and loading

Status: accepted · Date: 2026-10-20 · Supersedes the frontend layout notes in ADR 0001 · Decisions 6 and 7 replaced by ADR 0005

## Context

The frontend already sent every request through one typed client (`src/client.ts`), used only by `questions/questionsApi.ts` and `practice/practiceApi.ts`. These rules held only by convention:

- Nothing stopped a component from calling the client directly.
- There was no error boundary, so one render crash blanked the page.
- The code had two different rules for "the backend is down", and four hand-copied error banners.
- The practice route had no timeout, so a hung backend left it on "Loading…" forever.

Before this change, `npm test` passed 189 tests in 13 files, and `npm run lint` was clean.

## Decisions

**1. Only `*Api.ts` modules make requests.**
- `client` and `unwrap` may be imported only by `src/client.ts`, `src/**/*Api.ts` and tests. Nothing else may import `openapi-fetch`.
- ESLint enforces this with `no-restricted-imports` at `'error'` (`frontend/eslint.config.js`).
- `ApiError` and the types stay importable everywhere, because screens use `instanceof ApiError` and its `status`.

**2. One error vocabulary.** `classifyApiError()` in `src/apiErrors.ts` returns one of three kinds:

| Kind | When |
|---|---|
| `unreachable` | No answer (status 0, or not an `ApiError`), or a 5xx with no error code. That means the Vite proxy answered because the backend isn't running. |
| `validation` | `validation_error`. Show `fields[0].message`. |
| `server` | Anything else. The backend, or something on the way, answered. Show its `detail`. |

Shared copy (`UNREACHABLE_TITLE`) lives in `src/apiErrors.ts`. Copy for one feature stays in that feature's module (for example `transcribeFailure`), as `docs/design/flows.md` specifies.

**3. One error banner.**
- Every red error banner is `components/ErrorBanner.tsx`.
- A page whose data failed to load uses `components/LoadErrorBanner.tsx`. It picks the unreachable or server message and offers Retry.
- Warn and info banners stay inline. They have no shared behaviour yet.

**4. Render crashes never blank the app.**
- There are two `ErrorBoundary`s. One is around `<main>`, keyed by pathname, so the header keeps working and navigating away clears it. The other is at the root (`main.tsx`), with a fallback that doesn't use the router.
- Errors are reported once, through `reportError()` (console only; this is a local, single-user tool), wired in as `createRoot`'s `onCaughtError`/`onUncaughtError`.
- Event-handler and async errors are not caught by boundaries. Handle them where they happen, with an `ApiError` and a message.

**5. Every initial load can be cancelled and has a time limit.**
- Each attempt gets its own `AbortController`. It is aborted on unmount, on Retry, and after 10 s (`docs/design/flows.md` F1).
- Only the current attempt may update state.
- `QuestionsScreen` and `PracticeRoute` each do this inline for now.

**6. Deferred to the v1.1 frontend phase, on purpose:**
- **A shared `useLoad` hook.** Build it when the history screen is its third caller. It must:
  - expose a way to edit loaded data locally (`setData`), since `QuestionsScreen` adds, edits, deletes and undoes on the loaded list;
  - provide `reload()`;
  - be added to `react-hooks/exhaustive-deps` through `additionalHooks`.
- **Splitting `PracticeSession.tsx`** (stage reducer, dialogs, shared toast state). The seams should follow the approved history design.

**7. No file moves.** Existing modules stay where they are, as ADR 0001 says. New shared UI goes in `src/components/`, and shared non-UI code at the `src/` top level, next to `client.ts`.

## Rejected

- **TanStack Query / SWR:** two screens with no cache shared between them. Reconsider if several screens show the same server data.
- **React Router:** the hand-written router is a recorded decision (`docs/BUILD.md`).
- **react-error-boundary:** a 20-line class covers what we need.
- **Remote error reporting:** there is no server-side user base to report from.

## Consequences

- A new screen gets its API calls from a `*Api.ts` module (lint fails otherwise), shows load failures with `LoadErrorBanner`, and follows decision 5 until `useLoad` exists.
- One behaviour changed on purpose: a 4xx with no error code now reads "Couldn't load your questions" with the status, instead of "Can't reach the umless server".
