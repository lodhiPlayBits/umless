# Roadmap: launch readiness

Date: 2026-10-30 · Status: not started · Follows: the production-readiness review of 2026-10-30

## Goal

Make umless.in safe to promote to the public: no customer can lose money, a breakdown is noticed in minutes, data can be restored, and the legal pages match what the app does. Code quality is already there; this roadmap is mostly operations, configuration and a few small features.

Done when every phase below is ticked and the launch smoke test (Phase 8) passes on the live site.

Owners: **You** = dashboards, accounts, DNS, legal wording (only you can do these). **Claude** = code, tests, scripts, docs. Sizes: S ≈ an hour or two, M ≈ half a day to a day, L ≈ several days.

## Status

| # | Phase | Size | Status |
|---|---|---|---|
| 0 | Secure and ship today's work | S | not-started |
| 1 | Payments can't lose money | S | not-started |
| 2 | Backups you've actually restored | M | not-started |
| 3 | Know when it breaks | M | not-started |
| 4 | Production sign-in (Clerk) | M | not-started |
| 5 | Legal pages and deleting data | M | not-started |
| 6 | Safe deploys (CI, tags, rollback) | M | not-started |
| 7 | Hardening (CSP, free-tier abuse, Safari) | M | not-started |
| 8 | Launch | S | not-started |

Order: 0 → 1 first (live money is at risk today). 2 and 3 next. 4 before 5 (the deletion webhook lives on the production Clerk instance). 6 and 7 can run alongside 4–5. 8 last.

## Progress

<!-- One entry per finished phase: date, what was done, results. -->

## Phases

### Phase 0: Secure and ship today's work (S)

1. **You:** rotate the Deepgram key (Deepgram console → API keys: create a new one, put it in `backend/.env` and the repo root's `.env`, delete the old one). It was printed in a session log on 2026-10-30.
2. **You:** commit today's Redis and logging work on a branch off `develop`, push, merge (commands in that session).
3. **You + Claude:** deploy in this order, or the backend won't start:
   - `redis/.env` with `REDIS_PASSWORD`; `REDIS_URL` in `backend/.env`;
   - tag the running images `rollback-<date>`;
   - `docker compose up -d redis`, then `up -d --build backend`, then `restart nginx`.
4. **Claude:** check `docker logs umless-backend` shows "Transcription limits in Redis" and a transcription logs a line.

Done when: the new key works on the live site, the old one is deleted, Redis limits are live, and `git status` on the server is clean.

### Phase 1: Payments can't lose money (S)

Today a customer who pays and closes the tab before the browser confirms is charged and never credited: only the webhook covers that, and it's off.

1. **You:** Razorpay dashboard (live mode) → Webhooks → add `https://umless.in/api/payments/webhook`, events `payment.captured` and `order.paid`, with a long random secret.
2. **You:** put that secret in `backend/.env` as `RAZORPAY_WEBHOOK_SECRET`; rebuild the backend.
3. **Claude:** confirm nginx forwards the webhook route and the backend answers a signed test event (Razorpay's "send test webhook").
4. **You:** a real ₹40 purchase where you **close the tab straight after paying**. The time must appear within a minute. Then a normal ₹40 purchase. Refund both from the dashboard.
5. **Claude:** a refund runbook in `docs/runbooks/refunds.md`: how to refund in Razorpay, the SQL to remove the time, how to tell the customer. Until refunds are automated, this is the process.

Done when: the closed-tab purchase is credited by the webhook alone, and the runbook exists.

### Phase 2: Backups you've actually restored (M)

A backup you haven't restored is a guess.

1. **You:** OCI console → MySQL HeatWave DB system → Backups: check automatic backups are on, note retention (aim for 7+ days) and whether point-in-time recovery is on. Turn both on if not.
2. **You + Claude:** restore the latest backup to a **new, temporary** DB system; check the row counts of `questions`, `takes`, `accounts` and `payment_orders` against production; delete the temporary system.
3. **Claude:** a nightly logical dump (`mysqldump` in a small container, cron or a compose service) to a separate OCI bucket with a 30-day lifecycle rule, as a second, provider-independent copy. A test restores the dump into a throwaway `mysql:8.4` container.
4. **You:** the transcripts bucket: turn on object versioning (or a retention rule) so a bad delete can be undone.
5. **You:** keep a copy of every `.env` (backend, redis, deploy) in a password manager. If the VM is lost, these are the only copy.
6. **Claude:** `docs/runbooks/disaster-recovery.md`: rebuild the whole stack on a fresh VM from git, the password manager and the backups, step by step, with the time it took.

Done when: one restore has been done and checked, the nightly dump has run at least twice, and the recovery runbook exists.

### Phase 3: Know when it breaks (M)

1. **You:** an uptime monitor (UptimeRobot or Better Stack, free) on `https://umless.in/` and `https://umless.in/api/health`, every 1–5 minutes, alerting your phone.
2. **Claude:** Sentry (free tier) in the backend (FastAPI integration) and the frontend (React SDK, lazy-loaded so the landing page budget holds). Scrub request bodies; never send audio, transcript text or keys. **You:** create the Sentry project and give the two DSNs.
3. **Claude:** make a broken Deepgram key loud: a 401/403 from Deepgram logs at ERROR (Sentry alerts on it), not just WARNING. Today every user would see "try again" forever and nothing would tell you.
4. **You:** billing alerts:
   - Deepgram: a low-balance or usage alert;
   - OCI: a budget alert;
   - Razorpay: settlement notifications to your email.
5. **Claude:** a disk-space alert. A cron that emails or calls a webhook when `/` is over 80%; Docker logs and images fill disks.

Done when: stopping the backend container pages your phone within 5 minutes, and a test error shows up in Sentry from both the backend and the browser.

### Phase 4: Production sign-in, Clerk (M)

The development instance (`pk_test_`) isn't meant for real users. Dev and production are **separate user pools**, and every row in the database is keyed by the Clerk user id, so moving needs care.

1. **Claude:** count the real users and who has paid time:
   - rows in `accounts`;
   - `seconds_left > 0`;
   - paid `payment_orders`.

   This decides the migration path.
2. **You:** create the production instance in Clerk:
   - add the DNS records it asks for on umless.in (`clerk.`, `accounts.`, mail records);
   - set up Google sign-in with your own OAuth credentials (production instances need them);
   - turn on bot protection and email verification for sign-up.
3. **Claude:** a one-off migration script that maps old user ids to new ones by email, and updates `accounts`, `questions`, `takes` and `payment_orders` in one transaction. Dry run first, with a printed report. If there are only a handful of users, you can instead email them to sign up again and move their balance by hand.
4. **You:** export users from the dev instance and import them into production (Clerk dashboard or API), or let them re-register.
5. **You + Claude:** switch the keys:
   - `CLERK_PUBLISHABLE_KEY` (`pk_live_…`) in `backend/.env`;
   - the frontend's build-time key;
   - `CLERK_AUTHORIZED_PARTIES=https://umless.in` (drop localhost in production).

   Then run the migration and deploy.

Done when: you can sign up, sign in and sign out on umless.in with `pk_live_`, an existing user still sees their questions, history and balance, and no development banner appears.

### Phase 5: Legal pages and deleting data (M)

1. **You:** fill `address` in `frontend/src/content/business.ts` (the same address as your Razorpay KYC). Name a grievance contact (you, with email and phone) on the Contact page; Indian e-commerce rules expect one.
2. **Claude:** account deletion, as a Clerk `user.deleted` webhook (signature checked) that removes the user's questions, takes, transcripts in the bucket, and account row, in that order, idempotently. Keep paid orders for tax records, with the user id replaced by a hash. Tests for each part, plus one for a retried webhook.
3. **Claude:** a "Delete my account" control in Settings (Clerk's own UI can do it; the webhook does the cleanup).
4. **You + Claude:** read the privacy policy against what the app actually does, and fix the wording. Cover:
   - who processes data: Deepgram (audio, not kept), Clerk, Razorpay, Oracle Cloud (Mumbai);
   - what's stored and for how long;
   - how to delete it;
   - how to contact you.

   It must not promise what the code doesn't do.
6. **You:** if your turnover may cross the GST threshold, talk to an accountant about invoices and GST on the packs. Not a launch blocker at small volume, but know the line.

Done when: the address and grievance contact are live, deleting a test account removes all its data (checked in MySQL and the bucket), and the privacy policy matches the code.

### Phase 6: Safe deploys (M)

1. **Claude:** GitHub Actions on every push and pull request:
   - backend tests, with throwaway MySQL and Redis services, so the SQL and Redis tests run instead of skipping;
   - frontend unit tests, lint and build;
   - Playwright e2e.

   Branch protection on `main` and `develop`: CI must pass.
2. **Claude:** `deploy/deploy.sh <tag>` does these steps:
   - checks out a **tag** (never a dirty working tree);
   - tags the running images `rollback-<date>`;
   - builds, starts and checks `/api/health` through nginx;
   - rolls back automatically if the check fails.
3. **Claude:** a `deploy/rollback.sh` and a section in the recovery runbook.
4. **You:** from now on, no edits on the server: work in WSL, merge, tag (`v1.2.0`), deploy the tag.
5. **Optional, later:** a staging copy (a second compose project on another port with test keys) for changes to payments or auth.

Done when: a pull request with a failing test can't be merged, and a deploy and a rollback have each been run once with the scripts.

### Phase 7: Hardening (M)

1. **Claude:** Content-Security-Policy, in two steps:
   - first `Content-Security-Policy-Report-Only` (allowing self, Clerk, Razorpay Checkout and Sentry), with reports watched for a few days;
   - then enforced.

   Also add `preload` to HSTS once you're sure about subdomains.
2. **Claude:** free-tier abuse. A global daily cap on free-transcription minutes (in Redis, like the limits), so scripted sign-ups can't burn more than a set amount of Deepgram money a day. Logged and alerted when hit. Phase 4's bot protection and email verification are the other half.
3. **You + Claude:** a real iPhone (Safari) and Firefox pass over the F1–F4 flows: record, transcribe, replay, download. Safari records audio/mp4; check it end to end. Fix what breaks.
4. **Claude:** `npm audit` and `pip-audit`, then pin or upgrade anything flagged. Use Dependabot for future updates.

Done when: CSP is enforced with no reports from normal use, the free cap is live, and F1–F4 pass on an iPhone and in Firefox.

### Phase 8: Launch (S)

1. **You:** check the numbers. Current Deepgram per-minute price versus ₹40/hour (about ₹0.67 a minute), after Razorpay's fee plus GST and the 3 free transcriptions per account. Adjust prices now if the margin is too thin; it's harder after launch.
2. **Claude:** privacy-friendly analytics (Plausible or similar, no cookie banner needed) for sign-ups, first transcription and first purchase, so you can see where people drop off. Mention it in the privacy policy.
3. **You:** a support inbox you check daily (the email on the Contact page) and a canned reply for "I paid but didn't get time".
4. **You + Claude:** the launch smoke test on umless.in, on a phone and a laptop:
   - [ ] sign up (new email) → 3 free transcriptions shown
   - [ ] add a question → practise → transcript with fillers and pauses
   - [ ] replay, download audio and `.txt`
   - [ ] buy ₹40 → time added → close-tab purchase also credited (Phase 1)
   - [ ] history and dashboard show the take
   - [ ] delete the account → data gone (Phase 5)
   - [ ] uptime monitor green, Sentry quiet, backups ran last night
5. **You:** launch.

Done when: every box above is ticked on the live site.

## After launch (not blockers)

- Automate refunds from Razorpay's `refund.processed` webhook.
- A second worker or VM once traffic needs it; Redis limits already work across workers.
- Read the error tracker and support inbox weekly; turn repeat complaints into fixes.

## Risks

| Risk | Mitigation |
|---|---|
| The Clerk migration orphans users' data | Count first; dry-run the id-mapping script; take a backup right before; keep the dev instance until every user is checked |
| A restore test touches production | Always restore into a **new** temporary DB system or container, never over the live one |
| CSP breaks Clerk or Checkout | Report-only first; enforce only after a clean week |
| Free-tier cap blocks real new users | Set it well above normal daily use; alert when it's hit, so you can raise it |
