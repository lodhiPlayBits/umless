"""The site-wide daily cap on free-trial time (app/free_cap.py; launch roadmap Phase 7 step 2)."""

import logging
from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.billing.store import InMemoryBillingStore
from app.config import Settings
from app.free_cap import IST, InMemoryFreeTimeCap, RedisFreeTimeCap, ist_day
from app.transcription import Transcript, TranscriptionError, Word
from app.transcription.router import get_transcriber
from tests.test_billing import AUDIO, NeverCalledTranscriber, metered_app
from tests.test_limits import redis_client  # noqa: F401 (fixture)

USER = "local"
LOGGER = "app.free_cap"


def at(text: str) -> float:
    """A clock reading at this India time, e.g. "2026-11-01 23:59"."""
    return datetime.strptime(text, "%Y-%m-%d %H:%M").replace(tzinfo=IST).timestamp()


class Clock:
    def __init__(self, text):
        self.now = at(text)

    def __call__(self):
        return self.now


class OneWord:
    def __init__(self):
        self.calls = 0

    async def transcribe(self, audio, content_type):
        self.calls += 1
        return Transcript(words=[Word(word="hi", punctuated_word="Hi.", start=0.0, end=0.4, confidence=0.9)], duration_seconds=60.0)


class Failing:
    async def transcribe(self, audio, content_type):
        raise TranscriptionError("Deepgram returned HTTP 500")


class Silent:
    async def transcribe(self, audio, content_type):
        return Transcript(words=[], duration_seconds=5.0)


@contextmanager
def client_for(tmp_path, cap_seconds, seconds=60, transcriber=None, free=1200, paid=0):
    """A started metered client whose user has `free` and `paid` seconds, and the app's cap."""
    app = metered_app(tmp_path)
    app.state.measure_audio = lambda audio: seconds
    transcriber = transcriber or OneWord()
    app.dependency_overrides[get_transcriber] = lambda: transcriber
    with TestClient(app, base_url="http://localhost") as client:
        # The lifespan creates the billing store, so the balance is set once the client is started.
        app.state.free_cap = cap = InMemoryFreeTimeCap(cap_seconds)
        store: InMemoryBillingStore = app.state.billing
        store._balances[USER] = replace(store.balance(USER), free_seconds_left=free, seconds_left=paid)
        yield client, cap


def transcribe(client):
    return client.post("/api/transcriptions", content=AUDIO, headers={"Content-Type": "audio/webm"})


# --- the cap itself --------------------------------------------------------------------


@pytest.mark.anyio
async def test_reserves_until_the_cap_then_refuses():
    cap = InMemoryFreeTimeCap(100, clock=Clock("2026-11-01 10:00"))
    assert await cap.reserve(60)
    assert await cap.reserve(40)
    assert not await cap.reserve(1)
    assert cap.used == 100


@pytest.mark.anyio
async def test_released_seconds_can_be_used_again():
    cap = InMemoryFreeTimeCap(100, clock=Clock("2026-11-01 10:00"))
    assert await cap.reserve(100)
    await cap.release(30)
    assert await cap.reserve(30)
    assert not await cap.reserve(1)


@pytest.mark.anyio
async def test_the_day_resets_at_midnight_india_time():
    clock = Clock("2026-11-01 23:59")
    cap = InMemoryFreeTimeCap(100, clock=clock)
    assert await cap.reserve(100)
    assert not await cap.reserve(1)
    clock.now = at("2026-11-02 00:00")
    assert await cap.reserve(100)


def test_india_day_is_not_the_utc_day():
    # 00:30 IST on 2 Nov is still 1 Nov in UTC.
    assert ist_day(at("2026-11-02 00:30")) == "2026-11-02"


@pytest.mark.anyio
async def test_a_zero_cap_pauses_free_time_completely():
    assert not await InMemoryFreeTimeCap(0).reserve(1)


@pytest.mark.anyio
async def test_the_first_refusal_each_day_logs_an_error_and_later_ones_info(caplog):
    caplog.set_level(logging.INFO, logger=LOGGER)
    clock = Clock("2026-11-01 10:00")
    cap = InMemoryFreeTimeCap(0, clock=clock)
    for _ in range(3):
        await cap.reserve(10)
    clock.now = at("2026-11-02 10:00")
    await cap.reserve(10)

    levels = [r.levelname for r in caplog.records if r.name == LOGGER]
    assert levels == ["ERROR", "INFO", "INFO", "ERROR"]
    assert "Daily free-time cap reached for 2026-11-01" in caplog.records[0].getMessage()


# --- in the transcription route --------------------------------------------------------


def test_a_free_take_over_the_cap_is_503_before_deepgram(tmp_path, contract_schema):
    with client_for(tmp_path, cap_seconds=59, transcriber=NeverCalledTranscriber()) as (client, cap):
        response = transcribe(client)

    assert response.status_code == 503
    assert response.json()["code"] == "free_time_paused"
    assert "after midnight" in response.json()["detail"]
    contract_schema.find_operation_by_id("createTranscription").validate_response(response)
    assert cap.used == 0
    # Nothing was charged.
    assert client.app.state.billing.balance(USER).free_seconds_left == 1200


def test_free_takes_count_against_the_cap(tmp_path):
    with client_for(tmp_path, cap_seconds=120, seconds=60) as (client, cap):
        assert transcribe(client).status_code == 200
        assert transcribe(client).status_code == 200
        assert transcribe(client).status_code == 503
    assert cap.used == 120


def test_seconds_are_rounded_up_like_the_charge(tmp_path):
    with client_for(tmp_path, cap_seconds=1000, seconds=60.2) as (client, cap):
        transcribe(client)
    assert cap.used == 61


def test_a_paying_user_is_never_stopped_or_counted(tmp_path):
    with client_for(tmp_path, cap_seconds=0, free=1200, paid=3600) as (client, cap):
        assert transcribe(client).status_code == 200
    assert cap.used == 0


def test_a_take_that_needs_some_free_time_is_capped(tmp_path):
    # 30 s of paid time can't cover a 60 s take, so its 60 free seconds (used first) count.
    with client_for(tmp_path, cap_seconds=59, free=1200, paid=30) as (client, cap):
        assert transcribe(client).status_code == 503


def test_only_the_free_part_of_a_take_is_counted(tmp_path):
    # 20 s free left, then 50 s paid (not enough alone): only 20 s of free time is used and counted.
    with client_for(tmp_path, cap_seconds=1000, free=20, paid=50) as (client, cap):
        assert transcribe(client).status_code == 200
    assert cap.used == 20


def test_a_failed_transcription_gives_its_seconds_back(tmp_path):
    with client_for(tmp_path, cap_seconds=1000, transcriber=Failing()) as (client, cap):
        assert transcribe(client).status_code == 502
    assert cap.used == 0


def test_an_uncharged_short_silent_take_gives_its_seconds_back(tmp_path):
    with client_for(tmp_path, cap_seconds=1000, seconds=5, transcriber=Silent()) as (client, cap):
        assert transcribe(client).status_code == 200
    assert cap.used == 0


def test_an_unmetered_server_has_no_cap(tmp_path):
    from app.main import create_app

    app = create_app(Settings(transcriber="fake", data_file=tmp_path / "q.json", free_minutes_per_day=0))
    with TestClient(app, base_url="http://localhost") as client:
        assert transcribe(client).status_code == 200


# --- settings --------------------------------------------------------------------------


def test_the_cap_defaults_to_600_minutes(monkeypatch):
    monkeypatch.delenv("UMLESS_FREE_MINUTES_PER_DAY", raising=False)
    assert Settings.from_env(env_files=()).free_minutes_per_day == 600


@pytest.mark.parametrize("value, minutes", [("0", 0), ("1200", 1200)])
def test_the_cap_is_read_from_the_environment(monkeypatch, value, minutes):
    monkeypatch.setenv("UMLESS_FREE_MINUTES_PER_DAY", value)
    assert Settings.from_env(env_files=()).free_minutes_per_day == minutes


@pytest.mark.parametrize("value", ["-1", "lots", "1.5"])
def test_a_bad_cap_is_refused(monkeypatch, value):
    monkeypatch.setenv("UMLESS_FREE_MINUTES_PER_DAY", value)
    with pytest.raises(ValueError, match="UMLESS_FREE_MINUTES_PER_DAY"):
        Settings.from_env(env_files=())


# --- Redis (UMLESS_TEST_REDIS_URL) -----------------------------------------------------


@pytest.mark.anyio
async def test_redis_cap_reserves_releases_and_refuses(redis_client, caplog):  # noqa: F811
    caplog.set_level(logging.INFO, logger=LOGGER)
    cap = RedisFreeTimeCap(redis_client, 100, prefix="umless:test:free", clock=Clock("2026-11-01 10:00"))
    assert await cap.reserve(60)
    assert not await cap.reserve(41)
    await cap.release(20)
    assert await cap.reserve(60)
    assert not await cap.reserve(1)
    assert not await cap.reserve(1)
    assert [r.levelname for r in caplog.records if r.name == LOGGER] == ["ERROR", "INFO", "INFO"]


@pytest.mark.anyio
async def test_redis_release_never_goes_below_zero_or_into_a_new_day(redis_client):  # noqa: F811
    clock = Clock("2026-11-01 23:59")
    cap = RedisFreeTimeCap(redis_client, 100, prefix="umless:test:free", clock=clock)
    assert await cap.reserve(50)
    clock.now = at("2026-11-02 00:01")
    await cap.release(50)  # a take that straddled midnight
    assert await redis_client.get("umless:test:free:used:2026-11-02") is None
    await cap.release(500)
    assert await cap.reserve(100)


@pytest.mark.anyio
async def test_redis_down_fails_open(caplog):
    import redis.asyncio

    caplog.set_level(logging.WARNING, logger=LOGGER)
    client = redis.asyncio.from_url("redis://127.0.0.1:1/0", socket_connect_timeout=0.2)
    cap = RedisFreeTimeCap(client, 0)
    assert await cap.reserve(10)
    await cap.release(10)
    assert "skipping the daily free-time cap" in caplog.text
    await client.aclose()
