"""The site-wide daily cap on free-trial time (launch roadmap, Phase 7 step 2).

Every new account's free minutes are paid Deepgram calls, so scripted sign-ups could run up the
bill without limit. This caps the free seconds all users together may use each day (India time:
the day resets at midnight IST). Paying users never hit it. Seconds are reserved before Deepgram
is called and given back if the take isn't charged, so the cap counts what was really used.

Redis when REDIS_URL is set (shared by every worker); in memory otherwise. Like the transcription
limits (docs/adr/0006-redis-limits.md) it fails open: a Redis outage mustn't stop people practising.
"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Callable, Protocol

import redis
import redis.asyncio

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))
# Long enough to outlive its day in any time zone; the key name carries the date.
KEY_SECONDS = 2 * 24 * 3600

# Adds the seconds only if the day's total stays within the cap. Returns 1 if reserved, 0 if not.
RESERVE_SCRIPT = """
local used = tonumber(redis.call('get', KEYS[1]) or '0')
if used + tonumber(ARGV[1]) > tonumber(ARGV[2]) then
    return 0
end
redis.call('incrby', KEYS[1], ARGV[1])
redis.call('expire', KEYS[1], ARGV[3])
return 1
"""

# Gives seconds back without going below 0, and never creates a key (a take that straddled
# midnight gives nothing back to the new day).
RELEASE_SCRIPT = """
local used = redis.call('get', KEYS[1])
if not used then
    return 0
end
local left = math.max(0, tonumber(used) - tonumber(ARGV[1]))
redis.call('set', KEYS[1], left, 'KEEPTTL')
return left
"""


def ist_day(now: float) -> str:
    return datetime.fromtimestamp(now, IST).strftime("%Y-%m-%d")


class FreeTimeCap(Protocol):
    async def reserve(self, seconds: int) -> bool:
        """Hold `seconds` of today's free time; False (nothing held) when that would pass the cap."""
        ...

    async def release(self, seconds: int) -> None:
        """Give back seconds reserved for a take that wasn't charged."""
        ...


class InMemoryFreeTimeCap:
    """Local use and tests (one process)."""

    def __init__(self, seconds_per_day: int, clock: Callable[[], float] = time.time) -> None:
        self._limit = seconds_per_day
        self._clock = clock
        self._lock = threading.Lock()
        self._day = ""
        self._used = 0
        self._alerted = ""

    async def reserve(self, seconds: int) -> bool:
        with self._lock:
            day = ist_day(self._clock())
            if day != self._day:
                self._day, self._used = day, 0
            if self._used + seconds > self._limit:
                first = self._alerted != day
                self._alerted = day
            else:
                self._used += seconds
                return True
        log_refusal(day, self._limit, first)
        return False

    async def release(self, seconds: int) -> None:
        with self._lock:
            self._used = max(0, self._used - seconds)

    @property
    def used(self) -> int:
        return self._used


class RedisFreeTimeCap:
    def __init__(
        self,
        client: redis.asyncio.Redis,
        seconds_per_day: int,
        prefix: str = "umless:free",
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._client = client
        self._limit = seconds_per_day
        self._prefix = prefix
        self._clock = clock

    def _key(self, day: str) -> str:
        return f"{self._prefix}:used:{day}"

    async def reserve(self, seconds: int) -> bool:
        day = ist_day(self._clock())
        try:
            reserved = await self._client.eval(RESERVE_SCRIPT, 1, self._key(day), seconds, self._limit, KEY_SECONDS)
            if reserved:
                return True
            # One ERROR a day, however many refusals: the first worker to set the flag logs it.
            first = await self._client.set(f"{self._prefix}:alerted:{day}", 1, nx=True, ex=KEY_SECONDS)
        except redis.RedisError as exc:
            logger.warning("Redis unavailable, skipping the daily free-time cap: %s", exc)
            return True
        log_refusal(day, self._limit, bool(first))
        return False

    async def release(self, seconds: int) -> None:
        key = self._key(ist_day(self._clock()))
        try:
            await self._client.eval(RELEASE_SCRIPT, 1, key, seconds)
        except redis.RedisError as exc:
            logger.warning("Redis unavailable, couldn't give back %d free seconds: %s", seconds, exc)


def log_refusal(day: str, limit: int, first: bool) -> None:
    if first:
        # ERROR, which alerts: either real demand outgrew the cap, or someone is farming free accounts.
        logger.error(
            "Daily free-time cap reached for %s (IST): %d min used; free transcriptions are paused until midnight IST",
            day,
            limit // 60,
        )
    else:
        logger.info("Refused a free transcription: the daily free-time cap for %s is reached", day)
