# Runbook: knowing when it breaks

Three layers tell you something is wrong (launch roadmap, Phase 3). Each covers what the others can't see.

| Layer | Catches | Tells you by | Set up in |
|---|---|---|---|
| Uptime monitor (UptimeRobot or Better Stack) | the whole server or site down, from outside | phone push / SMS | their dashboard |
| Sentry | every ERROR log line and unhandled 500 in the backend, including browser crashes and CSP reports | Sentry app push, email | `SENTRY_DSN` in `backend/.env` |
| Watchdog (`deploy/watchdog.sh`) | disk over 80%, a container down or unhealthy (backups failing for 26 h), the health check failing from the server | email (Resend) | cron on the VM |

## What ERROR means

Only things that need you log at ERROR, so every Sentry event is worth reading:

- a Deepgram account problem (revoked key, no credit): every transcription fails;
- the contact form's mailer failing;
- a refund Razorpay refused (often a low Razorpay balance);
- the daily free-time cap reached (`Daily free-time cap reached …`): real demand outgrew it, or someone is farming free accounts. Raise `UMLESS_FREE_MINUTES_PER_DAY`, or set it to `0` to stop free time;
- a browser crash or CSP violation (`Browser error (…)`), from signed-in users;
- any unhandled 500.

## Sentry (once)

1. Sign up at sentry.io (the free Developer plan is enough). Create a project, platform **FastAPI**. Don't run their wizard: the code is in place (`backend/app/monitoring.py`).
2. Project → Settings → Client Keys (DSN): copy the DSN into `backend/.env`:
   ```
   SENTRY_DSN=https://<key>@o<org>.ingest.<region>.sentry.io/<project>
   ```
3. Project → Settings → Security & Privacy: turn on **Data Scrubber** and **Use Default Scrubbers**, and turn off **Store Native Crash Reports**. The backend already sends no request bodies, cookies, tokens, query strings, frame variables or IPs (`tests/test_monitoring.py` checks this); these are a second line.
4. Alerts → Create alert → Issues: "A new issue is created" **and** "The issue changes state from resolved to unresolved", action: email + mobile push. Install the Sentry app on your phone and sign in.
5. Restart the backend: `cd ~/umless/umless/deploy && docker compose up -d backend` (never `--build nginx`).
6. **Test:** `docker exec umless-backend python -c "import logging; from app.monitoring import start_sentry; import os, sentry_sdk; start_sentry(os.environ['SENTRY_DSN'], 'production'); logging.getLogger('app.test').error('Sentry test from the server'); sentry_sdk.flush(5)"`. The event should be in Sentry, and on your phone, within a minute.
7. Add Sentry to the privacy policy's "Who processes it for us" list (`frontend/src/features/legal/ui/LegalPage.tsx`), e.g. *Sentry (error reports from our servers; no transcripts, recordings or payment details)*, and to the "outside India" sentence.

## Watchdog (once)

1. It mails `CONTACT_TO` with the contact form's `RESEND_API_KEY` from `backend/.env`; nothing else to set up. Until umless.in is verified in Resend, `CONTACT_TO` must be the Resend account's own email.
2. Test it: `~/umless/umless/deploy/watchdog.sh --test` → "Test email sent to …", and the email arrives.
3. Install it for the `ubuntu` user (`crontab -e`):
   ```
   */10 * * * * /home/ubuntu/umless/umless/deploy/watchdog.sh >> /var/tmp/umless-watchdog/cron.log 2>&1
   ```
4. Check it ran: `tail /var/tmp/umless-watchdog/cron.log` (empty while all is well; one line per alert or recovery).

A problem is mailed when it starts, every 6 hours while it lasts, and once when it clears. Thresholds can be changed in the crontab line, e.g. `UMLESS_DISK_PERCENT=85 /home/ubuntu/…/watchdog.sh`. To silence a known problem for now, write the current time into its marker: `date +%s > /var/tmp/umless-watchdog/<key>` (keys: `disk`, `health`, `container-<name>`).

## When an alert comes

| Alert | First look |
|---|---|
| Disk full | `df -h /`, `docker system df`; then `docker image prune -a` and `docker builder prune` (old deploy images are the usual cause). |
| Container down / unhealthy | `docker ps -a`, `docker logs --tail 100 <name>`. A deploy normally fixes itself or rolls back (`docs/runbooks/deploys.md`). |
| `umless-backup` unhealthy | No backup for 26 h: `docs/runbooks/backups.md`. |
| Health check failing | `docker logs --tail 50 umless-nginx`, then the backend's. |
| Sentry: Deepgram account | Deepgram console: key, balance. Users see "Transcription failed" until it's fixed. |
| Sentry: free-time cap | Sentry/logs for how many accounts used free time today; raise or zero `UMLESS_FREE_MINUTES_PER_DAY`. |
| Sentry: browser error / CSP | The message names the page and the error; a CSP report names the blocked URL. |
