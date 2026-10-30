"""Transcription limits (docs/adr/0006-redis-limits.md): one transcription at a time per user,
and at most `per_hour` per user each clock hour. Both are checked before the paid Deepgram call.

Redis when REDIS_URL is set (shared by every worker); in memory otherwise (one process).
"""

import logging
import secrets
import time
from typing import Callable, Protocol

import redis
import redis.asyncio

logger = logging.getLogger(__name__)

# Long enough for a slow 25 MB upload plus Deepgram's 60 s timeout; a crashed request frees
# the user again after this.
LOCK_SECONDS = 180
WINDOW_SECONDS = 3600

# Deletes the lock only if it still holds this request's token: one that expired and was
# taken by a newer request is left alone.
RELEASE_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
end
return 0
"""


class TranscriptionLimits(Protocol):
    async def allow(self, user_id: str) -> bool:
        """Count one transcription; False when the user is over this hour's cap."""
        ...

    async def acquire(self, user_id: str) -> str | None:
        """A token for the user's one transcription slot, or None while another holds it."""
        ...

    async def release(self, user_id: str, token: str) -> None: ...


class InMemoryLimits:
    """Local use and tests. Releases always run in this process, so the lock needs no expiry."""

    def __init__(self, per_hour: int, clock: Callable[[], float] = time.time) -> None:
        self._per_hour = per_hour
        self._clock = clock
        self._counts: dict[str, tuple[int, int]] = {}
        self._locks: dict[str, str] = {}

    async def allow(self, user_id: str) -> bool:
        window = int(self._clock() // WINDOW_SECONDS)
        last_window, count = self._counts.get(user_id, (window, 0))
        count = count + 1 if last_window == window else 1
        self._counts[user_id] = (window, count)
        return count <= self._per_hour

    async def acquire(self, user_id: str) -> str | None:
        if user_id in self._locks:
            return None
        self._locks[user_id] = token = secrets.token_hex(16)
        return token

    async def release(self, user_id: str, token: str) -> None:
        if self._locks.get(user_id) == token:
            del self._locks[user_id]


class RedisLimits:
    """Fails open: if Redis can't be reached the transcription goes ahead and a warning is
    logged. An outage mustn't stop people practising, and billing stays correct in MySQL."""

    def __init__(
        self,
        client: redis.asyncio.Redis,
        per_hour: int,
        prefix: str = "umless",
        lock_seconds: int = LOCK_SECONDS,
    ) -> None:
        self._client = client
        self._per_hour = per_hour
        self._prefix = prefix
        self._lock_seconds = lock_seconds

    async def allow(self, user_id: str) -> bool:
        window = int(time.time() // WINDOW_SECONDS)
        key = f"{self._prefix}:rate:{user_id}:{window}"
        try:
            async with self._client.pipeline(transaction=True) as pipe:
                count, _ = await pipe.incr(key).expire(key, WINDOW_SECONDS, nx=True).execute()
        except redis.RedisError as exc:
            logger.warning("Redis unavailable, skipping the hourly cap: %s", exc)
            return True
        return count <= self._per_hour

    async def acquire(self, user_id: str) -> str | None:
        """An empty token means Redis was down and no lock is held."""
        token = secrets.token_hex(16)
        try:
            taken = await self._client.set(
                f"{self._prefix}:lock:{user_id}", token, nx=True, ex=self._lock_seconds
            )
        except redis.RedisError as exc:
            logger.warning("Redis unavailable, skipping the one-at-a-time lock: %s", exc)
            return ""
        return token if taken else None

    async def release(self, user_id: str, token: str) -> None:
        if not token:
            return
        try:
            await self._client.eval(RELEASE_SCRIPT, 1, f"{self._prefix}:lock:{user_id}", token)
        except redis.RedisError as exc:
            # The lock expires on its own after lock_seconds.
            logger.warning("Redis unavailable, couldn't release the lock: %s", exc)
