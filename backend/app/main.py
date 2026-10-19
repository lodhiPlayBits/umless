import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request

from app.config import Settings
from app.errors import ApiError, LocalHostOnlyMiddleware, add_error_handlers
from app.questions.repository import JsonFileQuestionRepository
from app.questions.router import router as questions_router
from app.summary import transcript_body
from app.transcription import (
    DeepgramTranscriber,
    FakeTranscriber,
    Transcriber,
    TranscriptionError,
)

logger = logging.getLogger(__name__)

ACCEPTED_AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"}


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Loaded at startup, not in create_app, so importing app.main never reads the data file.
    # A broken file raises QuestionFileError here and stops the server.
    app.state.questions = JsonFileQuestionRepository(app.state.settings.data_file)
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    # docs/api/openapi.yaml is the contract, so FastAPI's generated docs are turned off.
    app = FastAPI(
        title="umless", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )
    app.state.settings = settings or Settings.from_env()
    add_error_handlers(app)
    app.add_middleware(LocalHostOnlyMiddleware)
    app.include_router(questions_router)

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

    return app


app = create_app()
