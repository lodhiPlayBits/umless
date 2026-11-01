"""Balances and payment orders. Paid time is in seconds; free transcriptions are a count."""

import math
import threading
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
from typing import Protocol

from app.billing.packs import FREE_TRANSCRIPTIONS, REFUND_DAYS


@dataclass(frozen=True)
class Balance:
    free_transcriptions_left: int
    seconds_left: int
    # When paid time (not a free transcription) was last used, UTC as PAID_AT_FORMAT. A pack
    # bought before then can't be refunded. Not part of equality: it's bookkeeping, not balance.
    last_paid_use_at: str | None = field(default=None, compare=False)

    @property
    def can_transcribe(self) -> bool:
        return self.free_transcriptions_left > 0 or self.seconds_left > 0


@dataclass(frozen=True)
class Order:
    id: str  # Razorpay's order id
    user_id: str
    pack_id: str
    amount_paise: int
    seconds: int
    # created → paid → refund_pending → refunded; a failed refund goes back to paid.
    status: str
    payment_id: str | None = None
    paid_at: str | None = None  # UTC, "2026-10-30T08:50:46Z"
    refund_id: str | None = None
    refunded_at: str | None = None  # UTC, as paid_at


NEW_ACCOUNT = Balance(FREE_TRANSCRIPTIONS, 0)
PAID_AT_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


# Orders that are purchases: listed, and never credited again.
PURCHASED = ("paid", "refund_pending", "refunded")


class RefundRefused(Exception):
    """The refund policy doesn't allow it; the message says why, in words for the user."""


def charged_seconds(duration_seconds: float) -> int:
    """Whole seconds to deduct for a recording, rounded up."""
    return max(0, math.ceil(duration_seconds - 1e-9))


USED_SINCE_BOUGHT = "Paid practice time has been used since this pack was bought, so it can't be refunded."


def refund_refusal(order: Order, balance: Balance, now: datetime) -> str | None:
    """Why a paid order can't be refunded now, or None if it can (the published policy: within
    REFUND_DAYS of paying, and no paid time used since; one session of a 5-session pack is
    enough to lose the refund). Paid time is one pool, so the test is *when* it was last used,
    not how much is left; free transcriptions don't count."""
    if order.status == "refund_pending":
        return "A refund for this purchase is already in progress."
    if order.status == "refunded":
        return "This purchase has already been refunded."
    if order.status != "paid" or not order.paid_at:
        return "This order was never paid for."
    if now - datetime.strptime(order.paid_at, PAID_AT_FORMAT) > timedelta(days=REFUND_DAYS):
        return f"This pack was bought more than {REFUND_DAYS} days ago, so it can't be refunded."
    if balance.last_paid_use_at and balance.last_paid_use_at >= order.paid_at:
        return USED_SINCE_BOUGHT
    # Also for use from before last_paid_use_at was recorded (2026-11-01).
    if balance.seconds_left < order.seconds:
        return USED_SINCE_BOUGHT
    return None


class BillingStore(Protocol):
    def balance(self, user_id: str) -> Balance: ...

    def charge(self, user_id: str, duration_seconds: float) -> Balance:
        """Use a free transcription if any are left, else deduct the duration from paid time
        (never below zero)."""
        ...

    def add_order(self, order: Order) -> None: ...

    def get_order(self, order_id: str) -> Order | None: ...

    def mark_paid(self, order_id: str, payment_id: str) -> Balance | None:
        """Credit the order's time to its user once, while it's still `created`. A paid or
        refunded order changes nothing. None if there is no such order."""
        ...

    def purchases(self, user_id: str) -> list[Order]:
        """The user's purchases (paid, refund pending or refunded), newest first.
        Opened-and-closed checkouts aren't purchases."""
        ...

    def order_for_payment(self, payment_id: str) -> Order | None: ...

    def start_refund(self, order_id: str) -> Order:
        """Atomically: check refund_refusal, take the pack's time back and make the order
        `refund_pending`. Raises RefundRefused."""
        ...

    def refund_started(self, order_id: str, refund_id: str) -> None:
        """Remember Razorpay's refund id."""
        ...

    def cancel_refund(self, order_id: str) -> None:
        """Razorpay refused to start it: a `refund_pending` order gets its time back and is
        `paid` again."""
        ...

    def refund_processed(self, order_id: str, refund_id: str) -> str:
        """Razorpay refunded it: make the order `refunded`, taking its time back if it was
        still `paid` (a refund started in Razorpay's dashboard, or a lost answer). Returns the
        status it had."""
        ...

    def refund_failed(self, order_id: str) -> bool:
        """Razorpay couldn't refund it: like cancel_refund. True if the time was put back."""
        ...


class InMemoryBillingStore:
    """For local use: kept until the server stops."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._balances: dict[str, Balance] = {}
        self._orders: dict[str, Order] = {}
        self._last_paid_use: dict[str, str] = {}

    def _balance(self, user_id: str) -> Balance:
        return replace(self._balances.get(user_id, NEW_ACCOUNT), last_paid_use_at=self._last_paid_use.get(user_id))

    def balance(self, user_id: str) -> Balance:
        with self._lock:
            return self._balance(user_id)

    def charge(self, user_id: str, duration_seconds: float) -> Balance:
        with self._lock:
            current = self._balances.get(user_id, NEW_ACCOUNT)
            if current.free_transcriptions_left > 0:
                new = replace(current, free_transcriptions_left=current.free_transcriptions_left - 1)
            else:
                new = replace(current, seconds_left=max(0, current.seconds_left - charged_seconds(duration_seconds)))
                if charged_seconds(duration_seconds) > 0:
                    self._last_paid_use[user_id] = utc_now().strftime(PAID_AT_FORMAT)
            self._balances[user_id] = new
            return self._balance(user_id)

    def add_order(self, order: Order) -> None:
        with self._lock:
            self._orders[order.id] = order

    def get_order(self, order_id: str) -> Order | None:
        with self._lock:
            return self._orders.get(order_id)

    def mark_paid(self, order_id: str, payment_id: str) -> Balance | None:
        with self._lock:
            order = self._orders.get(order_id)
            if order is None:
                return None
            current = self._balances.get(order.user_id, NEW_ACCOUNT)
            if order.status == "created":
                paid_at = utc_now().strftime(PAID_AT_FORMAT)
                self._orders[order_id] = replace(order, status="paid", payment_id=payment_id, paid_at=paid_at)
                current = replace(current, seconds_left=current.seconds_left + order.seconds)
                self._balances[order.user_id] = current
            return current

    def purchases(self, user_id: str) -> list[Order]:
        with self._lock:
            paid = [o for o in self._orders.values() if o.user_id == user_id and o.status in PURCHASED]
        # Reversed insertion order breaks ties within a second: the later payment comes first.
        return sorted(reversed(paid), key=lambda order: order.paid_at or "", reverse=True)

    def order_for_payment(self, payment_id: str) -> Order | None:
        with self._lock:
            return next((o for o in self._orders.values() if o.payment_id == payment_id), None)

    def _add_seconds(self, user_id: str, seconds: int) -> None:
        current = self._balances.get(user_id, NEW_ACCOUNT)
        self._balances[user_id] = replace(current, seconds_left=max(0, current.seconds_left + seconds))

    def start_refund(self, order_id: str) -> Order:
        with self._lock:
            order = self._orders[order_id]
            reason = refund_refusal(order, self._balance(order.user_id), utc_now())
            if reason:
                raise RefundRefused(reason)
            self._add_seconds(order.user_id, -order.seconds)
            self._orders[order_id] = order = replace(order, status="refund_pending")
            return order

    def refund_started(self, order_id: str, refund_id: str) -> None:
        with self._lock:
            self._orders[order_id] = replace(self._orders[order_id], refund_id=refund_id)

    def cancel_refund(self, order_id: str) -> None:
        self.refund_failed(order_id)

    def refund_processed(self, order_id: str, refund_id: str) -> str:
        with self._lock:
            order = self._orders[order_id]
            if order.status in ("paid", "refund_pending"):
                if order.status == "paid":
                    self._add_seconds(order.user_id, -order.seconds)
                refunded_at = utc_now().strftime(PAID_AT_FORMAT)
                self._orders[order_id] = replace(order, status="refunded", refund_id=refund_id, refunded_at=refunded_at)
            return order.status

    def refund_failed(self, order_id: str) -> bool:
        with self._lock:
            order = self._orders[order_id]
            if order.status != "refund_pending":
                return False
            self._add_seconds(order.user_id, order.seconds)
            self._orders[order_id] = replace(order, status="paid", refund_id=None)
            return True


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
