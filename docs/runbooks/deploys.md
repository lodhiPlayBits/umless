# Runbook: releases and deploys

Since 2026-10-31: code reaches umless.in only as a **pushed, tagged, CI-green commit**. No edits on the server.

```
work on a feature branch (WSL)  →  pull request to develop  →  CI green  →  merge
develop → main (pull request, CI green)  →  tag vX.Y.Z on main
  →  CI builds the 4 images (ARM) and pushes them to OCIR  →  deploy.sh vX.Y.Z pulls and starts them
```

The server never builds: what runs is exactly what CI tested and built.

## CI (`.github/workflows/ci.yml`)

On every push to `main`/`develop` and every pull request:

| Job | Runs |
|---|---|
| `backend` | all backend tests against a real MySQL 8.4 and Redis 7.4 (nothing skips), plus the backup service's tests |
| `frontend` | the generated API client is up to date with the contract, then lint, unit tests and build |
| `e2e` | the Playwright flows F1–F4 and the accessibility checks; traces are uploaded when a test fails |
| `sonar` | SonarCloud analysis with backend and frontend coverage (`sonar-project.properties`) |
| `images` | **version tags only**, after the three test jobs pass: builds `backend`, `frontend`, `gateway` and `backup` for `linux/arm64` (emulated, about 10–15 min) and pushes them to `bom.ocir.io/bmej3eov9wnf/umless/<image>:<tag>` (and `:sha-<commit>`) |

**GitHub settings (you):** Settings → Secrets and variables → Actions.

| Kind | Name | Value |
|---|---|---|
| Secret | `OCIR_USERNAME` | `bmej3eov9wnf/Default/gauravlodhi983@gmail.com`: namespace / identity domain / username. This tenancy needs the domain, even `Default` |
| Secret | `OCIR_TOKEN` | an OCI **auth token** (OCI console → your profile → Auth tokens → Generate token), not the password |
| Secret | `SONAR_TOKEN` | sonarcloud.io → My Account → Security → Generate token |
| Variable | `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_Y2xlcmsudW1sZXNzLmluJA` (public; baked into the frontend image) |

**SonarCloud (you, once):** import the repo on sonarcloud.io, check that its organization and project keys match `sonar-project.properties` (`lodhiplaybits`, `lodhiPlayBits_umless`), and turn **off** Automatic Analysis (Administration → Analysis Method), since CI analyses it.

**The server (you, once):** log in to OCIR so `deploy.sh` can pull the private images. Docker keeps the login in `~/.docker/config.json`:
```bash
sg docker -c 'docker login bom.ocir.io -u "bmej3eov9wnf/Default/gauravlodhi983@gmail.com"'   # password: the auth token
```

**One-time setup (you, on GitHub):** Settings → Branches → Add branch ruleset (or classic protection) for `main` and `develop`:
- Require a pull request before merging.
- Require status checks to pass: `backend`, `frontend`, `e2e` (they appear after the workflow has run once).
- Block force pushes.

## Releasing

1. Merge `develop` into `main` through a pull request, with CI green.
2. Tag the merge commit, from WSL:
   ```bash
   git checkout main && git pull
   git tag -a v1.2.0 -m "Self-serve refunds, Redis limits, backups"
   git push origin v1.2.0
   ```
3. Wait for the tag's CI run to finish, `images` included (GitHub → Actions).
   Versions: `vMAJOR.MINOR.PATCH`. PATCH for fixes, MINOR for features, MAJOR for breaking changes.

## Deploying (on the server)

```bash
sg docker -c 'sh ~/umless/umless/deploy/deploy.sh v1.2.0'
```

It:
1. refuses if the server's checkout has local changes;
2. fetches tags and checks out the tag (for the compose files and config);
3. pulls the tag's 4 images from OCIR, and **stops before touching anything** if one is missing (CI not finished, or not logged in);
4. backs up the database (`backup.py once`);
5. tags the running backend, frontend, gateway and backup images as `rollback-<stamp>`;
6. re-tags the pulled images with the local names the compose files use (`umless-backend` and so on) and recreates those four containers (certbot and Redis keep running; the backend runs its migrations on start);
7. waits for backend and frontend to be healthy, then starts nginx;
8. checks `https://umless.in/` and `/api/health`.

If step 8 fails, it **rolls back by itself** and exits with an error. On success it prints the rollback command.

Takes 2–4 minutes; the site is down for a few seconds while containers swap.

## Rolling back by hand

When a problem shows up after a deploy that passed its check:

```bash
sg docker -c 'sh ~/umless/umless/deploy/rollback.sh'            # lists the stamps
sg docker -c 'sh ~/umless/umless/deploy/rollback.sh 20261031-184131'
```

It puts back the images, not the database. **Migrations must therefore only add** (new tables, nullable columns, indexes), so the previous code still runs on the new schema. A migration that renames or drops goes in two releases: stop using the column first, drop it in the next release.

To undo data changes too, restore a backup (`docs/runbooks/backups.md`). Deploys take one right before step 4.

Old rollback images pile up. Once in a while:
```bash
sg docker -c 'docker images --format "{{.Repository}}:{{.Tag}}" | grep ":rollback-" | sort | head -n -8 | xargs -r docker rmi'
```
That keeps the newest 8.

## Hotfix

Same path, faster: branch from `main`, fix with a test, pull request to `main` (CI green), tag `vX.Y.Z+1`, deploy, then merge `main` back into `develop`.

## Emergency: the site is down and CI can't help

Roll back first (above). Fix forward only through a tag. If you really must change the server's checkout, commit and push that change straight after, or the next `deploy.sh` refuses to run.
