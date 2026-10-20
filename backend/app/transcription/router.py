import logging

from fastapi import APIRouter, Depends, Request

from app.config import Settings
from app.errors import ApiError
from app.http import get_settings, media_type
from app.summary import transcript_body
from app.transcription.deepgram import DeepgramTranscriber
from app.transcription.fake import FakeTranscriber
from app.transcription.models import Transcriber, TranscriptionError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/transcriptions")

ACCEPTED_AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"}


def get_transcriber(settings: Settings = Depends(get_settings)) -> Transcriber:
    if settings.transcriber == "fake":
        return FakeTranscriber()
    if not settings.deepgram_api_key:
        raise ApiError(
            503,
            "transcription_unavailable",
            "Transcription is unavailable because DEEPGRAM_API_KEY is not set.",
        )
    return DeepgramTranscriber(
        settings.deepgram_api_key, timeout=settings.deepgram_timeout_seconds
    )


async def read_body_capped(request: Request, max_bytes: int) -> bytes:
    # Contract wording; only tests lower max_bytes, Settings.from_env always uses 25 MB.
    too_large = ApiError(413, "audio_too_large", "The recording is larger than 25 MB.")
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


@router.post("")
async def transcribe(
    request: Request,
    settings: Settings = Depends(get_settings),
    transcriber: Transcriber = Depends(get_transcriber),
) -> dict:
    # Only the normalized base type is forwarded; Deepgram detects the codec itself.
    content_type = media_type(request)
    if content_type not in ACCEPTED_AUDIO_TYPES:
        raise ApiError(
            415,
            "unsupported_audio_type",
            "Unsupported audio type. Send audio/webm, audio/ogg, audio/mp4, audio/wav"
            " or audio/mpeg.",
        )

    audio = await read_body_capped(request, settings.max_body_bytes)
    if not audio:
        raise ApiError(400, "empty_audio", "The recording is empty.")

    try:
        transcript = await transcriber.transcribe(audio, content_type)
        # OverflowError: Deepgram's timings make the summary rates infinite.
        return transcript_body(transcript)
    except (TranscriptionError, OverflowError) as exc:
        # The user only sees "try again"; the cause (e.g. a revoked key, HTTP 401) goes to the
        # log. TranscriptionError messages never contain the API key.
        logger.warning("Transcription failed: %s", exc)
        raise ApiError(
            502, "transcription_failed", "Transcription failed. Try again in a moment."
        ) from None
