# Paddle Paid-Launch Runbook (Operator)

Presence/absence checks only — this document and its scripts never print
secret values. Nothing here deploys, migrates, or charges by itself. Every
production step requires Matthew's explicit approval.

## Current policy: live checkout on the production hostname only

With the live checkout change (#2539, replaying #2230 and #2497), the tracked production client token is
live-class. A live token opens checkout only on `verdantgrowdiary.com` and
`www.verdantgrowdiary.com`; every other host is unavailable before script
loading, price resolution, or overlay opening. Authentication redirects and
session writes are not part of the checkout gate and keep their own rules. A
`test_` token stays sandbox everywhere. The build-time
switch `VITE_CHECKOUT_DISABLED="true"` makes checkout unavailable on every
host, production included. This runbook does not itself authorize or perform
a settings change; backend readiness is verified before the live build ships
(see "Live checkout release").

## Project identity (proven 2026-07-14)

| Question                    | Answer                                           | Evidence                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production Supabase project | **`knkwiiywfkbqznbxwqfh`** (Lovable-managed)     | Committed `.env` `VITE_SUPABASE_URL`/`VITE_SUPABASE_PROJECT_ID`; `supabase/config.toml` `project_id`; CI local stack container name; the Lovable project DB holds the live data (18 profiles, 94 diary entries, the founder billing row) |
| `bzatgtgjvuojpoxcknaa`      | Personal dev sandbox — **never a deploy target** | Only project visible to the personal Supabase account; near-zero data (0 diary entries, 0 billing rows); schema drifted AHEAD of production (has `billing_customer_links` etc.)                                                          |
| Who can touch production DB | Lovable deploys / Lovable cloud tooling only     | The Supabase MCP in agent sessions sees only the personal account — it structurally cannot migrate production                                                                                                                            |

## Canonical lane decision (revised 2026-07-16)

**Canonical for entitlements: the Lovable lane** — `payments-webhook` →
`lovable_paddle_events` → `public.subscriptions` (+ `allocate_lovable_founder_lifetime`
for Founder). This matches what the client checkout actually drives and what
Paddle's live + sandbox notification destinations point at today.

The BYO lane (`paddle-webhook` → `paddle_events` → `paddle_event_processing`
→ `apply_paddle_subscription_update_with_audit` /
`allocate_founder_lifetime_with_audit` → `billing_subscriptions`) is now an
**operator audit surface only**. It stays running so
`OperatorPaddleProcessingAudit`, `OperatorBillingSubscriptionUpdateAudit`,
and `OperatorBillingEntitlementResolutionAudit` continue to have data, but
it no longer contributes to entitlement resolution.

Residual live-union risk (previously "close before live"): **resolved**
by the 2026-07-16 narrowing migration. `has_pheno_tracker_entitlement`,
`ai_credit_spend`, `supabase/functions/_shared/unionEntitlementLookup.ts`,
and `src/hooks/useMyEntitlements.ts` all read only from
`public.subscriptions` now. Any currently-entitling `billing_subscriptions`
row was backfilled into `public.subscriptions` in the same migration
(synthetic `byo_backfill_*` / `lifetime_byo_backfill_*` paddle_subscription_id),
so no live entitlement was lost.

Consequence: any future operator BYO write to `billing_subscriptions` will
**not** grant entitlement. New entitlements must arrive through
`payments-webhook`. Refunds/corrections still happen as audited service-role
writes; they now target `public.subscriptions` (status update + audit note),
not `billing_subscriptions`.

## Migration order (file-only in this PR; apply requires approval)

Production is MISSING these repo migrations (verified live 2026-07-14):

1. `20260620234500_add_paddle_event_processing.sql`
2. `20260621003000_paddle_event_processing_operator_audit.sql`
3. `20260621004500_*billing_customer_links*.sql`
4. `20260621015000_apply_paddle_subscription_update_rpc.sql`
5. `20260622170000_billing_subscription_update_audit.sql`
6. `20260622171621_*purge_billing_subscription_update_audit*.sql`
7. `20260714230000_paddle_paid_launch_ordering_and_founder.sql`
8. `20260715001000_paddle_paid_launch_review_hardening.sql` (review follow-up:
   founder lock before existing-row read, FK-safe append-only audit trigger,
   audit DELETE/TRUNCATE revoked from service_role)

Apply in timestamp order via the Lovable/Supabase migration path for
`knkwiiywfkbqznbxwqfh` — never via the personal project.

## Checkout metadata contract (attribution)

**Canonical lane (`payments-webhook`, live and sandbox).** Checkout
(`src/hooks/usePaddleCheckout.ts`) sends `customData: { userId }`. After
signature verification, `payments-webhook` normalizes Paddle's raw
`custom_data` (#2221), and `eventProcessor.ts` attributes subscriptions, Founder
Lifetime and credit packs ONLY from `customData.userId`. A missing value records
the event as `missing_user_id` and grants no entitlement. If the checkout
payload shape ever changes, update `eventProcessor.ts` in the SAME change.

**Legacy BYO audit sink (`paddle-webhook`, sandbox-only).** It also accepts the
aliases `verdant_user_id`, `user_id`, `userId`, `auth_user_id` and
`verdant_auth_user_id`, and grants nothing. Live attribution is verified on
`payments-webhook`, never here.

## Required configuration (presence only — never echo values)

Edge function secrets on the production project:

| Secret                                                                                          | Used by                                                                                                     | Presence check                         |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `PADDLE_WEBHOOK_SECRET`                                                                         | paddle-webhook                                                                                              | `supabase secrets list` shows the NAME |
| `PADDLE_ENVIRONMENT`                                                                            | paddle-webhook — **permanently `sandbox`**, never `live` (see "Live checkout release")                      | same                                   |
| `PADDLE_SANDBOX_PRICE_PRO_MONTHLY` / `_PRO_ANNUAL` / `_FOUNDER_LIFETIME`                        | paddle-webhook plan mapping (sandbox-scoped; preferred)                                                     | same                                   |
| `PADDLE_PRICE_PRO_MONTHLY` / `PADDLE_PRICE_PRO_ANNUAL` / `PADDLE_PRICE_FOUNDER_LIFETIME`        | legacy fallback for paddle-webhook when the sandbox-scoped names are unset; also read by `get-paddle-price` | same                                   |
| `PAYMENTS_ENVIRONMENT`                                                                          | get-paddle-price env selection (server-controlled)                                                          | same                                   |
| `PADDLE_PRICE_CREDIT_PACK_50` / `PADDLE_PRICE_CREDIT_PACK_150`                                  | get-paddle-price for both pack SKUs; must hold the live pack price IDs for the live release                 | same                                   |
| `PADDLE_PRICE_CRAFT_MONTHLY` / `PADDLE_PRICE_CRAFT_ANNUAL`                                      | get-paddle-price; may be deliberately absent while Craft has no live product (`price_not_configured`)       | same (absence is expected today)       |
| `PADDLE_SANDBOX_API_KEY` (+ `PADDLE_LIVE_API_KEY` only at live approval)                        | gateway price lookups                                                                                       | same                                   |
| `LOVABLE_API_KEY`, `PAYMENTS_SANDBOX_WEBHOOK_SECRET` (+ `PAYMENTS_LIVE_WEBHOOK_SECRET` at live) | Lovable lane                                                                                                | same                                   |

JWT posture (now pinned in `supabase/config.toml`): `get-paddle-price`
verify_jwt=true; `paddle-webhook` and `payments-webhook` verify_jwt=false
(signature is the auth; they grant nothing unverified).

`paddle-webhook`'s three price IDs must belong to the SAME Paddle environment as
its webhook secret and `PADDLE_ENVIRONMENT` — i.e. **sandbox, permanently**. Set
them in the `PADDLE_SANDBOX_PRICE_*` names so they stay sandbox-correct even
after `PADDLE_PRICE_*` is repointed at a live catalog: those legacy names are
shared with `get-paddle-price`, which selects from the server's
`PAYMENTS_ENVIRONMENT`, and a live transition would otherwise leave every
sandbox event classified as `null` with no error raised.

### Price names at the live switch

`get-paddle-price` reads only these seven names, and only an explicit
`PAYMENTS_ENVIRONMENT` of `live` or `sandbox` selects the gateway. It does not
read `PADDLE_ENVIRONMENT`. At switch time the four sellable names (1, 2, 6, 7)
hold **live** price ids. Name 5 needs no value: Founder Lifetime is no longer
sold (#2028, #2570) and the function answers `410 plan_retired` before any
lookup; the name stays wired only for the cold-start drift guard. Names 3 and 4
stay empty while Craft has no live Paddle product (`price_not_configured`;
the live catalog read on 2026-10-29 had no Craft product):

1. `PADDLE_PRICE_PRO_MONTHLY`
2. `PADDLE_PRICE_PRO_ANNUAL`
3. `PADDLE_PRICE_CRAFT_MONTHLY`
4. `PADDLE_PRICE_CRAFT_ANNUAL`
5. `PADDLE_PRICE_FOUNDER_LIFETIME`
6. `PADDLE_PRICE_CREDIT_PACK_50`
7. `PADDLE_PRICE_CREDIT_PACK_150`

Before flipping them, set these seven sandbox copies (a copy for a plan with
no sandbox price may be empty, but the name must exist). The legacy classifier
maps pro monthly, pro annual, and founder lifetime today; the craft and
credit-pack copies are still required so those ids are stored off the shared
live names before the flip:

1. `PADDLE_SANDBOX_PRICE_PRO_MONTHLY`
2. `PADDLE_SANDBOX_PRICE_PRO_ANNUAL`
3. `PADDLE_SANDBOX_PRICE_CRAFT_MONTHLY`
4. `PADDLE_SANDBOX_PRICE_CRAFT_ANNUAL`
5. `PADDLE_SANDBOX_PRICE_FOUNDER_LIFETIME`
6. `PADDLE_SANDBOX_PRICE_CREDIT_PACK_50`
7. `PADDLE_SANDBOX_PRICE_CREDIT_PACK_150`

Also required, and not set by this repository: `PAYMENTS_ENVIRONMENT=live`,
`PAYMENTS_LIVE_WEBHOOK_SECRET`, and a live Paddle notification whose URL is the
`payments-webhook` function with `?env=live` (omitting `env` selects sandbox).
`PADDLE_ENVIRONMENT` stays `sandbox` permanently; `paddle-webhook` returns 403
otherwise.

### Checkout-disabled artifact (no deploy)

Rollback order, before any production publish:

1. The workflow `Checkout-disabled rollback artifact` builds with
   `VITE_CHECKOUT_DISABLED="true"` (process env, so the prebuild restore of
   `.env.production` does not drop the switch) and runs
   `scripts/verify-checkout-disabled-bundle.mjs`. The receipt artifact
   `checkout-disabled-rollback-receipt` must show the paused copy and no
   `Paddle.Initialize`, `Paddle.Checkout.open`, or `Paddle.Environment.set`
   in the client bundle. That job does not deploy.
2. The deployable rollback remains a pinned commit that appends
   `VITE_CHECKOUT_DISABLED="true"` to `.env.production` on a branch that is
   never merged, built with `bun run build`, and verified the same way.
   Publishing that commit is a separate owner approval. This pull request
   does not publish it.
3. Do not flip `PAYMENTS_ENVIRONMENT` back to `sandbox` as the rollback.

## Release gate — every box must be green before "ready"

1. [ ] Production project confirmed = `knkwiiywfkbqznbxwqfh` (re-run identity checks above)
2. [ ] Migrations 1–8 + the 2026-07-16 canonical-lane narrowing migration applied, in order
3. [ ] Canonical (Lovable) webhook URL registered in the Paddle dashboard: points at `payments-webhook` for both `env=sandbox` and `env=live` — this is what Lovable's built-in Paddle integration configures automatically
4. [ ] JWT settings deployed as pinned in config.toml
5. [ ] All required secret NAMES present (list above)
6. [ ] Price IDs configured for the matching Paddle environment
7. [ ] **Pre-transition evidence only:** sandbox smoke recorded green before the live build — see `docs/paddle-sandbox-smoke.md` (do not reconfigure production to sandbox to rerun it; after the live release the production build refuses a `test_` token). Live validation is item 8, the per-SKU resolution and the controlled verification in "Live checkout release", with no payment submitted without approval. Recorded evidence: one sandbox checkout → `lovable_paddle_events` row `processed_ok=true` → `public.subscriptions` row `environment='sandbox' status='active'`; duplicate delivery → noop (23505); Founder Lifetime cap decrements; cancel-and-resubscribe leaves both rows and resolves to the newer active one
8. [ ] **Live layers agree before the live build ships** — the live client
       token, `PAYMENTS_ENVIRONMENT=live`, live API key, live webhook secret
       and destination, live price IDs, and public copy all agree on live;
       legacy `PADDLE_ENVIRONMENT` stays `sandbox` (below).
9. [ ] **Rollback artifact verified** — the checkout-disabled build is built,
       verified under production-host conditions, and pinned
       (see "Live checkout rollback").
10. [ ] **Founder price archived in live Paddle** — the retired
        `founder_lifetime` price reads `archived` on a read-only price list
        (owner-approved Paddle-side write; see step 4 below and
        `docs/billing.md` step 4). The client and server refusals do not stop a
        caller who passes the price id to Paddle.js directly, and the webhook
        still allocates a seat; only archiving makes Paddle refuse it.

## Live checkout release

Merging #2539 into `verdant-grow-diary` makes it the build the configured
publisher deploys to production. Customer exposure starts when the live
`/version.json` reports the merge SHA; from then the live token opens checkout,
and there is no operator-only gate. So backend readiness is verified first, in
this order, and the merge waits for steps 1–6 and for every standing check in
`docs/billing.md` ("What must be true before live payments open to
customers"); step 7 is the merge followed by post-merge deployment
verification:

1. Merge #2229 (shared webhook-verifier packaging repair) through the queue.
   Confirm Lovable has pulled the merged source. Then, with the owner naming
   the Edge deploy, redeploy `payments-webhook`, `delete-account` and
   `paddle-portal-session`. Record each reported result with its
   submitted-source fingerprint and verify each live deployment receipt
   (version and last-updated time, or a boot log line); a success message or
   sync commit is not a receipt. Don't redeploy only because an unrelated
   file differs in Lovable's working copy.
2. The owner reads `PAYMENTS_ENVIRONMENT` in the production backend
   (`knkwiiywfkbqznbxwqfh`) and confirms it is exactly `live`, never inferred
   from the client token. Only then, with its own approval, deploy
   `get-paddle-price` and record its fingerprint and receipt. This comes
   before customer exposure.
3. From a signed-in production session, call `get-paddle-price` once for each
   SKU the pricing page sells (`pro_monthly`, `pro_annual`, `craft_monthly`,
   `craft_annual`, `founder_lifetime`, `credit_pack_50`, `credit_pack_150`;
   packs need a paid plan with a monthly AI allowance, e.g. Pro) and record
   status and log line. Each must return a live price ID or a deliberate calm
   block (`price_not_configured` for a product absent from live Paddle, which
   is Craft today, or `410 plan_retired` for `founder_lifetime`). Any
   `price_resolution_unavailable` blocks the release:
   one click on that SKU closes checkout for every plan on the page.
4. Founder price archived in live Paddle, owner-approved: the retired
   `founder_lifetime` price (`import_meta.external_id = founder_lifetime`) is
   set to `archived` by the Paddle operator, then verified by a read-only
   price read that shows that status. Record the price id and the read-back
   timestamp. Without this, a direct Paddle.js call with the price id still
   buys a Founder seat that the webhook grants, whatever the app refuses.
5. Read-only webhook pass: Paddle notification logs for both live
   destinations, live `lovable_paddle_events` rows, `payments-webhook` logs.
   Choose the canonical destination from evidence. A live test event is a
   production write and needs its own authorization.
6. Build and verify the rollback artifact (below).
7. Post-merge: merge #2539 through the queue. Measure the publisher deployment for the
   merge commit; exposure and live verification start only when the live
   `/version.json` names it. Then confirm `/pricing` shows "Secure checkout by
   Paddle". A
   real-money verification charge needs the owner's explicit approval of
   amount, account, and refund plan.

**`PADDLE_ENVIRONMENT` is NOT part of that list and must stay `sandbox`.** An
earlier revision of this runbook said to set it live; that was wrong.
`paddle-webhook` returns 403 `sandbox_only` unless it is exactly `sandbox`, and
per the release gate above **both** `env=sandbox` and `env=live` route to
`payments-webhook` — so no live traffic ever reaches `paddle-webhook`. Setting it
live enables nothing and silently starves the operator audit surfaces. Keep
`paddle-webhook`'s price IDs in the `PADDLE_SANDBOX_PRICE_*` names for the same
reason. Flipping any single setting or token is insufficient and
must fail closed.

### Live checkout rollback

The rollback artifact is a **pinned commit**, not a working-tree edit. The
prebuild step (`restore-env-production-from-head.mjs`) resets
`.env.production` to `HEAD` before every build, so an uncommitted switch is
silently discarded. Build it like this:

1. Before the merge, start from the exact reviewed head of #2539 (the full
   SHA the independent exact-head review passed; the merge commit
   does not exist yet).
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
   means step 5 failed. Treat it as a release incident, ship the one-line
   switch on top of the merge commit as the emergency action, and rebuild and
   verify the artifact on the merge commit before closing it.

It makes checkout
unavailable on every host, including the production hostname, before Paddle.js
loads or any price lookup runs, and shows "Checkout paused". It changes no
token, secret, entitlement read, webhook or portal path, so existing live
subscribers keep access and billing management.

Verify it before the #2539 merge:

1. `src/test/paddle-live-checkout-production-host.test.tsx` (page URL
   `https://verdantgrowdiary.com/`): the switch blocks init, price lookup and
   the hook; the paused banner hydrates without mismatch.
2. Build the artifact and load `/pricing` with `verdantgrowdiary.com` mapped
   to the built server: paused copy, `openCheckout` blocks, no request to
   `cdn.paddle.com`. A control build without the switch on the same mapping
   must show live copy.

No staging deploy: Verdant is production only, and a live token is
unavailable on any non-production host, so a preview cannot exercise this
path. After a real rollback deploy, the owner confirms on production that
`/pricing` shows "Checkout paused" with no Paddle.js request.

Keep it deployable as a pinned commit. To roll back, state the action and its
effect on live subscriptions, then deploy that commit.

Never as a generic rollback: flipping `PAYMENTS_ENVIRONMENT` back to
`sandbox` (breaks live portal and price lookups for existing customers and
recreates a hybrid), restoring an earlier `test_`-token build (reopens sandbox
checkout against a live selector), or revoking the live client token or
rotating secrets as a reflex.

## Business axis (refresh before every report)

Target: ≥ 101 distinct ACTIVE paid users in `public.subscriptions` (the
canonical entitlement source since 2026-07-16) with `environment='live'` by
2026-08-31. Count only that table with the environment filter. Do not count
`profiles`/leads/checkout opens/`profiles.tier`/browser state; do not count
`billing_subscriptions` (audit surface only, no longer grants access).
Baseline 2026-07-14: **1 active `founder_lifetime` row of unverified
provenance → 0 verified live paid users.** The one legacy BYO row was
backfilled into `public.subscriptions` on 2026-07-16.

## Rollback

- Live checkout: deploy the checkout-disabled rollback artifact (see "Live
  checkout rollback"). Do not flip `PAYMENTS_ENVIRONMENT` back to `sandbox`.
- App/functions: revert this PR's commits; redeploy previous functions.
- Migration 7 rollback: `DROP FUNCTION public.allocate_founder_lifetime(uuid);`,
  `DROP FUNCTION public.allocate_founder_lifetime_with_audit(uuid);`, restore the
  previous `apply_paddle_subscription_update` from `20260621015000`, and run
  `DROP TRIGGER trg_billing_subscription_update_audit_deny_update ON public.billing_subscription_update_audit;`,
  and (optional, non-destructive to keep) the two added nullable columns.
- Entitlements already granted are never deleted — billing history is
  append-only; corrections happen via new audited writes.

## Refund / adjustment policy (explicit)

`adjustment.created/updated` events are recorded and deliberately IGNORED
with reason `adjustment_event_requires_policy` — no automatic revocation.
Founder refunds are operator-manual: a service-role audited write, appended
to `billing_subscription_update_audit`, never silent deletion.
