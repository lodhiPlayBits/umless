"""Speech to text: the Transcriber interface, its Deepgram and fake implementations, and the
pause-dot text rule. The HTTP endpoint is in app.transcription.router."""

from app.transcription.deepgram import DeepgramTranscriber
from app.transcription.fake import FakeTranscriber
from app.transcription.models import DeepgramAccountError, Transcriber, Transcript, TranscriptionError, Word
from app.transcription.text import pause_dots, text_with_pauses

__all__ = [
    "DeepgramAccountError",
    "DeepgramTranscriber",
    "FakeTranscriber",
    "Transcriber",
    "Transcript",
    "TranscriptionError",
    "Word",
    "pause_dots",
    "text_with_pauses",
]
