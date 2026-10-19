import math
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.config import DEEPGRAM_MODEL, DEEPGRAM_PARAMS

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"


@dataclass
class Word:
    word: str
    start: float
    end: float
    confidence: float


@dataclass
class Transcript:
    text: str
    words: list[Word]
    duration_seconds: float | None


MAX_TIMESTAMP_SECONDS = 24 * 60 * 60


def _timestamp(value: object) -> float:
    """A word timing in seconds; rejects non-finite or absurd values (they would overflow dots)."""
    seconds = float(value)  # type: ignore[arg-type]
    if not (math.isfinite(seconds) and 0 <= seconds <= MAX_TIMESTAMP_SECONDS):
        raise ValueError(f"word timing out of range: {seconds}")
    return seconds


def text_with_pauses(words: list[dict]) -> str:
    """Join Deepgram words, marking each pause of 1 s or more with one dot per full second.

    Silence before the first and after the last word is not marked. A 1 ms tolerance keeps
    float noise (e.g. 2.0000001 -> 3.0) from dropping a dot at exact second boundaries.
    """
    parts: list[str] = []
    previous_end: float | None = None
    for w in words:
        if previous_end is not None:
            dots = math.floor(_timestamp(w["start"]) - previous_end + 0.001)
            if dots >= 1:
                parts.append("." * dots)
        parts.append(w.get("punctuated_word") or w["word"])
        previous_end = _timestamp(w["end"])
    return " ".join(parts)


class TranscriptionError(Exception):
    """The audio could not be transcribed. Messages never include the API key."""


class Transcriber(Protocol):
    async def transcribe(self, audio: bytes, content_type: str) -> Transcript: ...


class FakeTranscriber:
    """Canned transcript for tests and frontend work without a Deepgram key."""

    async def transcribe(self, audio: bytes, content_type: str) -> Transcript:
        return Transcript(
            text="So, um, this is a fake transcript.",
            words=[
                Word(word="so", start=0.0, end=0.3, confidence=0.99),
                Word(word="um", start=0.4, end=0.7, confidence=0.95),
            ],
            duration_seconds=1.0,
        )


class DeepgramTranscriber:
    def __init__(
        self,
        api_key: str,
        *,
        timeout: float = 60.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._timeout = timeout
        self._transport = transport

    async def transcribe(self, audio: bytes, content_type: str) -> Transcript:
        try:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=self._timeout
            ) as client:
                response = await client.post(
                    DEEPGRAM_URL,
                    params={"model": DEEPGRAM_MODEL, **DEEPGRAM_PARAMS},
                    headers={
                        "Authorization": f"Token {self._api_key}",
                        "Content-Type": content_type,
                    },
                    content=audio,
                )
        except (httpx.HTTPError, UnicodeEncodeError) as exc:
            # UnicodeEncodeError: httpx only sends ASCII headers (e.g. a key with a smart quote).
            raise TranscriptionError(
                f"Deepgram request failed: {type(exc).__name__}"
            ) from None

        if not response.is_success:
            raise TranscriptionError(f"Deepgram returned HTTP {response.status_code}")

        try:
            body = response.json()
            alternative = body["results"]["channels"][0]["alternatives"][0]
            raw_words = alternative.get("words", [])
            words = [
                Word(
                    word=w["word"],
                    start=_timestamp(w["start"]),
                    end=_timestamp(w["end"]),
                    confidence=float(w["confidence"]),
                )
                for w in raw_words
            ]
            return Transcript(
                text=text_with_pauses(raw_words) if raw_words else alternative["transcript"],
                words=words,
                duration_seconds=(body.get("metadata") or {}).get("duration"),
            )
        except (ValueError, KeyError, IndexError, TypeError, AttributeError, OverflowError):
            raise TranscriptionError("Deepgram returned an unexpected response") from None
