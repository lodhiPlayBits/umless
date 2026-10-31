# Roadmap: self-serve refunds

Date: 2026-10-31 · Status: approved 2026-10-31, done 2026-10-31 · Policy: `/legal/refunds` · Today's process: `docs/runbooks/refunds.md`

## Goal

A customer can refund an **unused pack bought within the last 7 days** by pressing a button on the Purchases page. umless checks the policy, takes the time back and asks Razorpay to return the money. Razorpay's webhooks then tell umless how it went. No email to you, no SQL by hand.

Done when:
- an eligible purchase shows **Request refund**, and an ineligible one doesn't;
- pressing it removes the time at once and shows "Refund in progress"; Razorpay's `refund.processed` turns it into "Refunded";
- a refund Razorpay rejects puts the time back, shows the purchase as paid again, and alerts you;
- a refund you start in the Razorpay dashboard is picked up the same way;
- a late payment webhook can never credit a refunded order again;
- all tests pass, including the new ones below, and the runbook describes the new flow.

## Today (manual)

1. The customer emails you.
2. You check eligibility in MySQL.
3. You click Refund in the Razorpay dashboard.
4. You remove the time with SQL, and must leave the order `paid`.

## Known bug this fixes

Crediting an order (browser confirmation or the `order.paid` / `payment.captured` webhooks) checks `status != "paid"`. Any other status, such as a future `refunded`, would be **credited again** by a late webhook. That's why the runbook says never to change the status. Reproduced on 2026-10-31 with a test, then removed until this roadmap is approved: a `refunded` order got its 3600 s back.

Fix: credit **only** orders whose status is `created`.

## Progress

- 2026-10-31: **Approved:** the API change, 7 days + unused as the policy says, start now. Reason: "I don't want to initiate refunds myself every time."
- 2026-10-31: **Phase 1 done (contract only).**
  - `docs/api/openapi.yaml`:
    - `requestRefund`;
    - `Purchase.status` and `Purchase.refundable`;
    - `listPurchases` includes refunded purchases;
    - `ErrorCode` `refund_not_allowed`;
    - the webhook description covers the refund events.
  - Logged in the `docs/BUILD.md` decisions log; `openapi.d.ts` regenerated. Schemathesis loads the contract (16 operations).
  - **Expected until Phases 2–3:**
    - backend: 3 tests fail (error-code list, `status`/`refundable` on purchases, the new operation's contract case);
    - frontend: `tsc` flags 2 `BillingPanel.test.tsx` fixtures without the new fields.

    **Don't deploy or merge Phase 1 alone.**
- 2026-10-31: **Phase 2 done (backend, not deployed).**
  - Regression test first: a `refund_pending` or `refunded` order was credited again by `mark_paid`. It failed before the fix and passes now; crediting is only for `created` orders, in both stores.
  - Store:
    - `refund_refusal()` is the one rule (status, `REFUND_DAYS = 7`, balance covers the pack);
    - `start_refund` takes the time and sets `refund_pending` atomically, locking the order then the account, as `mark_paid` does;
    - also `refund_started`, `cancel_refund`, `refund_processed` (takes the time if still `paid`), `refund_failed` and `order_for_payment`.
  - Migration `0005`: `refund_id`, `refunded_at`, and an index on `payment_id`.
  - Razorpay: `refund()` calls `POST /v1/payments/{id}/refund` (full amount, normal speed).
  - Endpoint `POST /api/payments/{order_id}/refund`: a Razorpay failure puts the time back, logs at ERROR and answers 502.
  - Webhook: `refund.processed` / `refund.failed`; partial or unknown refunds → WARNING + ignored.
  - Tests: 18 new (API, webhooks, Razorpay client, MySQL store). Full suite with MySQL and Redis: **596 passed**.
  - Frontend `tsc` still flags the 2 fixtures until Phase 3.
- 2026-10-31: **Phase 3 done (frontend, not deployed).**
  - `billingApi.requestRefund`; `model/useRefund.ts`: the request, a message per cause (the server's own reason for 409/502), and a reload of purchases and balance afterwards.
  - `PurchaseHistory`:
    - **Request refund** on refundable rows only;
    - the confirm dialog "Refund ₹40?" ("1 h will be removed from your practice time now…");
    - badges "Refund in progress" and "Refunded";
    - a success or failure banner with Dismiss.
  - Tests: the 2 fixtures gained `status`/`refundable`; 8 new (button only when refundable, badges, confirm → request → reload, cancel, server reason shown, error messages).
  - Results: **470 passed**, lint clean, `tsc` and build clean.
- 2026-10-31: **Phase 4 done.**
  - The webhook events `refund.processed` and `refund.failed` are enabled (you, in Razorpay).
  - `docs/runbooks/refunds.md` rewritten: self-serve is the normal path, with a table of the log lines that need you; manual refunds are for exceptions (a full refund in the dashboard is picked up by the webhook); the "never change the status" warning is gone.
  - CLAUDE.md: the open item is closed, and the order-status rule is added.
- 2026-10-31: **Phase 5: deployed; live test left (you).**
  - Before: a backup (`umless-20261031T184128Z`), and images tagged `rollback-20261031-1841`.
  - Backend and frontend rebuilt; migration `0004 → 0005` ran on start; both healthy.
  - Checked from outside:
    - the site and health answer 200;
    - `POST /api/payments/…/refund` without sign-in → 401;
    - the Purchases bundle contains "Request refund".
  - **Not committed yet.**
- 2026-10-31: **Live test passed; done.**
  - `order_TucPrFmp8XFnAQ` (₹40, account `user_3LTJh11…`): refund `rfnd_TucQgqnRvy1Bw6` requested at 18:44:53; `refund.processed` arrived at 18:45:27 and the order was marked `refunded`.
  - The first try, on a 28 Oct purchase, got Razorpay 400 "The id provided does not exist". It was a **test-mode** payment from before the live keys. The failure path worked: time back, 502, ERROR logged.
  - Those test-mode orders show "Request refund" until 4 Nov (7 days) and fail safely. They're only on the owner's accounts, so they're left as they are.

## Design

### Order statuses
```
created ──(payment confirmed)──▶ paid ──(refund requested)──▶ refund_pending ──(refund.processed)──▶ refunded
                                   ▲                                  │
                                   └─────────(refund.failed)──────────┘   time put back, you're alerted
```

### Who can refund (one rule, used everywhere)
An order is refundable when **all** of these hold:
- it belongs to the signed-in user;
- its status is `paid`;
- it was paid **within the last 7 days** (from `paid_at`);
- the account's paid time is **at least the pack's time**, meaning it hasn't been used. With several packs, time is one pool, so any pack the balance still fully covers counts as unused.

Not self-serve (stays manual, as in the runbook): charged twice, charged but no time, and partial refunds. They need your judgement.

### The request: `POST /api/payments/{orderId}/refund`
1. Check the rule. Another user's order, or an unknown one, gets 404 `order_not_found`. A rule failure gets 409 `refund_not_allowed`, with the reason in plain words ("more than 7 days ago", "some of this time has been used", "already refunded").
2. **In one MySQL transaction**, with the order and account rows locked: subtract the pack's time and set `refund_pending`. The time goes first so it can't be spent while the refund is in flight.
3. Call Razorpay: `POST /v1/payments/{payment_id}/refund`, full amount, speed `normal`, with notes `{order_id, user_id}`. Store the refund id it returns.
4. If Razorpay refuses or can't be reached: undo step 2 (time back, `paid`), log at ERROR and answer 502 `payment_provider_failed` ("Your practice time is unchanged; try again later").
5. Success: answer 200 with the updated purchase (`refund_pending`).

Bearer-token sign-in means another site can't trigger this from a form (no CSRF), so no request body is needed.

### Razorpay's webhooks (same URL, two new events)
- `refund.processed`: find the order by the refund's `payment_id` and check the amount is the full order amount.
  - `refund_pending` → `refunded`, store `refunded_at`.
  - `paid` → also take the time (floor 0), then `refunded`. This covers a refund started in the dashboard, or a call whose answer was lost (umless undid it, but Razorpay did refund).
  - `refunded` → nothing (repeat delivery).
- `refund.failed`: `refund_pending` → time back, `paid`, logged at ERROR.
- A partial amount is logged at WARNING and left for you (manual).

### Money comes from your Razorpay balance
Razorpay pays refunds from your **unsettled balance**. If it's too low (for example, everything was just settled to your bank), Razorpay rejects the refund and step 4 runs: the customer keeps their time, you get an alert, and you can top up or refund by hand. Worth knowing before launch.

## Phases

### Phase 1: Contract (S), needs your OK
`docs/api/openapi.yaml`:
- `Purchase` gains `status` (`paid` | `refund_pending` | `refunded`) and `refundable` (boolean, the rule above, computed by the server).
- `listPurchases` lists refunded and pending purchases too, with their status.
- New `requestRefund`: `POST /api/payments/{orderId}/refund`, answering 200 Purchase, 401, 404, 409 `refund_not_allowed`, 502, 503.
- `ErrorCode` gains `refund_not_allowed`.
- The `razorpayWebhook` description covers the refund events.
- A line in the `docs/BUILD.md` decisions log. Then `npm run gen:api`.

### Phase 2: Backend (M)
- **Regression test first** (the bug above), then the fix in `mark_paid`, in both stores.
- Migration `0005`: `payment_orders.refund_id` and `refunded_at` (both nullable).
- `Order` gains `refund_id` and `refunded_at`. `BillingStore` gains `start_refund`, `refund_started`, `cancel_refund`, `refund_processed` and `refund_failed`, plus `order_for_payment`, in both the in-memory and MySQL stores.
- `Razorpay.refund(payment_id, amount_paise, notes) -> refund_id`.
- The endpoint and the two webhook events, logged as INFO (requested, done) and ERROR (failed).
- `FakeRazorpay` gains `refund` for the tests and the contract fixture.

### Phase 3: Frontend (S–M)
- `billingApi.requestRefund(orderId)` and a mutation hook that refreshes purchases and the balance afterwards.
- Purchases list:
  - a **Request refund** button on refundable rows, opening a confirm dialog: "Refund ₹40? 60 minutes will be removed from your practice time now. Razorpay returns the money in 5–7 working days.";
  - badges "Refund in progress" and "Refunded";
  - an error message from the API's `detail`.
- Unit tests for the row states and the dialog; the e2e purchases spec, if one covers Billing.

### Phase 4: Setup and docs (S)
- **You:** Razorpay dashboard → Webhooks → your webhook → add events `refund.processed` and `refund.failed`.
- `docs/runbooks/refunds.md`: self-serve is the normal path; the manual path stays for the exceptions. Drop the "never change the status" warning, since the fix makes it safe.
- CLAUDE.md's open item "refunded practice time is removed by hand": closed.

### Phase 5: Deploy and live test (S)
1. Deploy the backend (it runs migration 0005 on start) and the frontend.
2. **You:** buy ₹40 and refund it straight away from Purchases. Check:
   - "Refund in progress", then "Refunded" once Razorpay's webhook arrives;
   - the balance goes down by 60 minutes at once;
   - Razorpay's dashboard shows the refund.
3. Check that a purchase older than 7 days, or a used one, shows no button.

## Tests (Phase 2–3)

| Case | Expected |
|---|---|
| Eligible order | 200, `refund_pending`, time removed, Razorpay called once with the full amount |
| Paid 7 days ago vs 7 days and 1 second ago | refundable vs 409 |
| Part of the time used | 409 "some of this time has been used" |
| Another user's order / unknown id / never paid | 404 |
| Requested twice (double click) | the second gets 409 "already refunded"; Razorpay called once |
| Razorpay refuses or times out | 502, time back, status `paid` |
| `refund.processed` for pending / paid / refunded | refunded / refunded with time taken / no change |
| `refund.failed` | time back, `paid`, logged at ERROR |
| Partial-amount refund event | ignored, WARNING |
| Late `order.paid` after a refund | no credit (the regression test) |
| Contract | Schemathesis validates the new endpoint and the changed `Purchase` |

## Risks

| Risk | Mitigation |
|---|---|
| Razorpay refunds but the answer is lost; umless puts the time back | `refund.processed` on a `paid` order takes the time and marks it refunded |
| Customer spends the time while the refund is in flight | Time is removed before Razorpay is called |
| Refund rejected for a low Razorpay balance | Time back, ERROR alert, manual follow-up |
| Abuse: buy, use a little, refund | Only refundable while the balance covers the whole pack |

## Decisions needed before Phase 1

1. **OK the API change** (Phase 1)?
2. **7 days and "unused" exactly as the policy says?** (Your published policy already promises this.)
3. **Order of work:** after or before Sentry and the account-deletion phase of the launch roadmap?
