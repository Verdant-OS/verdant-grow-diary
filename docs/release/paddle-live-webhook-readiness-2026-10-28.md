# Paddle live webhook readiness — repo audit, 2026-10-28

**Status:** audit only. No application, edge-function, schema, RLS or secret change.
**Measured at:** deploy tip `d590b2c105435cb2b22d1f265a4dea48948ccd3a` (`verdant-grow-diary`), 2026-10-28.
**Author:** Claude (author; ineligible for this document's independent acceptance).
**Supports:** three Paddle-side writes that happen outside the repository:
A. register the live webhook destination; C. turn off or de-discount checkout recovery;
D. run a Paddle simulation against the destination. Step B (writing external ids) is cancelled.

Read with [`docs/paddle-paid-launch-runbook.md`](../paddle-paid-launch-runbook.md) and
[`docs/specs/paddle-live-checkout-runtime-slice.md`](../specs/paddle-live-checkout-runtime-slice.md).
This file does not replace them. It answers one question: is the code ready for A, C and D?

## Evidence labels

- **Live account facts** (0 transactions, 0 subscriptions, 0 destinations, five active prices
  with `import_meta.external_id`, no Craft prices) are the founder's read-only measurement of
  2026-10-28. This audit does not re-derive them.
- **Live product import_meta** was read once, read-only, through the Paddle live connector on
  2026-10-28: `verdant_pro`, `founder_lifetime`, `credit_pack_50`, `credit_pack_150`, all
  `imported_from: lovable`. Nothing was written.
- **Paddle simulation behaviour** is a `source claim` from Paddle's docs
  ([Test webhooks](https://developer.paddle.com/webhooks/test-webhooks),
  [simulation run events](https://developer.paddle.com/api-reference/simulation-run-events)).
  It has not been measured against a delivery to this endpoint.
- Everything else is `established fact` read from source at the tip above, with file:line.

## 1. Live-cutover configuration (supports A)

### 1.1 `PAID_PLAN_IDS` and the env var each plan needs

Source: `src/lib/paidPlanAllowlist.ts:18-29`. The mirror is
`supabase/functions/_shared/lib/lib/paidPlanAllowlist.ts`, whose banner sha256 `3d8869e1…`
equals `sha256sum src/lib/paidPlanAllowlist.ts`. Env wiring: `supabase/functions/get-paddle-price/index.ts:50-58`.

| Plan id            | Env var `get-paddle-price` compares against | In `.env.example` | In `CURRENT_STATE.md` | Live Paddle price (founder's read) | Verdict                                                |
| ------------------ | ------------------------------------------- | ----------------- | --------------------- | ---------------------------------- | ------------------------------------------------------ |
| `pro_monthly`      | `PADDLE_PRICE_PRO_MONTHLY`                  | no                | no                    | `pri_01kx3dsf8t68ekz71m98fgxmnm`   | FAIL (undocumented)                                    |
| `pro_annual`       | `PADDLE_PRICE_PRO_ANNUAL`                   | no                | no                    | `pri_01kx3dsf43bjpksghckkbxn4d8`   | FAIL (undocumented)                                    |
| `craft_monthly`    | `PADDLE_PRICE_CRAFT_MONTHLY`                | no                | no                    | none                               | FAIL (offered, unsellable; §1.2)                       |
| `craft_annual`     | `PADDLE_PRICE_CRAFT_ANNUAL`                 | no                | no                    | none                               | FAIL (offered, unsellable; §1.2)                       |
| `founder_lifetime` | `PADDLE_PRICE_FOUNDER_LIFETIME`             | no                | no                    | `pri_01kx3dsezn1d73dghffdxnr2za`   | NOT_APPLICABLE (410 before lookup, `index.ts:183-188`) |
| `credit_pack_50`   | `PADDLE_PRICE_CREDIT_PACK_50`               | no                | no                    | `pri_01ky35ab5hdn0pjaj5k4pqnrwp`   | FAIL (undocumented)                                    |
| `credit_pack_150`  | `PADDLE_PRICE_CREDIT_PACK_150`              | no                | no                    | `pri_01ky35ab1f22xw8rkhdam01sd4`   | FAIL (undocumented)                                    |

- `.env.example:32-34` lists only the deprecated client names `VITE_PADDLE_PRICE_PRO_MONTHLY`,
  `_PRO_ANNUAL` and `_FOUNDER_LIFETIME`. Its server-secret list (`.env.example:39-47`) names none
  of the seven server names. `CURRENT_STATE.md` contains zero `PADDLE_PRICE_` strings.
- The names are documented elsewhere: `docs/paddle-paid-launch-runbook.md:92` (three),
  `docs/credit-packs-referral-deploy-runbook.md:84` (packs), and all seven in
  `docs/specs/paddle-live-checkout-runtime-slice.md:653-668`.
- **Confirmed defect, still open in code (FAIL; blocks live checkout, not A/C/D).** The seven names
  are flat and environment-unaware. `get-paddle-price` rejects any gateway result that differs
  from the configured value (`index.ts:313-323`). Serving live therefore requires live `pri_` ids
  in these vars, which breaks sandbox resolution. The legacy sandbox `paddle-webhook` also reads
  three of the same names. The runtime-slice spec already records this as finding 23
  (`docs/specs/paddle-live-checkout-runtime-slice.md:653-668`). Nothing here re-decides it.
- `PAYMENTS_ENVIRONMENT` selects the gateway. Only an explicit `live` or `sandbox` is accepted;
  anything else returns 503 (`supabase/functions/_shared/unionEntitlementLookup.ts:100-118`,
  `get-paddle-price/index.ts:268-277`). The measured value is NOT_MEASURED from the repo.

### 1.2 Plans in `PAID_PLAN_IDS` with no Paddle price (Craft)

- **What `get-paddle-price` returns today.** `craft_*` passes the allowlist (`index.ts:172`) and
  is not a pack or Founder. The gateway is queried by `external_id` (`index.ts:279-282`).
  - An empty result returns **404 `price_not_configured`** (`index.ts:296-307`).
  - A gateway error returns 502 `price_resolution_unavailable` (`index.ts:283-294`).
  - Which one the live gateway gives for an unknown external id is NOT_MEASURED, labelled
    `inference: 404`. Either way no price is returned and nothing is charged. PASS for safety.
- **Does the UI offer it? Yes (FAIL).**
  - `src/config/pricing.ts:105` keeps `craft_monthly` and `craft_annual` in `PRICING_TIERS`.
    `PURCHASABLE_PRICING_TIERS` filters out only Founder (`src/config/pricing.ts:142-144`).
  - `src/pages/Pricing.tsx:806-816` renders the Craft CTA, which calls `openCheckout` at
    `Pricing.tsx:303`. `src/pages/Upgrade.tsx:404,422,752` maps every purchasable tier.
  - Today the client is sandbox-only (§1.3), so this is a sandbox-catalog question. Once a live
    client ships, a grower can click a plan that cannot be sold and get a calm "unavailable"
    state. That is not a charge risk, but it is a trust defect before public selling.
    Founder decision: hide Craft CTAs, or keep them as interest capture. Separate UI PR.

### 1.3 Every place a Paddle price or plan is resolved

| Stage             | Where                                                                                                                                                                                                                                                        | Key                                                 | Verdict                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------- |
| CTA → hook        | `Pricing.tsx:303,377,884` → `usePaddleCheckout.openCheckout` (`src/hooks/usePaddleCheckout.ts:145`)                                                                                                                                                          | plan id string (`pro_monthly`, `credit_pack_50`, …) | PASS                                                                        |
| Client fences     | Founder refusal `usePaddleCheckout.ts:147-150`; sandbox-only gate `:154-157`; `src/lib/paddle.ts:275-285` (Paddle.js init, `Environment.set("sandbox")`); `src/lib/paddle.ts:316-324` (price lookup only when sandbox); `src/lib/paddleEnvironment.ts:87-92` | token class                                         | PASS (fails closed on `live_`; live checkout impossible from the app today) |
| Price id          | `src/lib/paddle.ts:316-340` → `get-paddle-price` → gateway `/prices?external_id=<plan>` (`index.ts:279-282`), cross-checked against `PADDLE_PRICE_<PLAN>` (`:313-323`)                                                                                       | `import_meta.external_id`                           | PASS                                                                        |
| Checkout open     | `usePaddleCheckout.ts:228-231`: `items[0].priceId` = server-resolved id; `customData: { userId: user.id }`                                                                                                                                                   | server `pri_` id                                    | PASS. No hardcoded `pri_` in non-test `src/`                                |
| Webhook normalize | `payments-webhook/index.ts:101-116` maps `items[].price.import_meta.external_id` → `importMeta.externalId`                                                                                                                                                   | `import_meta.external_id`                           | PASS (merged #2221)                                                         |
| Webhook decide    | `payments-webhook/eventProcessor.ts:249-257` (subscriptions), `:321-345` (one-time)                                                                                                                                                                          | `importMeta.externalId`                             | PASS                                                                        |
| One-time fallback | `index.ts:225-241` + `orchestrator.ts:300-310`: `paddle.prices.get(pri_…)` → `importMeta.externalId`; resolver error → 500 retry                                                                                                                             | `import_meta.external_id`                           | PASS                                                                        |
| Entitlement       | `src/lib/entitlements/lovablePaddleAdapter.ts:59-65,93-94` maps `subscriptions.price_id` (the external id written by decide) to a plan                                                                                                                       | external id                                         | PASS                                                                        |

**An unknown price never maps to a paid tier (PASS).**

- An unknown recurring external id skips as `unknown_price_id` (`eventProcessor.ts:255-257`).
- An unknown one-time id skips as `unknown_lifetime_price_id` (`eventProcessor.ts:322,343-345`).
- Credit packs are not in `KNOWN_PRICE_IDS` (`eventProcessor.ts:36`; `paidPlanAllowlist.ts:73-75`).
- The adapter returns `null` for any unmapped `price_id` (`lovablePaddleAdapter.ts:93-94`).
- The live product external id `verdant_pro` is stored in `product_id` only. Entitlement reads
  `price_id`. PASS.

## 2. `payments-webhook` event coverage (supports A and D)

Pipeline:

- `index.ts:375-448` handles transport, HMAC and normalization.
- `orchestrator.ts:257-654` records first, then decides, writes and marks.
- `eventProcessor.ts:197-414` is the pure decision step.

| Event                                                                                                   | Outcome                                                                                           | Writes                                                                                                                       | Test                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscription.created` / `.updated` / `.activated` / `.resumed` / `.trialing` / `.past_due` / `.paused` | handled                                                                                           | upsert `subscriptions` on `paddle_subscription_id` with the payload status (`eventProcessor.ts:234-280`; `index.ts:193-199`) | `src/test/payments-webhook-raw-wire.test.ts:13-42` (all seven, signed raw wire); `src/test/lovable-paddle-webhook-event-processor.test.ts:69-134,356-441`         |
| `subscription.canceled`                                                                                 | handled                                                                                           | update `subscriptions` by id + environment (`eventProcessor.ts:282-299`; `index.ts:200-208`)                                 | `lovable-paddle-webhook-event-processor.test.ts:136-150`; `payments-webhook-raw-wire.test.ts:65`                                                                  |
| `transaction.completed`                                                                                 | handled for one-time only; recurring (`subscription_id` set) skips `non_lifetime_transaction`     | credit-pack grant RPC or Founder allocator RPC (`eventProcessor.ts:311-373`)                                                 | see a–d below                                                                                                                                                     |
| `transaction.updated`                                                                                   | ignored (fallthrough, `unhandled_event_type`, `eventProcessor.ts:413`)                            | audit row in `lovable_paddle_events` only                                                                                    | NOT_MEASURED: no test names this type                                                                                                                             |
| `transaction.payment_failed`                                                                            | ignored (fallthrough); dunning arrives as `subscription.past_due`                                 | audit row only                                                                                                               | `lovable-paddle-webhook-event-processor.test.ts:276-282` (the title also says `subscription.trialing`, which the loop does not test and which is in fact handled) |
| `adjustment.created` / `.updated`                                                                       | approved `refund` or `chargeback` → `revoke_lifetime` + credit-pack clawback; anything else skips | refund barrier row, then revoke RPC, then clawback RPC (`eventProcessor.ts:391-411`; `orchestrator.ts:328-363,586-605`)      | `src/test/paddle-webhook-adjustment-refund-routing.test.ts:134-505`; `src/test/founders-webhook-refund-decision.test.ts:24-84`                                    |

- **a. Credit packs grant exactly 50 / 150 once; a replayed `event_id` is a no-op.**
  PASS (unit), NOT_MEASURED (runtime DB).
  - Credits come from `CREDIT_PACK_CREDITS` (`eventProcessor.ts:49-52`), keyed by a type, so a
    pack without a value fails to compile.
  - A duplicate `event_id` returns `duplicate_processed` without a second grant
    (`orchestrator.ts:279-292`).
  - The RPC `grant_lovable_credit_pack` is idempotent on the Paddle transaction id
    (`index.ts:269-289`).
  - Tests: `lovable-paddle-webhook-event-processor.test.ts:230,242`;
    `lovable-paddle-webhook-orchestrator.test.ts:625-646` (grant called once);
    `src/test/ai-credit-grants-sql.test.ts:44,92`.
  - The DB suites (`credit-pack-refund-clawback-db.test.ts:441`) need PostgreSQL tools.
- **b. Founder refund and chargeback revoke and retire.** PASS (code and unit); the
  "founder row retired" DB effect is NOT_MEASURED here.
  - Approved `refund` and approved `chargeback` both route to `revoke_lifetime`
    (`founders-webhook-refund-decision.test.ts:27,36`).
  - The orchestrator persists a refund barrier and then calls `revokeFounderLifetime`
    (`orchestrator.ts:328-363,586-594`).
  - That calls RPC `revoke_lovable_founder_lifetime_by_transaction` (`index.ts:348-371`), which
    flips the subscription and the founders row in one call.
  - The DB effect is covered by `founder-refund-before-purchase-db.test.ts` (PostgreSQL needed).
  - `chargeback_reverse` and `chargeback_warning` skip as not refund/chargeback. That is an
    idea for later, not a defect.
- **c. A credit-pack refund claws back.** PASS. `orchestrator.ts:595-605` runs
  `clawbackCreditPack` after the revoke on every approved refund.
  `paddle-webhook-adjustment-refund-routing.test.ts:429-505` covers it, including fail-closed
  when unwired.
- **d. A Founder buyer's recurring Pro cancels next period, live client only on `env=live`.**
  PASS (code); provider call NOT_MEASURED.
  - `index.ts:290-327` calls `paddle.subscriptions.cancel(id, { effectiveFrom: "next_billing_period" })`.
  - The client is `getPaddleClient(environment)`. The environment is the URL `env`
    (`index.ts:381`, passed in at `orchestrator.ts:484-488`).
  - `_shared/paddle.ts:33-35` picks `PADDLE_LIVE_API_KEY` only for `live`.
  - Tests `lovable-paddle-webhook-orchestrator.test.ts:439-517` pin scope and best-effort. The
    SDK call itself is mocked.
- **e. Paddle API version.** could_not_read.
  - The handler models Paddle Billing notification wire shape: snake_case `event_id`,
    `event_type`, `data` (`index.ts:69-134`).
  - Nothing in the repo pins a notification `api_version`.
  - The SDK import `npm:@paddle/paddle-node-sdk` has no version (`_shared/paddle.ts:14`), so it
    floats at every cold start.
  - The SDK is used only for the price reverse lookup and the provider cancel.

## 3. Simulation readiness (supports D) — FAIL

- **No simulation check.** Nothing in `payments-webhook`, `_shared/paddle.ts` or the orchestrator
  reads a traffic marker. The only `notification_id` in the tree is a test fixture
  (`rawWireTestHarness.ts:18,42`).
- **What Paddle sends (`source claim`, Paddle docs).**
  - Simulated events carry the same `Paddle-Signature` and come from the same IPs.
  - A destination with `traffic_source: platform` never receives simulations.
  - Simulation run events use the `ntfsimevt_` id prefix, where real events use `evt_`.
- **Why it matters.** The server treats any `environment='live'` row as entitling, regardless of
  the server's own environment (`_shared/unionEntitlementLookup.ts:167-171`). The comment there
  assumes a live row only ever comes from a real live payment.

On a destination that receives simulations (`all` or `simulation`), a simulated event signed
with `PAYMENTS_LIVE_WEBHOOK_SECRET` and posted to `?env=live`:

- always writes a `lovable_paddle_events` row tagged `live` (`orchestrator.ts:267-277`);
- with a custom payload whose `custom_data.userId` is a real account:
  - `subscription.created` + `pro_monthly` writes a live `subscriptions` row. That grants real
    Pro in production.
  - `transaction.completed` + `credit_pack_*` grants real credits and sends a purchase
    confirmation email (`index.ts:427-438`).
  - `founder_lifetime` allocates a Founder seat and asks the live Paddle API to cancel that
    user's other recurring subscriptions.
- with Paddle's demo payload (`inference`: no `userId`):
  - most events skip as `missing_user_id`;
  - `customer.*` still writes a `paddle_customers` row;
  - an approved demo adjustment writes a refund-barrier row and calls the revoke RPC
    (0 rows expected);
  - a demo `transaction.completed` without `import_meta` makes the live price lookup run on a
    demo `pri_` id. That is expected to error, so the handler returns 500 (inference,
    NOT_MEASURED).

**Smallest fix (proposal; edge change, separate PR, owner-named; not in this PR).**

1. Add a pure predicate in `src/lib/` for "this verified notification is simulation traffic":
   `event_id` starts with `ntfsimevt_`. Add unit tests for `evt_` (no), `ntfsimevt_` (yes),
   missing, non-string and case variants. The edge mirror is generated only for modules an edge
   function imports, so the predicate lands with its caller rather than as dead code now.
2. In `supabase/functions/payments-webhook/index.ts`, after `normalizeVerifiedPaddleEvent`
   (`:394-397`) and before `handleVerifiedEvent` (`:399-407`): when the predicate holds, return
   200 `{ status: "simulation_ignored" }` with **no** database write, RPC, Paddle call or email.
   Signature verification stays first, so D still proves URL, `verify_jwt=false`, secret, HMAC
   and normalization end to end.
3. Add a signed raw-wire regression to `src/test/payments-webhook-raw-wire.test.ts`, shown RED
   before the fix: a `ntfsimevt_` `subscription.created` carrying a real-looking `userId` writes
   no `lovable_paddle_events` row and no `subscriptions` row.
4. Sequence it after open PR #2570, which also edits payments edge code. The
   `PADDLE-WIRE-001` handoff block still says #2221 is open; #2221 merged on 2026-10-16.

Without that PR, D is safe only against a destination that is not the production endpoint, or
with Paddle's demo payload on a destination whose writes you accept as audit noise.

## 4. Founder page (no change) — PASS

- `/founder` redirects to `/pricing` (`src/routes/founder.tsx:4-10`).
- Purchase UIs use `PURCHASABLE_PRICING_TIERS` (Founder filtered, `src/config/pricing.ts:142-144`).
- `useFounderSlotsRemaining` (`src/hooks/useFounderSlotsRemaining.ts:51`, which reads
  `founder-slots-remaining`) has no consumer under `src/pages`, `src/components` or `src/routes`.
  Open PR #2570 deletes it and the function.
- Every client checkout path goes through `usePaddleCheckout.openCheckout`:
  - it refuses `founder_lifetime` before any network call (`usePaddleCheckout.ts:147-150`;
    `src/lib/founderLifetimeCheckoutGuard.ts:12-16`);
  - otherwise it gets its price only from `get-paddle-price`, which returns 410 `plan_retired`
    for `founder_lifetime` (`get-paddle-price/index.ts:183-188`).
- No non-test file under `src/` contains `pri_01kx3dsezn1d73dghffdxnr2za`.
- **Residual, outside the code:** the Founder price is still active in live Paddle. Anyone
  holding a live client token can call Paddle.js with that `pri_` id directly. The webhook would
  then allocate a seat (`eventProcessor.ts:343-372`). Today no live client token ships (§1.3).
  Archive the price before any live client token is deployed; that is the founder's call, given
  the CI gate that still expects it.
- **Conflict to reconcile:** the closed `STOP-SELLING-FOUNDER-LIFETIME` handoff block says
  "Paddle Founder price archived". The founder's live read shows 5 active and 0 archived. That
  line most likely refers to sandbox; it is not evidence for live.

## 5. Checkout recovery (supports C) — PASS

No code, test, copy or analytics event depends on Paddle's abandoned-checkout recovery email
or its discount.

- No `discountId` or `discountCode` is passed at `usePaddleCheckout.ts:228-245`.
- No webhook branch reads a discount. Totals are read only by the confirmation email formatter.
- **Name collision only.** In this repo, "checkout recovery" is Verdant's own failure-recovery
  UI when checkout cannot open, not Paddle's abandoned-cart email:
  - `CHECKOUT_RECOVERY_MESSAGE` (`usePaddleCheckout.ts:69-70`);
  - `Pricing.tsx:204,489-492,910-940`;
  - funnel events `checkout_recovery_dismissed` and `checkout_recovery_choose_another_plan`
    (`src/lib/funnelEventSchema.ts:65-66`, `src/lib/pricingAnalytics.ts:73-74`);
  - the operator outreach steps in `docs/releases/subscriber-growth-launch-runbook.md:168` and
    `docs/releases/subscriber-growth-publication-handoff.md:157,199`.

  Turning off Paddle's setting changes none of these.

## 6. Webhook destination spec for Paddle

| Field                                | Value                                                                                                                                                                                                                                                                                                           | Source                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destination URL                      | `https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/payments-webhook?env=live`                                                                                                                                                                                                                               | from_repo: project id in `supabase/config.toml`; `?env` parsed at `payments-webhook/index.ts:380-384`; `verify_jwt = false` at `supabase/config.toml:25-26`                                                                                                                                                                                          |
| `api_version`                        | `1` (recommended)                                                                                                                                                                                                                                                                                               | could_not_read: no pin in the repo. `inference`: the fixtures model the Paddle Billing v1 wire shape                                                                                                                                                                                                                                                 |
| `include_sensitive_fields`           | `false` (recommended)                                                                                                                                                                                                                                                                                           | from_repo, inference. Entitlement, credits and Founder paths read none of them. The confirmation email reads the address from `auth.users` (`sendPurchaseConfirmation.ts:110-126`). Effect: `customer.*` mirror rows may store `email` and `name` as null. That is acceptable; the mirror grants nothing.                                            |
| `traffic_source`                     | `platform`                                                                                                                                                                                                                                                                                                      | from_repo: §3 FAIL. Do not use `all` or `simulation` on this destination until the §3 PR is merged and deployed                                                                                                                                                                                                                                      |
| Subscribed events                    | `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.trialing`, `transaction.completed`, `adjustment.created`, `adjustment.updated`, `customer.created`, `customer.updated` | from_repo: every type `decide()` acts on (`eventProcessor.ts:203,234-242,282,311,391`). Omit `transaction.updated` and `transaction.payment_failed`: they only add audit rows (§2)                                                                                                                                                                   |
| Secret env var                       | `PAYMENTS_LIVE_WEBHOOK_SECRET` = this destination's `endpoint_secret_key`                                                                                                                                                                                                                                       | from_repo: `_shared/paddle.ts:68-72`. If missing, every delivery gets 500 `webhook_secret_not_configured` (`index.ts:137-139`) and Paddle retries; nothing is written                                                                                                                                                                                |
| Also needed for live one-time events | `PADDLE_LIVE_API_KEY`, `LOVABLE_API_KEY`                                                                                                                                                                                                                                                                        | from_repo: price reverse lookup and provider cancel (`_shared/paddle.ts:33-48`); not needed for signature checks                                                                                                                                                                                                                                     |
| Registration route                   | Direct in Paddle (dashboard or API), then set the secret in the Lovable Cloud secrets store                                                                                                                                                                                                                     | could_not_read: which `traffic_source`, events and `api_version` Lovable's built-in registration chooses. Code comments say Lovable's registration creates it; the settings above decide the §3 risk, so set them explicitly. If the Lovable connector is used instead, list notification settings read-only afterwards and confirm each field above |

## 7. Verdict on A, C and D

- **A (register live destination): READY from the repo side**, on these conditions:
  - `traffic_source: platform`;
  - the event list above;
  - `PAYMENTS_LIVE_WEBHOOK_SECRET` set to that destination's key.

  With 0 live transactions and a sandbox-only client, A opens no buyer path.

- **C (checkout recovery off / de-discounted): READY.** Nothing in the repo depends on it.
- **D (simulation against the production destination): NOT READY (FAIL).** It waits on the
  edge PR in §3. Until then, run simulations only against a destination that is not this
  endpoint.

Live checkout itself remains out of scope and blocked by design. The client is sandbox-only,
and the server price vars are flat (§1.1). That sequence belongs to
`docs/specs/paddle-live-checkout-runtime-slice.md` and open draft PR #2539.
