import math

import httpx

from app.config import DEEPGRAM_MODEL, DEEPGRAM_PARAMS
from app.transcription.models import Transcript, TranscriptionError, Word

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
MAX_TIMESTAMP_SECONDS = 24 * 60 * 60


def _timestamp(value: object) -> float:
    """A word timing in seconds; rejects non-finite or absurd values (they would overflow dots)."""
    seconds = float(value)  # type: ignore[arg-type]
    if not (math.isfinite(seconds) and 0 <= seconds <= MAX_TIMESTAMP_SECONDS):
        raise ValueError(f"word timing out of range: {seconds}")
    return seconds


def _duration(value: object) -> float | None:
    """Deepgram's audio length: missing stays None; anything else must be a finite number >= 0."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"duration is not a number: {value!r}")
    if not (math.isfinite(value) and value >= 0):
        raise ValueError(f"duration out of range: {value}")
    return float(value)


def _word(raw: dict) -> Word:
    """One Deepgram word, checked against the contract's Word schema."""
    word = raw["word"]
    if not isinstance(word, str) or not word:
        raise ValueError("word must be a non-empty string")
    start, end = _timestamp(raw["start"]), _timestamp(raw["end"])
    if end < start:
        raise ValueError(f"word ends before it starts: {start} > {end}")
    confidence = float(raw["confidence"])
    if not 0 <= confidence <= 1:  # also rejects NaN
        raise ValueError(f"confidence out of range: {confidence}")
    punctuated = raw.get("punctuated_word")
    if not isinstance(punctuated, str) or not punctuated:
        punctuated = word
    return Word(word=word, punctuated_word=punctuated, start=start, end=end, confidence=confidence)


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
            return Transcript(
                words=[_word(w) for w in alternative.get("words", [])],
                duration_seconds=_duration((body.get("metadata") or {}).get("duration")),
            )
        except (ValueError, KeyError, IndexError, TypeError, AttributeError, OverflowError):
            raise TranscriptionError("Deepgram returned an unexpected response") from None
