"""Pauses of 1 s or more between words show as dots in the transcript text: one dot per second."""

import json
from pathlib import Path

import httpx
import pytest

from app.transcription import DeepgramTranscriber, TranscriptionError, Word, text_with_pauses

FIXTURE = Path(__file__).parent / "fixtures" / "deepgram_response.json"


def W(punctuated, start, end):
    return {"punctuated_word": punctuated, "start": start, "end": end}


@pytest.mark.parametrize(
    ("words", "expected"),
    [
        ([W("Hello", 0.0, 0.5), W("world.", 0.8, 1.2)], "Hello world."),
        ([W("Hello", 0.0, 0.5), W("world.", 1.5, 2.0)], "Hello . world."),
        ([W("Hello", 0.0, 0.5), W("world.", 3.9, 4.2)], "Hello ... world."),
        ([W("Hello", 0.0, 0.5), W("world.", 2.49, 3.0)], "Hello . world."),
        ([W("Hello", 0.0, 0.5), W("world.", 2.5, 3.0)], "Hello .. world."),
        ([W("Hello", 0.0, 0.5), W("world.", 1.49, 2.0)], "Hello world."),
        ([W("Hello", 0.0, 2.0000001), W("world.", 3.0, 3.5)], "Hello . world."),
        ([W("So,", 0.0, 0.4), W("um,", 2.9, 3.2), W("I", 3.2, 3.3)], "So, .. um, I"),
        ([W("matters.", 5.68, 6.4), W("Uh,", 9.5, 9.9)], "matters. ... Uh,"),
        ([W("Hi", 4.0, 4.3), W("there.", 4.4, 4.8)], "Hi there."),
        ([W("a", 0.0, 1.0), W("b", 0.8, 1.2)], "a b"),
        ([W("Solo.", 0.0, 0.5)], "Solo."),
        ([], ""),
        ([W("a", 0, 0.5), W("b", 1.7, 2.0), W("c", 4.5, 5.0)], "a . b .. c"),
        ([W("a", 0.0, 1.0), W("b", 13.0, 13.5)], "a " + "." * 12 + " b"),
    ],
    ids=[
        "short-gap", "exactly-1s", "3.4s", "1.99s", "2.0s", "0.99s", "float-noise",
        "after-comma", "after-full-stop", "leading-silence-ignored", "overlap", "single-word",
        "empty", "several-pauses", "12s-no-cap",
    ],
)
def test_text_with_pauses(words, expected):
    assert text_with_pauses(words) == expected


def test_falls_back_to_plain_word():
    words = [{"word": "hello", "start": 0.0, "end": 0.5}, {"word": "world", "start": 2.0, "end": 2.5}]
    assert text_with_pauses(words) == "hello . world"


def test_real_fixture_without_long_pauses_is_unchanged():
    alt = json.loads(FIXTURE.read_text(encoding="utf-8"))["results"]["channels"][0]["alternatives"][0]
    assert text_with_pauses(alt["words"]) == alt["transcript"]


def deepgram_body(transcript, words):
    return {
        "metadata": {"duration": 3.4},
        "results": {"channels": [{"alternatives": [{"transcript": transcript, "words": words}]}]},
    }


async def transcribe_body(body):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=body))
    return await DeepgramTranscriber("key", transport=transport).transcribe(b"x", "audio/wav")


@pytest.mark.anyio
async def test_transcriber_text_shows_pauses_and_words_keep_their_shape():
    words = [
        {"word": "so", "punctuated_word": "So,", "start": 0.0, "end": 0.5, "confidence": 0.9},
        {"word": "um", "punctuated_word": "um,", "start": 2.6, "end": 3.0, "confidence": 0.8},
        {"word": "yes", "punctuated_word": "yes.", "start": 3.0, "end": 3.4, "confidence": 0.7},
    ]

    result = await transcribe_body(deepgram_body("So, um, yes.", words))

    assert result.text == "So, .. um, yes."
    assert result.words == [
        Word(word="so", start=0.0, end=0.5, confidence=0.9),
        Word(word="um", start=2.6, end=3.0, confidence=0.8),
        Word(word="yes", start=3.0, end=3.4, confidence=0.7),
    ]


@pytest.mark.anyio
async def test_transcriber_keeps_deepgram_text_when_there_are_no_words():
    assert (await transcribe_body(deepgram_body("hi", []))).text == "hi"


@pytest.mark.anyio
@pytest.mark.parametrize("bad_start", [None, "x"], ids=["missing", "not-a-number"])
async def test_transcriber_rejects_bad_word_timings(bad_start):
    word = {"word": "a", "punctuated_word": "a", "end": 0.5, "confidence": 0.9}
    if bad_start is not None:
        word["start"] = bad_start
    other = {"word": "b", "punctuated_word": "b", "start": 2.0, "end": 2.5, "confidence": 0.9}

    with pytest.raises(TranscriptionError):
        await transcribe_body(deepgram_body("a b", [word, other]))


def test_gap_just_under_one_second_counts_within_tolerance():
    assert text_with_pauses([W("a", 0.0, 0.5), W("b", 1.4995, 2.0)]) == "a . b"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("field", "raw"),
    [
        ("start", "Infinity"),
        ("start", "1e400"),
        ("start", "1e19"),
        ("start", "1e10"),
        ("start", "-1"),
        ("end", '"x"'),
        ("end", "Infinity"),
    ],
)
async def test_transcriber_rejects_absurd_timings_as_transcription_error(field, raw):
    """Raw JSON so non-finite numbers reach the parser; none may become a 500 or a huge string."""
    timings = {"start": "2.0", "end": "2.5"}
    timings[field] = raw
    body = (
        '{"results":{"channels":[{"alternatives":[{"transcript":"a b","words":['
        '{"word":"a","punctuated_word":"a","start":0.0,"end":0.5,"confidence":0.9},'
        f'{{"word":"b","punctuated_word":"b","start":{timings["start"]},"end":{timings["end"]},"confidence":0.9}}'
        "]}]}]}}"
    )
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=body.encode()))

    with pytest.raises(TranscriptionError):
        await DeepgramTranscriber("key", transport=transport).transcribe(b"x", "audio/wav")
