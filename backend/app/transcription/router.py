import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool

from app.auth import get_user_id
from app.billing.router import get_billing
from app.billing.store import BillingStore
from app.config import Settings
from app.errors import ApiError
from app.http import get_settings, media_type
from app.limits import TranscriptionLimits
from app.questions.domain import Question
from app.questions.router import get_question_repository, question_not_found
from app.summary import transcript_body
from app.takes.service import TakeHistory, get_take_history
from app.transcription.deepgram import DeepgramTranscriber
from app.transcription.fake import FakeTranscriber
from app.transcription.models import DeepgramAccountError, Transcriber, TranscriptionError

logger = logging.getLogger(__name__)

# Signed-in users only: every transcription is a paid Deepgram call.
router = APIRouter(prefix="/api/transcriptions", dependencies=[Depends(get_user_id)])

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
    # Unvalidated on purpose: a malformed id is one that doesn't exist (404), as on the question routes.
    question_id: str | None = Query(None, alias="questionId"),
    user_id: str = Depends(get_user_id),
    settings: Settings = Depends(get_settings),
    transcriber: Transcriber = Depends(get_transcriber),
    billing: BillingStore | None = Depends(get_billing),
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

    # One at a time per user, so parallel uploads can't all pass the balance check below.
    limits: TranscriptionLimits = request.app.state.limits
    token = await limits.acquire(user_id)
    if token is None:
        logger.info("Refused a transcription for %s: another is in progress", user_id)
        raise ApiError(
            409,
            "transcription_in_progress",
            "Your other recording is still being transcribed. Wait for it to finish.",
        )
    try:
        if not await limits.allow(user_id):
            logger.info("Refused a transcription for %s: over the hourly cap", user_id)
            raise ApiError(
                429,
                "rate_limited",
                "You've made a lot of recordings this hour. Try again in a few minutes.",
            )
        return await transcribe_one(request, question_id, user_id, settings, transcriber, billing, content_type)
    finally:
        await limits.release(user_id, token)


async def transcribe_one(
    request: Request,
    question_id: str | None,
    user_id: str,
    settings: Settings,
    transcriber: Transcriber,
    billing: BillingStore | None,
    content_type: str,
) -> dict:
    # Checked before the paid Deepgram call. The repositories block, so they run in the threadpool.
    # The stores are only needed to save a take, so a plain transcription doesn't touch them.
    question = None
    if question_id is not None:
        questions = get_question_repository(request, user_id)
        question = await run_in_threadpool(questions.get, question_id)
        if question is None:
            raise question_not_found()

    # Checked before the paid Deepgram call too.
    if billing is not None:
        balance = await run_in_threadpool(billing.balance, user_id)
        if not balance.can_transcribe:
            raise ApiError(
                402, "payment_required", "You're out of practice time. Buy a session to keep going."
            )

    audio = await read_body_capped(request, settings.max_body_bytes)
    if not audio:
        raise ApiError(400, "empty_audio", "The recording is empty.")

    try:
        transcript = await transcriber.transcribe(audio, content_type)
        # OverflowError: Deepgram's timings make the summary rates infinite.
        body = transcript_body(transcript)
    except (TranscriptionError, OverflowError) as exc:
        # The user only sees "try again"; the cause goes to the log. A refused account (revoked
        # key, no credit) breaks every transcription, so it's an ERROR, which alerts.
        # TranscriptionError messages never contain the API key.
        level = logging.ERROR if isinstance(exc, DeepgramAccountError) else logging.WARNING
        logger.log(level, "Transcription failed: %s", exc)
        raise ApiError(
            502, "transcription_failed", "Transcription failed. Try again in a moment."
        ) from None

    if billing is not None and body["words"]:
        await charge(billing, user_id, body)
    if question is not None:
        body["take_id"] = await save_take(get_take_history(request, user_id), question, body)
    # Counts and timings only: the transcript text never goes in the log.
    logger.info(
        "Transcribed %s s of audio for %s: %d words, %s, take %s",
        body["duration_seconds"],
        user_id,
        len(body["words"]),
        "charged" if billing is not None and body["words"] else "not charged",
        body.get("take_id") or "not saved",
    )
    return body


async def charge(billing: BillingStore, user_id: str, body: dict) -> None:
    """Use a free transcription, or deduct the recording's length. Only takes with words are
    charged. A failure is logged, not shown: the user already has the transcript."""
    words = body["words"]
    seconds = body["duration_seconds"] or (words[-1]["end"] if words else 0)
    try:
        await run_in_threadpool(billing.charge, user_id, seconds)
    except Exception:
        logger.exception("Couldn't charge %s for a transcription", user_id)


async def save_take(history: TakeHistory, question: Question, body: dict) -> str | None:
    """Keep the transcript in the user's history. Failing here never costs the user the
    transcript they paid for: they get it back with take_id null."""
    try:
        take = await run_in_threadpool(history.save, question, dict(body))
    except Exception:
        logger.exception("Couldn't save the take")
        return None
    return take.id
