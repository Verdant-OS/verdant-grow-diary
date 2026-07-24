# Paddle Paid-Launch Runbook (Operator)

Presence/absence checks only — this document and its scripts never print
secret values. Nothing here deploys, migrates, or charges by itself. Every
production step requires Matthew's explicit approval.

## Project identity (proven 2026-07-14)

| Question | Answer | Evidence |
| --- | --- | --- |
| Production Supabase project | **`knkwiiywfkbqznbxwqfh`** (Lovable-managed) | Committed `.env` `VITE_SUPABASE_URL`/`VITE_SUPABASE_PROJECT_ID`; `supabase/config.toml` `project_id`; CI local stack container name; the Lovable project DB holds the live data (18 profiles, 94 diary entries, the founder billing row) |
| `bzatgtgjvuojpoxcknaa` | Personal dev sandbox — **never a deploy target** | Only project visible to the personal Supabase account; near-zero data (0 diary entries, 0 billing rows); schema drifted AHEAD of production (has `billing_customer_links` etc.) |
| Who can touch production DB | Lovable deploys / Lovable cloud tooling only | The Supabase MCP in agent sessions sees only the personal account — it structurally cannot migrate production |

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

The BYO webhook attributes buyers ONLY from checkout `custom_data`. The live
checkout (`src/hooks/usePaddleCheckout.ts`) sends `customData: { userId }`,
and the webhook accepts `verdant_user_id`, `user_id`, `userId`,
`auth_user_id`, or `verdant_auth_user_id`. If the checkout payload shape ever
changes, update the webhook's extraction list in the SAME change — a mismatch
records paid events with `missing_user_id` and grants no entitlement.

## Required configuration (presence only — never echo values)

Edge function secrets on the production project:

| Secret | Used by | Presence check |
| --- | --- | --- |
| `PADDLE_WEBHOOK_SECRET` | paddle-webhook | `supabase secrets list` shows the NAME |
| `PADDLE_ENVIRONMENT` | paddle-webhook (must be `sandbox` until live approval) | same |
| `PADDLE_PRICE_PRO_MONTHLY` / `PADDLE_PRICE_PRO_ANNUAL` / `PADDLE_PRICE_FOUNDER_LIFETIME` | paddle-webhook plan mapping | same |
| `PAYMENTS_ENVIRONMENT` | get-paddle-price env selection (server-controlled) | same |
| `PADDLE_SANDBOX_API_KEY` (+ `PADDLE_LIVE_API_KEY` only at live approval) | gateway price lookups | same |
| `LOVABLE_API_KEY`, `PAYMENTS_SANDBOX_WEBHOOK_SECRET` (+ `PAYMENTS_LIVE_WEBHOOK_SECRET` at live) | Lovable lane | same |

JWT posture (now pinned in `supabase/config.toml`): `get-paddle-price`
verify_jwt=true; `paddle-webhook` and `payments-webhook` verify_jwt=false
(signature is the auth; they grant nothing unverified).

All three Paddle price IDs must belong to the SAME Paddle environment as the
webhook secret and `PADDLE_ENVIRONMENT`.

## Release gate — every box must be green before "ready"

1. [ ] Production project confirmed = `knkwiiywfkbqznbxwqfh` (re-run identity checks above)
2. [ ] Migrations 1–8 + the 2026-07-16 canonical-lane narrowing migration applied, in order
3. [ ] Canonical (Lovable) webhook URL registered in the Paddle dashboard: points at `payments-webhook` for both `env=sandbox` and `env=live` — this is what Lovable's built-in Paddle integration configures automatically
4. [ ] JWT settings deployed as pinned in config.toml
5. [ ] All required secret NAMES present (list above)
6. [ ] Price IDs configured for the matching Paddle environment
7. [ ] Sandbox smoke green — see `docs/paddle-sandbox-smoke.md`: one sandbox checkout → `lovable_paddle_events` row `processed_ok=true` → `public.subscriptions` row `environment='sandbox' status='active'`; duplicate delivery → noop (23505); Founder Lifetime cap decrements; cancel-and-resubscribe leaves both rows and resolves to the newer active one
8. [ ] **Production stays blocked** — until Matthew approves the live-enable change: live `VITE_PAYMENTS_CLIENT_TOKEN`, `PAYMENTS_LIVE_WEBHOOK_SECRET`, `PADDLE_LIVE_API_KEY`, live price IDs, and `PAYMENTS_ENVIRONMENT=live` land as one reviewed slice

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
