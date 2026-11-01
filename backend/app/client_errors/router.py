import logging

from fastapi import APIRouter, Depends, Request, Response

from app.auth import get_user_id
from app.client_errors.models import ClientErrorReport
from app.errors import ApiError
from app.questions.router import require_json

logger = logging.getLogger(__name__)

# Signed-in users only, like every endpoint but health (ADR 0001, 0003).
router = APIRouter(prefix="/api", dependencies=[Depends(get_user_id)])


@router.post("/client-errors", status_code=204, dependencies=[Depends(require_json)])
async def report_client_error(
    body: ClientErrorReport, request: Request, user_id: str = Depends(get_user_id)
) -> Response:
    if not await request.app.state.client_error_limits.allow(user_id):
        raise ApiError(429, "rate_limited", "Too many error reports this hour.")
    # ERROR so a crash on the live site alerts. Every browser-sent value goes in with %r: its
    # newlines come out escaped, so a report can't forge log lines.
    logger.error(
        "Browser error (%s) for %s on %r: %r stack=%r component_stack=%r",
        body.kind,
        user_id,
        body.path,
        body.message,
        body.stack,
        body.component_stack,
    )
    return Response(status_code=204)
