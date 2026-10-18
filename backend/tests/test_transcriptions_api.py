import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app, get_transcriber
from app.transcription import Transcript, TranscriptionError, Word

SECRET = "sk-secret-key-123"
AUDIO = b"\x00\x01fake-audio-bytes\xff"


class RecordingTranscriber:
    def __init__(self):
        self.calls = []

    async def transcribe(self, audio, content_type):
        self.calls.append((audio, content_type))
        return Transcript(
            text="hello um world",
            words=[Word(word="hello", start=0.0, end=0.5, confidence=0.9)],
            duration_seconds=1.5,
        )


class FailingTranscriber:
    async def transcribe(self, audio, content_type):
        raise TranscriptionError("upstream failed")


def make_client(transcriber, settings=None):
    app = create_app(settings or Settings(transcriber="fake"))
    app.dependency_overrides[get_transcriber] = lambda: transcriber
    return TestClient(app)


def post(client, body=AUDIO, content_type="audio/webm"):
    headers = {"Content-Type": content_type} if content_type is not None else {}
    return client.post("/api/transcriptions", content=body, headers=headers)


def test_valid_upload_returns_transcript_json():
    response = post(make_client(RecordingTranscriber()))

    assert response.status_code == 200
    assert response.json() == {
        "text": "hello um world",
        "words": [{"word": "hello", "start": 0.0, "end": 0.5, "confidence": 0.9}],
        "duration_seconds": 1.5,
    }


def test_transcriber_receives_exact_bytes_and_content_type():
    t = RecordingTranscriber()
    post(make_client(t), body=AUDIO, content_type="audio/wav")

    assert t.calls == [(AUDIO, "audio/wav")]


@pytest.mark.parametrize(
    "content_type",
    [
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/wav",
        "audio/mpeg",
        "AUDIO/WEBM",
        "audio/webm;codecs=opus",
        "audio/webm; codecs=opus",
    ],
)
def test_accepted_content_types(content_type):
    response = post(make_client(RecordingTranscriber()), content_type=content_type)

    assert response.status_code == 200


def test_content_type_with_parameters_is_passed_to_transcriber():
    t = RecordingTranscriber()
    post(make_client(t), content_type="audio/webm;codecs=opus")

    assert len(t.calls) == 1
    assert t.calls[0][1].lower().startswith("audio/webm")


def test_null_duration_is_serialized_as_null():
    class NoDuration:
        async def transcribe(self, audio, content_type):
            return Transcript(text="um", words=[], duration_seconds=None)

    response = post(make_client(NoDuration()))

    assert response.status_code == 200
    assert response.json()["duration_seconds"] is None


@pytest.mark.parametrize(
    "content_type", ["text/plain", "video/webm", "application/octet-stream"]
)
def test_unsupported_content_type_returns_415(content_type):
    t = RecordingTranscriber()
    response = post(make_client(t), content_type=content_type)

    assert response.status_code == 415
    assert isinstance(response.json()["detail"], str)
    assert t.calls == []


def test_missing_content_type_returns_415():
    t = RecordingTranscriber()
    client = make_client(t)
    request = client.build_request("POST", "/api/transcriptions", content=AUDIO)
    request.headers.pop("content-type", None)
    response = client.send(request)

    assert response.status_code == 415
    assert isinstance(response.json()["detail"], str)
    assert t.calls == []


def test_empty_body_returns_400():
    t = RecordingTranscriber()
    response = post(make_client(t), body=b"")

    assert response.status_code == 400
    assert isinstance(response.json()["detail"], str)
    assert t.calls == []


def test_body_over_limit_returns_413_without_calling_transcriber():
    t = RecordingTranscriber()
    client = make_client(t, Settings(transcriber="fake", max_body_bytes=1024))
    response = post(client, body=b"a" * 2000)

    assert response.status_code == 413
    assert isinstance(response.json()["detail"], str)
    assert t.calls == []


def test_body_at_limit_is_accepted():
    t = RecordingTranscriber()
    client = make_client(t, Settings(transcriber="fake", max_body_bytes=1024))
    response = post(client, body=b"a" * 1024)

    assert response.status_code == 200


def test_transcription_error_returns_502_without_leaking_key():
    settings = Settings(transcriber="deepgram", deepgram_api_key=SECRET)
    response = post(make_client(FailingTranscriber(), settings))

    assert response.status_code == 502
    assert isinstance(response.json()["detail"], str)
    assert SECRET not in response.text


@pytest.mark.parametrize("key", [None, ""])
def test_deepgram_without_api_key_returns_503(key):
    client = TestClient(
        create_app(Settings(transcriber="deepgram", deepgram_api_key=key))
    )
    response = post(client)

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert "key" in detail.lower()


def test_fake_transcriber_without_override_returns_um_text(client):
    response = post(client)

    assert response.status_code == 200
    assert "um" in response.json()["text"]
