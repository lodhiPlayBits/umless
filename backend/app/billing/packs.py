"""What practice time costs (docs/adr/0004-razorpay-billing.md)."""

from dataclasses import dataclass

# Every new account's free practice time, used up by the second before any paid time. 20 minutes
# (6-8 full answers): enough to feel the product without replacing a purchase. 90 cost ≈ ₹33 in
# Deepgram per throwaway account and beat the ₹49 pack (decided 2026-11-01).
FREE_SECONDS = 20 * 60
# The longest recording the server transcribes (the app stops recording at 10:00).
MAX_RECORDING_SECONDS = 10 * 60
# Deepgram bills every recording, words or not, so takes are charged even when silent. The one
# exception: shorter than this with no words, which is what a muted or failed mic looks like.
FREE_SILENT_SECONDS = 15
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
