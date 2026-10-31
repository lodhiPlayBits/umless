# Roadmap: launch readiness

Date: 2026-10-30 · Status: not started · Follows: the production-readiness review of 2026-10-30

## Goal

Make umless.in safe to promote to the public: no customer can lose money, a breakdown is noticed in minutes, data can be restored, and the legal pages match what the app does. Code quality is already there; this roadmap is mostly operations, configuration and a few small features.

Done when every phase below is ticked and the launch smoke test (Phase 8) passes on the live site.

Owners: **You** = dashboards, accounts, DNS, legal wording (only you can do these). **Claude** = code, tests, scripts, docs. Sizes: S ≈ an hour or two, M ≈ half a day to a day, L ≈ several days.

## Status

| # | Phase | Size | Status |
|---|---|---|---|
| 0 | Secure and ship today's work | S | deferred to just before launch (2026-10-30) |
| 1 | Payments can't lose money | S | done |
| 2 | Backups you've actually restored | M | done |
| 3 | Know when it breaks | M | in-progress |
| 4 | Production sign-in (Clerk) | M | in-progress (live; check left) |
| 5 | Legal pages and deleting data | M | not-started |
| 6 | Safe deploys (CI, tags, rollback) | M | in-progress (built; your GitHub steps left) |
| 7 | Hardening (CSP, free-tier abuse, Safari) | M | not-started |
| 8 | Launch | S | not-started |

Order: 1 first (live money was at risk). Phase 0 is deferred to just before launch (your decision, 2026-10-30), **except** its Redis step: the backend on disk needs `REDIS_URL`, so Redis must be set up at the first backend rebuild (Phases 3–5 all rebuild it). 2 and 3 next. 4 before 5 (the deletion webhook lives on the production Clerk instance). 6 and 7 can run alongside 4–5. 8 last.

## Progress

<!-- One entry per finished phase: date, what was done, results. -->

- 2026-10-31: **Phase 1, steps 1–3 done.**
  - The Razorpay live webhook points at `https://umless.in/api/payments/webhook` with 2 events, and `RAZORPAY_WEBHOOK_SECRET` is in `backend/.env`. The backend was recreated with it (same image).
  - Checked on the live site:
    - no signature → 400 `payment_invalid`;
    - wrong signature → 400;
    - correctly signed test event → 200 `ignored`.
  - Left: the closed-tab ₹40 purchase (step 4) and the refund runbook (step 5).
- 2026-10-31: **Phase 1 done.**
  - Closed-tab purchase (`pay_TuEBiLU32DEp4g`, ₹40): the backend log shows the order created, then two webhook deliveries (200, 200) and **no** `/api/payments/verify` call. The webhook alone credited the 60 minutes, once.
  - Refund runbook: `docs/runbooks/refunds.md`. Its MySQL shell command and refund SQL were checked against a throwaway `mysql:8.4`. It keeps a refunded order's status `paid`, so a late webhook retry can't credit it again.
- 2026-10-31: **Phase 2: HeatWave checked; our own dumps built.**
  - Findings on `mysql20261024145824` (Always Free, Mumbai):
    - automatic backups are on, but kept for **1 day**;
    - point-in-time recovery, manual backups and longer retention are greyed out on the free tier;
    - restoring into a new DB system may not be possible (one free system).
  - So the nightly dump (step 3) is now the **main** backup, done first. Paying for a bigger DB system isn't worth it at this size; revisit with volume.
  - Built `backup/`, with the runbook `docs/runbooks/backups.md`:
    - a nightly gzipped `mysqldump` at 20:30 UTC to a private bucket;
    - 30 days kept, the newest 7 never deleted;
    - unhealthy after 26 h without a success;
    - `restore-test.sh` restores the newest dump into a throwaway MySQL and compares row counts with production.
  - Tested:
    - unit tests for retention and scheduling;
    - a real dump with a user without PROCESS (like HeatWave's), restored with JSON and Unicode intact.
  - Not yet run against OCI: it needs the bucket and policy (runbook, Setup 1–2).
- 2026-10-30: **Phase 2, nightly backups live.**
  - Bucket `umless-backups` created (private), and the `umless-bucket-access` policy extended. The VM can list, write, read and delete there. `get_bucket` gives a 404, which is expected: the policy grants objects, not buckets.
  - First backup: `mysql/umless-20261030T192501Z.sql.gz`, 2.0 kB, 3.3 s. The next runs nightly at 20:30 UTC.
  - **Restore test OK:** accounts 3/3, alembic_version 1/1, payment_orders 8/8, questions 2/2, takes 4/4.
  - Left: versioning on the transcripts bucket (step 4), `.env` files in a password manager (step 5), the recovery runbook (step 6).
- 2026-10-31: **Phase 2, step 6 done:** `docs/runbooks/disaster-recovery.md`, rebuilding on a new VM (Ubuntu 24.04, Ampere A1) from GitHub, the six `.env` files, HeatWave or the dumps, with a checklist. Not yet rehearsed. Left: steps 4 and 5 (you).
- 2026-10-31: **Phase 2 done.**
  - You: versioning is on for the transcripts bucket, and the six `.env` files are in the password manager.
  - Today's work is committed and pushed (`73b522b` on `origin/main`).
- 2026-10-31: **Phase 3, step 3 code done (not deployed).**
  - Deepgram's 401, 402 and 403 (revoked key, no credit, no permission) raise `DeepgramAccountError`, and the route logs it at ERROR; other failures stay at WARNING. Users still see 502 `transcription_failed`.
  - Tests: client and route levels.
  - Also fixed `test_with_redis_url_the_app_keeps_its_limits_in_redis`: it failed instead of skipping without `UMLESS_TEST_REDIS_URL`.
  - Results: 537 passed without Redis, 542 with it.
- 2026-10-31: **`www.umless.in` fix ready (found while setting up UptimeRobot).**
  - The problem: `www` resolved to the server, but the certificate covered only `umless.in`, so `https://www.umless.in` showed a certificate warning.
  - The fix:
    - nginx redirects `www` (HTTP and HTTPS) and plain HTTP straight to `https://umless.in`;
    - `init-letsencrypt.sh` adds `www` to the same certificate (`--cert-name --expand`) when its DNS exists, and builds only the gateway image. Its old `up --build nginx` also rebuilt the backend and frontend images.
  - Tested in a throwaway gateway: the config is valid, the redirects keep path and query, ACME still reaches certbot, and the `www` redirect sends HSTS.
- 2026-10-31: **`www` fix deployed.**
  - The certificate now covers `umless.in` and `www.umless.in` (expires 2027-01-28; certbot renews automatically).
  - Checked from outside: all `www` and HTTP variants answer 301 to `https://umless.in`.
- 2026-10-31: **Phase 4 started: Clerk production keys received, not applied.**
  - `clerk.umless.in` doesn't resolve yet, so switching now would break sign-in.
  - Waiting on you:
    - Clerk DNS records verified;
    - the secret key rolled (it was posted in chat; umless doesn't use it);
    - Google OAuth credentials;
    - bot protection.
  - Then one coordinated deploy: Redis, both keys, `CLERK_AUTHORIZED_PARTIES=https://umless.in`, backend and frontend rebuilt, and a dry-run-first SQL move of the 3 existing accounts to their new user ids.
- 2026-10-31: **Phase 4: DNS done; account-move script built.**
  - The 5 Clerk CNAMEs are at Hostinger, and checked live through public DNS (1.1.1.1).
  - Waiting on Clerk's Verify Records and its SSL certificates.
  - Transcripts in the bucket are stored under `users/<user id>/takes/`, so a plain SQL move would lose them. `app/admin/move_user.py OLD NEW [--apply]` (dry run by default) does the whole move:
    - questions, takes and paid orders;
    - transcripts: copied first, old copies deleted only after the database commit;
    - the balance, merged with the fresh account from the first sign-in, without extra free transcriptions;
    - refused if the new id already has data.
  - Tests: 8 against a real MySQL 8.4. The full suite passes with MySQL (573).
- 2026-10-30: **Clerk production switch deployed.**
  - Before: a backup (`umless-20261030T204340Z`), and images tagged `rollback-20261030-2043`.
  - Redis started; `REDIS_URL` in `backend/.env`.
  - `pk_live_` in `backend/.env` and `frontend/.env`; backend and frontend rebuilt.
  - Checked:
    - the bundle ships `pk_live_`;
    - the backend logs "Transcription limits in Redis";
    - `/api/questions` without a session → 401.
  - Account move: `user_3LBFroY5BX7twlMsoiyLt5aZOb8` (dev, gauravlodhi983) → `user_3LQjZfsQZCodEryE2FcKqdnTQoB` (production). Moved 1 question, 1 take and its transcript, 4 orders, and the balance (3 free + 7200 s).
    - The id as first given had a zero where Clerk has a capital O. The script refused it ("no data"), which caught the mix-up.
  - Not moved, by your choice:
    - `user_3LBFyJIIrtFa7G1DJieqxTxMQEw`: 1 question, 3 takes, 2 paid orders, 7200 s;
    - `user_3LPKHw7GOnBpmJmJfOPxzT6wf2h`: 1 paid order, 3600 s.

    Their data stays in the database; move it with the same script if those people sign in on production.
  - Phase 0's Redis and logging went out in this deploy. Deepgram key rotation is still open.
- 2026-10-31: **Self-serve refunds done** (`docs/roadmap/2026-10-31-self-serve-refunds.md`): deployed and tested live (a ₹40 refund was processed by Razorpay's webhook in 34 s).
- 2026-10-31: **Phase 6 built.**
  - `.github/workflows/ci.yml`:
    - `backend`: real MySQL 8.4 + Redis 7.4, plus the backup tests;
    - `frontend`: generated client up to date, lint, tests, build;
    - `e2e`: Playwright, with traces on failure.
  - `deploy/deploy.sh <tag>`: refuses a dirty checkout; backup → rollback tags → build → health check → **automatic rollback** on failure. `deploy/rollback.sh <stamp>` rolls back by hand.
  - `docs/runbooks/deploys.md` covers the release flow, migrations that only add, and hotfixes. The e2e backend now blanks `REDIS_URL`, like the other production settings.
  - Checked locally: shellcheck (info notes only); the workflow parses; e2e **86 passed**; backend 596 and frontend 470 earlier today.
  - **Left (you):**
    - push, so CI runs once;
    - branch protection on `main`/`develop` requiring `backend`, `frontend` and `e2e`;
    - the first tagged deploy with the script.

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

1. ~~**You:** check HeatWave's automatic backups.~~ Done: 1 day only, and the free tier can't change it (see Progress).
2. **Claude (done) + You:** the nightly dump (`backup/`) is the main backup. **You:** bucket, policy and `backup/.env` (runbook Setup 1–3), then start it.
3. **You:** run `backup/restore-test.sh` once the first dump is in the bucket; it must end `OK`.
4. **You:** the transcripts bucket: turn on object versioning (or a retention rule) so a bad delete can be undone.
5. **You:** keep a copy of all six `.env` files (`backend/`, repo root, `frontend/`, `deploy/`, `redis/`, `backup/`) in a password manager. If the VM is lost, these are the only copy.
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
