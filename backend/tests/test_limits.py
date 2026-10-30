"""Transcription limits: one at a time per user, and a cap per hour (docs/adr/0006-redis-limits.md)."""

import asyncio
import os

import httpx
import pytest

from app.config import Settings
from app.limits import InMemoryLimits, RedisLimits
from app.main import create_app
from app.transcription import Transcript, Word
from app.transcription.router import get_transcriber

AUDIO = b"\x00\x01fake-audio-bytes\xff"
pytestmark = pytest.mark.anyio


class GatedTranscriber:
    """The first call waits until `release` is set; later calls answer at once."""

    def __init__(self):
        self.calls = 0
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def transcribe(self, audio, content_type):
        self.calls += 1
        if self.calls == 1:
            self.started.set()
            await self.release.wait()
        return Transcript(
            words=[Word(word="hi", punctuated_word="Hi.", start=0.0, end=0.4, confidence=0.9)],
            duration_seconds=0.5,
        )


def make_app(transcriber, **settings):
    app = create_app(Settings(transcriber="fake", **settings))
    app.dependency_overrides[get_transcriber] = lambda: transcriber
    return app


def async_client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost")


async def post(client):
    return await client.post("/api/transcriptions", content=AUDIO, headers={"Content-Type": "audio/webm"})


async def test_a_second_transcription_while_one_runs_is_refused_before_deepgram():
    # Regression: the balance is checked before the Deepgram call and charged after it, so
    # parallel uploads all passed the check and all ran as paid calls.
    transcriber = GatedTranscriber()
    async with async_client(make_app(transcriber)) as client:
        first = asyncio.create_task(post(client))
        await asyncio.wait_for(transcriber.started.wait(), 5)

        second = await post(client)
        transcriber.release.set()
        first = await first

    assert second.status_code == 409
    assert second.json() == {
        "code": "transcription_in_progress",
        "detail": "Your other recording is still being transcribed. Wait for it to finish.",
    }
    assert first.status_code == 200
    assert transcriber.calls == 1


async def test_the_lock_is_released_after_a_transcription():
    transcriber = GatedTranscriber()
    transcriber.release.set()
    async with async_client(make_app(transcriber)) as client:
        assert (await post(client)).status_code == 200
        assert (await post(client)).status_code == 200


async def test_the_lock_is_released_when_a_transcription_is_refused():
    transcriber = GatedTranscriber()
    transcriber.release.set()
    async with async_client(make_app(transcriber)) as client:
        empty = await client.post("/api/transcriptions", content=b"", headers={"Content-Type": "audio/webm"})
        assert empty.status_code == 400
        assert (await post(client)).status_code == 200


async def test_transcriptions_over_the_hourly_cap_get_429_before_deepgram():
    transcriber = GatedTranscriber()
    transcriber.release.set()
    async with async_client(make_app(transcriber, transcriptions_per_hour=2)) as client:
        responses = [await post(client) for _ in range(3)]

    assert [r.status_code for r in responses] == [200, 200, 429]
    assert responses[2].json() == {
        "code": "rate_limited",
        "detail": "You've made a lot of recordings this hour. Try again in a few minutes.",
    }
    assert transcriber.calls == 2


async def test_a_refused_content_type_doesnt_use_the_hourly_cap():
    transcriber = GatedTranscriber()
    transcriber.release.set()
    async with async_client(make_app(transcriber, transcriptions_per_hour=1)) as client:
        refused = await client.post("/api/transcriptions", content=AUDIO, headers={"Content-Type": "text/plain"})
        assert refused.status_code == 415
        assert (await post(client)).status_code == 200


async def test_in_memory_cap_starts_again_each_hour():
    now = [7200.0]
    limits = InMemoryLimits(per_hour=1, clock=lambda: now[0])

    assert await limits.allow("u")
    assert not await limits.allow("u")
    assert await limits.allow("someone-else")
    now[0] += 3600
    assert await limits.allow("u")


async def test_in_memory_lock_is_per_user():
    limits = InMemoryLimits(per_hour=30)

    token = await limits.acquire("u")
    assert token is not None
    assert await limits.acquire("u") is None
    assert await limits.acquire("someone-else") is not None
    await limits.release("u", token)
    assert await limits.acquire("u") is not None


# --- Redis -------------------------------------------------------------------------------


class BrokenRedis:
    """Every command fails as if Redis were down."""

    def __getattr__(self, name):
        def fail(*args, **kwargs):
            raise __import__("redis").ConnectionError("Redis is down")

        return fail


async def test_redis_down_lets_transcriptions_through(caplog):
    # A Redis outage mustn't stop people practising; billing stays correct in MySQL.
    limits = RedisLimits(BrokenRedis(), per_hour=1)

    assert await limits.allow("u")
    assert await limits.allow("u")
    token = await limits.acquire("u")
    assert token == ""
    await limits.release("u", token)
    assert "Redis" in caplog.text


@pytest.fixture
async def redis_client():
    """A real Redis from UMLESS_TEST_REDIS_URL (e.g. redis://:pw@127.0.0.1:6380/15). Skips
    without it. Only keys under umless:test: are touched."""
    url = os.environ.get("UMLESS_TEST_REDIS_URL")
    if not url:
        pytest.skip("UMLESS_TEST_REDIS_URL is not set")
    import redis.asyncio

    client = redis.asyncio.from_url(url)
    yield client
    async for key in client.scan_iter("umless:test:*"):
        await client.delete(key)
    await client.aclose()


async def test_redis_lock_is_per_user_and_released(redis_client):
    limits = RedisLimits(redis_client, per_hour=30, prefix="umless:test")

    token = await limits.acquire("u")
    assert token
    assert await limits.acquire("u") is None
    assert await limits.acquire("someone-else")
    await limits.release("u", token)
    assert await limits.acquire("u")


async def test_redis_lock_expires(redis_client):
    limits = RedisLimits(redis_client, per_hour=30, prefix="umless:test", lock_seconds=1)

    assert await limits.acquire("u")
    await asyncio.sleep(1.2)
    assert await limits.acquire("u")


async def test_redis_release_never_frees_a_newer_lock(redis_client):
    # The first lock expired and a newer request took it; the old release must leave it.
    limits = RedisLimits(redis_client, per_hour=30, prefix="umless:test", lock_seconds=1)

    old = await limits.acquire("u")
    await asyncio.sleep(1.2)
    new = await limits.acquire("u")
    await limits.release("u", old)

    assert new and await limits.acquire("u") is None


async def test_redis_cap_counts_per_user_and_expires(redis_client):
    limits = RedisLimits(redis_client, per_hour=2, prefix="umless:test")

    assert [await limits.allow("u") for _ in range(3)] == [True, True, False]
    assert await limits.allow("someone-else")
    ttls = [await redis_client.ttl(key) async for key in redis_client.scan_iter("umless:test:rate:*")]
    assert ttls and all(0 < ttl <= 3600 for ttl in ttls)


# --- settings ----------------------------------------------------------------------------

PUBLIC_SERVER = {
    "DB_HOST": "db",
    "DB_USER": "u",
    "DB_PASSWORD": "p",
    "DB_NAME": "n",
    "CLERK_PUBLISHABLE_KEY": "pk_test_c3RhYmxlLWZpc2gtNDkzMC5jbGVyay5hY2NvdW50cy5kZXYk",
    "CLERK_AUTHORIZED_PARTIES": "https://umless.in",
    "OCI_BUCKET": "b",
    "OCI_NAMESPACE": "n",
    "OCI_REGION": "r",
    "RAZORPAY_KEY_ID": "rzp_test_abc",
    "RAZORPAY_KEY_SECRET": "secret",
}


def test_a_database_without_redis_is_refused(monkeypatch):
    for name, value in PUBLIC_SERVER.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("REDIS_URL", raising=False)

    with pytest.raises(ValueError, match="REDIS_URL"):
        Settings.from_env(env_files=())


def test_settings_read_redis_without_showing_the_password(monkeypatch):
    for name, value in PUBLIC_SERVER.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("REDIS_URL", "redis://:hunter2@redis:6379/0")
    monkeypatch.setenv("UMLESS_TRANSCRIPTIONS_PER_HOUR", "12")

    s = Settings.from_env(env_files=())

    assert (s.redis_url, s.transcriptions_per_hour) == ("redis://:hunter2@redis:6379/0", 12)
    assert "hunter2" not in repr(s)


def test_the_hourly_cap_defaults_to_30(monkeypatch):
    monkeypatch.delenv("UMLESS_TRANSCRIPTIONS_PER_HOUR", raising=False)

    assert Settings.from_env(env_files=()).transcriptions_per_hour == 30


@pytest.mark.parametrize("value", ["0", "-1", "lots"])
def test_a_bad_hourly_cap_is_refused(monkeypatch, value):
    monkeypatch.setenv("UMLESS_TRANSCRIPTIONS_PER_HOUR", value)

    with pytest.raises(ValueError, match="UMLESS_TRANSCRIPTIONS_PER_HOUR"):
        Settings.from_env(env_files=())


def test_with_redis_url_the_app_keeps_its_limits_in_redis(redis_client, tmp_path):
    from fastapi.testclient import TestClient

    url = os.environ["UMLESS_TEST_REDIS_URL"]
    transcriber = GatedTranscriber()
    transcriber.release.set()
    app = make_app(transcriber, data_file=tmp_path / "q.json", redis_url=url, transcriptions_per_hour=1)
    try:
        with TestClient(app, base_url="http://localhost") as client:
            assert isinstance(app.state.limits, RedisLimits)
            sent = lambda: client.post(  # noqa: E731
                "/api/transcriptions", content=AUDIO, headers={"Content-Type": "audio/webm"}
            )
            assert [sent().status_code, sent().status_code] == [200, 429]
    finally:
        import redis

        sync = redis.from_url(url)
        for key in sync.scan_iter("umless:*:local*"):
            sync.delete(key)
        sync.close()
