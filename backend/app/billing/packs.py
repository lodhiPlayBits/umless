"""What practice time costs (docs/adr/0004-razorpay-billing.md)."""

from dataclasses import dataclass

# The launch offer (owner's decision, 2026-11-03): 60 free minutes and 40% off both packs, until
# the owner ends it by hand. To end it: set this to False here AND LAUNCH_OFFER in
# frontend/src/content/business.ts (the pricing pages), then deploy. Accounts already topped up
# by migration 0009 keep their free minutes; only new accounts and new orders go back to normal.
LAUNCH_OFFER = True

# Every new account's free practice time, used up by the second before any paid time. Normally 20
# minutes (6-8 full answers): enough to feel the product without replacing a purchase. 90 cost
# ≈ ₹33 in Deepgram per throwaway account and beat the ₹49 pack (decided 2026-11-01). The launch
# offer is 60 minutes.
NORMAL_FREE_SECONDS = 20 * 60
OFFER_FREE_SECONDS = 60 * 60
FREE_SECONDS = OFFER_FREE_SECONDS if LAUNCH_OFFER else NORMAL_FREE_SECONDS
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


def _pack(id: str, label: str, seconds: int, normal_paise: int, offer_paise: int) -> Pack:
    return Pack(id, label, seconds, offer_paise if LAUNCH_OFFER else normal_paise)


# The only prices the server charges: orders take the amount from here, never from the client.
# Normal ₹49 / ₹199; launch offer ₹29 / ₹119 (40% off). Orders already paid keep their amount.
PACKS = {
    pack.id: pack
    for pack in (
        _pack("session_1", "1 session · 60 minutes", 60 * 60, 49_00, 29_00),
        _pack("session_5", "5 sessions · 300 minutes", 5 * 60 * 60, 199_00, 119_00),
    )
}
