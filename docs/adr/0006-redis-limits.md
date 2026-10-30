# ADR 0006: Transcription limits in Redis

Status: accepted · Date: 2026-10-30

## Context

`createTranscription` checks the balance before the paid Deepgram call and charges after it (ADR 0004, decision 2). Parallel uploads from one user all passed the check: with 1 second of paid time left, ten uploads at once made ten Deepgram calls, and the charge stopped at zero, so nine were free. Nothing capped how often a signed-in user could call Deepgram either.

On 2026-10-30 Redis was considered for the billing data and not added (MySQL was correct, one worker). It's added now for a job MySQL and a single process don't cover: limits that hold across uvicorn workers and machines.

## Decisions

**1. One transcription at a time per user.** Before the balance check, `SET umless:lock:{user} <token> NX EX 180` (180 s covers a slow 25 MB upload plus Deepgram's 60 s timeout). Another request while it's held gets 409 `transcription_in_progress`. The lock is released in a `finally` with a compare-and-delete Lua script, so a lock that expired and was taken by a newer request is left alone.

**2. At most 30 transcriptions per user per clock hour** (`UMLESS_TRANSCRIPTIONS_PER_HOUR`). `INCR umless:rate:{user}:{hour}` plus `EXPIRE … 3600 NX`; over the cap is 429 `rate_limited`. Counted after the content-type check, so a refused audio type doesn't count. Fixed windows allow up to twice the cap across an hour boundary; that's enough to protect the Deepgram bill.

**3. Fails open.** If Redis can't be reached the transcription goes ahead and a warning is logged. An outage mustn't stop people practising, and billing stays correct in MySQL. Redis only holds keys that expire, so it can be flushed or lost at any time.

**4. Configuration.** `REDIS_URL` turns Redis on, and a server with a database (the public deployment) refuses to start without it. Without it (local use, tests) the same limits are kept in memory (`InMemoryLimits`). Redis runs as its own service (`redis/`), on the umless network only, password required, 128 MB with `volatile-lru`.

## Rejected

- **An asyncio lock in the process:** fixes decision 1 only while there's one worker.
- **A lock row in MySQL:** works, but every transcription would hold a connection or need cleanup of stale rows; Redis expiry does that for free.
- **Caching balances or question lists in Redis:** MySQL handles them at this size, and a cache adds invalidation bugs.
- **Failing closed:** a Redis outage would stop all practice for a protection that billing already backs up.

## Consequences

- `createTranscription` can answer 409 and 429 (contract updated; flows E25, E26).
- Deploy needs `redis/.env` (`REDIS_PASSWORD`) and `REDIS_URL` in `backend/.env` before the backend is rebuilt.
- Tests against a real Redis run with `UMLESS_TEST_REDIS_URL` (only `umless:test:*` keys are touched); otherwise they skip.
