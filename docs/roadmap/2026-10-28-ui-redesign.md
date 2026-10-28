# Roadmap: UI/UX redesign (marketing site, pricing, dashboard)

Date: 2026-10-28 · Status: approved 2026-10-28; Phases 0–1 built in Figma, not yet visually checked

## Progress

- 2026-10-28: Decisions: keep the indigo accent, use Inter (Geist Mono for the timer).
- 2026-10-28: The Figma file is on the Starter plan: 3 pages, 1 variable mode per collection, and a cap on MCP tool calls. Workarounds:
  - Pages are `Design system`, `Marketing & Auth` and `App`, with Sections inside them instead of separate pages.
  - Dark mode uses two collections, `Color · Light` and `Color · Dark`, with the same 14 token names. Dark frames are made by cloning the Light frame and swapping its variables.
- 2026-10-28: Built: variables (24 primitives, 14 colour tokens per theme, 15 layout tokens with `var(--…)` code syntax), 11 text styles, 3 shadow styles, and the Cover, Moodboard and Foundations (Light and Dark) sections. Not yet screenshot-checked, because the MCP call limit was reached.
- 2026-10-28: The Starter plan allows 20 MCP calls a month, so design moved to static HTML in `docs/design/v2/` (same tokens, real light/dark toggle). The Figma file stays as a reference. Done: `assets/theme.css` and `assets/theme.js`, `components.html`, `landing.html`, `pricing.html`, and the `index.html` hub. Preview with the `design-v2` entry in `.claude/launch.json` (port 5181). Next: auth, then the app screens.

## Goal

Design a modern, clean and minimal umless in Figma, then build it. It has a public marketing site, a pricing page, sign-in screens and a dashboard-style app. Every screen works in light and dark mode, switched with a toggle.

Figma file: https://www.figma.com/design/sBZvRaqi1zocPtIA3WLMOD/umless (empty on 2026-10-28).

Done when:
- every screen below exists in Figma at desktop (1440) and mobile (375), in both light and dark mode, built from shared components and variables;
- a clickable prototype covers landing → sign up → dashboard → practice → result → pricing;
- `docs/design/` (tokens, screens, flows) matches the Figma file, ready for the build phases.

## Reference: what we take from parakeet-ai.com

We borrow its **structure and feel**: a clean layout with lots of white space, one strong hero, short feature cards, a privacy section, transparent pricing cards, a "works everywhere" strip, an FAQ accordion and a closing CTA. We don't copy its copy, illustrations, logo or colours.

We also don't copy its positioning. Parakeet sells live help *during* real interviews. umless helps you practise *before* them, and the site should say exactly that.

| parakeet-ai.com section | umless version |
|---|---|
| Hero "Real-time AI interview assistant" | Hero: "Say less *um*." Record an answer, see every filler and pause. Product visual: a transcript with fillers highlighted |
| Everything you need, mid-conversation | How it works in 3 steps: add questions → record → review |
| Blazing-fast transcription / accurate responses | Feature cards: filler detection (um, uh, mhmm), pause dots, pace (wpm), downloads |
| 100% private advantage | Privacy: recordings stay in your browser unless you save them |
| People trust & love | Testimonials, **only real ones**. Hide the section until we have some |
| Before, during and after the call | Before you practise / while you record / after you answer |
| Transparent pricing (Unlimited / Credits / Custom) | Pricing teaser that links to `/pricing` |
| Desktop app / browser / phone | Works in your browser on desktop and phone |
| FAQ | FAQ: languages, privacy, mic, which browsers work, pricing |
| Ready to answer every question? | Closing CTA: "Start practising free" |

## Screens in scope

| Area | Screens |
|---|---|
| Marketing | Landing `/`, Pricing `/pricing`, Privacy, Terms, 404 |
| Auth | Sign up, Log in, Forgot password, Check your email, Reset password |
| App shell | Sidebar (Dashboard, Questions, History, Settings), top bar (theme toggle, avatar menu), mobile bottom nav |
| Dashboard | Stats (takes this week, fillers per minute, average pace, streak), progress chart, recent takes, "Practise next question" |
| Existing flows F1–F4 | Questions list, practice (ready, recording, review, transcribing), result, plus all error and edge states from `screens.md` |
| History (v1.1) | Takes for each question, one take's detail, trend for that question |
| Account | Profile, Billing (plan, invoices, upgrade or cancel), Delete account |
| Upgrade | Free limit reached, checkout handoff, payment success or failure |

## Phases

### Phase 0: Set up the Figma file (S)
- Pages: `Cover`, `Foundations`, `Components`, `Marketing`, `Auth`, `App`, `Prototype`, `Archive`.
- A moodboard frame of reference screenshots (parakeet and 2–3 other clean SaaS sites), with a note on what we take from each.
- Done when: the file has the pages, and the moodboard is agreed.

### Phase 1: Foundations (M)
- Variables: a `primitives` collection (raw colours) and a `semantic` collection with **Light** and **Dark** modes. Start from `docs/design/tokens.md`, which already passes AA in both themes.
- Typography: choose one font (for example Inter or Geist) and map it to the existing `--text-*` scale. Add a display size for marketing (48–64px).
- Spacing, radius, shadow and motion from `tokens.md`. Add a marketing max width (1200px) next to the app's 720px.
- Grids: 12 columns on desktop, 8 on tablet, 4 on mobile.
- Done when: switching a frame's mode from Light to Dark recolours it fully, and every text pairing is still ≥ 4.5:1.

### Phase 2: Components (M–L)
- Basic: button (primary, secondary, ghost, danger × sizes × states), input, textarea, **theme toggle** (sun and moon), badge, avatar, tooltip, toast, dialog, accordion.
- Marketing: nav bar, hero, feature card, step card, pricing card with a monthly/yearly toggle, FAQ item, CTA band, footer.
- App: sidebar, top bar, stat tile, chart card, question row, record button, level meter, timer, audio player, transcript block (filler highlight, pause dots), summary bar, empty, loading and error blocks.
- All components use auto layout, variants and variables only, with no hard-coded colours.
- Done when: every screen in Phases 3–5 can be built from these without detaching.

### Phase 3: Marketing site (M)
- Landing: the sections in the table above, in that order, at 1440 and 375.
- Pricing page: plan cards (Free and Pro, plus Credits if we want pay-as-you-go), a monthly/yearly toggle, a feature comparison table and a billing FAQ.
- Privacy and Terms page template, and the 404 page.
- Done when: both pages are complete in light and dark mode, and the copy is real (no lorem ipsum).

### Phase 4: Auth screens (S)
- Sign up, Log in, Forgot password, Check your email, Reset password. Include errors such as a wrong password, an email already in use and an expired link.
- Done when: every screen and error state is designed in both themes.

### Phase 5: App and dashboard (L)
- App shell at desktop and mobile.
- Dashboard with first-time (empty) and returning-user versions.
- Redesign F1–F4 inside the shell. Keep every state from `screens.md` (E1–E24): the redesign changes the look, not the behaviour.
- History screens (these feed v1.1 phase 1, which is in progress).
- Settings, Billing and the Upgrade flow.
- Done when: every row of `screens.md` has a matching frame, plus the new screens.

### Phase 6: Responsive, dark mode and accessibility pass (S)
- Check every frame at 375, 768 and 1440 in both modes.
- Check touch targets (48px), focus states, reduced-motion variants and contrast.

### Phase 7: Prototype and test (S–M)
- Link the main path: landing → sign up → dashboard → practice → result → pricing.
- Test with 3–5 people, list the issues, fix the top ones.

### Phase 8: Hand off to the build (S)
- Update `docs/design/tokens.md`, `screens.md` and `flows.md` (add F5 onwards: sign up, login, onboarding, history, pricing and payment, billing, settings).
- Plan the build in this order, each as a `/kit:build` phase:
  1. new tokens and the theme toggle (frontend only)
  2. app shell and the redesigned F1–F4 (frontend only)
  3. marketing landing and pricing (static pages)
  4. history (v1.1, needs SQLite)
  5. auth and payment (needs hosting, users and a payment provider)

## Decisions needed before Phase 1

1. **Brand colour:** keep the indigo accent, or pick a new one?
2. **Font:** the system font stack as today, or a web font (Inter or Geist)?
3. **Plans and prices:** which tiers, in INR and/or USD, and what's in the free tier (for example N takes a month)?
4. **Payment provider:** Razorpay (India) or Stripe?
5. **Hosting:** does umless.in become a hosted, multi-user app? The current app is localhost-only by design (ADR 0001 Host guard, no CORS), and accounts are a v1 non-goal in `prd.md`. Sign-up, the dashboard's history and pricing all depend on this.
6. **Testimonials:** do we have any real ones? If not, the section ships hidden.

## Risks

- **Designing ahead of the backend.** Auth, billing and history screens can be designed now, but building them needs a database, hosting and a security redesign. Finish designing them, but build them last (Phase 8 order).
- **Looking like a clone.** Use parakeet for layout rhythm only. Keep umless's own name, voice, colours and product visual.
- **Losing edge states in the redesign.** The current app handles 24 edge cases. Phase 5 must keep all of them; `screens.md` is the checklist.

## Out of scope

- Writing frontend code before Phase 8 is approved.
- A native desktop or mobile app.
- Changing the API contract (`docs/api/openapi.yaml`) as part of this roadmap.
