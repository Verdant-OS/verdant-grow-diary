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
| Pro Annual        | $115           | / year     | `pro-annual`       |
| Founder Lifetime  | $129 (one-time)| one-time   | `founder-lifetime` |

Founder Lifetime is limited to the first 75 buyers.

## Configuration

Sandbox config is read from `VITE_PADDLE_*` env vars (see `.env.example`).
If any required value is missing, or if `VITE_PADDLE_ENVIRONMENT` is set to
`live` or `production`, the billing page renders a safe "checkout
unavailable" state. The client-side checkout helper refuses to initialize
against live Paddle.

Server-only secrets (configured via Lovable Cloud → Secrets, never in
`.env`):

- `PADDLE_ENVIRONMENT` — must be `sandbox` for now
- `PADDLE_WEBHOOK_SECRET` — used by the `paddle-webhook` edge function
  to verify Paddle signatures against the raw request body

## Webhook

The `paddle-webhook` edge function:

1. Reads the raw request body before any parsing.
2. Verifies the `Paddle-Signature` header via HMAC-SHA256 in constant time.
3. Refuses requests unless `PADDLE_ENVIRONMENT=sandbox`.
4. Records the event in `public.paddle_events` idempotently (unique
   `event_id`).
5. Does **not** change any user entitlement. Entitlement flips are
   intentionally deferred to a separate, reviewed change.

## Pro entitlement rule

Pro access must only be granted server-side after a verified Paddle webhook
event is recorded. It must never be granted from a client checkout success:


- A client-side checkout success callback
- A query string on a return URL
- Local storage, session storage, or any client-trusted flag

## What is still required before live payments

Before flipping to live Paddle:

- [ ] Complete Paddle live verification (merchant of record onboarding).
- [ ] Confirm acceptable use policy fit for Verdant (software-only).
- [ ] Add server-side entitlement updater that consumes verified events
      from `paddle_events` and writes to a dedicated `entitlements` table
      with RLS.
- [ ] Add end-to-end sandbox checkout test through Paddle.js.
- [ ] Add refund / chargeback / cancellation event handling.
- [ ] Add billing portal / "manage subscription" surface for the grower.
- [ ] Add tax / receipt copy reviewed for software-only positioning.
- [ ] Replace `VITE_PADDLE_ENVIRONMENT=sandbox` and `PADDLE_ENVIRONMENT=
      sandbox` with `live` in environment config, only after the above.
