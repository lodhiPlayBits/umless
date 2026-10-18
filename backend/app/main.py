from dataclasses import asdict

from fastapi import Depends, FastAPI, HTTPException, Request

from app.config import Settings
from app.transcription import (
    DeepgramTranscriber,
    FakeTranscriber,
    Transcriber,
    TranscriptionError,
)

ACCEPTED_AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"}


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_transcriber(settings: Settings = Depends(get_settings)) -> Transcriber:
    if settings.transcriber == "fake":
        return FakeTranscriber()
    if not settings.deepgram_api_key:
        raise HTTPException(503, "Transcription is unavailable: DEEPGRAM_API_KEY is not set")
    return DeepgramTranscriber(
        settings.deepgram_api_key, timeout=settings.deepgram_timeout_seconds
    )


async def read_body_capped(request: Request, max_bytes: int) -> bytes:
    too_large = HTTPException(413, f"Audio is larger than {max_bytes} bytes")
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > max_bytes:
        raise too_large
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > max_bytes:
            raise too_large
        chunks.append(chunk)
    return b"".join(chunks)


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="umless")
    app.state.settings = settings or Settings.from_env()

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/api/transcriptions")
    async def transcribe(
        request: Request,
        settings: Settings = Depends(get_settings),
        transcriber: Transcriber = Depends(get_transcriber),
    ) -> dict:
        # Only the normalized base type is forwarded; Deepgram detects the codec itself.
        content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type not in ACCEPTED_AUDIO_TYPES:
            raise HTTPException(415, "Unsupported audio type")

        audio = await read_body_capped(request, settings.max_body_bytes)
        if not audio:
            raise HTTPException(400, "Empty audio")

        try:
            transcript = await transcriber.transcribe(audio, content_type)
        except TranscriptionError:
            raise HTTPException(502, "Could not transcribe audio") from None
        return asdict(transcript)

    return app


app = create_app()
