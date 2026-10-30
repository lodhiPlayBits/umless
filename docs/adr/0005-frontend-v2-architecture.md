# ADR 0005: Frontend architecture for the v2 redesign

Status: accepted 2026-10-28, implemented 2026-10-30 · Date: 2026-10-28 · Deciders: Gaurav Lodhi · Extends ADR 0002, replaces its decisions 6 and 7

## Context

The v2 design (`docs/design/v2/`, roadmap `docs/roadmap/2026-10-28-ui-redesign.md`) turns umless into a different shape of product:

| Today | v2 design |
|---|---|
| 3 routes: questions, practice, legal | ~15 routes: landing, pricing, sign-in/up, dashboard, questions, practice, history (all, per question, one take), settings (profile, billing), legal, 404 |
| One header, one layout | Three layouts: marketing site (nav + footer), app shell (sidebar, top bar, phone tab bar, practice-time card), bare auth page |
| v1 tokens, system font, light only | v2 tokens, Inter + Geist Mono, light/dark toggle |
| Questions and takes shown on one screen each | The same server data on many screens: questions (dashboard, questions, practice, history filter), takes (dashboard, history, practice result "fewer than last time"), account balance (shell card, practice, settings) |
| `PracticeSession.tsx` 572 lines, all stages in one component | 10 practice states, each with its own view |

Forces:
- **Behaviour must not regress.** The app handles 24 edge cases (`docs/design/screens.md` E1–E24), and the Playwright specs F1–F4 cover them. The redesign changes the look, not the behaviour.
- **Small team, plain stack.** React 19, plain CSS with tokens, a hand-written router, generated API types. No CSS-in-JS, no component library.
- **It's live.** umless.in takes real payments, so each phase must ship on its own and keep the site working.
- **More screens are coming.** These include Coach/teams, shared question sets and more stats, so adding a screen or a feature must not mean editing many existing files.

## Decision

### 1. Layered folders with a one-way dependency rule

```
src/
  app/        entry, providers, route registry, layouts (MarketingLayout, AppShell, AuthLayout), guards
  pages/      one thin component per route: reads route params, composes features, sets the title
  features/   questions, practice, takes, progress, billing, account, marketing
    <name>/
      api/    the only place that calls the API client (*Api.ts, ADR 0002 rule 1 unchanged)
      model/  state and pure logic: hooks, reducers, calculations. No JSX
      ui/     components for this feature
      index.ts   the public surface; other code imports only from here
  shared/
    api/      client.ts, apiErrors.ts, generated/
    ui/       design-system primitives (see 3)
    lib/      router core, formatting (time, dates, numbers), stores, small hooks
    theme/    tokens.css, base.css, theme store, ThemeToggle
  content/    copy as data: business details, pricing copy, FAQ, legal text
```

`shared/config/paths.ts` holds every URL pattern. Features build links from it, and `app/routes.ts` maps the same patterns to pages, so features never import the route table. Inside a feature, imports are relative (`./`, `../model/…`). Any `@/features/<name>/…` path is therefore a cross-feature deep import, and lint rejects it.

Imports only go downwards (`app → pages → features → shared`). ESLint `no-restricted-imports` enforces it, so no new plugin is needed:
- `shared/**` and `content/**` may not import `features`, `pages` or `app`. `content` is plain data, so features may import it.
- `features/<a>` may import `features/<b>` only through `features/<b>/index.ts`, never a deep path.
- `pages/**` may not import `features/*/api` (screens get their data from the feature's model hooks).

A `@/` path alias (Vite + TS) replaces `../../..` imports.

### 2. Routes are data (open/closed)

`app/routes.ts` is one table: `{ id, path, layout, access: 'public' | 'signedIn' | 'signedOut', title, nav?, load: () => import('@/pages/…') }`.
- The router core (`shared/lib/router.ts`) keeps today's API (`navigate`, `usePathname`, `useNavigationGuard`), but it matches `:param` patterns from the table instead of hard-coded `if`s.
- Layouts, the sidebar, the phone tab bar and the access guard all read the table. Adding a screen is one new row plus one page file, with no edits to the shell.
- Each page is `React.lazy`, so the marketing pages don't download the recorder, Clerk UI or charts until they're needed.
- The hand-written router stays (ADR 0002, `docs/BUILD.md`). The table is ~60 lines; React Router would replace it but buys nothing we need.

Sessions sit behind an interface: `shared/lib/session.ts` gives `{auth: 'clerk' | 'local', status}`, and only `app/session/ClerkSession.tsx` reads Clerk's state. The route guard (`app/access.ts`), the layouts and the pages depend on that interface, so local single-user mode and e2e need no Clerk. Swapping the auth provider would touch one file.

### 3. A design-system layer in `shared/ui`

- Primitives copy the design's class vocabulary (`docs/design/v2/assets/theme.css`, `app.css`): Button, IconButton, Card, Panel, Badge, Banner, Dialog, Toast, Field/Input/Textarea, Select, Switch, Segmented, Tabs, Stat, List/ListRow, EmptyState, Skeleton, Spinner, Icon (one SVG sprite), LineChart (hand-rolled SVG, ~80 lines), Kbd.
- Primitives are **substitutable for the native element** (Liskov). Each one takes the native element's props (`ComponentProps<'button'>`), forwards `ref` and `className`, and adds only variant props (`variant`, `size`). Callers never lose a native attribute.
- Primitive class names are prefixed `ui-` (BEM-style, e.g. `ui-button--primary`). This keeps them from clashing with the old global `.btn`/`.card`/`.dialog` rules while screens move over one by one. The old rules are deleted when the last screen moves (Phase 6).
- A `<Field>` owns its control's id: the control inside gets the id, `aria-describedby` and `aria-invalid` from context.
- Primitives know nothing about umless. Feature components (TakeRow, TranscriptView, PracticeTimeCard) are built from them in `features/*/ui`.
- **Styling:** plain CSS as now. There's one co-located `.css` file per primitive, plus `tokens.css` for the v2 tokens with light, dark and system-default dark. No hard-coded colours (CLAUDE.md rule unchanged).
- **Fonts:** Inter and Geist Mono are self-hosted with `@fontsource-variable`, so there's no third-party request and no layout shift.
- **Theme:** a module store (`useSyncExternalStore`, like `billing/account.ts`) plus a 6-line inline script in `index.html` that sets `data-theme` before first paint. Clerk's `appearance.variables` follow the same tokens, so its modals match both themes.

### 4. Server state goes through TanStack Query

ADR 0002 rejected TanStack Query "until several screens show the same server data". v2 crosses that line: one transcription changes the takes list, the dashboard stats, the question's "practised 3×" line, the history chart and the balance in the shell.

- `@tanstack/react-query` v5, with exact version pinned (5.104.2: the newest release at least two weeks old when added).
- One `QueryClient` lives in `shared/api/query.ts`. Hooks pass it to `useQuery` explicitly instead of reading it from a provider. That way:
  - hooks work in any render, so the existing component tests need no wrapper;
  - non-React code (the purchase flow, sign-out) changes the same cache;
  - tests clear it after each test (`src/test/setup.ts`).
- Defaults: no automatic retries (failures show a banner with Retry, ADR 0002) and no refetch on window focus.
- Each feature's `model/` owns its query keys and hooks (`useQuestions`, `useTakes(filter)`, `useAccount`) over its `api/`. Screens never write `useQuery` with raw keys.
- Mutations invalidate by key. A successful transcription invalidates `['takes']` and `['account']`, and the dashboard and shell update with no wiring between them.
- ADR 0002's rules carry over:
  - **Decision 5 (abort and timeout):** the `queryFn` gets the `AbortSignal` and a 10 s timeout (`withTimeout(signal)`).
- Signing out calls `clearServerData()`, so nothing of one user's questions, takes or balance stays in memory for the next person.
  - **Decision 2 (error vocabulary):** `classifyApiError` is unchanged, and `LoadErrorBanner` takes the query's `error` and `refetch`.
- The hand-made stores for the balance (`billing/account.ts`) and the deferred `useLoad` hook both go away.

### 5. Practice is a state machine, not a component

`PracticeSession.tsx` splits along the design's states:
- `features/practice/model/practiceMachine.ts`: a pure reducer `(state, event) → state`. The states are idle, permission, denied, recording, countdown, review, transcribing, failed, result and silent. It is unit-tested with no DOM.
- `features/practice/model/usePracticeSession.ts`: wires the reducer to the recorder, the timers and the transcription mutation, and owns the navigation guard.
- `features/practice/ui/stages/*`: one view per state. Each is presentational and gets only the props it renders (interface segregation).
- `recorder.ts` stays behind its current interface. The machine depends on that interface, not on `MediaRecorder` (dependency inversion), so tests pass a fake.

### 6. Derived numbers are pure functions

`features/progress/model/` holds every stat the dashboard and history show: fillers per minute per week, streak, average pace, week-over-week deltas, best take, and "fewer than last time". Each is a plain function over `TakeSummary[]`, tested with tables of examples. Components only format the output. A new stat is one function plus one entry in a stat definition list, with no component edits.

### 7. Backend additions this needs

This is the only contract change, and it needs the user's OK per CLAUDE.md:

- `GET /api/takes?question_id=&since=&limit=` lists takes across questions, newest first, as `TakeList`. It powers History and the Dashboard.
- Today only `GET /api/questions/{id}/takes` exists. Calling it once per question would be N requests per dashboard load.

Everything else in the design maps onto existing endpoints or onto Clerk.

### 8. Auth screens are Clerk's components, themed

`/sign-in` and `/sign-up` render Clerk's `<SignIn>`/`<SignUp>` inside `AuthLayout`, with the v2 tokens as `appearance.variables`. Clerk already implements every state in `auth.html`: wrong password, locked, expired link, verify email and reset password. Building those forms ourselves would duplicate security-sensitive code.

## Options considered

### Data layer
| | Own `useLoad` hook + module stores | TanStack Query (chosen) |
|---|---|---|
| Complexity | Low per screen, grows with each cross-screen update | Medium once, then low |
| Cost | 0 kB | ~13 kB gzip |
| Scalability | Every new screen needs manual cache and invalidation wiring | Invalidate by key; dedupes, caches, refetches on focus |
| Familiarity | Matches today's code | Industry default; well documented |

### Folder structure
| | Keep feature folders as today (ADR 0002 decision 7) | Layered `app/pages/features/shared` (chosen) |
|---|---|---|
| Complexity | None now | One mechanical move phase |
| Scalability | `src/` root keeps growing, and nothing stops a cross-feature import | Lint enforces the boundaries; each feature has a public surface |
| Risk | — | Git history needs `git log --follow`; done in one no-behaviour-change phase |

### Auth UI
| | Custom forms on Clerk hooks (`useSignIn`) | Clerk components themed (chosen) |
|---|---|---|
| Matches `auth.html` pixel-for-pixel | Yes | Close (tokens, radius, font), not exact |
| Effort and risk | High: 16 states, MFA, OAuth, bot protection, all ours | Low |

### Routing
| | React Router / TanStack Router | Hand-written router + route table (chosen) |
|---|---|---|
| Features we'd use | Patterns, lazy loading, guards | Same, in ~150 lines we already own and test |
| Cost | New dependency, and the navigation guard needs rewriting | None |

## Consequences

- **Easier:**
  - A new screen is one route row plus one page.
  - A new stat is one pure function.
  - A new primitive is reused everywhere.
  - Cross-screen data stays consistent with no wiring.
  - Marketing pages load fast (lazy app code).
  - Practice logic is testable without a DOM.
- **Harder:**
  - More files and layers to learn. The import rules are strict (lint errors on a deep import).
  - The folder move makes `git blame` need `--follow`.
- **Revisit:**
  - Pre-rendering the marketing pages for SEO (the site is an SPA; Google renders JS, but prerendering would be faster).
  - Whether Coach/teams needs organisation-scoped query keys.
  - Moving to `Clerk Elements` if the auth screens must match the design exactly.
- ADR 0002 decisions 1–5 still hold. Decisions 6 (`useLoad`, PracticeSession split) and 7 (no file moves) are replaced by this ADR.

## Action items

See `docs/roadmap/2026-10-28-frontend-v2-build.md`.
