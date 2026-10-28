"""The transcript every transcriber returns, and the interface they share."""

from dataclasses import dataclass
from typing import Protocol

from app.transcription.text import text_with_pauses


@dataclass
class Word:
    word: str
    punctuated_word: str
    start: float
    end: float
    confidence: float


@dataclass
class Transcript:
    words: list[Word]
    duration_seconds: float | None

    @property
    def text(self) -> str:
        # Always built from the words, so the text can't disagree with the summary.
        return text_with_pauses(self.words)


class TranscriptionError(Exception):
    """The audio could not be transcribed. Messages never include the API key."""


class Transcriber(Protocol):
    async def transcribe(self, audio: bytes, content_type: str) -> Transcript: ...
