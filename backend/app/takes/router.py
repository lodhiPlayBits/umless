import logging
from dataclasses import asdict

from fastapi import APIRouter, Depends, Query, Response

from app.auth import get_user_id
from app.errors import ApiError
from app.http import parse_date_time
from app.questions.repository import QuestionRepository
from app.questions.router import get_question_repository, question_not_found
from app.takes.domain import Take
from app.takes.objects import StorageError
from app.takes.service import TakeHistory, get_take_history

logger = logging.getLogger(__name__)

# Router-level, so a request without a valid sign-in gets 401 before anything else.
router = APIRouter(prefix="/api", dependencies=[Depends(get_user_id)])


def take_not_found() -> ApiError:
    return ApiError(404, "take_not_found", "That take doesn't exist any more.")


def storage_unavailable(exc: StorageError) -> ApiError:
    logger.warning("Take storage failed: %s", exc)
    return ApiError(
        503, "storage_unavailable", "Your saved takes can't be reached right now. Try again in a moment."
    )


def take_summary(take: Take) -> dict:
    return asdict(take)


@router.get("/questions/{question_id}/takes")
def list_takes(
    question_id: str,
    questions: QuestionRepository = Depends(get_question_repository),
    history: TakeHistory = Depends(get_take_history),
) -> dict:
    if questions.get(question_id) is None:
        raise question_not_found()
    return {"items": [take_summary(take) for take in history.list(question_id)]}


@router.get("/takes")
def list_all_takes(
    question_id: str | None = Query(None, alias="questionId", min_length=1, max_length=64),
    since: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    history: TakeHistory = Depends(get_take_history),
) -> dict:
    after = parse_date_time(since, "since") if since is not None else None
    # A filter, not a lookup: an unknown question matches nothing rather than being a 404.
    return {"items": [take_summary(take) for take in history.recent(question_id, after, limit)]}


@router.get("/takes/{take_id}")
def get_take(take_id: str, history: TakeHistory = Depends(get_take_history)) -> dict:
    try:
        found = history.transcript(take_id)
    except StorageError as exc:
        raise storage_unavailable(exc) from None
    if found is None:
        raise take_not_found()
    take, transcript = found
    return {**take_summary(take), "transcript": transcript}


@router.delete("/takes/{take_id}", status_code=204, response_class=Response)
def delete_take(take_id: str, history: TakeHistory = Depends(get_take_history)) -> Response:
    try:
        deleted = history.delete(take_id)
    except StorageError as exc:
        raise storage_unavailable(exc) from None
    if not deleted:
        raise take_not_found()
    return Response(status_code=204)
