"""Razorpay: create orders, confirm payments, and check payment and webhook signatures.

A few REST calls and two HMAC checks, so plain httpx instead of Razorpay's SDK.
"""

import hashlib
import hmac

import httpx

API = "https://api.razorpay.com/v1"


class RazorpayError(Exception):
    """Razorpay couldn't be reached or refused. Messages never contain the key secret."""


def _signature(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


class Razorpay:
    def __init__(self, key_id: str, key_secret: str, webhook_secret: str | None = None, timeout: float = 15.0):
        self.key_id = key_id
        self._key_secret = key_secret
        self._webhook_secret = webhook_secret
        self._timeout = timeout

    def create_order(self, amount_paise: int, currency: str, receipt: str, notes: dict) -> str:
        """The new order's id (order_...)."""
        try:
            response = httpx.post(
                f"{API}/orders",
                auth=(self.key_id, self._key_secret),
                json={"amount": amount_paise, "currency": currency, "receipt": receipt[:40], "notes": notes},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise RazorpayError(f"create order: {type(exc).__name__}") from exc
        if response.status_code != 200:
            # Razorpay's error body describes the request, never the secret.
            raise RazorpayError(f"create order: HTTP {response.status_code} {response.text[:300]}")
        return response.json()["id"]

    def _request(self, method: str, path: str, action: str, **kwargs) -> httpx.Response:
        try:
            return httpx.request(
                method, f"{API}{path}", auth=(self.key_id, self._key_secret), timeout=self._timeout, **kwargs
            )
        except httpx.HTTPError as exc:
            raise RazorpayError(f"{action}: {type(exc).__name__}") from exc

    def payment_is_captured(self, payment_id: str, order_id: str, amount_paise: int, currency: str) -> bool:
        """Whether Razorpay holds this payment, for this order and amount, as captured.

        An authorized payment is captured here first: one left uncaptured is refunded by
        Razorpay after a few days. Raises RazorpayError if Razorpay can't be asked.
        """
        response = self._request("GET", f"/payments/{payment_id}", "fetch payment")
        if response.status_code in (400, 404):
            return False
        if response.status_code != 200:
            raise RazorpayError(f"fetch payment: HTTP {response.status_code} {response.text[:300]}")
        payment = response.json()
        if payment.get("order_id") != order_id or payment.get("amount") != amount_paise:
            return False
        if payment.get("status") == "authorized":
            captured = self._request(
                "POST",
                f"/payments/{payment_id}/capture",
                "capture payment",
                json={"amount": amount_paise, "currency": currency},
            )
            if captured.status_code != 200:
                # Captured meanwhile by Razorpay's own auto-capture: ask again.
                again = self._request("GET", f"/payments/{payment_id}", "fetch payment")
                if again.status_code != 200:
                    raise RazorpayError(f"capture payment: HTTP {captured.status_code} {captured.text[:300]}")
                return again.json().get("status") == "captured"
            payment = captured.json()
        return payment.get("status") == "captured"

    def payment_is_genuine(self, order_id: str, payment_id: str, signature: str) -> bool:
        """Checkout's success handler signature: HMAC-SHA256 of "order_id|payment_id"."""
        expected = _signature(self._key_secret, f"{order_id}|{payment_id}".encode())
        return hmac.compare_digest(expected, signature)

    @property
    def accepts_webhooks(self) -> bool:
        return bool(self._webhook_secret)

    def webhook_is_genuine(self, body: bytes, signature: str) -> bool:
        if not self._webhook_secret:
            return False
        return hmac.compare_digest(_signature(self._webhook_secret, body), signature)
