# Paddle Sandbox Smoke Checklist

Rerun this whenever the billing surface changes — checkout, webhook, entitlement
gates, price IDs, env config. Mirrors the release-gate items in
`docs/paddle-paid-launch-runbook.md` §Release gate. Everything below is
**sandbox-only**; no real charges, no live secrets required.

Canonical lane since 2026-07-16: `payments-webhook` → `public.subscriptions`.
The BYO `paddle-webhook` / `billing_subscriptions` path is audit-only and
should stay empty in this flow.

## Pre-flight

- [ ] `VITE_PAYMENTS_CLIENT_TOKEN` starts with `test_` (check the preview
      network tab or the payments dashboard).
- [ ] `/pricing` renders with the **amber test-mode banner** at the top
      ("All payments made in the preview are in test mode").
- [ ] Pro Monthly, Pro Annual, and Founder Lifetime CTAs are enabled (not
      the "checkout unavailable" fallback).
- [ ] Founder counter on the pricing card shows a non-zero remaining count.

## Test card matrix

Any future expiry, any 3-digit CVC, any cardholder name.

| Card                  | CVC | Expected                                |
| --------------------- | --- | --------------------------------------- |
| `4242 4242 4242 4242` | 123 | Successful payment, no 3DS              |
| `4000 0000 0000 3220` | 123 | Triggers 3D Secure challenge            |
| `4000 0000 0000 0002` | 123 | Always declined                         |
| `4000 0027 6000 3184` | 123 | Succeeds initially, declines on renewal |

## Case 1 — Pro Monthly success

1. Sign in as a test account (not staff).
2. Open `/pricing` → click **Pro Monthly** → checkout overlay opens.
3. Pay with `4242 4242 4242 4242`.
4. Overlay closes → redirect to `/checkout/success`.
5. Within a few seconds, Settings shows a Pro badge.

Verify in the backend:

- [ ] One row in `public.subscriptions` with `environment='sandbox'`,
      `status='active'`, `price_id='pro_monthly'`, `paddle_subscription_id`
      matching what Paddle assigned.
- [ ] One row in `public.lovable_paddle_events` with
      `processing_status='processed'` and `processed_ok=true`.
- [ ] **Zero** new rows in `public.billing_subscriptions` (canonical lane
      is Lovable — BYO is silent here).

## Case 2 — Duplicate-delivery idempotency

1. In the Paddle sandbox dashboard → **Notifications** → find the delivery
   from Case 1 → click **Replay**.
2. Wait a few seconds.

Verify:

- [ ] No new row in `public.subscriptions` (unique constraint on
      `paddle_subscription_id` produces a 23505 upsert no-op).
- [ ] `public.lovable_paddle_events` shows the replay attempt recorded but
      NOT re-processed (idempotent on `paddle_event_id`).

## Case 3 — Declined card

1. Fresh signed-in test account.
2. `/pricing` → Pro Monthly → pay with `4000 0000 0000 0002`.
3. Expect a decline notice inside the Paddle overlay.

Verify:

- [ ] No `public.subscriptions` row.
- [ ] `public.lovable_paddle_events` may record a `transaction.payment_failed`
      event; no entitlement is granted.

## Case 4 — Founder Lifetime cap

1. Note the current `founder_lifetime_slots_remaining()` value (visible in
   the pricing-card counter or by calling the RPC).
2. Fresh test account → Founder Lifetime → pay with `4242 4242 4242 4242`.
3. After success, counter decrements by 1.

Verify:

- [ ] One row in `public.subscriptions` with `price_id='founder_lifetime'`,
      `current_period_end IS NULL`, `paddle_subscription_id` starting with
      `lifetime_` (CHECK constraint).
- [ ] `founder_number` populated 1..75 (unique per allocation).

Sold-out check (only run when convenient — do NOT use to actually exhaust
the cap): if `founder_lifetime_slots_remaining()` were 0, `get-paddle-price`
returns `409 plan_sold_out` and the checkout never opens.

## Case 5 — Cancel-and-resubscribe

1. Cancel the Case 1 subscription via the Paddle sandbox dashboard
   (Subscriptions → cancel immediately, or wait for period end and use
   Simulator to fire `subscription.canceled`).
2. Verify the row in `public.subscriptions` flips to `status='canceled'`.
3. From the same account, purchase Pro Monthly again with `4242…4242`.

Verify:

- [ ] A **new** row in `public.subscriptions` (new `paddle_subscription_id`)
      with `status='active'`. The old canceled row remains.
- [ ] Settings shows Pro (entitlement resolves to the newer active row).

## Case 6 — Entitlement gate re-check

For the account from Case 1 or Case 4:

- [ ] Call `select public.has_pheno_tracker_entitlement(<user_id>)` as
      service role — expect `true`.
- [ ] Trigger an AI Doctor review — `ai_credit_spend` returns
      `status='spent'` with the correct `plan_id` and `scope='per_month'`
      (Pro) or the Pro allowance for Founder Lifetime.
- [ ] Confirm the resulting `ai_credit_spends.meta` records
      `server_billing_environment='sandbox'` and
      `entitlement_environment='sandbox'` (unless the account also has a
      valid live entitlement, which intentionally takes precedence).

For a **free** account (no subscription):

- [ ] `has_pheno_tracker_entitlement` returns `false`.
- [ ] `ai_credit_spend` for `ai_doctor_review` on a new grow returns
      `status='spent'` up to 3 credits, then
      `status='denied' reason='limit_reached'`.

The environment-aware spend RPC is service-role-only and is normally invoked
by AI Doctor / AI Coach after JWT verification. Do not call it from a browser
console. For operator SQL/API verification, provide the verified test user's
UUID as `p_user_id`, `p_billing_environment='sandbox'`, and the server-pinned
feature/model tier. An authenticated user client attempting the same RPC must
receive a permission denial.

- [ ] Repeat one AI Doctor request with the same idempotency key. The second
      spend response is `status='replayed'`, `result IS NULL`, and the edge
      returns a calm invalid response without a second provider call.
- [ ] Force a provider failure in a disposable test request. The service-only
      refund path appends one negative-weight reversal; replaying the refund is
      idempotent and leaves the original spend row unchanged.
- [ ] During expand verification, confirm both AI Doctor and AI Coach spend
      rows include `meta.server_billing_environment='sandbox'`. This proves the
      updated edges reached the new overload after the schema reload.
- [ ] After the separate contract migration only, attempt both legacy
      `ai_credit_spend` and `ai_credit_refund` RPCs with an authenticated user
      token. Both receive permission denial; no new spend or reversal row
      appears.

## After each run

- Note the exact `paddle_subscription_id`s created in a scratch file so you
  can clean them up if desired (sandbox rows don't need cleanup, but it's
  useful for isolation between reruns).
- If any check fails, capture the row from `lovable_paddle_events`
  (`skip_reason`, `last_error`) — it names the exact webhook path that
  didn't process.
