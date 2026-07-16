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

| Plan              | Price          | Cadence    | Slug               |
| ----------------- | -------------- | ---------- | ------------------ |
| Pro Monthly       | $12            | / month    | `pro-monthly`      |
| Pro Annual        | $99            | / year     | `pro-annual`       |
| Founder Lifetime  | $129 (one-time)| one-time   | `founder-lifetime` |

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
- [ ] Set `PAYMENTS_ENVIRONMENT=live` and install live `VITE_PAYMENTS_CLIENT_TOKEN`
      + live webhook secret + live API key + live price IDs as one reviewed
      change.
