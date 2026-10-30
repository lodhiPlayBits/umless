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
from app.billing.store import Balance, BillingStore, Order
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
        "free_transcriptions_left": balance.free_transcriptions_left if balance else 0,
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


def purchase_body(order: Order) -> dict:
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
    }


@router.get("/payments")
def list_purchases(
    user_id: str = Depends(get_user_id), billing: BillingStore | None = Depends(get_billing)
) -> dict:
    # A server without payments has nothing to list, like /api/account's "metered": false.
    return {"items": [purchase_body(order) for order in billing.purchases(user_id)] if billing else []}


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
        payment = event["payload"]["payment"]["entity"]
        kind, order_id, payment_id, amount = event["event"], payment["order_id"], payment["id"], payment["amount"]
    except (ValueError, KeyError, TypeError):
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
