import logging

from fastapi import APIRouter, Depends, Request, Response

from app.auth import get_user_id
from app.config import Settings
from app.contact.mailer import MailError
from app.contact.models import ContactMessage
from app.errors import ApiError
from app.http import get_settings
from app.questions.router import require_json

logger = logging.getLogger(__name__)

# Signed-in users only, like every endpoint but health (ADR 0001, 0003); signed-out visitors
# have the email address on the Contact page.
router = APIRouter(prefix="/api", dependencies=[Depends(get_user_id)])

KINDS = {"complaint": "Complaint", "suggestion": "Suggestion", "other": "Message"}


@router.post("/contact", status_code=204, dependencies=[Depends(require_json)])
async def send_contact_message(
    body: ContactMessage,
    request: Request,
    user_id: str = Depends(get_user_id),
    settings: Settings = Depends(get_settings),
) -> Response:
    mailer = request.app.state.mailer
    if mailer is None or not settings.contact_to:
        raise ApiError(503, "contact_unavailable", "The contact form isn't set up on this server. Email us instead.")
    if not await request.app.state.contact_limits.allow(user_id):
        raise ApiError(429, "rate_limited", "You've sent a lot of messages this hour. Try again later, or email us.")
    subject = f"[umless] {KINDS[body.kind]} from {body.name.strip()}"
    text = (
        f"{KINDS[body.kind]} sent from the umless contact form.\n\n"
        f"From: {body.name.strip()} <{body.email}>\n"
        f"Account: {user_id}\n\n"
        f"{body.message.strip()}\n\n"
        "Reply to this email to answer them directly.\n"
    )
    try:
        email_id = await mailer.send(settings.contact_to, body.email, subject, text)
    except MailError as exc:
        # ERROR: until it's fixed, every message fails (a revoked key, an unverified sender).
        logger.error("Contact message from %s couldn't be sent: %s", user_id, exc)
        raise ApiError(502, "contact_failed", "Your message couldn't be sent. Try again in a moment, or email us.") from None
    # Never the message itself in the log.
    logger.info("Contact message (%s) from %s sent as %s", body.kind, user_id, email_id)
    return Response(status_code=204)
