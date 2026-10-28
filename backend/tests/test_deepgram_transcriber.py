import json
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest

from app.config import DEEPGRAM_MODEL, DEEPGRAM_PARAMS, Settings
from app.transcription import (
    DeepgramTranscriber,
    FakeTranscriber,
    Transcript,
    TranscriptionError,
    Word,
)

FIXTURE = Path(__file__).parent / "fixtures" / "deepgram_response.json"
API_KEY = "sk-secret-key-123"
AUDIO = b"RIFFfake-wav-bytes"


def fixture_body():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def make(handler):
    return DeepgramTranscriber(API_KEY, transport=httpx.MockTransport(handler))


def ok_handler(request):
    return httpx.Response(200, json=fixture_body())


@pytest.mark.anyio
async def test_request_shape():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=fixture_body())

    await make(handler).transcribe(AUDIO, "audio/wav")

    (req,) = seen
    assert req.method == "POST"
    assert req.url.scheme == "https"
    assert req.url.host == "api.deepgram.com"
    assert req.url.path == "/v1/listen"
    query = {k: v[0] for k, v in parse_qs(req.url.query.decode()).items()}
    assert query["model"] == DEEPGRAM_MODEL
    for key, value in DEEPGRAM_PARAMS.items():
        assert query[key] == str(value)
    assert req.headers["Authorization"] == f"Token {API_KEY}"
    assert req.headers["Content-Type"] == "audio/wav"
    assert req.content == AUDIO


def test_filler_words_param_is_requested():
    assert DEEPGRAM_PARAMS["filler_words"] == "true"


@pytest.mark.anyio
async def test_mip_opt_out_param_is_requested():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=fixture_body())

    await make(handler).transcribe(AUDIO, "audio/wav")

    (req,) = seen
    assert parse_qs(req.url.query.decode())["mip_opt_out"] == ["true"]


def raw_body(words, **metadata):
    return {
        "metadata": metadata,
        "results": {"channels": [{"alternatives": [{"transcript": "x", "words": words}]}]},
    }


def good_word(**overrides):
    word = {"word": "a", "punctuated_word": "A", "start": 0.0, "end": 0.5, "confidence": 0.9}
    word.update(overrides)
    return word


async def transcribe_raw(body):
    """Raw JSON content so NaN/Infinity (which httpx's json= refuses to encode) reach the parser."""
    content = json.dumps(body).encode()
    return await make(lambda request: httpx.Response(200, content=content)).transcribe(
        AUDIO, "audio/wav"
    )


@pytest.mark.anyio
@pytest.mark.parametrize("extra", [{}, {"punctuated_word": ""}], ids=["missing", "empty"])
async def test_punctuated_word_falls_back_to_word(extra):
    word = good_word(word="hello", **extra)
    if not extra:
        del word["punctuated_word"]

    result = await transcribe_raw(raw_body([word], duration=1.0))

    assert result.words[0].punctuated_word == "hello"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "overrides",
    [
        {"start": 2.0, "end": 1.0},
        {"confidence": -0.1},
        {"confidence": 1.1},
        {"confidence": float("nan")},
        {"word": "", "punctuated_word": "x"},
        {"word": 123, "punctuated_word": "x"},
    ],
    ids=["end-before-start", "confidence-negative", "confidence-above-1", "confidence-nan",
         "empty-word", "non-string-word"],
)
async def test_rejects_words_the_contract_forbids(overrides):
    with pytest.raises(TranscriptionError):
        await transcribe_raw(raw_body([good_word(**overrides)], duration=1.0))


@pytest.mark.anyio
@pytest.mark.parametrize(
    "duration",
    ["abc", "3.5", True, -1.0, float("nan"), float("inf"), float("-inf")],
    ids=["string", "numeric-string", "bool", "negative", "nan", "inf", "-inf"],
)
async def test_rejects_unusable_duration(duration):
    with pytest.raises(TranscriptionError):
        await transcribe_raw(raw_body([good_word()], duration=duration))


@pytest.mark.anyio
@pytest.mark.parametrize("metadata", [{}, {"duration": None}], ids=["missing", "null"])
async def test_missing_or_null_duration_stays_none(metadata):
    result = await transcribe_raw(raw_body([good_word()], **metadata))

    assert result.duration_seconds is None


@pytest.mark.anyio
async def test_very_large_finite_duration_is_accepted():
    result = await transcribe_raw(raw_body([good_word()], duration=200000))

    assert result.duration_seconds == 200000


@pytest.mark.anyio
async def test_parses_fixture_into_transcript():
    expected = fixture_body()
    alt = expected["results"]["channels"][0]["alternatives"][0]

    result = await make(ok_handler).transcribe(AUDIO, "audio/wav")

    assert isinstance(result, Transcript)
    assert result.text == alt["transcript"]
    assert result.text.startswith("So, uh, I think")
    assert result.duration_seconds == pytest.approx(10.0535)
    assert len(result.words) > 0
    assert result.words == [
        Word(
            word=w["word"],
            punctuated_word=w["punctuated_word"],
            start=w["start"],
            end=w["end"],
            confidence=w["confidence"],
        )
        for w in alt["words"]
    ]


@pytest.mark.anyio
@pytest.mark.parametrize("status", [400, 401, 429, 500, 503])
async def test_non_2xx_raises_transcription_error(status):
    def handler(request):
        return httpx.Response(status, json={"err_msg": "nope"})

    with pytest.raises(TranscriptionError):
        await make(handler).transcribe(AUDIO, "audio/wav")


@pytest.mark.anyio
async def test_transport_error_raises_transcription_error():
    def handler(request):
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(TranscriptionError):
        await make(handler).transcribe(AUDIO, "audio/wav")


@pytest.mark.anyio
async def test_timeout_raises_transcription_error():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(TranscriptionError):
        await make(handler).transcribe(AUDIO, "audio/wav")


@pytest.mark.anyio
@pytest.mark.parametrize(
    "body", [{}, {"results": {}}, {"results": {"channels": []}}]
)
async def test_malformed_body_raises_transcription_error(body):
    def handler(request):
        return httpx.Response(200, json=body)

    with pytest.raises(TranscriptionError):
        await make(handler).transcribe(AUDIO, "audio/wav")


@pytest.mark.anyio
async def test_non_json_body_raises_transcription_error():
    def handler(request):
        return httpx.Response(200, content=b"<html>not json</html>")

    with pytest.raises(TranscriptionError):
        await make(handler).transcribe(AUDIO, "audio/wav")


@pytest.mark.anyio
async def test_error_message_does_not_contain_api_key():
    def handler(request):
        return httpx.Response(401, text=f"bad credentials Token {API_KEY}")

    with pytest.raises(TranscriptionError) as exc:
        await make(handler).transcribe(AUDIO, "audio/wav")

    assert API_KEY not in str(exc.value)


@pytest.mark.anyio
async def test_transport_error_message_does_not_contain_api_key():
    def handler(request):
        raise httpx.ConnectError(f"failed with {request.headers['Authorization']}")

    with pytest.raises(TranscriptionError) as exc:
        await make(handler).transcribe(AUDIO, "audio/wav")

    assert API_KEY not in str(exc.value)


@pytest.mark.anyio
async def test_fake_transcriber_returns_um_and_words():
    result = await FakeTranscriber().transcribe(b"x", "audio/webm")

    assert "um" in result.text
    assert len(result.words) >= 1


def test_settings_defaults():
    s = Settings()

    assert s.deepgram_api_key is None
    assert s.transcriber == "deepgram"
    assert s.deepgram_timeout_seconds == 60.0
    assert s.max_body_bytes == 25 * 1024 * 1024


def test_settings_from_env_reads_environment(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "abc")
    monkeypatch.setenv("UMLESS_TRANSCRIBER", "fake")

    s = Settings.from_env(env_files=())

    assert s.deepgram_api_key == "abc"
    assert s.transcriber == "fake"


def test_settings_from_env_defaults_to_deepgram(monkeypatch):
    monkeypatch.delenv("UMLESS_TRANSCRIBER", raising=False)
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)

    s = Settings.from_env(env_files=())

    assert s.transcriber == "deepgram"


def test_data_file_defaults_to_backend_data_questions_json(monkeypatch):
    from app.config import BACKEND_DIR

    monkeypatch.delenv("UMLESS_DATA_FILE", raising=False)

    assert Settings.from_env(env_files=()).data_file == BACKEND_DIR / "data" / "questions.json"


def test_absolute_data_file_env_is_used_as_given(monkeypatch, tmp_path):
    target = tmp_path / "elsewhere.json"
    monkeypatch.setenv("UMLESS_DATA_FILE", str(target))

    assert Settings.from_env(env_files=()).data_file == target


def test_relative_data_file_env_resolves_against_backend_dir_not_cwd(monkeypatch, tmp_path):
    from app.config import BACKEND_DIR

    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("UMLESS_DATA_FILE", "rel/q.json")

    assert Settings.from_env(env_files=()).data_file == BACKEND_DIR / "rel" / "q.json"
