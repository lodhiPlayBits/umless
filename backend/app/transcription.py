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
            words = [
                Word(
                    word=w["word"],
                    start=w["start"],
                    end=w["end"],
                    confidence=w["confidence"],
                )
                for w in alternative.get("words", [])
            ]
            return Transcript(
                text=alternative["transcript"],
                words=words,
                duration_seconds=(body.get("metadata") or {}).get("duration"),
            )
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            raise TranscriptionError("Deepgram returned an unexpected response") from None
