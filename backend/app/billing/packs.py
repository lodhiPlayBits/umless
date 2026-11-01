"""What practice time costs (docs/adr/0004-razorpay-billing.md)."""

from dataclasses import dataclass

# Every new account's free practice time: 90 minutes (three 30-minute sessions), used up by the
# second, before any paid time.
FREE_SECONDS = 90 * 60
# The longest recording the server transcribes (the app stops recording at 10:00).
MAX_RECORDING_SECONDS = 10 * 60
# An unused pack can be refunded this long after it was paid for (the published refund policy).
REFUND_DAYS = 3


@dataclass(frozen=True)
class Pack:
    id: str
    label: str
    seconds: int
    amount_paise: int
    currency: str = "INR"


# The only prices the server charges: orders take the amount from here, never from the client.
PACKS = {
    pack.id: pack
    for pack in (
        Pack("session_1", "1 session · 60 minutes", 60 * 60, 49_00),
        Pack("session_5", "5 sessions · 300 minutes", 5 * 60 * 60, 199_00),
    )
}
