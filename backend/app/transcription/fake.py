from app.transcription.models import Transcript, Word


class FakeTranscriber:
    """Canned transcript for tests and frontend work without a Deepgram key."""

    async def transcribe(self, audio: bytes, content_type: str) -> Transcript:
        # Includes a filler and one pause of over a second, so both show up in the UI.
        words = [
            ("so", "So,", 0.0, 0.3),
            ("um", "um,", 0.4, 0.7),
            ("this", "this", 1.9, 2.1),
            ("is", "is", 2.1, 2.2),
            ("a", "a", 2.2, 2.3),
            ("fake", "fake", 2.3, 2.6),
            ("transcript", "transcript.", 2.6, 3.2),
        ]
        return Transcript(
            words=[
                Word(word=w, punctuated_word=p, start=s, end=e, confidence=0.95)
                for w, p, s, e in words
            ],
            duration_seconds=3.5,
        )
