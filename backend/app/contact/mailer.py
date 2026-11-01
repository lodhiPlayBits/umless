"""Sends email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).

One POST with a bearer key, so plain httpx instead of an SDK. Plain text only.
"""

import httpx

RESEND_URL = "https://api.resend.com/emails"


class MailError(Exception):
    """The email couldn't be sent. Messages never contain the API key."""


class ResendMailer:
    def __init__(self, api_key: str, sender: str, timeout: float = 15.0, transport: httpx.AsyncBaseTransport | None = None):
        self._api_key = api_key
        self._sender = sender
        self._timeout = timeout
        self._transport = transport

    async def send(self, to: str, reply_to: str, subject: str, text: str) -> str:
        """The new email's Resend id."""
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=self._timeout) as client:
                response = await client.post(
                    RESEND_URL,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json={"from": self._sender, "to": [to], "reply_to": reply_to, "subject": subject, "text": text},
                )
        except httpx.HTTPError as exc:
            raise MailError(f"send email: {type(exc).__name__}") from None
        if response.status_code not in (200, 201):
            # Resend's error body describes the request, never the key.
            raise MailError(f"send email: HTTP {response.status_code} {response.text[:300]}")
        return response.json().get("id", "")
