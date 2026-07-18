# Verdant Billing

## Status: sandbox / test mode only

Verdant is currently configured for **Paddle sandbox only**. No live charges
are accepted. No real money moves. No customer is granted Pro entitlement
from the client.

## Compliance note

**Verdant sells software, not cannabis.** Verdant does not sell cannabis,
seeds, nutrients, or any consumable or regulated product.

What Verdant sells:

- Grow diary
- Plant memory and plant profiles
- Sensor snapshot history and sensor truth
- Exports and automatic backups
- Cautious, grower-approved AI decision support

What Verdant does not sell:

- Cannabis, flower, or any consumable product
- Seeds, clones, or live plants
- Nutrients, fertilizers, or any chemical product
- Grow equipment, lights, tents, fans, or hardware
- Anything controlled, regulated, or age-restricted in the buyer's
  jurisdiction

Verdant is a software tool. The grower is responsible for complying with
all laws applicable to cultivation in their own jurisdiction.

## Plans (sandbox)

| Plan             | Price           | Cadence  | Slug               |
| ---------------- | --------------- | -------- | ------------------ |
| Pro Monthly      | $12             | / month  | `pro-monthly`      |
| Pro Annual       | $99             | / year   | `pro-annual`       |
| Founder Lifetime | $129 (one-time) | one-time | `founder-lifetime` |

Founder Lifetime is limited to the first 75 buyers. Founder Lifetime includes
100 AI Doctor credits per month; additional credit packs are planned later but
are not live yet.

## Configuration

The **canonical** client env var is `VITE_PAYMENTS_CLIENT_TOKEN` (Lovable
built-in Paddle integration). Its prefix (`test_` → sandbox, `live_` → live)
is the single source of truth for the client environment. On loopback hosts
a `live_` token fails closed and the checkout button renders as unavailable.

Legacy BYO client env vars (`VITE_PADDLE_ENVIRONMENT`,
`VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_PRICE_*`) are `@deprecated` and only
read by the operator audit surfaces / legacy `Upgrade.tsx` presenter. New
code should not reference them.

Server-only secrets (configured via Lovable Cloud → Secrets, never in
`.env`):

- `PAYMENTS_ENVIRONMENT` — server-controlled selector for the Lovable lane
  (`sandbox` or `live`; ignored client-supplied `env`)
- `PAYMENTS_SANDBOX_WEBHOOK_SECRET` / `PAYMENTS_LIVE_WEBHOOK_SECRET` — used
  by `payments-webhook` to verify Paddle signatures
- `PADDLE_SANDBOX_API_KEY` / `PADDLE_LIVE_API_KEY` — gateway connection keys
  for `get-paddle-price` and any server-side Paddle API calls
- `LOVABLE_API_KEY` — project-level gateway auth
- `SUPABASE_SERVICE_ROLE_KEY` — used inside AI Doctor / AI Coach only after
  caller JWT verification to invoke protected credit spend/refund RPCs. The
  browser never receives this key and cannot provide `user_id`, plan, model
  tier, weight, or billing environment.
- (Legacy, still read by the BYO audit sink) `PADDLE_ENVIRONMENT`,
  `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_PRO_MONTHLY`/`_PRO_ANNUAL`/
  `_FOUNDER_LIFETIME`

## Webhook

Canonical: `payments-webhook` (Lovable lane). Verifies the signature via
the shared `verifyWebhook` helper, records into `public.lovable_paddle_events`
idempotently on `paddle_event_id` (23505 = duplicate no-op), and writes
`public.subscriptions` directly for recurring plans + calls
`allocate_lovable_founder_lifetime` for Founder Lifetime.

Audit-only: `paddle-webhook` (BYO lane). Sandbox-only. Still verifies
signatures and writes `paddle_events` / `paddle_event_processing` /
`billing_subscriptions` for operator audit pages, but no longer contributes
to entitlement resolution as of 2026-07-16.

## Pro entitlement rule

Pro access must only be granted server-side after a verified Paddle webhook
event has written `public.subscriptions` (canonical Lovable lane). It must
never be granted from any client trust surface:

- A client-side checkout success callback
- A query string on a return URL
- Local storage, session storage, or any client-trusted flag

## AI credit environment boundary

AI credit metering uses the same server-authoritative environment decision as
the other Paddle gates:

- `PAYMENTS_ENVIRONMENT=live`: valid live rows may entitle; sandbox-only rows
  are ignored.
- `PAYMENTS_ENVIRONMENT=sandbox`: valid sandbox rows may entitle, while a valid
  live row retains precedence.
- AI Doctor and AI Coach verify the caller JWT first, derive the user id from
  that verified session, and resolve the environment from server secrets with
  `resolveRequiredServerBillingEnvironment()`. Cost-bearing AI fails closed
  unless `PAYMENTS_ENVIRONMENT` is explicitly `live` or `sandbox`; an invalid
  selector or any missing-selector key configuration never silently becomes
  sandbox.
- The environment-aware `ai_credit_spend` overload is executable only by
  `service_role`. In the final contract state, the former authenticated
  five-argument overload is revoked, so ordinary clients cannot manufacture
  spends, select a model weight, or point the meter at another user's
  subscription.
- Refunds use a service-only overload that receives the JWT-verified expected
  user id and checks ownership of the original spend. The final contract state
  also revokes authenticated access to the legacy refund function.

The ledger remains append-only. Refunds continue through `ai_credit_refund`,
and Founder Lifetime remains capped at 100 AI credits per UTC month.

Deployment is an expand/verify/contract sequence across two database releases.
The expand migration adds service-only overloads but deliberately leaves legacy
grants until both updated edges produce service-overload receipts after the
PostgREST schema reload. A separately reviewed contract migration then revokes
legacy access. Before expand, the new edges fall back only when PostgREST
specifically reports that the new overload is absent. See
[`ai-credit-billing-environment-rollout.md`](./ai-credit-billing-environment-rollout.md)
for the mandatory pause, residual expand-stage exposure, verification evidence,
and rollback order.

## What is still required before live payments

Before flipping to live Paddle:

- [ ] Complete Paddle live verification (merchant of record onboarding).
- [ ] Confirm acceptable use policy fit for Verdant (software-only).
- [ ] Refund / chargeback / adjustment handling beyond "record and ignore"
      (currently `adjustment.created/updated` events are stored but not
      auto-acted on; operator-manual only).
- [ ] Customer portal / "manage subscription" surface for the grower
      (Settings currently shows a placeholder dialog).
- [ ] Tax / receipt copy reviewed for software-only positioning.
- [ ] Sandbox smoke green per `docs/paddle-sandbox-smoke.md` (Pro Monthly,
      Pro Annual, Founder Lifetime, duplicate-delivery idempotency,
      cancel-and-resubscribe).
- [ ] Set `PAYMENTS_ENVIRONMENT=live` and install live `VITE_PAYMENTS_CLIENT_TOKEN` + live webhook secret + live API key + live price IDs as one reviewed
      change.
