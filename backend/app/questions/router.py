from dataclasses import asdict

from fastapi import APIRouter, Depends, Request, Response

from app.errors import ApiError
from app.questions.models import QuestionCreate, QuestionUpdate
from app.questions.repository import QuestionRepository

router = APIRouter(prefix="/api/questions")


def get_question_repository(request: Request) -> QuestionRepository:
    repository = getattr(request.app.state, "questions", None)
    if repository is None:
        raise RuntimeError(
            "Question repository not loaded; enter the app's lifespan"
            " (use TestClient as a context manager)."
        )
    return repository


def require_json(request: Request) -> None:
    # Rejecting everything but application/json (a missing header too) stops cross-site
    # form posts, which skip the CORS preflight (ADR 0001).
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type != "application/json":
        raise ApiError(415, "unsupported_media_type", "Send the request body as application/json.")


def question_not_found() -> ApiError:
    return ApiError(404, "question_not_found", "That question doesn't exist any more.")


@router.get("")
def list_questions(repository: QuestionRepository = Depends(get_question_repository)) -> dict:
    return {"items": [asdict(q) for q in repository.list()]}


@router.post("", status_code=201, dependencies=[Depends(require_json)])
def create_question(
    body: QuestionCreate,
    response: Response,
    repository: QuestionRepository = Depends(get_question_repository),
) -> dict:
    question = repository.add(body.text, body.position)
    response.headers["Location"] = f"/api/questions/{question.id}"
    return asdict(question)


# Ids are plain strings: a malformed id is just one that doesn't exist (404, not 422).
@router.patch("/{question_id}", dependencies=[Depends(require_json)])
def update_question(
    question_id: str,
    body: QuestionUpdate,
    repository: QuestionRepository = Depends(get_question_repository),
) -> dict:
    question = repository.update(question_id, body.text)
    if question is None:
        raise question_not_found()
    return asdict(question)


@router.delete("/{question_id}", status_code=204, response_class=Response)
def delete_question(
    question_id: str,
    repository: QuestionRepository = Depends(get_question_repository),
) -> Response:
    if not repository.delete(question_id):
        raise question_not_found()
    return Response(status_code=204)
