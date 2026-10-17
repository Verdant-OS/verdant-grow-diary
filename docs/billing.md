# Verdant Billing

## Status: live checkout on the production hostname, held behind backend readiness

The tracked production client token is live-class (`live_`). Live checkout
opens only on `verdantgrowdiary.com` and `www.verdantgrowdiary.com`; every
other host (previews, staging, localhost) is unavailable for a live token, and
a sandbox-class (`test_`) token stays sandbox everywhere. This build must not
reach customers until the backend readiness checks in
[Live checkout release sequence](#live-checkout-release-sequence) pass. No
customer is granted Pro entitlement from the client.

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

## Plans

| Plan             | Price           | Cadence  | Slug               |
| ---------------- | --------------- | -------- | ------------------ |
| Pro Monthly      | $12             | / month  | `pro-monthly`      |
| Pro Annual       | $99             | / year   | `pro-annual`       |
| Founder Lifetime | $129 (one-time) | one-time | `founder-lifetime` |

Founder Lifetime is limited to the first 100 buyers. Founder Lifetime includes
100 AI Doctor credits per month; additional credit packs are planned later but
are not live yet.

## Configuration

The **canonical** client env var is `VITE_PAYMENTS_CLIENT_TOKEN` (Lovable
built-in Paddle integration). The committed `.env.production` carries the
live-class (`live_`) production token; the prebuild gate requires the bundled
token to equal it. Client resolution:

- `test_` → sandbox on every host.
- `live_` → live only on `verdantgrowdiary.com` / `www.verdantgrowdiary.com`;
  unavailable on every other host.
- Missing or malformed → unavailable everywhere.
- `VITE_CHECKOUT_DISABLED="true"` (exact string) → unavailable everywhere,
  including production, with paused copy. This is the rollback switch; see
  [Live checkout rollback](#live-checkout-rollback).

Paddle.js is initialized with `Environment.set("production")` for live and
`Environment.set("sandbox")` for sandbox. Entitlement reads always read live
rows; sandbox rows are read only for a `test_` token. Classify tokens by
prefix only and never print or copy their values into logs, tickets, or review
comments. A publishable client token is public by design, but it still goes
only in `.env.production`, never in a review comment.

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
- (Legacy, still read by the BYO audit sink) `PADDLE_ENVIRONMENT` — permanently
  `sandbox`; `paddle-webhook` 403s on anything else and no live endpoint routes
  into it — plus `PADDLE_WEBHOOK_SECRET`, and `PADDLE_PRICE_PRO_MONTHLY`/
  `_PRO_ANNUAL`/`_FOUNDER_LIFETIME` as a fallback only
- `PADDLE_SANDBOX_PRICE_PRO_MONTHLY`/`_PRO_ANNUAL`/`_FOUNDER_LIFETIME` —
  sandbox-scoped price ids for `paddle-webhook`'s plan mapping. Preferred over
  the legacy names, which `get-paddle-price` also reads and which hold LIVE ids
  once `PAYMENTS_ENVIRONMENT=live`

## Webhook

Canonical: `payments-webhook` (Lovable lane). Verifies the signature via
the shared `verifyWebhook` helper, records into `public.lovable_paddle_events`
idempotently on `paddle_event_id` (23505 = duplicate no-op), and writes
`public.subscriptions` directly for recurring plans + calls
`allocate_lovable_founder_lifetime` for Founder Lifetime.

An approved refund or chargeback (partial refunds included) revokes Founder
Lifetime and calls `clawback_lovable_credit_pack`, which appends one reversal
for the full credit-pack grant on that transaction. If credits were already
spent, the pack balance goes negative and pack-funded AI stops until later
grants cover it; the monthly allowance is unaffected. A refund that arrives
before the purchase blocks the grant (`credit_pack_refund_precedes_purchase`).

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

## Entitlement and checkout environment

`PAYMENTS_ENVIRONMENT` must be set explicitly to `live` or `sandbox`. Nothing
infers it from which Paddle keys are configured.

- Entitlement gates (exports, live sensors, sensor ingest, bridge-token minting,
  Pheno Tracker, credit-pack eligibility) read through
  `resolveServerBillingEnvironment()`. When the selector is unset or invalid it
  fails closed to `live`: verified live rows still entitle, and sandbox rows
  never do. The edge runtime logs `billing_environment_unresolved` once with the
  reason.
- `get-paddle-price` picks the Paddle gateway with
  `resolveRequiredServerBillingEnvironment()` and returns
  `503 price_resolution_unavailable` when the selector is unset or invalid.

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

## Live checkout release sequence

Backend readiness is verified **before** this build reaches customers. Merging
the live-token change into `verdant-grow-diary` is customer exposure: the
production host builds from that branch and the live token opens checkout on
it. So the merge waits until every step below is green.

1. **#2229 merged and `payments-webhook` redeployed.** Merge the shared
   webhook-verifier packaging repair through the queue. Confirm Lovable has
   pulled the merged source, then (owner-named Edge deploy) redeploy
   `payments-webhook`, `delete-account`, `paddle-portal-session` and
   `get-paddle-price`. Record each returned fingerprint against the deploy
   head.
2. **Server selector read.** The owner reads `PAYMENTS_ENVIRONMENT` and confirms
   it is exactly `live`. `get-paddle-price` returns
   `503 price_resolution_unavailable` for an unset or invalid value.
3. **Catalog resolution observed.** Confirm the credit-pack price secrets hold
   live IDs. From a signed-in production session, resolve `pro_monthly` once
   and read its `get-paddle-price` log line (`reason`, `stage`,
   `env_var_configured`) and HTTP status.
4. **Webhook path decided, read-only.** Paddle notification logs for both live
   destinations, live rows in `lovable_paddle_events`, and `payments-webhook`
   logs. Choose the canonical destination from that evidence. A live test
   event is a production write and needs its own authorization.
5. **Rollback artifact built and verified** (below) before the merge.
6. **Merge, then verify.** After the merge deploys, confirm `/version.json`
   names the merge commit and `/pricing` shows "Secure checkout by Paddle".
   A real-money verification charge needs the owner's explicit approval of
   amount, account, and refund plan.

There is no operator-only gate in this build. From the deploy until a
rollback, any visitor on the production hostname can open live checkout.

## Live checkout rollback

The rollback artifact is a pre-built, pre-verified client build: the live
checkout code with `VITE_CHECKOUT_DISABLED="true"` added to `.env.production`
next to the unchanged live token. On every host, including the production
hostname, it resolves checkout to unavailable before Paddle.js loads, before
any price lookup, and before any redirect. `/pricing` and the payments banner
show "Checkout paused". It does not touch tokens, secrets, entitlement reads,
`payments-webhook`, or `paddle-portal-session`, so existing live subscribers
keep their access and billing management.

Before the merge, verify the artifact under production-host conditions:

- `src/test/paddle-live-checkout-production-host.test.tsx` runs on
  `https://verdantgrowdiary.com/` and proves the switch blocks init, price
  lookup and the hook, and that the paused banner hydrates without mismatch.
- Build the artifact and load `/pricing` with `verdantgrowdiary.com` mapped to
  the built server: paused copy, no request to `cdn.paddle.com`.
- Deploy it to staging (`verdant-grow-diary2`) and repeat the `/pricing`
  check: unavailable trust copy, `openCheckout` blocks, no Paddle.js load.

Keep it deployable as a pinned commit. To roll back, state the action and its
effect on live subscriptions, then deploy that commit.

Do **not** use these as a generic rollback:

- Flipping `PAYMENTS_ENVIRONMENT` back to `sandbox`. That breaks live portal
  and price lookups for existing customers, and recreates a sandbox/live
  hybrid if a live client is still served.
- Restoring an earlier `test_`-token build. That reopens sandbox checkout
  against a live server selector.
- Revoking the live client token or rotating secrets as a reflex. Revoke the
  token only if it must be invalidated, and say so first.

This repository change does not mutate Lovable/Paddle/Supabase settings.

## What must be true before live payments open to customers

The owner chose `PAYMENTS_ENVIRONMENT=live` for this release.
That choice covers the client change; it does not make any single
token or settings flip sufficient. The release sequence above is the order.

Standing checks:

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
- [ ] Prepare the code, configuration, secrets, price IDs, notification
      destinations, public copy, tests, and rollback as one reviewed change;
      apply none of them independently.
