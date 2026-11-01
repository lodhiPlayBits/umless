import json
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field

from app.auth import get_user_id
from app.billing.packs import PACKS
from app.billing.razorpay import Razorpay, RazorpayError
from app.billing.store import Balance, BillingStore, Order, RefundRefused, refund_refusal, utc_now
from app.errors import ApiError
from app.questions.router import require_json

logger = logging.getLogger(__name__)

# Router-level sign-in, so a request without it gets 401 before anything else.
router = APIRouter(prefix="/api", dependencies=[Depends(get_user_id)])
# Razorpay calls the webhook itself, with its own signature instead of a sign-in.
webhook_router = APIRouter(prefix="/api")

PackId = Literal["session_1", "session_5"]


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    pack_id: PackId


class PaymentVerify(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    order_id: str = Field(min_length=1, max_length=64)
    payment_id: str = Field(min_length=1, max_length=64)
    signature: str = Field(min_length=1, max_length=256)


def payments_unavailable() -> ApiError:
    return ApiError(503, "payments_unavailable", "Payments aren't set up on this server.")


def payment_invalid() -> ApiError:
    return ApiError(400, "payment_invalid", "This payment couldn't be verified.")


def get_billing(request: Request) -> BillingStore | None:
    """None when this server doesn't meter transcription (no Razorpay keys: local use)."""
    return request.app.state.billing


def get_razorpay(request: Request) -> Razorpay | None:
    return request.app.state.razorpay


def account_body(balance: Balance | None) -> dict:
    return {
        "metered": balance is not None,
        "free_seconds_left": balance.free_seconds_left if balance else 0,
        "seconds_left": balance.seconds_left if balance else 0,
        "packs": [
            {
                "id": pack.id,
                "label": pack.label,
                "seconds": pack.seconds,
                "amount_paise": pack.amount_paise,
                "currency": pack.currency,
            }
            for pack in PACKS.values()
        ]
        if balance is not None
        else [],
    }


@router.get("/account")
def get_account(
    user_id: str = Depends(get_user_id), billing: BillingStore | None = Depends(get_billing)
) -> dict:
    return account_body(billing.balance(user_id) if billing else None)


def order_not_found() -> ApiError:
    return ApiError(404, "order_not_found", "That payment order doesn't exist.")


def purchase_body(order: Order, refundable: bool) -> dict:
    pack = PACKS.get(order.pack_id)
    return {
        "order_id": order.id,
        "payment_id": order.payment_id,
        "pack_id": order.pack_id,
        # The pack's current name; a pack retired later keeps its id as its name.
        "label": pack.label if pack else order.pack_id,
        "seconds": order.seconds,
        "amount_paise": order.amount_paise,
        "currency": pack.currency if pack else "INR",
        "paid_at": order.paid_at,
        "status": order.status,
        "refundable": refundable,
    }


@router.get("/payments")
def list_purchases(
    user_id: str = Depends(get_user_id), billing: BillingStore | None = Depends(get_billing)
) -> dict:
    # A server without payments has nothing to list, like /api/account's "metered": false.
    if billing is None:
        return {"items": []}
    balance, now = billing.balance(user_id), utc_now()
    return {
        "items": [
            purchase_body(order, refundable=refund_refusal(order, balance, now) is None)
            for order in billing.purchases(user_id)
        ]
    }


@router.post("/payments/{order_id}/refund")
def request_refund(
    # Unvalidated on purpose: a malformed id is one that doesn't exist (404), as on the question routes.
    order_id: str,
    user_id: str = Depends(get_user_id),
    billing: BillingStore | None = Depends(get_billing),
    razorpay: Razorpay | None = Depends(get_razorpay),
) -> dict:
    """Self-serve refund of an unused pack (docs/roadmap/2026-10-31-self-serve-refunds.md)."""
    if billing is None or razorpay is None:
        raise payments_unavailable()
    order = billing.get_order(order_id)
    # Someone else's order, or a checkout never paid, is no different from a missing one.
    if order is None or order.user_id != user_id or order.status == "created":
        raise order_not_found()
    try:
        # The time goes first, so it can't be spent while Razorpay refunds the money.
        order = billing.start_refund(order.id)
    except RefundRefused as exc:
        raise ApiError(409, "refund_not_allowed", str(exc)) from None
    try:
        refund_id = razorpay.refund(order.payment_id, order.amount_paise, {"order_id": order.id, "user_id": user_id})
    except RazorpayError as exc:
        billing.cancel_refund(order.id)
        # ERROR: often the Razorpay balance is too low to pay refunds, which needs you.
        logger.error("Refund of order %s failed at Razorpay; the time was put back: %s", order.id, exc)
        raise ApiError(
            502, "payment_provider_failed", "The refund couldn't be started. Your practice time is unchanged; try again later."
        ) from None
    billing.refund_started(order.id, refund_id)
    logger.info("Refund %s requested for order %s by %s", refund_id, order.id, user_id)
    return purchase_body(order, refundable=False)


@router.post("/payments/orders", status_code=201, dependencies=[Depends(require_json)])
def create_order(
    body: OrderCreate,
    user_id: str = Depends(get_user_id),
    billing: BillingStore | None = Depends(get_billing),
    razorpay: Razorpay | None = Depends(get_razorpay),
) -> dict:
    if billing is None or razorpay is None:
        raise payments_unavailable()
    pack = PACKS[body.pack_id]
    try:
        order_id = razorpay.create_order(
            pack.amount_paise,
            pack.currency,
            receipt=f"umless-{uuid.uuid4().hex[:24]}",
            notes={"user_id": user_id, "pack_id": pack.id},
        )
    except RazorpayError as exc:
        logger.warning("Razorpay order failed: %s", exc)
        raise ApiError(
            502, "payment_provider_failed", "The payment couldn't be started. Try again in a moment."
        ) from None
    billing.add_order(Order(order_id, user_id, pack.id, pack.amount_paise, pack.seconds, "created"))
    return {
        "order_id": order_id,
        "key_id": razorpay.key_id,
        "amount_paise": pack.amount_paise,
        "currency": pack.currency,
        "pack_id": pack.id,
        "label": pack.label,
    }


@router.post("/payments/verify", dependencies=[Depends(require_json)])
def verify_payment(
    body: PaymentVerify,
    user_id: str = Depends(get_user_id),
    billing: BillingStore | None = Depends(get_billing),
    razorpay: Razorpay | None = Depends(get_razorpay),
) -> dict:
    if billing is None or razorpay is None:
        raise payments_unavailable()
    order = billing.get_order(body.order_id)
    # Someone else's order is no different from a missing one.
    if order is None or order.user_id != user_id:
        raise ApiError(404, "order_not_found", "That payment order doesn't exist.")
    if not razorpay.payment_is_genuine(order.id, body.payment_id, body.signature):
        logger.warning("Payment signature mismatch for order %s", order.id)
        raise payment_invalid()
    # A valid signature means the payment was authorized; time is only added once it's captured.
    try:
        captured = razorpay.payment_is_captured(body.payment_id, order.id, order.amount_paise, PACKS[order.pack_id].currency)
    except RazorpayError as exc:
        logger.warning("Couldn't confirm payment %s: %s", body.payment_id, exc)
        raise ApiError(
            502, "payment_provider_failed", "Your payment couldn't be confirmed yet. Try again in a moment."
        ) from None
    if not captured:
        logger.warning("Payment %s for order %s is not captured", body.payment_id, order.id)
        raise payment_invalid()
    return account_body(billing.mark_paid(order.id, body.payment_id))


@webhook_router.post("/payments/webhook")
async def razorpay_webhook(
    request: Request,
    billing: BillingStore | None = Depends(get_billing),
    razorpay: Razorpay | None = Depends(get_razorpay),
) -> dict:
    """Credits a paid order even if the browser closed before verifying it."""
    if billing is None or razorpay is None or not razorpay.accepts_webhooks:
        raise payments_unavailable()
    raw = await request.body()
    if not razorpay.webhook_is_genuine(raw, request.headers.get("x-razorpay-signature", "")):
        raise payment_invalid()
    try:
        event = json.loads(raw)
        kind = event["event"]
    except (ValueError, KeyError, TypeError):
        return {"status": "ignored"}
    if kind in ("refund.processed", "refund.failed"):
        return await run_in_threadpool(refund_event, billing, kind, event)
    try:
        payment = event["payload"]["payment"]["entity"]
        order_id, payment_id, amount = payment["order_id"], payment["id"], payment["amount"]
    except (KeyError, TypeError):
        # Genuine but not a payment event we use; 200 so Razorpay doesn't retry it.
        return {"status": "ignored"}
    if kind not in ("payment.captured", "order.paid") or not order_id:
        return {"status": "ignored"}
    order = await run_in_threadpool(billing.get_order, order_id)
    if order is None or order.amount_paise != amount:
        logger.warning("Webhook for unknown or mismatched order %s", order_id)
        return {"status": "ignored"}
    await run_in_threadpool(billing.mark_paid, order.id, payment_id)
    return {"status": "ok"}


def refund_event(billing: BillingStore, kind: str, event: dict) -> dict:
    """refund.processed / refund.failed, for refunds started here or in Razorpay's dashboard."""
    try:
        refund = event["payload"]["refund"]["entity"]
        refund_id, payment_id, amount = refund["id"], refund["payment_id"], refund["amount"]
    except (KeyError, TypeError):
        return {"status": "ignored"}
    order = billing.order_for_payment(payment_id)
    if order is None:
        logger.warning("Refund %s is for unknown payment %s", refund_id, payment_id)
        return {"status": "ignored"}
    if amount != order.amount_paise:
        # Only full refunds are automatic; a partial one (made in the dashboard) needs you.
        logger.warning("Partial refund %s of order %s (%s of %s paise): adjust the time by hand", refund_id, order.id, amount, order.amount_paise)
        return {"status": "ignored"}
    if kind == "refund.processed":
        before = billing.refund_processed(order.id, refund_id)
        logger.info("Refund %s of order %s went through (was %s)", refund_id, order.id, before)
    elif billing.refund_failed(order.id):
        logger.error("Refund %s of order %s failed at Razorpay; the time was put back", refund_id, order.id)
    return {"status": "ok"}
