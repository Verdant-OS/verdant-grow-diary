# Plan — live Stripe checkout, smallest safe path

**Status:** `PROPOSED — NOT APPROVED`. Plan only. No code, schema, RLS, Edge, secret,
Lovable or production change was made to write it.
**Requested by:** Cheek, 2026-11-12 14:39 UTC ("What's the easiest way to get live checkouts?").
**Measured at:** deploy branch `verdant-grow-diary` at
`c2884348875b3dd39f2059ecc323ac10c33cfde5`, 2026-11-12.
**Author:** Claude (plan author). The author of this plan, and every builder of a slice
below, is excluded from that slice's independent review (`AGENTS.md` §13).

Labels follow `CLAUDE.md` evidence discipline: `established fact` (read in the repo at the
SHA above), `source claim` (a file or page says so), `inference`, `NOT_MEASURED`.

## 1. Answers to the three questions

1. **Is Stripe our checkout today? No.**
   - `established fact`: the repo has no Stripe checkout or webhook code. Every live
     checkout path is Paddle: `src/hooks/usePaddleCheckout.ts`, the Edge functions
     `get-paddle-price`, `checkout-status`, `paddle-portal-session` and
     `payments-webhook` (its header: "Lovable built-in Paddle webhook sink").
   - `source claim`: production already has Stripe columns and tables, from Lovable's
     migration `20261104184500` (`billing_provider`, `stripe_subscription_id`,
     `stripe_customer_id` on `subscriptions`; `stripe_payment_receipts`;
     `stripe_record_credit_payment`). Nothing in the repo writes or reads them for access.
   - `NOT_MEASURED`: whether Lovable deployed Stripe Edge functions that are not in the
     repo. A read-only function list on the Supabase project settles it.
2. **Is the payment key the wrong type?**
   - `established fact`: the committed Paddle client token in `.env.production` is the
     live type (`live_` prefix), and the prebuild gate
     `scripts/assert-paddle-production-sandbox.mjs` refuses a `test_` token.
   - `NOT_MEASURED`: the server-side Paddle API key and webhook secret are Supabase
     secrets. No agent can or should read them.
   - For Stripe, the right type is a **live** secret key (prefer a restricted `rk_live_`
     key scoped to Checkout Sessions, Customers, Subscriptions and Prices) plus the
     webhook signing secret (`whsec_`). Switching a key is a secret change, so it is
     Cheek's step (§5), never an agent's.
3. **Easiest live path:** Stripe's hosted Checkout page in subscription mode, started by
   one new server function and confirmed by one new webhook function, plus a small fix
   so the entitlement reader can see Stripe rows. No new table is expected (§4).

## 2. Why today's code cannot grant a Stripe subscription

`established fact`, from `supabase/functions/_shared/unionEntitlementLookup.ts` and
`src/lib/entitlements/lovablePaddleAdapter.ts`:

- The reader selects Paddle columns only. It never selects `billing_provider`,
  `stripe_subscription_id` or `stripe_customer_id`.
- Its tie-break sorts on `paddle_subscription_id`, which is null on a Stripe row.
- `mapLovableSubscriptionRow` grants a plan only through `KNOWN_PRICE_TO_PLAN[row.price_id]`
  (`pro_monthly`, `pro_annual`, `founder_lifetime`). An unknown price unlocks nothing,
  which is the correct fail-closed behavior and must stay.
- `src/hooks/useMyEntitlements.ts` mirrors the same window and order. It is presentation
  only; the server decides access (`AGENTS.md` §7).

`src/lib/entitlements/types.ts` already declares `BillingProvider = "stripe" | "paddle"`.

## 3. Build slices (each one PR, one owner, independent exact-head review)

### Slice A — reader sees Stripe rows (no live effect on its own)

- Select the provider-neutral columns and `billing_provider`; break ties on a key that is
  never null for either provider (confirm the live table's primary key first; the repo
  has no `create table public.subscriptions`).
- Keep `price_id` as the readable plan key (`pro_monthly`, `pro_annual`, and the Craft
  keys once they exist), so `KNOWN_PRICE_TO_PLAN` stays the one grant table.
- Tests: a Stripe row with a known key grants; unknown key grants nothing; a Paddle row
  and a Stripe row for one user resolve deterministically; a sandbox row never grants
  in live; existing Paddle fixtures unchanged.
- **Needs Cheek's yes:** the Edge redeploy of every function that imports the shared
  reader (it is shared, so `ai-doctor-review` and `ai-coach` metering read it too).

### Slice B — `stripe-checkout` Edge function (server-side start)

- Verifies the caller's JWT and takes the user id from it, never from the body.
- Body carries one readable plan key. The server maps it to a Stripe price id from env
  (`STRIPE_PRICE_PRO_MONTHLY_LIVE` and so on), mirroring `get-paddle-price`.
- **Stripe interlock (the `paddlePriceId: null` equivalent):** Free, `founder_lifetime`
  (no longer sold) and any key whose price env is unset are refused with a calm 503 and
  no Stripe call. Unsetting one env var turns that plan's checkout off.
- Creates a Checkout Session: `mode=subscription`, `client_reference_id` and
  `subscription_data.metadata.user_id` set to the verified user, the success URL back to
  `/upgrade`. Returns only the session URL.
- **Needs Cheek's yes:** new Edge function deploy; Stripe secrets (§5).

### Slice C — `stripe-webhook` Edge function (the only writer of Stripe rows)

- `verify_jwt = false` in `supabase/config.toml` (as `payments-webhook` has), because
  Stripe cannot send a Supabase JWT. Signature checked on the raw body with
  `STRIPE_WEBHOOK_SECRET` before anything else; bad or stale signature is 400.
- Rejects an event whose `livemode` disagrees with the server's resolved
  `PAYMENTS_ENVIRONMENT`.
- Handles `checkout.session.completed` and `customer.subscription.created|updated|deleted`.
  For each, it re-reads the subscription from Stripe and upserts on
  `(environment, stripe_subscription_id)` with `billing_provider='stripe'`. Re-reading
  makes duplicates and out-of-order deliveries harmless (idempotent replay).
- Maps the Stripe price back to the readable plan key on the server; an unmapped price
  writes no entitling row and logs a fixed code.
- Service role stays inside the function. No client write path is added.
- **Needs Cheek's yes:** new Edge function deploy and the `config.toml` change; the
  webhook endpoint in his Stripe dashboard (§5).

### Slice D — client entry point

- `useStripeCheckout` calls Slice B and redirects. `/pricing` and `/upgrade` CTAs use it
  for new sales; Paddle checkout is frozen for new sales, not removed.
- Pinned copy goes in `src/constants/*Copy.ts`; no pricing copy changes beyond the
  button target unless Cheek asks.

Not in this plan: credit packs (`stripe_record_credit_payment`, receipts table), Stripe
customer portal, tax, coupons, removing Paddle. Each is its own later slice.

## 4. Schema, RLS and Edge changes, each flagged for Cheek's yes

| Change                                              | Kind                                                      | Needs his yes                                          |
| --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| None to tables or RLS                               | `inference`: columns exist per migration `20261104184500` | Read-only production check first (§6)                  |
| Shared entitlement reader                           | Edge (shared code) redeploy                               | Yes                                                    |
| `stripe-checkout`                                   | New Edge function                                         | Yes                                                    |
| `stripe-webhook` + `config.toml`                    | New Edge function, gateway setting                        | Yes                                                    |
| Migration `20261104233500` (#2876) apply            | Production SQL                                            | Yes; needed before credit packs, not for subscriptions |
| Any migration the production check shows is missing | New additive migration                                    | Yes                                                    |

Migration `20261101180000` is the test-mode sink and must never be applied.

## 5. Cheek's own steps, in order

1. Activate the Stripe account for live payments (business, bank, identity).
2. In live mode, create the products and prices: Pro $12/mo and $99/yr; Craft $29/mo and
   $249/yr if Craft launches now. `established fact`: these are the prices in
   `src/constants/pricing.ts` on the deploy branch, which `src/config/pricing.ts` and the
   `/pricing` page read, and `src/test/pricing-monthly-label-free-tent.test.tsx` pins Pro at
   $12. Cheek picked Pro $12/mo and $99/yr on 2026-11-12 15:03 UTC, which supersedes the
   $19.99/mo and $199/yr note from 2026-08-12. The Stripe prices must match what the site shows.
3. Create a restricted live key and add it, the price ids and later the webhook secret to
   Supabase Edge secrets yourself. Do not paste keys into chat, PRs or Lovable.
4. Add the webhook endpoint (the `stripe-webhook` function URL) in Stripe with the four
   events in Slice C, and copy its signing secret into Supabase secrets.
5. Confirm `PAYMENTS_ENVIRONMENT=live` on the project.
6. After the slices are deployed, buy Pro monthly with a real card on
   https://verdantgrowdiary.com from a disposable test account, confirm access unlocks,
   then refund it in Stripe and confirm access ends at cancellation.

## 6. Checks before build

- Read-only on production: the `subscriptions` columns, constraints and primary key, and
  whether any Stripe Edge functions already exist. `scripts/sql/verify-stripe-payment-receipts-privileges.sql`
  covers the receipts privileges.
- `scripts/required-money-migrations.mjs` stays green for each slice.

## 7. Costs (`source claim`: stripe.com/pricing and stripe.com/billing/pricing, read 2026-11-12)

- 2.9% + 30¢ per successful domestic card charge; +1.5% international cards; +1% currency
  conversion; +0.5% manually entered cards; $15 per dispute.
- Stripe Billing (subscriptions): 0.7% of Billing volume, pay as you go.
- `inference` (arithmetic on those rates, before tax or international cards):

| Plan          | Card fee | Billing fee | Total fee | Net     |
| ------------- | -------- | ----------- | --------- | ------- |
| Pro $12/mo    | $0.65    | $0.08       | $0.73     | $11.27  |
| Pro $99/yr    | $3.17    | $0.69       | $3.86     | $95.14  |
| Craft $29/mo  | $1.14    | $0.20       | $1.34     | $27.66  |
| Craft $249/yr | $7.52    | $1.74       | $9.26     | $239.74 |

- `NOT_MEASURED`: whether Stripe returns the card fee on a refund. Budget about $0.65 for
  the step 6 test purchase.

## 8. Risks, rollback, Paddle subscribers

- **Paddle subscribers stay safe:** their rows, `payments-webhook`, `paddle-portal-session`
  and the Paddle price map are untouched. Slice A only adds Stripe visibility; a test pins
  that existing Paddle fixtures still grant exactly as before.
- **Wrong user gets access:** prevented by taking the user id from the verified JWT in
  Slice B and accepting only signed Stripe events in Slice C.
- **Sandbox grants live:** prevented by the environment filter plus the `livemode` check.
- **Double charge or duplicate rows:** the unique key on `(environment,
stripe_subscription_id)` plus re-read-then-upsert.
- **Rollback:** unset the Stripe price env vars (checkout refuses at once) and point the
  CTAs back to Paddle. Rows already written keep their paid access until period end.
  No migration to reverse.

## 9. Cheek's decisions

1. Repo server-side Stripe path (recommended) or Lovable-managed Stripe.
2. Launch Pro only, or Pro and Craft together. Pro price is decided: $12/mo and $99/yr
   (Cheek, 2026-11-12 15:03 UTC).
3. Yes on each Edge deploy and secret listed in §4 and §5, at the exact reviewed SHA.
4. Whether to apply #2876 now or with the later credit-pack slice.
5. Whether Paddle checkout is frozen or kept as a second option for new sales.
