# Roadmap: build the v2 frontend

Date: 2026-10-28 · Status: done 2026-10-30 (approved 2026-10-28) · Architecture: ADR 0005 · Design: `docs/design/v2/`

## Goal

Ship the v2 design on umless.in on the architecture in ADR 0005. Each phase must deploy on its own and keep the live site (payments included) working.

Done when:
- every screen in `docs/design/v2/` exists in the app, in light and dark, at 375 / 768 / 1440 px;
- every edge state E1–E24 in `docs/design/screens.md` still behaves as before;
- unit tests, lint, build, backend tests and the Playwright specs all pass;
- the ESLint import boundaries from ADR 0005 are on, at `'error'`.

## Progress

- 2026-10-28: Approved: ADR 0005, keeping the live pack pricing, adding `GET /api/takes` in Phase 7, and the new URLs.
- 2026-10-28: **Phase 1 done.**
  - 69 files moved with `git mv` into `app/ pages/ features/ shared/ content/`, with the `@/` alias.
  - New pieces:
    - a route table (`app/routes.ts`) with lazy pages, one chunk each;
    - a generic `matchPath`/`buildPath` in `shared/lib/router.ts`;
    - URL patterns in `shared/config/paths.ts`;
    - an index file for each feature;
    - ESLint layer rules.
  - Results:
    - unit tests: 266 passed (7 new router tests; one App test now waits for the lazy page);
    - Playwright: 82 passed.
  - Also fixed two existing e2e problems:
    - **Stale transcription mocks.** Since takes were added, the app sends `/api/transcriptions?questionId=…`, and the specs' `**/api/transcriptions` glob didn't match it. 10 tests had been failing on `main`. They now use a shared regex (`tests/e2e/helpers.ts`).
    - **Real keys in e2e.** The e2e backend now blanks the bucket and Razorpay keys from `backend/.env`, so test runs never write to the real bucket or count against free transcriptions.

- 2026-10-28: **Phase 2 done.**
  - `shared/theme`:
    - `tokens.css`: v2 tokens, light/dark/system, plus backdrop, shadow and tint tokens. It's the only file with colour values.
    - Self-hosted Inter and Geist Mono (`@fontsource-variable` 5.3.0).
    - A theme store and `ThemeToggle`, now in both headers, plus a no-flash script in `index.html`.
    - `clerkAppearance`: Clerk's UI drawn with our CSS variables.
  - `shared/ui` primitives: Button/ButtonLink/IconButton, Card/Panel, Badge, Banner, Dialog, Field/Input/Textarea/Select, Switch, Segmented, Tabs, Stat, List/ListRow/LinkRow, EmptyState/Skeleton/Spinner/Kbd/IconTile, Icon (37 icons from the design) and LineChart.
  - The dev-only style guide is at `/_ui`; it's left out of production builds.
  - Results:
    - unit tests: 308 passed (42 new);
    - Playwright: 82 passed;
    - screenshots of `/_ui` checked against `components.html` in light, dark and 390 px.

- 2026-10-28: **Phase 3 done.**
  - Layouts:
    - `AppShell`: sidebar and phone tab bar from the route table, a top bar with breadcrumb, practice-time chip, theme toggle and `UserButton`, and a practice-time card.
    - `MarketingLayout`: header, phone menu and `SiteFooter`.
    - `AuthLayout`.
  - New URLs: `/` is the landing page, the list moved to `/questions`, plus `/pricing`, `/sign-in`, `/sign-up` and `/settings`.
  - The route table now carries the access level (public / signedIn / signedOut), the layout, the nav entry, the breadcrumb parent and the width.
  - Access rules are one pure function (`app/access.ts`). Signed out on an app URL goes to `/sign-in?redirect=…`; signed in on landing or sign-in goes home. A `?redirect=` value is checked so it can only point within the site.
  - `shared/lib/session.ts` is the session interface (Clerk or local). Only `app/session/ClerkSession.tsx` talks to Clerk. Clerk's redirects use our router, and its sign-in uses hash routing.
  - Changes from the plan:
    - Signed-in home is `/questions` until the Dashboard exists (`HOME_PATH`, Phase 8).
    - History and Dashboard get their nav entries when their routes land (Phases 7–8), instead of placeholder pages.
    - Settings has theme, practice time and "Manage account" (Clerk's profile) for now.
  - Results:
    - unit tests: 330 passed (access rules, route table, layouts, footer);
    - Playwright: 82 passed, with specs moved to `/questions`;
    - checked on umless.in: signed out, `/questions` redirects to the themed Clerk sign-in, and the landing page has the new header and footer.

- 2026-10-28: **Phase 4 done.**
  - The landing page (`docs/design/v2/landing.html`): hero with the result mock, how it works, features, before/while/after, privacy, pricing, works anywhere, FAQ, and a closing call to action. Testimonials stay hidden.
  - The pricing page: free and pack cards (cheapest per minute marked "Best value"), a comparison table with the price per minute, a billing FAQ, and a call to action. Signed-in users go to Settings to buy.
  - All copy is data in `content/marketing.ts`, checked against the backend: transcripts saved and audio not, Deepgram set to English with no training, recordings with no words not charged, the 10-minute limit.
  - Components are in `features/marketing`.
  - The legal pages are restyled.
  - Both 404s: "4uh4", with Home/Pricing when signed out and Questions when signed in; and the deleted question (E16).
  - Every route has a tab title and meta description.
  - The header links go to `/#features`, `/#how` and `/#faq`. The router now tracks the hash, and every page change scrolls to the top or to the anchor.
  - Results:
    - unit tests: 342 passed;
    - Playwright: 82 passed;
    - checked on umless.in: landing, pricing, refunds and 404.
  - Still open: the refund policy says refunded time is removed from the account. That is a manual step today.

- 2026-10-28: **Phase 5 done.**
  - Added `@tanstack/react-query` 5.104.2. I passed over 5.105.0, released two days earlier, and took the newest release that had been out two weeks.
  - `shared/api/query.ts` has the client, `withTimeout` and `clearServerData` (called on sign-out).
  - The hand-made account store is gone. `useAccount`, `setAccount`, `refreshAccountIfShown` and `resetAccount` keep their signatures and now sit on the cache. One request serves the shell card, the top-bar chip and Settings, and a payment's balance shows everywhere.
  - The questions screen loads through `useQuestions()` (`QUESTIONS_KEY`), and its add, edit, delete and undo update the shared cache.
  - Past takes are a query per question; a saved transcription calls `invalidateTakes()`.
  - Not moved yet: the practice route's question lookup. It moves with the practice rewrite in Phase 6.
  - Results:
    - unit tests: 353 passed (11 new for the cache, the timeout and the delayed skeleton);
    - Playwright: 82 passed.

- 2026-10-30: **Phase 6 done.**
  - The practice flow was split up. The 572-line `PracticeSession` became:
    - `model/practiceMachine.ts`, a pure reducer with ten stages. An event that doesn't fit the stage is ignored, so a late transcription can't jump back to a stale result.
    - `model/usePracticeSession.ts`: recorder, timers, transcription, downloads, the navigation guard and the dialogs.
    - One view per stage in `ui/stages/`, plus `PracticeHeader` and `PracticeDialogs`. `PracticeSession` is now about 100 lines of composition.
  - Questions and practice restyled to `app-questions.html` and `app-practice.html` on the shared/ui primitives.
  - Rebuilt on the primitives: `ChoiceDialog`, `ErrorBanner`, `LoadErrorBanner` and `Toast`.
  - The old global CSS is gone. `app/index.css` is now a small base layer, and `mark.filler`/`.pause` moved to the theme.
  - Copy for real users replaces the developer messages: no "python run.py", "backend is running", localhost URL or `DEEPGRAM_API_KEY`. Emoji in button labels became icons ("⬇ Audio" → "Audio"). The tests were updated to the new text.
  - The class names the e2e specs select by are kept on the new markup (`.q-row .text`, `.field-msg`, `.meter`, `.player .time`, `.spinner`, `.transcript .body`).
  - Results:
    - unit tests: 372 passed (19 new machine tests, covering every stage × event pair);
    - Playwright: 82 passed, covering E1–E24;
    - screenshots of the questions, editing, empty, ready, recording, review, result and dialog states on desktop and phone, light and dark.
  - Moved to Phase 7: the question list's "practised N× · fillers/min" line and the practice route's lookup through the questions cache. Both need `GET /api/takes`.

- 2026-10-30: **Phase 7 done.**
  - Backend: `GET /api/takes` (`listAllTakes`) with `questionId`, `since` and `limit`.
    - An unknown `questionId` returns an empty list, not a 404.
    - `since` is checked strictly against RFC 3339. Schemathesis found that pydantic accepted `since=0.5` as a Unix timestamp.
    - Migration 0004 adds the `(user_id, created_at)` index; it is applied in production.
    - Backend tests: 528 passed, including the MySQL tests against a throwaway MySQL 8.4 container and the contract fuzzing.
  - Frontend:
    - `features/takes` now owns take data and display, moved from practice with `git mv`: API, query keys, `TranscriptCard`, `PastTakes`, the summary text. Every takes query sits under `['takes']`.
    - `features/progress` holds the pure stat functions (day groups, relative days, usage per question, best take, progress per question, trend) with table tests.
    - `features/history` has `/history` (question filter, 7/30/All, Today/This week/Earlier, best and high badges), `/history/:questionId` (four stats, chart, takes) and `/takes/:id` (summary, transcript, .txt, delete).
    - History is in the nav. The questions list shows "Practised N× · last … · X fillers/min" or "New", from one request.
  - Results:
    - unit tests: 402 passed;
    - Playwright: 82 passed;
    - screenshots of every History screen with real takes, from which I fixed best-on-ties, the heading layout, same-day chart labels and the badge position on phones.
  - Still open: the practice route still finds its question through its own request, not the questions cache. Low value; leaving it.

- 2026-10-30: **Phase 8 done.**
  - `/dashboard` is now the signed-in home (`HOME_PATH`) and first in the nav.
  - Two states:
    - **First visit** (no takes yet): a 3-step checklist, `QuickAddQuestion` (field plus starter chips) or "Record your first answer", and a preview.
    - **Returning:** a streak line, a "Practise next" card (the first question never tried, else the one practised longest ago), four stats against last week (takes, fillers/min, pace with a 130–160 note, average longest pause), an 8-week trend chart with a summary line, and 4 recent takes.
  - New pure functions with table tests:
    - in `features/progress`: `weekComparison`, `practiceStreak` (alive until a whole day is missed), `weeklyTrend` (empty weeks left out), `nextQuestion`, `paceNote`;
    - in `features/dashboard/model`: `weekDelta`, `trendSummary`.
  - `addQuestion` and `SUGGESTED_QUESTIONS` moved into the questions model, shared by the Questions screen and the Dashboard.
  - Results:
    - unit tests: 433 passed;
    - Playwright: 82 passed;
    - screenshots of the first visit (empty, and with a question) and of returning (desktop and phone). From them I made the streak line say which day you practised.

- 2026-10-30: **Phase 9 done.**
  - Settings has two tabs, each its own URL:
    - `/settings` (Profile): theme, plus Clerk's `<UserProfile>` embedded and themed (name, email, password, sign-in methods, delete account).
    - `/settings/billing` (Billing): balance; one card per pack with price per minute and "Best value"; "Payment worked" with the new balance; "The payment didn't go through" with a Try again that retries the same pack; a note for servers without payments.
  - `usePurchase` with `purchaseErrorMessage` is the one purchase flow, shared by the BuyTime dialog and the Billing tab.
  - `OutOfTimeBanner` (no free transcriptions and no paid time) shows on Billing and on the Dashboard.
  - The pricing page's buy buttons go to `/settings/billing`.
  - Results:
    - unit tests: 446 passed;
    - Playwright: 82 passed;
    - screenshots of Profile, Billing (desktop and phone), out of time, and the Dashboard with the banner.
  - **Still open (needs your decision):** deleting a Clerk account doesn't delete that user's questions, takes, transcripts or balance. It needs a Clerk `user.deleted` webhook and a signing secret (`CLERK_WEBHOOK_SECRET`).

- 2026-10-30: **Phase 10 done. The roadmap is complete.**
  - Accessibility:
    - `tests/e2e/a11y.spec.ts` (`@axe-core/playwright` 4.14.0) checks 11 pages in light and dark, at 375 and 1280 px, against WCAG 2.2 AA. It fails on serious or critical issues, and on a page that rendered nothing.
    - It found one real issue, an `aria-label` on a generic `<div>` (the take lists), now fixed.
    - The live audit of landing, sign-in, pricing and privacy (signed out) found no issues of ours. The one serious item is Clerk's "Secured by" text on its striped "Development mode" footer, which goes away with a production Clerk instance.
  - Performance:
    - The app shell is now lazy-loaded, so the public site no longer downloads the sidebar, billing or checkout code. The entry JavaScript went from 120.9 to 115.5 kB gzipped; landing's total JavaScript is about 118 kB (budget 120).
    - Public pages render before Clerk has loaded when no `__client_uat` session cookie suggests a sign-in (`renderStatus` in `app/access.ts`). Landing LCP on simulated 4G went from 2.57 s to about 0.88 s (3 runs). App pages, and visitors who may be signed in, still wait for Clerk.
  - Docs: CLAUDE.md now describes the live app, the container-based commands and the open items; `docs/design/flows.md` has F5–F9.
  - Rollback: before deploying I tagged the previously running images `umless-frontend:rollback-20261030-1720` and `umless-backend:rollback-20261030-1720`.
  - Results:
    - unit tests: 455 passed;
    - Playwright: 86 passed (82 flows plus 4 accessibility runs);
    - backend: 528 passed (Phase 7).
  - **Left for you:**
    - the Clerk account-deletion webhook (decision);
    - a production Clerk instance;
    - the live Razorpay webhook secret;
    - one real ₹40 purchase on the Billing tab;
    - commit and push.

## Where the design and the live product differ (decided here, unless you say otherwise)

| Design shows | We build | Why |
|---|---|---|
| Free 10 takes/month, Pro ₹299/month, Coach (marked "example prices, to be decided") | The live pricing: 3 free transcriptions, then ₹40 for 60 min and ₹120 for 300 min | It's what Razorpay charges and what the legal pages say. The pricing page is data-driven, so a later Pro plan is a content change |
| Sidebar "Free plan, 7 of 10 left, Upgrade to Pro" | A "Practice time" card: free transcriptions left or minutes left, plus **Buy time** | Same reason |
| History locked on Free | History open to everyone | Takes are already saved for every user |
| Custom auth forms (`auth.html`, 16 states) | Clerk `<SignIn>`/`<SignUp>`, themed with v2 tokens | ADR 0005 decision 8 |
| Settings: "Keep audio too", "Export my data", invoices, cancel plan | Not in this roadmap | No backend for them; these are open proposals in the redesign roadmap |
| Privacy section "Transcript: made, then sent to you" | "Transcript: saved to your account; delete it any time" | Transcripts are now stored (OCI bucket) |
| Testimonials | Hidden | No real quotes yet |

## Phases

Each phase is a branch off `develop`, then verify, deploy and a short check on umless.in. Sizes: S ≈ half a day, M ≈ 1–2 days, L ≈ 3+ days.

### Phase 1: Foundation and folder move (M), no visible change
- Create `app/ pages/ features/ shared/ content/`, move the existing files into them, and add the `@/` alias.
- Router: switch to the route table (`app/routes.ts`) with `:param` matching and `React.lazy` pages. URLs stay as today.
- ESLint import boundaries (ADR 0005 decision 1).
- Update CLAUDE.md "Layout" and ADR 0002's status line.
- **Done when:** the same tests pass unchanged (except import paths), Playwright F1–F4 is green, and the bundle has one chunk per page.

### Phase 2: Design system and theme (M)
- `shared/theme`: v2 tokens (light, dark, system), self-hosted Inter and Geist Mono, and the no-flash theme script and store with `ThemeToggle`.
- `shared/ui` primitives from ADR 0005 decision 3, each with a unit test (variants, native-prop passthrough, a11y attributes).
- Port `components.html` to a dev-only `/_ui` page (not in the production route table) as a living style guide.
- Clerk `appearance` mapped to the tokens.
- **Done when:** `/_ui` matches `components.html` in both themes, and no hard-coded colour remains outside `tokens.css`.

### Phase 3: Layouts and new URLs (M)
- `MarketingLayout` (sticky nav, phone menu, footer from `content/`), `AppShell` (sidebar, top bar with breadcrumbs, theme toggle and Clerk `UserButton`, phone tab bar, Practice-time card) and `AuthLayout`.
- New URL map:

  | Path | Access |
  |---|---|
  | `/` landing (signed in → `/dashboard`) | public |
  | `/pricing` | public |
  | `/sign-in` and `/sign-up` | signed out |
  | `/dashboard` | signed in |
  | `/questions` | signed in |
  | `/practice/:id` | signed in |
  | `/history` | signed in |
  | `/history/:questionId` | signed in |
  | `/takes/:id` | signed in |
  | `/settings` and `/settings/billing` | signed in |
  | `/terms`, `/privacy`, `/refunds`, `/contact` | public |

- The old `/` question list moves to `/questions`. Today's screens render inside the new shell, unstyled where needed.
- Access guard: a signed-out visitor on an app URL goes to `/sign-in?redirect=…`.
- **Done when:** every route renders in the right layout, the guard works, and F1–F4 are green with the updated URLs.

### Phase 4: Marketing, auth and 404 (M)
- Landing: hero with product mock, how it works, features, before/while/after, privacy, pricing teaser, works anywhere, FAQ, CTA. Copy goes in `content/marketing.ts`.
- Pricing page from `content/pricing.ts` (live packs), plus a comparison table and billing FAQ.
- Sign in and sign up (Clerk, themed).
- Restyle the legal pages and add both 404 variants (unknown page, deleted question).
- Page titles and meta description per route.
- **Done when:** a signed-out visitor can go landing → pricing → sign up → dashboard, and the Razorpay-required pages are still reachable from the footer.

### Phase 5: Data layer (S)
- Add `@tanstack/react-query`.
- Add `features/*/model` query hooks (`useQuestions`, `useAccount`, `useQuestionTakes`) and mutations with invalidation.
- Retire `billing/account.ts`'s hand-made store.
- **Done when:** existing screens use the hooks, and buying time or transcribing updates the shell card with no manual refresh.

### Phase 6: Questions and Practice redesign, F1–F4 (L)
- Questions: add row with hint and errors, duplicate warning ("Add anyway"), starter chips, inline edit (Enter/Esc), delete dialog plus a 5 s undo toast, empty, loading skeleton, server-error banner, and a "practised N× · fillers/min" meta line.
- Practice: split `PracticeSession` into `practiceMachine` + `usePracticeSession` + one view per stage (ADR 0005 decision 5). This covers mic prompt and blocked, recording with the meter, the last-minute countdown, review with the player, transcribing, failed, result (stat tiles, transcript legend, downloads, "fewer fillers than last time"), and no words heard.
- Previous/next question, Space to record/stop, and a sticky action bar on phones.
- The BuyTime dialog moves onto the new primitives.
- **Done when:** every E1–E24 row in `screens.md` is checked off, the reducer has a unit test for every transition, and F1–F4 are green.

### Phase 7: History, with a backend change (M)
- **Contract:** `GET /api/takes?question_id=&since=&limit=`, plus backend tests (and Schemathesis), then `npm run gen:api`. **Needs your OK** (CLAUDE.md "Contract first").
- `features/progress/model`: pure stat functions with table tests.
- Screens:
  - **All takes:** question filter, a 7 d / 30 d / All switch, and grouping into Today / This week / Earlier.
  - **One question's progress:** stats, chart and the take list.
  - **One take** (`/takes/:id`): the full transcript, with delete.
  - **Empty state.**
- **Done when:** a take made in Practice appears in History without a reload, and deleting one updates every screen.

### Phase 8: Dashboard (M)
- Returning user:
  - welcome line with the streak;
  - "Practise next" card (prefers a question not tried yet, then the oldest practised);
  - 4 stat tiles with week-over-week deltas;
  - fillers-per-minute chart for the last 8 weeks;
  - recent takes.
- First visit: a 3-step checklist, an inline add-question field with starter chips, and a "What you'll see" sample.
- **Done when:** both states render from real data, and the stat functions are reused from Phase 7.

### Phase 9: Settings and billing (M)
- Profile: Clerk `<UserProfile>` embedded and themed. It includes Clerk's own delete-account option.
- Theme selector: Light / Dark / System.
- Billing:
  - balance and packs, with Buy;
  - the payment worked and payment failed states (moved from the practice dialog flow);
  - a "free limit reached" banner.
- **Open:** deleting a Clerk account should also delete that user's questions, takes and balance. That needs a Clerk `user.deleted` webhook on the backend (new secret, new endpoint). It's a separate decision, and this phase ships without it.
- **Done when:** a user can see their balance, buy a pack and change the theme from Settings.

### Phase 10: Quality pass and launch (S–M)
- Every route at 375, 768 and 1440 in both themes:
  - 48 px touch targets;
  - visible focus;
  - reduced motion;
  - contrast ≥ 4.5:1;
  - axe check with no serious issues.
- Performance budget: the landing JS chunk ≤ 120 kB gzip, and LCP < 2.5 s on 4G.
- Update docs: CLAUDE.md (it's stale: localhost-only, no auth), `docs/design/screens.md` and `flows.md` (F5+), and the redesign roadmap's progress.
- Deploy, run a smoke test on umless.in (sign up, practise, buy ₹40, history) and keep a rollback image tag.

## Order and dependencies

```
1 Foundation → 2 Design system → 3 Layouts → 4 Marketing/auth
                                          ↘ 5 Data layer → 6 Questions+Practice → 7 History → 8 Dashboard → 9 Settings → 10 QA
```

Phase 4 can run in parallel with 5–6. After phase 4 the public site looks new. Until phase 6, the app pages are inside the new shell but partly in the old style. That's acceptable for a few days; if it isn't, deploy 3–6 together.

## Risks

| Risk | Mitigation |
|---|---|
| Edge states lost in the practice rewrite | `screens.md` is the checklist; reducer tests per transition; F1–F4 must pass before deploy |
| The folder move breaks imports or blame | Phase 1 changes no behaviour; one commit for the move, one for the rest |
| Old bookmarks to `/` expecting the question list | Signed-in users on `/` go to `/dashboard`, one click from Questions |
| Live payments break during the shell change | Payment code moves but isn't rewritten until phase 9; one real ₹40 test after phases 3 and 9 |
| Bundle growth (Query, fonts, Clerk UI) | Lazy pages; Clerk UI only on auth and settings; budget check in phase 10 |

## Decisions needed before Phase 1

1. Approve ADR 0005: the layered folders, TanStack Query, Clerk components for auth, and keeping the hand-written router.
2. Keep the live pricing (packs) instead of the design's Free/Pro/Coach. Recommended.
3. OK to add `GET /api/takes` to the contract in Phase 7.
4. New URLs: the question list moves from `/` to `/questions`, and `/` becomes the landing page.
