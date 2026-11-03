# Runbook: the launch offer

From 2026-11-03 until you end it by hand: **60 free minutes** for every account (normally 20) and packs at **₹29** (1 session) and **₹119** (5 sessions), 40% off the normal ₹49 and ₹199.

| What | Where |
|---|---|
| Prices charged and free time for new accounts | `LAUNCH_OFFER` in `backend/app/billing/packs.py` |
| What the pricing pages, billing screen and Terms say | `LAUNCH_OFFER` in `frontend/src/content/business.ts` |
| Existing accounts' free time | migration `0009`, run once at the first deploy: everyone topped up to 60 minutes |
| Daily cap on free minutes | `UMLESS_FREE_MINUTES_PER_DAY=100000` in `backend/.env` (off while the offer runs) |

## Ending the offer

1. Set `LAUNCH_OFFER = False` in **both** files above (they must match), and update the date in `LAST_UPDATED` (`business.ts`) because the Terms prices change.
2. Run the tests (the price tests follow the switch), then commit, merge and deploy as usual.
3. From the deploy on: new orders cost ₹49 / ₹199, and new accounts get 20 free minutes. **Not changed:** orders already paid at ₹29 / ₹119 (they keep their amount, and refunds return what was paid), and the free minutes people already have.
4. Delete the `UMLESS_FREE_MINUTES_PER_DAY=100000` line from `backend/.env`, and recreate the backend (`cd ~/umless/umless/deploy && docker compose up -d backend`). The 600 minutes a day cap applies again; raise it there if you want more.

## While it runs

- **Deepgram credit.** There is no card on the Deepgram account, only credit that expires on 14 Nov. When it runs out or expires, every transcription fails, including for paying users, and Sentry emails you ("Deepgram refused the key"). Put the new key in `backend/.env` as `DEEPGRAM_API_KEY` and recreate the backend.
- **What it costs.** Deepgram at about ₹0.37 a minute: a 60-minute free trial is about ₹22 per account; a ₹29 pack leaves about ₹6 and a ₹119 pack about ₹4 if every minute is used (after Razorpay's fee and GST).
- **No daily cap**, so a burst of fake sign-ups can use the credit fast. Clerk's bot protection and email verification (Phase 4) and the per-user limits (30 an hour, one at a time) still apply. Watch Deepgram's usage page the first days.
