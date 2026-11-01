# Runbook: refunds

Published policy (`/legal/refunds`):
- **Within 3 days of buying, and no paid practice time used since:** full refund.
- **Any paid time used after buying** (even one session of a 5-session pack): no refund. Free transcriptions don't count.
- **Charged but no time credited, or charged twice:** refund the extra payment in full, any time.

## The normal path: self-serve (nothing for you to do)

Since 2026-10-31 (`docs/roadmap/2026-10-31-self-serve-refunds.md`), customers refund unused packs themselves: Settings → Billing → Purchases → **Request refund**. The button only appears when the policy allows it: paid within 3 days, and no paid time used since (`accounts.last_paid_use_at` is before the purchase; set on every paid charge since 2026-11-01).

What happens:
1. umless removes the pack's time and marks the purchase `refund_pending` ("Refund in progress").
2. umless asks Razorpay to refund the full amount (`POST /v1/payments/{id}/refund`).
3. Razorpay's `refund.processed` webhook marks it `refunded`. The money reaches the customer in 5–7 working days.

Order statuses: `created → paid → refund_pending → refunded`. A failed refund goes back to `paid`, with the time restored.

**What can need you:**

| Log line (`docker logs umless-backend`) | Meaning | Do |
|---|---|---|
| `ERROR … Refund of order … failed at Razorpay; the time was put back` | Razorpay refused to start it. Usually your **Razorpay balance is too low** (it was just settled to your bank) | Check the Razorpay dashboard. Top up or wait for new payments, then tell the customer to try again, or refund by hand (below) |
| `ERROR … Refund rfnd_… of order … failed at Razorpay; the time was put back` | Razorpay accepted it, then failed (`refund.failed`) | Same as above |
| `WARNING … Partial refund …` | Someone made a partial refund in the dashboard | Adjust the time by hand (below) |
| `WARNING … Refund … is for unknown payment …` | A refund of a payment umless doesn't know (another site on the same Razorpay account?) | Nothing, unless it's yours |

The webhook needs the events `refund.processed` and `refund.failed` enabled in Razorpay (Account & Settings → Webhooks, the `https://umless.in/api/payments/webhook` entry). They are on since 2026-10-31.

## The exceptions: refunds by hand

Charged twice, charged but no time, a partial refund, or a refund the policy wouldn't allow but you choose to give. You reply within 2 working days (the policy promises it).

### 1. Find the purchase

From the customer's email: the date and, ideally, the payment id (`pay_…`), which they can copy from Settings → Billing → Purchases.

Open a MySQL shell from the server (the database is only reachable inside OCI):

```bash
cd ~/umless/umless/backend
sg docker -c 'docker run --rm -it --env-file .env mysql:8.4 sh -c "MYSQL_PWD=\$DB_PASSWORD mysql -h \$DB_HOST -P \${DB_PORT:-3306} -u \$DB_USER \$DB_NAME"'
```

```sql
SELECT id, user_id, pack_id, amount_paise, seconds, status, payment_id, refund_id, paid_at, refunded_at
FROM payment_orders WHERE payment_id = 'pay_XXXXXXXX';
SELECT user_id, free_transcriptions_left, seconds_left FROM accounts WHERE user_id = 'user_XXXXXXXX';
```

To check that the email matches the account, find the user id in the Clerk dashboard (**Production**) → Users.

### 2. Refund in Razorpay

Razorpay dashboard (**Live mode**) → Transactions → Payments → search the `pay_…` id → **Refund** → full amount → normal speed.

**For a full refund, that's all.** The `refund.processed` webhook finds the order, takes its time back (floor 0) and marks it `refunded`, exactly as if the customer had pressed the button. Check afterwards that the order shows `refunded`.

### 3. Only for partial refunds, or credit instead of money

The webhook leaves partial refunds alone. Adjust by hand, in one transaction:

```sql
START TRANSACTION;
SELECT seconds_left FROM accounts WHERE user_id = 'user_XXXXXXXX' FOR UPDATE;
UPDATE accounts SET seconds_left = GREATEST(seconds_left - <seconds>, 0) WHERE user_id = 'user_XXXXXXXX';
SELECT seconds_left FROM accounts WHERE user_id = 'user_XXXXXXXX';
COMMIT;   -- or ROLLBACK; if the numbers look wrong
```

*Charged but no time*, credited instead of refunded:

```sql
START TRANSACTION;
UPDATE payment_orders SET status='paid', payment_id='pay_…', paid_at=UTC_TIMESTAMP() WHERE id='order_…' AND status='created';
UPDATE accounts SET seconds_left = seconds_left + <seconds> WHERE user_id = 'user_…';
COMMIT;
```

Setting an order's status by hand is safe: a late payment webhook only credits orders still `created`, so a `paid`, `refund_pending` or `refunded` order is never credited twice. Until 2026-10-31 that wasn't true; the fix came with self-serve refunds.

### 4. Tell the customer

> Hi, your refund of ₹40 for the purchase on 31 Oct 2026 (payment pay_XXXXXXXX) has been sent. Razorpay refund id: rfnd_XXXXXXXX. It reaches your original payment method in 5–7 working days; your bank may take a few days more. The 60 minutes from that pack have been removed from your account. — umless

### 5. Keep a record

Add a line to a private refunds log: date, user id, payment id, refund id, amount and reason. You'll need it for accounts and tax.
