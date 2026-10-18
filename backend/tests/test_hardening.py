"""Regression tests for fixes from the Phase 1 code and security reviews."""

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app, get_transcriber
from app.transcription import DeepgramTranscriber, Transcript, TranscriptionError

AUDIO = b"fake-audio"


class RecordingTranscriber:
    def __init__(self):
        self.calls = []

    async def transcribe(self, audio, content_type):
        self.calls.append((audio, content_type))
        return Transcript(text="um", words=[], duration_seconds=None)


def make_client(transcriber, settings=None):
    app = create_app(settings or Settings(transcriber="fake"))
    app.dependency_overrides[get_transcriber] = lambda: transcriber
    return TestClient(app)


@pytest.mark.anyio
async def test_null_metadata_parses_with_no_duration():
    body = {"metadata": None, "results": {"channels": [{"alternatives": [{"transcript": "um"}]}]}}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=body))

    result = await DeepgramTranscriber("key", transport=transport).transcribe(AUDIO, "audio/wav")

    assert result == Transcript(text="um", words=[], duration_seconds=None)


@pytest.mark.anyio
async def test_non_dict_alternative_raises_transcription_error():
    body = {"results": {"channels": [{"alternatives": ["not-a-dict"]}]}}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=body))
    with pytest.raises(TranscriptionError):
        await DeepgramTranscriber("key", transport=transport).transcribe(AUDIO, "audio/wav")


@pytest.mark.anyio
async def test_non_ascii_key_raises_transcription_error():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={}))
    with pytest.raises(TranscriptionError):
        await DeepgramTranscriber("key”", transport=transport).transcribe(AUDIO, "audio/wav")


@pytest.mark.parametrize(
    "header", ["AUDIO/WEBM;codecs=opus", b"audio/webm; x=\xe9"], ids=["upper-with-codec", "non-ascii-param"]
)
def test_only_normalized_base_type_is_forwarded(header):
    t = RecordingTranscriber()
    response = make_client(t).post(
        "/api/transcriptions", content=AUDIO, headers={"Content-Type": header}
    )

    assert response.status_code == 200
    assert t.calls == [(AUDIO, "audio/webm")]


def test_streamed_body_over_limit_returns_413_without_content_length():
    t = RecordingTranscriber()
    client = make_client(t, Settings(transcriber="fake", max_body_bytes=1024))

    def chunks():
        for _ in range(4):
            yield b"a" * 512

    response = client.post(
        "/api/transcriptions", content=chunks(), headers={"Content-Type": "audio/webm"}
    )

    assert response.status_code == 413
    assert t.calls == []


def test_get_transcriber_passes_configured_timeout():
    settings = Settings(transcriber="deepgram", deepgram_api_key="k", deepgram_timeout_seconds=12.5)

    transcriber = get_transcriber(settings)

    assert isinstance(transcriber, DeepgramTranscriber)
    assert transcriber._timeout == 12.5


def test_transcriber_setting_is_normalized(monkeypatch):
    monkeypatch.setenv("UMLESS_TRANSCRIBER", " FAKE ")

    assert Settings.from_env(env_files=()).transcriber == "fake"


def test_unknown_transcriber_setting_fails_at_startup(monkeypatch):
    monkeypatch.setenv("UMLESS_TRANSCRIBER", "deepgrma")

    with pytest.raises(ValueError, match="UMLESS_TRANSCRIBER"):
        Settings.from_env(env_files=())


def test_env_file_precedence(monkeypatch, tmp_path):
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    backend_env = tmp_path / "backend.env"
    root_env = tmp_path / "root.env"
    backend_env.write_text("DEEPGRAM_API_KEY=from-backend\n", encoding="utf-8")
    root_env.write_text("DEEPGRAM_API_KEY=from-root\n", encoding="utf-8")

    assert Settings.from_env(env_files=(backend_env, root_env)).deepgram_api_key == "from-backend"
    assert Settings.from_env(env_files=(root_env,)).deepgram_api_key == "from-root"

    monkeypatch.setenv("DEEPGRAM_API_KEY", "from-environment")
    assert Settings.from_env(env_files=(backend_env, root_env)).deepgram_api_key == "from-environment"


def test_settings_repr_hides_api_key():
    assert "sk-secret" not in repr(Settings(deepgram_api_key="sk-secret"))
