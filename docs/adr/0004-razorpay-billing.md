# ADR 0004: Paid practice time with Razorpay

Status: accepted · Date: 2026-10-25

## Context

Every transcription is a paid Deepgram call, and umless is now public with sign-in (ADR 0003). Pricing agreed with the owner: 3 free transcriptions per account, then practice time sold in sessions of 60 minutes of recording: 1 session for ₹40, 5 for ₹120. Payments go through Razorpay (India, INR).

## Decisions

**1. Balance = free transcriptions (a count) + paid time (seconds).** Table `accounts` (one row per Clerk user, created with 3 free on first use). A transcript with words uses a free transcription if any are left, otherwise deducts its length (Deepgram's `duration_seconds`, else the last word's end, rounded up to a second), never below zero. A transcript with no words is free.

**2. Checked before Deepgram, charged after.** With no free transcription and no paid time, `createTranscription` answers 402 `payment_required` before reading the audio. The recording's length is only known afterwards, so the last few seconds of paid time can cover one more take of up to 10 minutes; that is the most a user can get unpaid, once.

**3. Razorpay Orders + Standard Checkout, verified on the server.**
- `POST /api/payments/orders` creates the Razorpay order with the amount from the server's price list (`app/billing/packs.py`), never from the client, and records it in `payment_orders`.
- The browser opens Checkout; its success handler's `razorpay_signature` goes to `POST /api/payments/verify`, which checks HMAC-SHA256(`order_id|payment_id`, key secret) and credits the order's time.
- `POST /api/payments/webhook` (`payment.captured`, `order.paid`; signed with the webhook secret) credits the order too, for when the tab closes before verify.
- Crediting locks the order row and is idempotent: verify and the webhook together credit once. An order belongs to the user who created it; another user's order id is 404, even with a genuine signature.
- Plain `httpx` and `hmac`, no Razorpay SDK: one REST call and two signature checks.

**4. Configuration fails closed.** `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` turn metering on; `RAZORPAY_WEBHOOK_SECRET` enables the webhook. A server with a database (the public deployment) refuses to start without the keys. Without them (local use) nothing is metered and `getAccount` says `metered: false`.

## Rejected

- **Razorpay Subscriptions:** the owner prices by usage, and recurring billing adds plans and renewal webhooks for no benefit.
- **Trusting the browser's recording length before transcribing:** can't be verified; Deepgram's duration is.
- **Charging silent takes:** Deepgram bills them, but charging users for "we couldn't hear any words" feels broken; the cost is small.

## Consequences

- Prices are code (`PACKS`); changing one is a deploy. Orders keep the amount and seconds they were bought at.
- Refunds are done in the Razorpay dashboard and do not remove time automatically.
- Going live means live keys (`rzp_live_…`) in `backend/.env`, a webhook in Razorpay's live mode, and Razorpay's website checks (terms, refund and contact pages) on umless.in.
