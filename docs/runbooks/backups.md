# Runbook: database backups

The MySQL HeatWave system is on the Always Free tier: automatic backups are on, but kept for **1 day**. Point-in-time recovery and manual backups are off, and the free tier can't change that. So the main backup is ours: `backup/` dumps the database every night at 02:00 IST (20:30 UTC) to a private OCI bucket. Dumps are kept for 30 days, and the newest 7 are never deleted.

| What | Where |
|---|---|
| Service | `backup/` (`backup.py`, compose, Dockerfile); included in `deploy/docker-compose.yml` |
| Settings | `backup/.env` (from `backup/.env.example`) |
| Dumps | bucket `umless-backups`, objects `mysql/umless-<UTC time>.sql.gz` |
| Restore test | `backup/restore-test.sh` |

## Setup (once)

1. **Bucket.** OCI console → Storage → Buckets → Create: name `umless-backups`, same compartment as the transcripts bucket, Standard tier, **private**, encryption with Oracle-managed keys.
2. **Permission.** The VM signs in as itself (instance principal), like the backend. In Identity → Policies, find the policy that lets the VM's dynamic group manage the transcripts bucket, and add one statement:
   ```
   Allow dynamic-group <the same group> to manage objects in compartment <the same compartment> where target.bucket.name='umless-backups'
   ```
3. **Settings.** Copy `backup/.env.example` to `backup/.env`. Copy the `DB_*` values from `backend/.env`, and `OCI_NAMESPACE` and `OCI_REGION` from there too. It's a separate file so the backup container never sees the Deepgram or Razorpay keys.
   - *Optional hardening:* a read-only database user, instead of the app's. As the HeatWave admin user:
     ```sql
     CREATE USER 'umless_backup'@'%' IDENTIFIED BY '<long random password>';
     GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES ON umless.* TO 'umless_backup'@'%';
     ```
4. **Start it** (from `deploy/`):
   ```bash
   sg docker -c 'docker compose up -d --build backup'
   sg docker -c 'docker logs -f umless-backup'
   ```
   It backs up straight away. Expect `Uploaded mysql/umless-….sql.gz (… kB)` and then `Next backup at … 20:30 UTC`.
5. **Restore test:** see below. Do it now, not on the day you need it.

**Never pass `--remove-orphans`** to compose from `backup/`, `redis/`, `backend/` or `frontend/`. All of them share the project name `umless`, so from one folder the other services look like orphans, and that flag would delete the live containers.

## Checking it's working

- `docker ps`: `umless-backup` shows `(healthy)`. It turns `(unhealthy)` when no backup has succeeded for 26 hours. Phase 3's monitoring should alert on that.
- `docker logs umless-backup | grep -E "Uploaded|ERROR"`: one `Uploaded` a night.
- The bucket in the console lists one object per night.

## Restore test (monthly, and after any change to the database or this service)

```bash
sg docker -c ~/umless/umless/backup/restore-test.sh
```

It downloads the newest dump and restores it into a throwaway MySQL 8.4 container on this VM. Then it prints the row count of every table next to production's. Production is only read, never written. It ends with `OK` or `FAIL`. Production can be a little ahead (rows added since last night). A table empty in the backup but not in production is a failure.

Add a line to the roadmap's Progress section with the date and the result.

## Restoring for real

Only when production data is lost or corrupted. **Never restore over the live database without a fresh dump of its current state first.** Even broken data may be needed later.

1. Stop writes: `sg docker -c 'docker compose stop backend'` (the site shows errors; that's intended).
2. Dump the current state: `sg docker -c 'docker compose run --rm backup once'`.
3. Get the dump to restore. That's the newest by default; for an older one, take its name from the bucket in the console:
   ```bash
   mkdir -p ~/restore && sg docker -c 'docker compose run --rm --user "$(id -u)" -v ~/restore:/out backup fetch-latest /out/latest.sql.gz'
   ```
4. Restore into the live database. The dump drops and recreates each table it contains:
   ```bash
   gunzip -c ~/restore/latest.sql.gz | sg docker -c 'docker run --rm -i --env-file ~/umless/umless/backup/.env mysql:8.4 sh -c "MYSQL_PWD=\$DB_PASSWORD mysql -h \$DB_HOST -P \${DB_PORT:-3306} -u \$DB_USER \$DB_NAME"'
   ```
5. Start the backend (`docker compose up -d backend`, then `restart nginx`). Check sign-in, a question list, history and a balance.
6. Anything paid after the dump's time (Razorpay dashboard → Payments) has to be re-credited by hand (`docs/runbooks/refunds.md`, "charged but no time").

## Second line: HeatWave's own backup

The 1-day automatic backup still exists. In the console, a backup can be restored into a **new** DB system. The free tier allows only one, so that may need a paid shape for a few hours. Use it only if our dumps are missing.
