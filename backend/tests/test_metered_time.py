"""Free time by the minute, and the server-side length check (docs/roadmap/2026-11-01-metered-free-time.md)."""

import io
from dataclasses import replace

import av
import pytest
from fastapi.testclient import TestClient

from app.billing.packs import FREE_SECONDS
from app.billing.store import Balance, InMemoryBillingStore
from app.transcription.duration import UnreadableAudio, audio_seconds
from app.transcription.router import get_transcriber
from tests.test_billing import AUDIO, NeverCalledTranscriber, SilentTranscriber, metered_app, pay

USER = "local"


class OneWordTranscriber:
    def __init__(self):
        self.calls = 0

    async def transcribe(self, audio, content_type):
        from app.transcription import Transcript, Word

        self.calls += 1
        return Transcript(words=[Word(word="hi", punctuated_word="Hi.", start=0.0, end=0.4, confidence=0.9)], duration_seconds=999.0)


def client_for(tmp_path, seconds, transcriber=None):
    app = metered_app(tmp_path)
    app.state.measure_audio = lambda audio: seconds  # the recording's measured length
    transcriber = transcriber or OneWordTranscriber()
    app.dependency_overrides[get_transcriber] = lambda: transcriber
    return TestClient(app, base_url="http://localhost"), transcriber


def transcribe(client):
    return client.post("/api/transcriptions", content=AUDIO, headers={"Content-Type": "audio/webm"})


def account(client):
    return client.get("/api/account").json()


def set_balance(client, free, paid=0):
    store: InMemoryBillingStore = client.app.state.billing
    store._balances[USER] = replace(store.balance(USER), free_seconds_left=free, seconds_left=paid)


def test_a_new_account_has_20_free_minutes(tmp_path):
    client, _ = client_for(tmp_path, 10)
    with client:
        assert (account(client)["free_seconds_left"], account(client)["seconds_left"]) == (FREE_SECONDS, 0)


def test_a_take_uses_exactly_its_measured_length_rounded_up(tmp_path):
    client, transcriber = client_for(tmp_path, 61.2)  # Deepgram says 999 s; the measurement counts
    with client:
        assert transcribe(client).status_code == 200
        assert (account(client)["free_seconds_left"], account(client)["seconds_left"]) == (FREE_SECONDS - 62, 0)
    assert transcriber.calls == 1


def test_free_minutes_run_out_into_paid_time(tmp_path):
    client, _ = client_for(tmp_path, 50)
    with client:
        pay(client)  # +3600 paid
        set_balance(client, free=30, paid=3600)
        assert transcribe(client).status_code == 200
        assert (account(client)["free_seconds_left"], account(client)["seconds_left"]) == (0, 3580)


def test_using_only_free_minutes_doesnt_count_as_paid_use(tmp_path):
    client, _ = client_for(tmp_path, 50)
    with client:
        pay(client)
        assert transcribe(client).status_code == 200  # all from the 90 free minutes
        assert client.get("/api/payments").json()["items"][0]["refundable"] is True


def test_a_recording_longer_than_the_time_left_is_402_before_deepgram(tmp_path):
    client, _ = client_for(tmp_path, 61, NeverCalledTranscriber())
    with client:
        set_balance(client, free=20, paid=10)
        response = transcribe(client)

        assert response.status_code == 402
        assert response.json() == {
            "code": "payment_required",
            "detail": "This recording is 1 min 1 s; you have 30 s left. Buy more practice time to transcribe it.",
        }
        assert (account(client)["free_seconds_left"], account(client)["seconds_left"]) == (20, 10)


def test_a_recording_that_fits_exactly_is_allowed(tmp_path):
    client, _ = client_for(tmp_path, 29.4)
    with client:
        set_balance(client, free=20, paid=10)
        assert transcribe(client).status_code == 200
        assert (account(client)["free_seconds_left"], account(client)["seconds_left"]) == (0, 0)


@pytest.mark.parametrize("seconds", [602.5, 3600, 7200])
def test_over_10_minutes_is_refused_before_deepgram(tmp_path, seconds):
    client, _ = client_for(tmp_path, seconds, NeverCalledTranscriber())
    with client:
        response = transcribe(client)
        assert response.status_code == 400
        assert response.json()["code"] == "recording_too_long"
        assert account(client)["free_seconds_left"] == FREE_SECONDS


def test_exactly_10_minutes_is_allowed(tmp_path):
    client, _ = client_for(tmp_path, 600.4)
    with client:
        assert transcribe(client).status_code == 200


def test_unreadable_audio_is_400_before_deepgram(tmp_path):
    app = metered_app(tmp_path)
    app.state.measure_audio = audio_seconds  # the real measurement, on bytes that aren't audio
    app.dependency_overrides[get_transcriber] = lambda: NeverCalledTranscriber()
    with TestClient(app, base_url="http://localhost") as client:
        response = transcribe(client)
        assert response.status_code == 400
        assert response.json() == {"code": "unreadable_audio", "detail": "This recording couldn't be read. Record it again."}


def test_a_long_take_with_no_words_is_charged(tmp_path):
    # Regression: silent takes were free for the user, but Deepgram bills them anyway, so
    # 10 minutes of silence 30 times an hour cost umless 300 minutes and the user nothing.
    client, _ = client_for(tmp_path, 45, SilentTranscriber())
    with client:
        assert transcribe(client).status_code == 200
        assert account(client)["free_seconds_left"] == FREE_SECONDS - 45


@pytest.mark.parametrize("seconds, charged", [(14.9, 0), (15, 15)])
def test_a_short_take_with_no_words_is_free(tmp_path, seconds, charged):
    # A muted or failed mic: under 15 s with no words isn't charged.
    client, _ = client_for(tmp_path, seconds, SilentTranscriber())
    with client:
        assert transcribe(client).status_code == 200
        assert account(client)["free_seconds_left"] == FREE_SECONDS - charged


def test_charging_takes_free_first_then_paid_in_the_store():
    store = InMemoryBillingStore()
    store._balances[USER] = Balance(100, 500)

    assert store.charge(USER, 40.2) == Balance(59, 500)
    assert store.balance(USER).last_paid_use_at is None
    assert store.charge(USER, 100) == Balance(0, 459)
    assert store.balance(USER).last_paid_use_at is not None
    assert store.charge(USER, 10_000) == Balance(0, 0)  # never below zero


def test_no_paid_use_is_recorded_when_there_was_no_paid_time():
    # Free time running out on an account with no paid time isn't a "paid use" (it would block
    # a refund of a pack bought later in the same second).
    store = InMemoryBillingStore()
    store._balances[USER] = Balance(30, 0)

    assert store.charge(USER, 100) == Balance(0, 0)
    assert store.balance(USER).last_paid_use_at is None


# --- measuring real audio ----------------------------------------------------------------


def make_audio(fmt, codec, seconds, options=None):
    """A silent recording of `seconds`, encoded like a browser would."""
    buf = io.BytesIO()
    with av.open(buf, "w", format=fmt, options=options or {}) as out:
        stream = out.add_stream(codec, rate=48000 if codec != "libmp3lame" else 44100)
        stream.layout = "mono"
        rate = stream.codec_context.sample_rate
        frame_size = stream.codec_context.frame_size or 1024
        done = 0
        while done < seconds * rate:
            frame = av.AudioFrame(format=stream.format.name, layout="mono", samples=frame_size)
            for plane in frame.planes:
                plane.update(bytes(plane.buffer_size))
            frame.sample_rate = rate
            frame.pts = done
            for packet in stream.encode(frame):
                out.mux(packet)
            done += frame_size
        for packet in stream.encode(None):
            out.mux(packet)
    return buf.getvalue()


@pytest.mark.parametrize(
    "fmt, codec, options",
    [
        ("webm", "libopus", {"live": "1"}),  # like Chrome's MediaRecorder: no duration in the header
        ("webm", "libopus", None),
        ("ogg", "libopus", None),
        ("mp4", "aac", None),
        ("wav", "pcm_s16le", None),
        ("mp3", "libmp3lame", None),
    ],
)
def test_measuring_every_accepted_format(fmt, codec, options):
    assert audio_seconds(make_audio(fmt, codec, 7.5, options)) == pytest.approx(7.5, abs=0.1)


def test_a_long_recording_measures_long():
    assert audio_seconds(make_audio("webm", "libopus", 65, {"live": "1"})) == pytest.approx(65, abs=0.1)


@pytest.mark.parametrize("data", [AUDIO, b"", b"RIFF" + b"\x00" * 40, b"\x1aE\xdf\xa3" + b"\x00" * 64])
def test_anything_else_is_unreadable(data):
    with pytest.raises(UnreadableAudio):
        audio_seconds(data)


def test_migrations_0007_and_0008_convert_then_cap_free_time(mysql_engine):
    # 0007: each free transcription left became 30 minutes; 0008: free time is capped at 20 minutes.
    from alembic import command
    from sqlalchemy import text

    from tests.conftest import alembic_config

    config = alembic_config(mysql_engine.url)
    command.downgrade(config, "0006")
    try:
        with mysql_engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO accounts (user_id, free_transcriptions_left, seconds_left, created_at) "
                "VALUES ('mig_three', 3, 100, NOW()), ('mig_none', 0, 3600, NOW())"
            ))
        command.upgrade(config, "0007")
        with mysql_engine.begin() as conn:
            assert dict(conn.execute(text("SELECT user_id, free_seconds_left FROM accounts WHERE user_id LIKE 'mig_%'")).all()) == {"mig_three": 5400, "mig_none": 0}
            conn.execute(text("INSERT INTO accounts (user_id, free_transcriptions_left, free_seconds_left, seconds_left, created_at) VALUES ('mig_some', 0, 600, 0, NOW())"))
        command.upgrade(config, "head")
        with mysql_engine.connect() as conn:
            rows = dict(conn.execute(text("SELECT user_id, free_seconds_left FROM accounts WHERE user_id LIKE 'mig_%'")).all())
        assert rows == {"mig_three": 1200, "mig_none": 0, "mig_some": 600}
    finally:
        command.upgrade(config, "head")
        with mysql_engine.begin() as conn:
            conn.execute(text("DELETE FROM accounts WHERE user_id LIKE 'mig_%'"))
