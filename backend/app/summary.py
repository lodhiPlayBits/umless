"""Filler flags, pauses and the summary returned with every transcript (docs/data-model.md)."""

import math
from collections import Counter
from dataclasses import asdict, dataclass

from app.transcription import Transcript, Word, pause_dots

# Must match FillerWord in docs/api/openapi.yaml (checked by tests/test_summary.py). Deepgram's
# uh-huh, uh-uh, mm-mm and nuh-uh are yes/no answers, so they count as ordinary words.
FILLER_WORDS = ("um", "uh", "mhmm")


@dataclass
class FillerCount:
    word: str
    count: int


@dataclass
class TranscriptSummary:
    word_count: int
    filler_count: int
    fillers: list[FillerCount]
    words_per_minute: int | None
    fillers_per_minute: float | None
    pause_count: int
    longest_pause_seconds: float | None


def _per_minute(count: int, minutes: float | None, ndigits: int | None) -> float | None:
    if not minutes:
        return None
    rate = count / minutes
    if not math.isfinite(rate):
        # Only a near-zero duration from Deepgram gets here; callers treat it as unusable (502).
        raise OverflowError("per-minute rate out of range")
    return round(rate, ndigits)


def _gaps(words: list[Word]) -> list[float]:
    """Raw silence before each word (0 for the first); the same values the dots are built from."""
    return [0.0] + [b.start - a.end for a, b in zip(words, words[1:])]


def summarize(words: list[Word], duration_seconds: float | None) -> TranscriptSummary:
    fillers = Counter(w.word for w in words if w.word in FILLER_WORDS)
    filler_count = sum(fillers.values())
    word_count = len(words) - filler_count
    pauses = [gap for gap in _gaps(words) if pause_dots(gap) >= 1]

    # Chrome's WebM often has no duration, so fall back to when the last word ends.
    seconds = duration_seconds or (words[-1].end if words else None)
    minutes = seconds / 60 if seconds else None

    return TranscriptSummary(
        word_count=word_count,
        filler_count=filler_count,
        fillers=[
            FillerCount(word, count)
            for word, count in sorted(fillers.items(), key=lambda item: (-item[1], item[0]))
        ],
        words_per_minute=_per_minute(word_count, minutes, None),
        fillers_per_minute=_per_minute(filler_count, minutes, 1),
        pause_count=len(pauses),
        longest_pause_seconds=round(max(pauses), 1) if pauses else None,
    )


def transcript_body(transcript: Transcript) -> dict:
    """The createTranscription 200 body: text, words with flags and pauses, duration, summary."""
    words = [
        {
            **asdict(w),
            "is_filler": w.word in FILLER_WORDS,
            # Display value only; the dots and pause counts use the raw gap.
            "pause_before_seconds": round(max(0.0, gap), 2),
        }
        for w, gap in zip(transcript.words, _gaps(transcript.words))
    ]
    return {
        "text": transcript.text,
        "words": words,
        "duration_seconds": transcript.duration_seconds,
        "summary": asdict(summarize(transcript.words, transcript.duration_seconds)),
    }
