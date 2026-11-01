# Stripe test-mode setup

Issue #2669, slice 1. This runbook is for a later, separately authorized
operator step. The pull request that adds it does not deploy functions, does
not apply the migration, and does not create Stripe products.

## What this slice ships

- `create-checkout-session` opens a Stripe Checkout Session with Managed
  Payments enabled. Callers must be signed in. Founder Lifetime answers
  `410 plan_retired` before any Stripe request.
- `stripe-webhook` verifies `Stripe-Signature` on the raw body, then calls
  `public.apply_stripe_test_mode_event`. A live-mode event is refused with
  no database write.
- `supabase/migrations/20261101180000_stripe_test_mode_subscription_sink.sql`
  is the additive schema. It is not applied.

Purchasable products: Pro monthly ($12), Pro annual ($99), Craft monthly
($29), Craft annual ($249), credit pack 50 ($9), credit pack 150 ($19).
Founder Lifetime stays retired. There is no Founder Stripe product and no
`STRIPE_PRICE_FOUNDER_LIFETIME` secret.

## Operator steps, test mode only

1. In the Stripe dashboard, stay in test mode. Create six products and one
   USD price each, at the amounts above. Use tax code `txcd_10103100` for
   every product. Do not create a Founder Lifetime product. Do not copy a
   live-mode price id.
2. Store the six test-mode price ids as Lovable secrets under
   `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`,
   `STRIPE_PRICE_CRAFT_MONTHLY`, `STRIPE_PRICE_CRAFT_ANNUAL`,
   `STRIPE_PRICE_CREDIT_PACK_50`, and `STRIPE_PRICE_CREDIT_PACK_150`.
   The checkout function reads the Price back from Stripe and refuses it
   unless currency is USD, the unit amount matches the catalog, and
   `livemode` is false.
3. Store `STRIPE_SECRET_KEY` as a test secret key (`sk_test_` only). A
   missing key or any `sk_live_` value fails closed and does not call Stripe.
4. Register a test-mode webhook endpoint for `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, and `invoice.payment_failed`. Store its
   signing secret as `STRIPE_WEBHOOK_SECRET` (`whsec_`). The function
   verifies the raw body. Set the endpoint's API version to
   `2026-02-25.preview`. Checkout sends the subscription id; the webhook
   loads that Subscription with `STRIPE_SECRET_KEY` before granting.
5. Set `STRIPE_CHECKOUT_RETURN_ORIGIN` to exactly one of
   `https://verdantgrowdiary.com`, `https://www.verdantgrowdiary.com`,
   `http://127.0.0.1:8080`, or `http://localhost:8080`. Return URLs are
   `/checkout/success` and `/checkout/cancel` on that origin.
6. Apply `20261101180000_stripe_test_mode_subscription_sink.sql` only after
   a separate authorization names that file. Until then, do not deploy
   `create-checkout-session` or `stripe-webhook`: customer reuse and the
   webhook RPC depend on the new tables.

## What the webhook writes

Subscription grants become `public.subscriptions` rows with `provider =
'stripe'`, `environment = 'sandbox'`, `price_id` set to the plan id, and
`paddle_subscription_id` set to `stripe:` plus the Stripe subscription id.
Raw Stripe ids are not stored in `paddle_subscription_id`. Credit packs call
the existing `grant_lovable_credit_pack` with credits chosen in SQL from the
plan id (50 or 150) and environment `sandbox`. The checkout session id is
the idempotency key. Founder allocation functions are not called.

## Not in this slice

Pricing page, upgrade and portal UI, Paddle removal, and the delete-account
dialog copy remain later slices. Hosted Checkout screenshots are
`NOT_MEASURED` until a test-mode key is used on an authorized deploy.
