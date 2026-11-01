import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool

from app.auth import get_user_id
from app.billing.packs import FREE_SILENT_SECONDS, MAX_RECORDING_SECONDS
from app.billing.router import get_billing
from app.billing.store import BillingStore, charged_seconds
from app.config import Settings
from app.errors import ApiError
from app.http import get_settings, media_type
from app.limits import TranscriptionLimits
from app.questions.domain import Question
from app.questions.router import get_question_repository, question_not_found
from app.summary import transcript_body
from app.takes.service import TakeHistory, get_take_history
from app.transcription.deepgram import DeepgramTranscriber
from app.transcription.duration import UnreadableAudio
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

    # Metered: the server measures the recording itself and checks it against the limit and the
    # time left, all before Deepgram is paid for it (docs/roadmap/2026-11-01-metered-free-time.md).
    seconds = None
    if billing is not None:
        seconds = await measure_and_check(request, billing, user_id, audio)

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

    # Charged even with no words (Deepgram bills them too), except a short silent take: a mic problem.
    charged = billing is not None and (bool(body["words"]) or seconds >= FREE_SILENT_SECONDS)
    if charged:
        await charge(billing, user_id, seconds)
    if question is not None:
        body["take_id"] = await save_take(get_take_history(request, user_id), question, body)
    # Counts and timings only: the transcript text never goes in the log.
    logger.info(
        "Transcribed %s s of audio for %s: %d words, %s, take %s",
        body["duration_seconds"],
        user_id,
        len(body["words"]),
        "charged" if charged else "not charged",
        body.get("take_id") or "not saved",
    )
    return body


def duration_text(seconds: float) -> str:
    """"45 s", "1 min 1 s", "10 min", for the 402 message."""
    whole = charged_seconds(seconds)
    minutes, rest = divmod(whole, 60)
    if not minutes:
        return f"{rest} s"
    return f"{minutes} min {rest} s" if rest else f"{minutes} min"


async def measure_and_check(request: Request, billing: BillingStore, user_id: str, audio: bytes) -> float:
    """The recording's length, once it's known to be readable, at most 10 minutes, and no longer
    than the user's free plus paid time. Every refusal happens before Deepgram is called."""
    measure = request.app.state.measure_audio
    try:
        # FFmpeg parsing blocks, so it runs in the threadpool.
        seconds = await run_in_threadpool(measure, audio)
    except UnreadableAudio as exc:
        logger.info("Refused a transcription for %s: unreadable audio (%s)", user_id, exc)
        raise ApiError(400, "unreadable_audio", "This recording couldn't be read. Record it again.") from None
    # A little slack: the app stops at 10:00, and containers can run a few frames longer.
    if seconds > MAX_RECORDING_SECONDS + 2:
        logger.info("Refused a transcription for %s: %.0f s is over the limit", user_id, seconds)
        raise ApiError(
            400, "recording_too_long", f"This recording is {duration_text(seconds)} long; the limit is 10 minutes."
        )
    balance = await run_in_threadpool(billing.balance, user_id)
    if charged_seconds(seconds) > balance.total_seconds:
        raise ApiError(
            402,
            "payment_required",
            f"This recording is {duration_text(seconds)}; you have {duration_text(balance.total_seconds)} left. "
            "Buy more practice time to transcribe it.",
        )
    return seconds


async def charge(billing: BillingStore, user_id: str, seconds: float) -> None:
    """Deduct the measured length: free time first, then paid. A failure is logged, not shown:
    the user already has the transcript."""
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
