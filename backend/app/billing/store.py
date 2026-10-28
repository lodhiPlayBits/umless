"""Balances and payment orders. Paid time is in seconds; free transcriptions are a count."""

import math
import threading
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Protocol

from app.billing.packs import FREE_TRANSCRIPTIONS


@dataclass(frozen=True)
class Balance:
    free_transcriptions_left: int
    seconds_left: int

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
    status: str  # "created" or "paid"
    payment_id: str | None = None


NEW_ACCOUNT = Balance(FREE_TRANSCRIPTIONS, 0)


def charged_seconds(duration_seconds: float) -> int:
    """Whole seconds to deduct for a recording, rounded up."""
    return max(0, math.ceil(duration_seconds - 1e-9))


class BillingStore(Protocol):
    def balance(self, user_id: str) -> Balance: ...

    def charge(self, user_id: str, duration_seconds: float) -> Balance:
        """Use a free transcription if any are left, else deduct the duration from paid time
        (never below zero)."""
        ...

    def add_order(self, order: Order) -> None: ...

    def get_order(self, order_id: str) -> Order | None: ...

    def mark_paid(self, order_id: str, payment_id: str) -> Balance | None:
        """Credit the order's time to its user once. Paying an already paid order changes
        nothing. None if there is no such order."""
        ...


class InMemoryBillingStore:
    """For local use: kept until the server stops."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._balances: dict[str, Balance] = {}
        self._orders: dict[str, Order] = {}

    def balance(self, user_id: str) -> Balance:
        with self._lock:
            return self._balances.get(user_id, NEW_ACCOUNT)

    def charge(self, user_id: str, duration_seconds: float) -> Balance:
        with self._lock:
            current = self._balances.get(user_id, NEW_ACCOUNT)
            if current.free_transcriptions_left > 0:
                new = replace(current, free_transcriptions_left=current.free_transcriptions_left - 1)
            else:
                new = replace(current, seconds_left=max(0, current.seconds_left - charged_seconds(duration_seconds)))
            self._balances[user_id] = new
            return new

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
            if order.status != "paid":
                self._orders[order_id] = replace(order, status="paid", payment_id=payment_id)
                current = replace(current, seconds_left=current.seconds_left + order.seconds)
                self._balances[order.user_id] = current
            return current


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
