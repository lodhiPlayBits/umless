# Runbook: refunding a purchase

Refunds are manual (ADR 0004): Razorpay returns the money, and you remove the time by hand. Follow the published policy (`/legal/refunds`):

- **Unused pack, asked within 7 days of buying:** full refund.
- **Partly or fully used pack:** no refund.
- **Charged but no time credited, or charged twice:** refund the extra payment in full, any time.

You reply within 2 working days (the policy promises it).

## 1. Find the purchase

From the customer's email: the date and, ideally, the payment id (`pay_…`). They can copy it from Settings → Billing → Purchases.

Open a MySQL shell from the server (the database is only reachable from inside OCI):

```bash
cd ~/umless/umless/backend
sg docker -c 'docker run --rm -it --env-file .env mysql:8.4 sh -c "MYSQL_PWD=\$DB_PASSWORD mysql -h \$DB_HOST -P \${DB_PORT:-3306} -u \$DB_USER \$DB_NAME"'
```

Then look the order and the account up:

```sql
-- The order (by payment id, or by order id order_…)
SELECT id, user_id, pack_id, amount_paise, seconds, status, payment_id, created_at, paid_at
FROM payment_orders WHERE payment_id = 'pay_XXXXXXXX';

-- The customer's balance, and all their paid orders
SELECT user_id, free_transcriptions_left, seconds_left FROM accounts WHERE user_id = 'user_XXXXXXXX';
SELECT id, pack_id, seconds, payment_id, paid_at FROM payment_orders
WHERE user_id = 'user_XXXXXXXX' AND status = 'paid' ORDER BY paid_at;
```

To check that the email matches the account, find the user id in the Clerk dashboard → Users.

## 2. Decide

- **Is it unused?** It is if `seconds_left` is still **at least** the order's `seconds` (3600 for `session_1`, 18000 for `session_5`) and it's within 7 days of `paid_at`. Otherwise some of it was spent: refuse politely, quoting the policy.
- **Charged twice?** Two orders with the same pack within a few minutes, and the customer meant to buy once: refund the second.
- **Charged but no time?** The order's `status` is still `created` while Razorpay shows the payment captured. This should no longer happen with the webhook on (Phase 1). If it does, check `docker logs umless-backend | grep webhook` first, then refund or credit by hand (step 4).

## 3. Refund in Razorpay

Razorpay dashboard (**Live mode**) → Transactions → Payments → search the `pay_…` id → **Refund** → full amount → normal speed.

Note the refund id (`rfnd_…`). The money reaches the customer in 5–7 working days.

## 4. Remove the time

In the same MySQL shell, in one transaction. Replace the user id and the seconds (the order's `seconds`):

```sql
START TRANSACTION;
SELECT seconds_left FROM accounts WHERE user_id = 'user_XXXXXXXX' FOR UPDATE;
UPDATE accounts SET seconds_left = GREATEST(seconds_left - 3600, 0) WHERE user_id = 'user_XXXXXXXX';
SELECT seconds_left FROM accounts WHERE user_id = 'user_XXXXXXXX';
COMMIT;   -- or ROLLBACK; if the numbers look wrong
```

**Leave the order's `status` as `paid`.** The webhook and the browser credit an order only while it isn't `paid`. If you change it to anything else, a late webhook retry from Razorpay would credit the time again. The refunded order stays in the customer's Purchases list; the reply email explains it.

*Charged but no time* is the one case where you add instead (if you credit rather than refund): `UPDATE payment_orders SET status='paid', payment_id='pay_…', paid_at=UTC_TIMESTAMP() WHERE id='order_…';` and `seconds_left = seconds_left + <seconds>` in the same transaction.

## 5. Tell the customer

> Hi, your refund of ₹40 for the purchase on 31 Oct 2026 (payment pay_XXXXXXXX) has been sent. Razorpay refund id: rfnd_XXXXXXXX. It reaches your original payment method in 5–7 working days; your bank may take a few days more. The 60 minutes from that pack have been removed from your account. The purchase still shows in Settings → Billing, as a record. — umless

## 6. Keep a record

Add a line to a private refunds log (date, user id, payment id, refund id, amount, reason). You'll need it for accounts and tax.

## Later

Automate this from Razorpay's `refund.processed` webhook (roadmap: "After launch"). It would remove the time and mark the order refunded, with a status the crediting code knows never to credit again.
