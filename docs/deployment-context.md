# Deployment context

Status: notes from a planning discussion on 2026-10-20. Not built yet.

## Target setup

| Piece | Choice | Runs where |
|---|---|---|
| App server | EC2 **t3.micro or t4g.micro** (a t2.micro also works) with 1–2 GB swap | AWS |
| Reverse proxy | nginx: TLS, serves the built frontend (`frontend/dist`), proxies `/api` to uvicorn on 127.0.0.1 | on the instance |
| Backend | FastAPI under uvicorn, 1–2 workers | on the instance |
| Cache | Redis | on the instance |
| Database | Existing free Postgres (20 GB) | managed, not on the instance |
| Auth | Clerk (sign-up, login, sessions, MFA) | Clerk-hosted |
| Speech to text | Deepgram nova-3 | Deepgram-hosted |

Aurora was considered and rejected. Even its smallest setup costs more than the whole instance, and the free Postgres does the same job.

## Why a micro instance is enough
- Expected memory: nginx 10–20 MB, each uvicorn worker 80–150 MB, Redis 10–50 MB, OS about 250 MB. That fits in 1 GB.
- CPU stays low because Deepgram does the transcription. The server mostly waits on network I/O.
- The one memory spike is uploads. `read_body_capped` (`backend/app/transcription/router.py`) holds each recording in memory, up to 25 MB, so concurrent uploads add up. Swap is the safety net. Revisit this if usage grows past a handful of simultaneous users.
- On t2 instances, CPU above 10% runs on burst credits, and the instance slows sharply when they run out. t3 and t4g have a higher baseline.
- Don't run `npm run build` on the instance; it can run out of memory on 1 GB. Build in CI or locally and copy `dist/` over.

## Data
- Postgres stores **only questions and minimal user data**.
  - No transcripts and no audio. The server never stores recordings.
  - If audio is ever kept, it goes in S3, with only the key in Postgres.
- Users: Clerk already holds names, emails and sessions. The database needs only:
  - a `users` table keyed by the Clerk user ID (the token's `sub` claim);
  - a `user_id` column on `questions`.
  - Don't copy profile data that Clerk owns.
- Size: far below 20 GB (a question is at most 500 characters).
- Connections: a micro Postgres allows roughly 60–80. Use a small pool, about 5 per worker.
- Network: same region as the EC2 instance. Allow port 5432 only from the instance's security group.
- Check when the free tier ends (AWS RDS free tier is time-limited).

## Auth: what Clerk does and what we still build
Clerk handles accounts, login screens, passwords, social login, MFA, sessions and token refresh. Three pieces are still ours:

1. **Frontend:** wrap the app in `<ClerkProvider>`. Send `Authorization: Bearer <getToken()>` on every request. That is one change in `frontend/src/client.ts`, because every request goes through it.
2. **Backend:** add a FastAPI dependency that verifies the Clerk session token (JWT checked against Clerk's public keys) on every protected route.
3. **Per-user data:** every repository query is scoped by the verified user ID (`WHERE user_id = :sub`). This is the one that matters most. Without it, any logged-in user can read or delete everyone's questions.

## Code changes needed before going live
1. **Configurable allowed hosts.** `LocalHostOnlyMiddleware` (`backend/app/errors.py`) accepts only `localhost` and `127.0.0.1`. Behind nginx with a real domain, every request would get a 400 `invalid_host`. Read the allowed hosts from settings.
2. **A Postgres repository.** Implement `QuestionRepository` on Postgres, with a migration tool such as Alembic. The current JSON file repository uses an in-process lock and breaks with more than one uvicorn worker.
3. **Clerk auth** (the three pieces above), plus contract changes: a security scheme in `docs/api/openapi.yaml`, a 401 error code, and `security: []` kept only on `/api/health`.
4. **CORS and CSRF review.** Today the frontend and backend share one origin through the Vite proxy. Keep them on one origin behind nginx so nothing changes.
5. **Production settings:** secrets in environment variables (not `.env` files in the repo), uvicorn without `--reload`, and a process manager (systemd).

## Open decisions
- **This conflicts with `docs/BUILD.md`.** It says v1.1 stays "local and single-user", with SQLite as the next database, and auth "waits until the app is deployed or multi-user". Moving to Postgres and Clerk changes that plan. Record the decision in BUILD.md's decisions log, and decide whether v1.1 attempt history comes before or after deployment.
- What Redis is for: rate limiting, caching, or Deepgram job state. Nothing in the app needs it yet.
- Domain name and TLS (Let's Encrypt with certbot, or an AWS load balancer).
