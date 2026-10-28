# ADR 0003: Sign-in with Clerk, one question list per user

Status: accepted · Date: 2026-10-25 · Changes the "Auth" section of ADR 0001

## Context

umless now runs on a public server (https://umless.in) with questions in MySQL. ADR 0001 relied on the deployment shape (localhost only) instead of auth, which no longer holds: anyone who found the site could read and edit the one shared question list and spend the Deepgram credits. Users must be able to sign up, and each must see only their own questions. Recordings and transcripts are still never stored on the server; a later object-storage bucket for takes will reuse the same user id.

## Decisions

**1. Clerk does sign-in; the backend only verifies its tokens.**
- The frontend wraps the app in `ClerkProvider` (`src/SignInGate.tsx`). Signed out, it shows a welcome screen with Sign in / Create account (Clerk's modals). Signed in, it shows the app with Clerk's `UserButton` in the header.
- Every API request carries the Clerk session token as `Authorization: Bearer <token>`, added in one place: the `openapi-fetch` middleware in `src/client.ts`, fed by Clerk's standalone `getToken()` (which refreshes the short-lived token).
- The backend (`app/auth.py`) verifies the token itself: RS256 signature against the instance's JWKS (`<issuer>/.well-known/jwks.json`, cached), `iss` equal to the instance's Frontend API URL (decoded from the publishable key), `exp`/`nbf` with 5 s leeway, and `azp` in `CLERK_AUTHORIZED_PARTIES`. The user id is `sub`. No Clerk secret key and no Clerk backend SDK are needed.

**2. Every endpoint but `GET /api/health` requires sign-in.** The dependency sits on the routers, so a request without a valid token gets 401 `unauthorized` before any body validation or Deepgram call. The contract declares a `clerkSession` bearer scheme globally, `security: []` only on `getHealth`, and a 401 response on every other operation.

**3. Questions are owned by the Clerk user id.** The `questions` table has `user_id` (binary collation, so ids are compared exactly); every query filters on it. Another user's question id behaves exactly like a missing one (404 `question_not_found`), so ids leak nothing.

**4. Sign-in is configuration, and fails closed.**
- Backend: `CLERK_PUBLISHABLE_KEY` turns it on and then `CLERK_AUTHORIZED_PARTIES` is required. `DB_HOST` without `CLERK_PUBLISHABLE_KEY` refuses to start: the multi-user store must never fall back to one shared list.
- Frontend: `VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env`, read at build time (the Docker build copies it in).
- Without either, the app runs as before for local, single-user use (JSON file, user `local`, no token). Unit, contract and e2e tests use this mode or a test signing key; the contract tests run with sign-in on so Schemathesis also checks that calls without a token get 401.

**5. Signing out unmounts the app**, so one user's questions and takes are never left on screen or in memory for the next person on the same browser.

## Rejected

- **Clerk's Python backend SDK (`clerk-backend-api`)**: needs the secret key and adds a large dependency for what is one JWT check.
- **Session cookies through the gateway**: the frontend and API are same-origin, but Clerk's `__session` cookie is not refreshed for API calls made with `fetch`; the bearer token from `getToken()` is.
- **Hiding the app behind nginx auth**: no per-user data, and no sign-up.

## Consequences

- The deployed site uses Clerk's **development** instance (`pk_test_`), which shows a "Development mode" badge and has low user limits. Moving to a production instance means a `pk_live_` key, Clerk's DNS records for umless.in, and updating `CLERK_PUBLISHABLE_KEY` in both `.env` files; nothing in the code changes.
- If Clerk's JWKS can't be fetched (Clerk outage) and no keys are cached, API calls return 401 and the failure is logged.
- `CLERK_AUTHORIZED_PARTIES` must list every origin the app is served from (add `http://localhost:5173` to use sign-in with the dev server).
