# Verdant Billing

## Status: live checkout on the production hostname, held behind backend readiness

The tracked production client token is live-class (`live_`). Live checkout
opens only on `verdantgrowdiary.com` and `www.verdantgrowdiary.com`; every
other host (preview URLs, localhost) is unavailable for a live token, and
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

What the pricing page offers, from `src/config/pricing.ts` (amounts) and
`get-paddle-price` (the plan ids it resolves). The live Paddle catalog was read
on 2026-10-29 (read-only): it holds Pro monthly, Pro annual, both credit packs
and the retired Founder price, and no Craft product.

| Plan / pack        | Price          | Cadence  | Checkout SKU      | Live Paddle price         |
| ------------------ | -------------- | -------- | ----------------- | ------------------------- |
| Pro Monthly        | $12            | / month  | `pro_monthly`     | yes                       |
| Pro Annual         | $99            | / year   | `pro_annual`      | yes                       |
| Craft Monthly      | $29            | / month  | `craft_monthly`   | none (scoped unavailable) |
| Craft Annual       | $249           | / year   | `craft_annual`    | none (scoped unavailable) |
| AI credit pack 50  | $9 (one-time)  | one-time | `credit_pack_50`  | yes                       |
| AI credit pack 150 | $19 (one-time) | one-time | `credit_pack_150` | yes                       |

Founder Lifetime is no longer sold (#2028, #2570). Existing Founder
entitlements stay in place until a separate PR and migration remove them.
Holders keep Pro-like access with AI credits capped at 100 per UTC month. New
checkout for `founder_lifetime` is refused on the client
(`founderLifetimeCheckoutGuard`) and by `get-paddle-price`, which answers
`410 plan_retired` before any price lookup. The `PADDLE_PRICE_FOUNDER_LIFETIME`
name stays wired only because the cold-start drift guard requires a name for
every `PAID_PLAN_IDS` entry; it needs no live value.

Included AI Doctor credits: Free 3 per grow; Pro and Founder 100 per month;
Craft 300 per month. Credit packs are one-time top-ups for any active paid
entitlement that includes a monthly AI allowance: Pro and Craft subscriptions,
and existing Founder Lifetime rows (one-time, but they carry the monthly
bucket). They never expire and are spent only after the monthly allowance.

Deliberate unavailable cases at launch. Each must show a calm, scoped block,
never a page-wide one (see [Live checkout release sequence](#live-checkout-release-sequence)):

- **Craft** has no live Paddle product, so `get-paddle-price` returns
  `price_not_configured`. That block is per SKU: only the Craft button that was
  tried (monthly or annual) changes to "Join the Craft launch list"; the other
  Craft button stays available until it is tried, and other plans are
  unaffected. Do not create Craft products or prices to make it sell.
- **Founder Lifetime** is refused before any network call; a stale or direct
  request reaches `410 plan_retired`.
- **Credit packs** return `pack_requires_monthly_plan` for a grower without an
  active paid entitlement that includes a monthly AI allowance, which blocks
  both packs and leaves subscriptions open.

## Configuration

The **canonical** client env var is `VITE_PAYMENTS_CLIENT_TOKEN` (Lovable
built-in Paddle integration). The committed `.env.production` carries the
live-class (`live_`) production token; the prebuild gate requires the bundled
token to equal it and refuses a sandbox (`test_`) token, and the production
smoke refuses a sandbox committed token, so a later commit cannot quietly
restore sandbox checkout in production. Client resolution:

Paddle's documented client-token shape is the prefix plus exactly 27
letters/digits. The runtime and the production prebuild gate both require it.

- `test_` plus exactly 27 letters/digits → sandbox on every host.
- `live_` plus exactly 27 letters/digits → live only on
  `verdantgrowdiary.com` / `www.verdantgrowdiary.com`; unavailable on every
  other host.
- Missing or malformed, for either prefix (for example `test_invalid`,
  `live_invalid`, or a payload with `_`, `-` or the wrong length) →
  unavailable everywhere, and a malformed value fails the production build.
- `VITE_CHECKOUT_DISABLED="true"` (exact string) → unavailable everywhere,
  including production, with paused copy. This is the rollback switch; see
  [Live checkout rollback](#live-checkout-rollback).

Paddle.js is initialized with `Environment.set("production")` for live and
`Environment.set("sandbox")` for sandbox. Entitlement reads always read live
rows; sandbox rows are read only for a `test_` token. Check a token by its
prefix and shape only, never by printing it: never copy a value into logs,
tickets, or review comments. A publishable client token is public by design, but it still goes
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

At the live switch, the four sellable names (Pro monthly, Pro annual, both
credit packs) must hold live price ids. `get-paddle-price` reads only this set
of seven names, and `PAYMENTS_ENVIRONMENT` (not `PADDLE_ENVIRONMENT`) selects
the gateway. `PADDLE_PRICE_FOUNDER_LIFETIME` needs no value: the function
answers `410 plan_retired` before any lookup. The two Craft names stay empty
while Craft has no live product (`price_not_configured`):

- `PADDLE_PRICE_PRO_MONTHLY`
- `PADDLE_PRICE_PRO_ANNUAL`
- `PADDLE_PRICE_CRAFT_MONTHLY`
- `PADDLE_PRICE_CRAFT_ANNUAL`
- `PADDLE_PRICE_FOUNDER_LIFETIME`
- `PADDLE_PRICE_CREDIT_PACK_50`
- `PADDLE_PRICE_CREDIT_PACK_150`

Before those names are flipped, set the seven sandbox copies. The legacy
classifier currently maps pro monthly, pro annual, and founder lifetime; the
craft and credit-pack copies still have to exist so those ids are not left
only on the shared live names:

- `PADDLE_SANDBOX_PRICE_PRO_MONTHLY`
- `PADDLE_SANDBOX_PRICE_PRO_ANNUAL`
- `PADDLE_SANDBOX_PRICE_CRAFT_MONTHLY`
- `PADDLE_SANDBOX_PRICE_CRAFT_ANNUAL`
- `PADDLE_SANDBOX_PRICE_FOUNDER_LIFETIME`
- `PADDLE_SANDBOX_PRICE_CREDIT_PACK_50`
- `PADDLE_SANDBOX_PRICE_CREDIT_PACK_150`

`PAYMENTS_ENVIRONMENT=live` must be explicit. `PAYMENTS_LIVE_WEBHOOK_SECRET`
must be set, and the live Paddle notification URL is `payments-webhook?env=live`
(`env` defaults to sandbox). `PADDLE_ENVIRONMENT` stays `sandbox`.

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
and an existing Founder Lifetime entitlement remains capped at 100 AI credits per UTC month. Founder Lifetime is no longer sold; removing the entitlement is a separate PR plus migration.

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
the live-token change into `verdant-grow-diary` makes it the build the
configured publisher deploys to production; customer exposure starts when the
live `/version.json` reports the merge SHA, and from then the live token opens
checkout. Nothing in this document treats the merge itself as the release. The
merge waits until steps 1–6 are green **and** every standing check in
[What must be true before live payments open to customers](#what-must-be-true-before-live-payments-open-to-customers)
is done; step 7 is the merge followed by post-merge deployment verification
and the first owner-approved purchase.

1. **#2229 merged and `payments-webhook` redeployed.** Merge the shared
   webhook-verifier packaging repair through the queue. Confirm Lovable has
   pulled the merged source, then (owner-named Edge deploy) redeploy
   `payments-webhook`, `delete-account` and `paddle-portal-session`. Record
   each reported result with its submitted-source fingerprint, then verify the
   live deployment receipt for each (version and last-updated time in Lovable
   Cloud, or a boot log line). A deploy tool's success message or a sync
   commit is not a receipt. Don't redeploy solely because an unrelated file
   (for example a test) differs in Lovable's working copy.
2. **Server selector read.** The owner reads `PAYMENTS_ENVIRONMENT` in the
   production backend (Lovable Cloud project `knkwiiywfkbqznbxwqfh`) and
   confirms it is exactly `live`. Never infer it from the client token.
   `get-paddle-price` returns `503 price_resolution_unavailable` for an unset
   or invalid value. This read comes before the `get-paddle-price` deploy and
   before customer exposure.
   Then, with its own owner approval, deploy `get-paddle-price` and record
   its fingerprint and live receipt the same way.
3. **Every sellable SKU resolves.** From a signed-in production session, call
   `get-paddle-price` once for each SKU the pricing page sells and record its
   HTTP status. A success returns only `{ paddleId }` and writes no catalog
   log; record the status and the returned id. A failure also logs `reason`,
   `stage` and `env_var_configured`; record that line:
   `pro_monthly`, `pro_annual`, `craft_monthly`, `craft_annual`,
   `founder_lifetime`, `credit_pack_50`, `credit_pack_150` (packs need a
   session whose paid plan includes a monthly AI allowance, such as Pro).
   Each must return a live price ID, or a deliberate calm block:
   `price_not_configured` for a product that does not exist in live Paddle
   (Craft today) or `410 plan_retired` for `founder_lifetime`. Any SKU returning
   `price_resolution_unavailable` (for example a live product whose
   `PADDLE_PRICE_*` secret is empty or holds a sandbox ID) blocks: the client
   cannot tell that from a shared failure, so one click on it closes checkout
   for every plan on the page.
4. **Founder price archived in live Paddle.** The retired Founder price must
   be `archived` before customer exposure, verified by a read-only price list
   that shows that status. The client and server refusals do not stop a caller
   who passes the price id to Paddle.js directly, and the webhook still
   allocates a seat for such a purchase; archiving makes Paddle refuse it.
   This is an owner-approved Paddle-side write.
5. **Webhook path decided, read-only.** Paddle notification logs for every live
   destination, live rows in `lovable_paddle_events`, and `payments-webhook`
   logs. Choose the canonical destination from that evidence and confirm its
   endpoint secret is the one the function reads. A live test event is a
   production write and needs its own authorization. Logs do not prove
   delivery, signature verification or entitlement processing: that proof is
   the first owner-approved purchase (step 7), made right after the deploy and
   before any announcement, whose `lovable_paddle_events` row must read
   `processed_ok` and whose `subscriptions` row must grant. Paddle retries a
   non-2xx delivery with backoff for about three days (`source claim`, Paddle
   docs), so a defect found by that purchase can be fixed and the event
   replays; the release stays on hold until the row is processed.
6. **Rollback artifact built and verified** (below) before the merge.
7. **Merge, then confirm the deploy (post-merge verification).** Measure the configured publisher and its
   deployment for the merge commit. Until the live `/version.json` names that
   commit, production still runs the previous build and no live verification
   applies. Once it does, confirm `/pricing` shows "Secure checkout by Paddle".
   A real-money verification charge needs the owner's explicit approval of
   amount, account, and refund plan.

There is no operator-only gate in this build. From the deploy until a
rollback, any visitor on the production hostname can open live checkout.

## Live checkout rollback

Rollback is a deploy, not a toggle. `VITE_CHECKOUT_DISABLED` is read at build
time, so turning live checkout off means publishing the pinned rollback SHA
below: a full build and a production deploy. The expected time to roll back is
one publish cycle of the configured publisher, from the promotion step until
the live `/version.json` reports the rollback SHA. That duration is
`NOT_MEASURED`. Record it when the rollback artifact is verified, and live
checkout stays open until the rollback deploy is serving.

The rollback artifact is a **pinned commit**, not a working-tree edit. The
prebuild step (`restore-env-production-from-head.mjs`) resets
`.env.production` to `HEAD` before every build, so an uncommitted switch is
silently discarded. Build it like this:

1. Before the merge, start from the exact reviewed head of this release's PR
   (#2539, the full 40-character SHA that the independent exact-head review
   passed; the merge commit does not exist yet).
2. Add one commit, on a branch that is never merged, that only appends
   `VITE_CHECKOUT_DISABLED="true"` to `.env.production`, next to the unchanged
   live token.
3. Build that commit with the normal `bun run build` (prebuild included) and
   record its SHA as the rollback SHA.
4. Verify that exact SHA (below). This is the pre-merge gate.
5. Before enqueueing (pre-merge gate): the reviewed head must already contain
   the current base, so the merge tree will equal the reviewed head and the
   pinned artifact. If the base moves after review, update the PR, get a fresh
   exact-head review, and rebuild and re-verify the artifact on the new head
   before enqueueing. Never enqueue while the artifact's parent differs from
   the head being merged. Enqueue only into an empty merge queue, and enqueue
   nothing else until this PR lands, so no other entry can land first. If the
   queue tip changes anyway while this PR is queued, remove it from the queue
   before it merges, update it, get a fresh exact-head review, and rebuild and
   re-verify the artifact before re-enqueueing. The merge must never land on a
   tree that differs from the verified artifact's parent.
6. After the merge, confirm `git diff <reviewed head> <merge commit>` is
   empty. This is a check of step 5, not a recovery path: a non-empty diff
   means step 5 failed. Treat it as a release incident: prepare the one-line
   switch on top of the merge commit as an emergency release packet (SHA,
   build receipt, effect on live subscribers), and deploy it only on the
   founder's per-item approval; agents never publish, promote or roll back on
   their own. Rebuild and verify the artifact on the merge commit before
   closing the incident.

On every host, including the production
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
  the built server: paused copy, `openCheckout` blocks, no request to
  `cdn.paddle.com`. A control build without the switch, on the same mapping,
  must show live copy, so the result comes from the switch.

There is no staging environment (`AGENTS.md`, production only), and a live
token is unavailable on any non-production host anyway, so a preview deploy
cannot exercise this path. After a real rollback deploy, the owner confirms
on production that `/pricing` shows "Checkout paused" and no Paddle.js
request is made.

Keep it deployable as a pinned commit. To roll back, state the action and its
effect on live subscriptions, then deploy that commit. The pinned commit is
valid only while production serves this PR's merge commit: after any later
release, deploying it would also remove that release. Whenever production
advances, build, review and verify a new switch commit on the currently
deployed SHA before relying on it.

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

Standing checks. Each one is a pre-merge gate for the live release, alongside
steps 1–5 of the release sequence; none is optional, because the merge lets
the publisher expose live checkout:

- [ ] Complete Paddle live verification (merchant of record onboarding).
- [ ] Confirm acceptable use policy fit for Verdant (software-only).
- [ ] Refund / chargeback / adjustment handling beyond "record and ignore"
      (currently `adjustment.created/updated` events are stored but not
      auto-acted on; operator-manual only).
- [ ] Customer portal verified: Settings → "Manage subscription" (the existing
      `SubscriptionTile` flow, `src/lib/customerPortal.ts` → the
      `paddle-portal-session` Edge function) opens the Paddle customer portal
      for a live subscriber after the redeploy. No payment is made to check it.
- [ ] Tax / receipt copy reviewed for software-only positioning.
- [ ] Pre-transition sandbox evidence recorded per `docs/paddle-sandbox-smoke.md`
      (Pro Monthly, Pro Annual, Founder Lifetime, duplicate-delivery
      idempotency, cancel-and-resubscribe). Do not reconfigure production to
      sandbox to rerun it; live validation is the release sequence above.
- [ ] Prepare the code, configuration, secrets, price IDs, notification
      destinations, public copy, tests, and rollback as one reviewed change;
      apply none of them independently.
