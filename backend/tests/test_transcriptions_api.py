import json
import re
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app, get_transcriber
from app.transcription import (
    DeepgramTranscriber,
    Transcript,
    TranscriptionError,
    Word,
)

OPENAPI = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.yaml"
FIXTURES = Path(__file__).parent / "fixtures"
SECRET = "sk-secret-key-123"
AUDIO = b"\x00\x01fake-audio-bytes\xff"


class RecordingTranscriber:
    def __init__(self):
        self.calls = []

    async def transcribe(self, audio, content_type):
        self.calls.append((audio, content_type))
        return Transcript(
            words=[
                Word(word="hello", punctuated_word="Hello", start=0.0, end=0.5, confidence=0.9),
                Word(word="um", punctuated_word="um,", start=0.5, end=0.8, confidence=0.8),
            ],
            duration_seconds=1.5,
        )


class FailingTranscriber:
    async def transcribe(self, audio, content_type):
        raise TranscriptionError("upstream failed")


def make_client(transcriber, settings=None):
    app = create_app(settings or Settings(transcriber="fake"))
    app.dependency_overrides[get_transcriber] = lambda: transcriber
    return TestClient(app, base_url="http://localhost")


def post(client, body=AUDIO, content_type="audio/webm"):
    headers = {"Content-Type": content_type} if content_type is not None else {}
    return client.post("/api/transcriptions", content=body, headers=headers)


def test_valid_upload_returns_transcript_json():
    response = post(make_client(RecordingTranscriber()))

    assert response.status_code == 200
    assert response.json() == {
        "text": "Hello um,",
        "words": [
            {
                "word": "hello",
                "punctuated_word": "Hello",
                "start": 0.0,
                "end": 0.5,
                "confidence": 0.9,
                "is_filler": False,
                "pause_before_seconds": 0,
            },
            {
                "word": "um",
                "punctuated_word": "um,",
                "start": 0.5,
                "end": 0.8,
                "confidence": 0.8,
                "is_filler": True,
                "pause_before_seconds": 0,
            },
        ],
        "duration_seconds": 1.5,
        "summary": {
            "word_count": 1,
            "filler_count": 1,
            "fillers": [{"word": "um", "count": 1}],
            "words_per_minute": 40,
            "fillers_per_minute": 40.0,
            "pause_count": 0,
            "longest_pause_seconds": None,
        },
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
            return Transcript(words=[], duration_seconds=None)

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
        create_app(Settings(transcriber="deepgram", deepgram_api_key=key)),
        base_url="http://localhost",
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


def test_empty_body_uses_empty_audio_error_body():
    response = post(make_client(RecordingTranscriber()), body=b"")

    assert response.status_code == 400
    assert response.json() == {"code": "empty_audio", "detail": "The recording is empty."}


def test_body_over_limit_uses_audio_too_large_error_body():
    client = make_client(
        RecordingTranscriber(), Settings(transcriber="fake", max_body_bytes=1024)
    )
    response = post(client, body=b"a" * 2000)

    assert response.status_code == 413
    assert response.json() == {
        "code": "audio_too_large",
        "detail": "The recording is larger than 25 MB.",
    }


def test_unsupported_type_uses_unsupported_audio_type_error_body():
    response = post(make_client(RecordingTranscriber()), content_type="text/plain")

    assert response.status_code == 415
    assert response.json() == {
        "code": "unsupported_audio_type",
        "detail": "Unsupported audio type. Send audio/webm, audio/ogg, audio/mp4, audio/wav or audio/mpeg.",
    }


def test_transcription_error_uses_transcription_failed_error_body():
    response = post(make_client(FailingTranscriber()))

    assert response.status_code == 502
    assert response.json() == {
        "code": "transcription_failed",
        "detail": "Transcription failed. Try again in a moment.",
    }


def test_missing_api_key_uses_transcription_unavailable_error_body():
    client = TestClient(
        create_app(Settings(transcriber="deepgram", deepgram_api_key=None)),
        base_url="http://localhost",
    )
    response = post(client)

    assert response.status_code == 503
    assert response.json() == {
        "code": "transcription_unavailable",
        "detail": "Transcription is unavailable because DEEPGRAM_API_KEY is not set.",
    }


# --- Transcript contract (docs/api/openapi.yaml) ---


def schema_required(name):
    text = OPENAPI.read_text(encoding="utf-8")
    block = re.search(rf"^    {name}:\s*\n(.*?)(?=^    \w+:\s*$|\Z)", text, re.S | re.M)
    assert block, f"{name} schema not found in openapi.yaml"
    required = re.search(
        r"^      required:\s*(?:\[(.*?)\]|\n((?:\s+- \w+\s*\n)+))", block.group(1), re.M
    )
    assert required, f"{name} has no required list"
    if required.group(1) is not None:
        items = required.group(1).split(",")
    else:
        items = re.findall(r"- (\w+)", required.group(2))
    return {item.strip() for item in items if item.strip()}


def filler_enum():
    text = OPENAPI.read_text(encoding="utf-8")
    block = re.search(r"^    FillerWord:\s*\n(?:\s+type: \w+\s*\n)?\s+enum: \[(.*?)\]", text, re.M)
    assert block, "FillerWord enum not found in openapi.yaml"
    return {item.strip() for item in block.group(1).split(",")}


def assert_transcript_shape(body):
    assert set(body) == schema_required("Transcript")
    assert isinstance(body["text"], str)
    assert body["duration_seconds"] is None or body["duration_seconds"] >= 0
    for word in body["words"]:
        assert set(word) == schema_required("Word")
        assert word["word"] and word["punctuated_word"]
        assert 0 <= word["confidence"] <= 1
        assert 0 <= word["start"] <= word["end"] <= 86400
        assert isinstance(word["is_filler"], bool)
        assert 0 <= word["pause_before_seconds"] <= 86400
    summary = body["summary"]
    assert set(summary) == schema_required("TranscriptSummary")
    for key in ("word_count", "filler_count", "pause_count"):
        assert isinstance(summary[key], int) and summary[key] >= 0
    for key in ("words_per_minute", "fillers_per_minute"):
        assert summary[key] is None or summary[key] >= 0
    assert summary["longest_pause_seconds"] is None or summary["longest_pause_seconds"] >= 1
    for item in summary["fillers"]:
        assert set(item) == schema_required("FillerCount")
        assert item["word"] in filler_enum()
        assert item["count"] >= 1


def deepgram_word(word, start, end, punctuated=None):
    return {
        "word": word,
        "start": start,
        "end": end,
        "confidence": 0.9,
        "punctuated_word": punctuated or word,
    }


def deepgram_client(body):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=body))
    return make_client(DeepgramTranscriber("key", transport=transport))


def deepgram_body(words, **metadata):
    return {
        "metadata": metadata,
        "results": {"channels": [{"alternatives": [{"transcript": "x", "words": words}]}]},
    }


class FixedTranscriber:
    def __init__(self, transcript):
        self.transcript = transcript

    async def transcribe(self, audio, content_type):
        return self.transcript


def test_fake_transcriber_response_matches_contract(client):
    body = post(client).json()

    assert_transcript_shape(body)
    assert [t for t in body["text"].split() if set(t) != {"."}] == [
        x["punctuated_word"] for x in body["words"]
    ]


def test_silence_returns_zeroed_summary():
    response = post(make_client(FixedTranscriber(Transcript(words=[], duration_seconds=3.0))))

    body = response.json()
    assert response.status_code == 200
    assert_transcript_shape(body)
    assert body["text"] == ""
    assert body["words"] == []
    assert body["summary"] == {
        "word_count": 0,
        "filler_count": 0,
        "fillers": [],
        "words_per_minute": 0,
        "fillers_per_minute": 0.0,
        "pause_count": 0,
        "longest_pause_seconds": None,
    }


def test_silence_without_duration_has_null_rates():
    body = post(make_client(FixedTranscriber(Transcript(words=[], duration_seconds=None)))).json()

    assert body["summary"]["words_per_minute"] is None
    assert body["summary"]["fillers_per_minute"] is None


def test_three_ums_fixture_counts_um_three():
    fixture = json.loads((FIXTURES / "deepgram_three_ums.json").read_text(encoding="utf-8"))

    response = post(deepgram_client(fixture))

    body = response.json()
    assert response.status_code == 200
    assert_transcript_shape(body)
    assert body["summary"]["fillers"] == [{"word": "um", "count": 3}]
    assert body["summary"]["filler_count"] == 3
    huh = next(x for x in body["words"] if x["word"] == "uh-huh")
    assert huh["is_filler"] is False
    assert body["summary"]["word_count"] == 4  # i, think, uh-huh, yes


def test_dots_and_pause_summary_agree():
    from app.transcription import pause_dots

    gaps = [0.996, 0.9995, 1.996, 2.5]
    words = [deepgram_word("w0", 0.0, 1.0)]
    for i, gap in enumerate(gaps, start=1):
        start = words[-1]["end"] + gap
        words.append(deepgram_word(f"w{i}", start, start + 0.5))

    body = post(deepgram_client(deepgram_body(words, duration=20.0))).json()

    assert_transcript_shape(body)
    runs = re.findall(r"\.+", body["text"])
    assert len(runs) == body["summary"]["pause_count"] == 3
    assert [len(r) for r in runs] == [pause_dots(g) for g in gaps if pause_dots(g) > 0] == [1, 1, 2]
    assert body["summary"]["longest_pause_seconds"] == 2.5


@pytest.mark.parametrize(
    ("metadata", "reported"), [({"duration": 0}, 0), ({}, None)], ids=["zero", "missing"]
)
def test_duration_fallback_keeps_reported_duration(metadata, reported):
    words = [deepgram_word("um", 0.0, 1.0)] + [
        deepgram_word("x", 6.0 * i, 6.0 * i + 1.0) for i in range(1, 5)
    ]
    words.append(deepgram_word("x", 29.0, 30.0))  # last end 30 s -> 0.5 min, 5 words, 1 filler

    body = post(deepgram_client(deepgram_body(words, **metadata))).json()

    assert body["duration_seconds"] == reported
    assert body["summary"]["words_per_minute"] == 10
    assert body["summary"]["fillers_per_minute"] == 2.0


@pytest.mark.parametrize("word", ["a", "um"], ids=["word", "filler"])
def test_tiny_duration_returns_502_not_500(word):
    # A near-zero duration makes the per-minute rates overflow to infinity.
    client = deepgram_client(deepgram_body([deepgram_word(word, 0.0, 0.0)], duration=1e-307))
    client.raise_server_exceptions = False

    response = post(client)

    assert response.status_code == 502
    assert response.json()["code"] == "transcription_failed"


def test_unusable_duration_returns_502():
    response = post(
        deepgram_client(deepgram_body([deepgram_word("a", 0.0, 0.5)], duration="abc"))
    )

    assert response.status_code == 502
    assert response.json() == {
        "code": "transcription_failed",
        "detail": "Transcription failed. Try again in a moment.",
    }
