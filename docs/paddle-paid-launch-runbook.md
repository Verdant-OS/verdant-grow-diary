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

## Canonical lane decision

**Canonical for entitlements: the BYO lane** — `paddle-webhook` →
`paddle_events` → `paddle_event_processing` → `apply_paddle_subscription_update_with_audit`
/ `allocate_founder_lifetime_with_audit` → `billing_subscriptions`.

Why: it is the only lane with raw-body signature verification + replay
bounds, verified-link attribution (signed checkout `custom_data`, never
email), guarded service-role-only RPCs, sanitized append-only audit, and a
DB-level sandbox-only launch gate. `billing_subscriptions` remains the
entitlement source of truth.

The Lovable lane (`payments-webhook` → `lovable_paddle_events` +
`subscriptions`) keeps running for observability but must never write
competing entitlements (it does not write `billing_subscriptions`).
**At launch, the Paddle account's webhook destination is repointed to
`paddle-webhook`.** No third lane exists.

Known residual risk to close before live: server-side entitlement readers
union `subscriptions(environment='live')` (e.g. `has_pheno_tracker_entitlement`,
AI-credit gate). Until the union is narrowed to `billing_subscriptions`-only
(follow-up migration, requires approval), the Lovable lane accepting a
`?env=live` query param is a bypass surface — mitigated today by live webhook
secrets not being configured.

## Migration order (file-only in this PR; apply requires approval)

Production is MISSING these repo migrations (verified live 2026-07-14):

1. `20260620234500_add_paddle_event_processing.sql`
2. `20260621003000_paddle_event_processing_operator_audit.sql`
3. `20260621004500_*billing_customer_links*.sql`
4. `20260621015000_apply_paddle_subscription_update_rpc.sql`
5. `20260622170000_billing_subscription_update_audit.sql`
6. `20260622171621_*purge_billing_subscription_update_audit*.sql`
7. `20260714230000_paddle_paid_launch_ordering_and_founder.sql` (this PR)

Apply in timestamp order via the Lovable/Supabase migration path for
`knkwiiywfkbqznbxwqfh` — never via the personal project.

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
2. [ ] Migrations 1–7 applied there, in order
3. [ ] Canonical webhook URL registered in the Paddle dashboard: `https://knkwiiywfkbqznbxwqfh.functions.supabase.co/paddle-webhook` (sandbox notification destination first)
4. [ ] JWT settings deployed as pinned in config.toml
5. [ ] All required secret NAMES present (list above)
6. [ ] Price IDs configured for the matching Paddle environment
7. [ ] Sandbox smoke green: one sandbox checkout → webhook → `billing_subscriptions` row; duplicate delivery → noop; proof harness passes (`bun run scripts/run-paid-launch-proof-harness.ts` against a disposable project)
8. [ ] **Production stays blocked** — `PADDLE_ENVIRONMENT=sandbox` and the RPC-level sandbox gates remain until Matthew approves the live-enable migration + `PADDLE_ENVIRONMENT=live` + live secrets + live price IDs as one reviewed change

## Business axis (refresh before every report)

Target: ≥ 101 distinct ACTIVE paid users in `public.billing_subscriptions`
by 2026-08-31. Count only that table (never profiles/leads/checkout
opens/`profiles.tier`/browser state/`subscriptions` rows unless reconciled).
Baseline 2026-07-14: **1 active `founder_lifetime` row of unverified
provenance (likely sandbox/manual — 0 live Paddle events have ever been
received) → 0 verified live paid users.**

## Rollback

- App/functions: revert this PR's commits; redeploy previous functions.
- Migration 7 rollback: `DROP FUNCTION public.allocate_founder_lifetime(_with_audit)`,
  restore the previous `apply_paddle_subscription_update` from
  `20260621015000`, `DROP TRIGGER trg_billing_subscription_update_audit_deny_update`,
  and (optional, non-destructive to keep) the two added nullable columns.
- Entitlements already granted are never deleted — billing history is
  append-only; corrections happen via new audited writes.

## Refund / adjustment policy (explicit)

`adjustment.created/updated` events are recorded and deliberately IGNORED
with reason `adjustment_event_requires_policy` — no automatic revocation.
Founder refunds are operator-manual: a service-role audited write, appended
to `billing_subscription_update_audit`, never silent deletion.
