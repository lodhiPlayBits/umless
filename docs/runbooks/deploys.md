# Runbook: CI/CD and deploys

Since 2026-10-31: **merging a pull request into `main` deploys it.** Nothing is deployed by hand, and nothing is edited on the server.

```
feature branch → PR to develop (CI) → merge → PR develop → main (CI) → merge
  → images pushed to OCIR → deploy over SSH → smoke test from outside
  → smoke test fails? server rolled back to the previous main commit + revert PR opened for you
```

## The pipeline (`.github/workflows/ci.yml`)

| Stage | Job | Runs on | What |
|---|---|---|---|
| 1 | `backend` | every PR/push | all backend tests on a real MySQL 8.4 + Redis 7.4, backup tests, coverage |
| 1 | `frontend` | every PR/push | generated API client up to date, lint, unit tests with coverage, build |
| 1 | `e2e` | every PR/push | Playwright flows F1–F4 and accessibility; traces on failure |
| 2 | `scan (…)` | every PR/push | Trivy filesystem scan of `backend`, `frontend`, `backup`, `deploy/nginx`, `redis`; **fails on a fixable CRITICAL** |
| 3 | `sonar` | every PR/push | SonarCloud with backend + frontend coverage (`sonar-project.properties`) |
| 4 | `build-push (…)` | every PR/push | builds the `backend`, `frontend`, `gateway` and `redis` images for `linux/arm64` (emulated) **only if their folder changed**, Trivy image scan, **fails on a fixable CRITICAL**. On `main` only: pushes `bom.ocir.io/bmej3eov9wnf/umless/<image>:<7-char sha>`; an unchanged image gets the new tag without a rebuild (same digest, so its container isn't restarted) |
| — | `ci-passed` | always | the **one required check**: every stage above succeeded |
| 5 | `deploy` | push to `main` | SSH to the server: `deploy <sha>` → `deploy/deploy.sh` |
| 6 | `smoke-test` | after deploy | `.github/scripts/smoke-test.sh https://umless.in` from GitHub: home page and bundle, `/api/health`, sign-in enforced on 3 API routes, http→https, www→bare, HSTS, certificate ≥ 7 days |
| 7 | `rollback` | smoke test failed | deploys the previous `main` commit, opens a **revert PR** (never pushes to `main`) |

### What `deploy.sh <sha>` does on the server
1. refuses if the checkout has local changes; fetches and checks out the commit;
2. pulls its 4 images from OCIR, and **stops before touching anything** if one is missing;
3. compares each with the running container: **only changed services restart**; if none changed, it's done;
4. backs up the database, and tags the running images `rollback-<stamp>`;
5. recreates the changed services (the backend runs migrations on start), waits for health, restarts nginx;
6. checks `https://umless.in/` and `/api/health`, and **rolls back by itself** if that fails.

So there are two safety nets: `deploy.sh`'s own check on the server, then the public smoke test with CI's rollback.

## One-time setup

**GitHub → Settings → Secrets and variables → Actions:**

| Kind | Name | Value |
|---|---|---|
| Secret | `OCIR_USERNAME` | `bmej3eov9wnf/Default/gauravlodhi983@gmail.com` (namespace/domain/user; this tenancy needs `Default`) |
| Secret | `OCIR_TOKEN` | an OCI auth token (profile → Auth tokens) |
| Secret | `SONAR_TOKEN` | sonarcloud.io → My Account → Security |
| Secret | `DEPLOY_SSH_KEY` | printed by `deploy/setup-ci-access.sh` |
| Secret | `DEPLOY_KNOWN_HOSTS` | printed by `deploy/setup-ci-access.sh` (`umless.in ssh-ed25519 …`) |
| Variable | `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_Y2xlcmsudW1sZXNzLmluJA` |

**On the server** (once):
```bash
sg docker -c 'docker login bom.ocir.io -u "bmej3eov9wnf/Default/gauravlodhi983@gmail.com"'   # done 2026-10-31
sh ~/umless/umless/deploy/setup-ci-access.sh
```
`setup-ci-access.sh`:
- makes a **read-only GitHub deploy key**, so the server can `git fetch` (add the printed public key under repo Settings → Deploy keys, write access **off**). Pushes from the server keep using https;
- adds **CI's key** to `~/.ssh/authorized_keys`, restricted to `deploy/ci-deploy.sh` (`command=…,restrict`): it can run `deploy <sha>` and nothing else. Every use is logged to `~/umless-deploys.log`;
- prints the private CI key once, for the `DEPLOY_SSH_KEY` secret, and deletes it;
- prints the host key line for `DEPLOY_KNOWN_HOSTS`, so CI only talks to this server.

The OCI security list must allow SSH (22) from the internet: GitHub's runners have no fixed IPs. Password login is off on this server (keys only).

**SonarCloud:** the project keys must match `sonar-project.properties`; Automatic Analysis must be **off**.

**Branch protection** (Settings → Rules → rulesets, for `main` and `develop`): require a pull request; require the status check **`ci-passed`**; block force pushes.

## Day to day

- Work on a branch, PR to `develop`, merge when `ci-passed` is green.
- Release: PR `develop` → `main`, merge. The deploy runs by itself (≈ 20–30 min with ARM emulation; less when only some images changed). Watch it under Actions.
- If CI rolls back: the site is on the previous version. Read the failed smoke test and the revert PR, then either merge the revert or fix forward with a new PR. Close the revert PR if the cause was outside the code (network, DNS, certificate).

## The backup service (built on the server)

CI doesn't build the backup image: it rarely changes, isn't part of serving users, and was the slowest image (1.78 GB under ARM emulation). CI still runs its tests and the Trivy scan of `backup/`. When a merged change touches `backup/`, rebuild it on the server **after** that merge's deploy has finished (the checkout is then at that commit):
```bash
cd ~/umless/umless/deploy && sg docker -c 'docker compose build backup && docker compose up -d --no-deps backup'
sg docker -c 'docker logs --tail 3 umless-backup'   # expect "Uploaded …" (it backs up on start)
```

## By hand (emergencies)

```bash
sg docker -c 'sh ~/umless/umless/deploy/deploy.sh <commit sha>'   # any commit whose images are in OCIR
sg docker -c 'sh ~/umless/umless/deploy/rollback.sh'              # list rollback stamps
sg docker -c 'sh ~/umless/umless/deploy/rollback.sh <stamp>'      # put back the images from before a deploy
bash ~/umless/umless/.github/scripts/smoke-test.sh https://umless.in
```

Rollbacks put back images, not the database. **Migrations must therefore only add** (tables, nullable columns, indexes), so the previous version still runs on the new schema. Renames and drops take two releases: stop using the column, then drop it in the next release.

To clean up old rollback images now and then (keeps the newest 8):
```bash
sg docker -c 'docker images --format "{{.Repository}}:{{.Tag}}" | grep ":rollback-" | sort | head -n -8 | xargs -r docker rmi'
```
