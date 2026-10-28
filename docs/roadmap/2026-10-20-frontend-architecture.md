# Roadmap: frontend architecture hardening

Date: 2026-10-20 · Status: approved, in progress

## Goal

Make the frontend's existing rules enforced by tooling:

- Only API modules talk to the HTTP client, and ESLint fails the build otherwise.
- Errors are classified by one rule and shown by one banner component.
- No route can hang on "Loading…" or blank the page.
- The v1.1 history screens have a written pattern to follow (ADR 0002).

There are no new dependencies and no file moves.

## Starting point

The code already routes every request through one typed client. Only `questions/questionsApi.ts` and `practice/practiceApi.ts` import `client`/`unwrap`, and the only raw `fetch` is `src/client.ts`. The real gaps were:

- no error boundary (a render crash blanked the page);
- two different "server unreachable" rules;
- four hand-copied error banners;
- a practice route with no abort and no timeout (a hung backend meant "Loading…" forever);
- no tests for `PracticeRoute`;
- a client boundary held only by convention.

## Phases

### Phase 0: ADR 0002 and baseline (S)
- Write `docs/adr/0002-frontend-architecture.md`. It covers the import boundary, the error taxonomy and the single unreachable rule, where shared copy lives, the `ErrorBanner` scope, what was deferred to v1.1, and "no file moves".
- **Done when:** the ADR exists and the baseline `verify` result is recorded.

### Phase 1: Guardrails (S)
- An ESLint `no-restricted-imports` rule at `'error'` for `src/**/*.{ts,tsx}`:
  - `client` and `unwrap` are allowed only in `src/client.ts`, `src/**/*Api.ts` and tests;
  - `ApiError` stays importable everywhere.
- An inner `ErrorBoundary` around the `<main>` content, keyed by pathname.
- A root boundary in `main.tsx` that doesn't use the router.
- `reportError()`, wired through `createRoot`'s `onCaughtError`/`onUncaughtError`.
- **Done when:**
  - a `.ts` and a `.tsx` scratch file importing `client` both fail lint;
  - the real tree passes lint;
  - the boundary tests pass;
  - `verify` passes.

### Phase 2: One error vocabulary, one error banner (M)
- `classifyApiError()` next to the client, plus one module for the shared unreachable copy.
- One `ErrorBanner` component replacing all four `banner error` sites, `MicError` included. Rendered text stays the same.
- A new `PracticeRoute.test.tsx`, with a regression test: a coded 500 must not say "Can't reach the umless server".
- **Done when:**
  - "Can't reach the umless server" appears in one non-test source file;
  - `className="banner error"` appears in one `.tsx` file;
  - the regression test fails before the change and passes after it;
  - `verify` passes.

### Phase 3: The practice route can't hang (S)
- `loadPracticeQuestion` and `isServerUp` take an `AbortSignal`.
- `PracticeRoute` aborts on unmount and on Retry, and times out after 10 s. This mirrors `QuestionsScreen`'s pattern on purpose; it is not generalised.
- **Done when:**
  - the regression tests pass: a never-answering load shows the error banner after the timeout, and a never-answering health check shows "Server offline";
  - `verify` passes.

Order: 0 → 1 → 2 → 3, with one commit per phase.

## Out of scope
- **Deferred to the v1.1 frontend phase:**
  - splitting `PracticeSession.tsx`, including deduplicating the toast state;
  - a generic `useLoad` hook, to be built when the history screen becomes its third caller.
- File moves.
- New libraries (state, routing, data fetching, error boundary).
- Remote error reporting.
- Backend, contract, generated types, CSS.

## Decisions taken on open questions
Defaults were applied because the user asked to go ahead:
- The practice route and the health check use the same 10 s timeout as the questions list.
- On the practice route, a coded server error shows "Couldn't load this question" with the server's `detail`, as `QuestionsScreen` already does.
- A 4xx without an error code is now classified as `server`, not `unreachable`. This is a deliberate copy change.
- `MicError` uses the shared `ErrorBanner`.
- The user creates branches, commits and pushes.

## Challenged by plan-critic

Verdict: PROCEED WITH CHANGES. There were no blocking objections.

Accepted:
1. The lint boundary covers `.ts` as well as `.tsx`, at `'error'` severity.
2. The generic `useLoad` hook is deferred to v1.1. Its requirements are recorded in the ADR: `setData` for local edits, `reload()`, and `additionalHooks` for `exhaustive-deps`.
3. Success checks now search `.ts` and `.tsx` and cover all four error-banner sites. Behaviour tests replace the `AbortController` grep.
4. The PracticeSession split and the folder move were dropped. ADR 0001 says existing modules stay where they are.
5. One branch with one commit per phase. The user owns git.
6. A root error boundary was added in addition to the `<main>` boundary.
7. The PracticeRoute bug is labelled low impact, and the 4xx copy change is flagged.
8. Baseline counts go in the ADR, not in BUILD.md. `useToast` was deferred. `isServerUp` gets a timeout.

Rejected: none.
