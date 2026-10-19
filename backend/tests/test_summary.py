"""Transcript summary: filler flags, rates and the pause rule shared with the dots in the text."""

import dataclasses
import math
import re
from pathlib import Path

import pytest

from app.summary import FILLER_WORDS, summarize, transcript_body
from app.transcription import Transcript, Word

OPENAPI = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.yaml"


def w(word, start, end, punctuated=None):
    return Word(
        word=word, punctuated_word=punctuated or word, start=start, end=end, confidence=0.9
    )


def two_words(gap):
    """Two words whose raw gap is `gap` (first one ends at 1.0 s)."""
    return [w("a", 0.0, 1.0), w("b", 1.0 + gap, 1.5 + gap)]


def body_for(words, duration=None):
    return transcript_body(Transcript(words=words, duration_seconds=duration))


CONTRACT_WORDS = [
    w("so", 0.1, 0.4, "So,"),
    w("um", 2.6, 2.9, "um,"),
    w("i", 3.0, 3.1, "I"),
    w("led", 3.1, 3.3),
    w("the", 3.3, 3.4),
    w("migration", 3.4, 4.0, "migration."),
]


def test_contract_example_summary():
    transcript = Transcript(words=CONTRACT_WORDS, duration_seconds=4.5)

    body = transcript_body(transcript)

    assert transcript.text == "So, .. um, I led the migration."
    assert body["text"] == "So, .. um, I led the migration."
    assert dataclasses.asdict(summarize(CONTRACT_WORDS, 4.5)) == {
        "word_count": 5,
        "filler_count": 1,
        "fillers": [{"word": "um", "count": 1}],
        "words_per_minute": 67,
        "fillers_per_minute": 13.3,
        "pause_count": 1,
        "longest_pause_seconds": 2.2,
    }
    assert body["summary"] == {
        "word_count": 5,
        "filler_count": 1,
        "fillers": [{"word": "um", "count": 1}],
        "words_per_minute": 67,
        "fillers_per_minute": 13.3,
        "pause_count": 1,
        "longest_pause_seconds": 2.2,
    }
    assert [x["pause_before_seconds"] for x in body["words"]] == [0, 2.2, 0.1, 0, 0, 0]
    assert [x["is_filler"] for x in body["words"]] == [False, True, False, False, False, False]


@pytest.mark.parametrize(
    ("gap", "text", "pause_count", "longest", "pause_before"),
    [
        (0.996, "a b", 0, None, 1.0),
        (0.9995, "a . b", 1, 1.0, 1.0),
        (1.996, "a . b", 1, 2.0, 2.0),
        (2.5, "a .. b", 1, 2.5, 2.5),
        (-0.2, "a b", 0, None, 0.0),
    ],
    ids=["0.996-no-dot", "0.9995-one-dot", "1.996-one-dot", "2.5-two-dots", "overlap"],
)
def test_gap_rule_boundaries(gap, text, pause_count, longest, pause_before):
    body = body_for(two_words(gap), 5.0)

    assert body["text"] == text
    assert body["summary"]["pause_count"] == pause_count
    assert body["summary"]["longest_pause_seconds"] == longest
    assert body["words"][0]["pause_before_seconds"] == 0
    second = body["words"][1]["pause_before_seconds"]
    assert second == pause_before
    assert math.copysign(1.0, second) == 1.0  # never -0.0


def test_rates_fall_back_to_last_word_end():
    words = [w("um", 0.0, 1.0)] + [w("x", 1.0 + i, 2.0 + i) for i in range(5)]  # last end 6.0
    words[-1] = w("x", 29.0, 30.0)  # last end 30.0 -> 0.5 min, 5 words, 1 filler

    for duration in (None, 0):
        summary = summarize(words, duration)
        assert summary.words_per_minute == 10
        assert summary.fillers_per_minute == 2.0


def test_rates_null_without_duration_or_words():
    for duration in (None, 0):
        summary = summarize([], duration)
        assert summary.words_per_minute is None
        assert summary.fillers_per_minute is None


def test_no_words_with_duration_gives_zero_rates():
    summary = summarize([], 3.0)

    assert summary.words_per_minute == 0
    assert summary.fillers_per_minute == 0.0
    assert summary.word_count == 0
    assert summary.filler_count == 0
    assert summary.fillers == []
    assert summary.pause_count == 0
    assert summary.longest_pause_seconds is None


@pytest.mark.parametrize("token", ["uh-huh", "uh-uh", "mm-mm", "nuh-uh"])
def test_yes_no_tokens_are_not_fillers(token):
    body = body_for([w(token, 0.0, 0.5)], 2.0)

    assert body["words"][0]["is_filler"] is False
    assert body["summary"]["word_count"] == 1
    assert body["summary"]["filler_count"] == 0
    assert body["summary"]["fillers"] == []


def test_fillers_sorted_by_count_then_word():
    names = ["um", "uh", "um", "mhmm", "uh", "mhmm", "mhmm"]
    words = [w(n, i, i + 0.5) for i, n in enumerate(names)]

    assert dataclasses.asdict(summarize(words, 10.0))["fillers"] == [
        {"word": "mhmm", "count": 3},
        {"word": "uh", "count": 2},
        {"word": "um", "count": 2},
    ]
    assert summarize(words, 10.0).filler_count == 7


def test_rounding_is_pinned():
    # Python's round() is half-to-even; every input below is exactly representable.
    five_words = [w("x", i * 0.5, i * 0.5 + 0.25) for i in range(5)]
    assert summarize(five_words, 120.0).words_per_minute == round(2.5) == 2
    assert summarize(five_words, 45.0).words_per_minute == 7  # 6.67

    five_ums = [w("um", i * 0.5, i * 0.5 + 0.25) for i in range(5)]
    assert summarize(five_ums, 240.0).fillers_per_minute == round(1.25, 1) == 1.2

    # gap 0.125 -> 0.12 for display; gap 1.25 -> longest 1.2
    assert body_for([w("a", 0.0, 0.5), w("b", 0.625, 1.0)])["words"][1][
        "pause_before_seconds"
    ] == round(0.125, 2) == 0.12
    body = body_for([w("a", 0.0, 0.5), w("b", 1.75, 2.0)])
    assert body["summary"]["longest_pause_seconds"] == round(1.25, 1) == 1.2
    assert body["summary"]["pause_count"] == 1


def test_filler_words_match_openapi_contract():
    text = OPENAPI.read_text(encoding="utf-8")
    block = re.search(r"^    FillerWord:\s*\n(?:\s+type: \w+\s*\n)?\s+enum: \[(.*?)\]", text, re.M)
    assert block, "FillerWord enum not found in openapi.yaml"
    documented = {item.strip() for item in block.group(1).split(",")}

    assert documented
    assert documented == set(FILLER_WORDS)
