# Verdant Level Two — Billing Migration Apply Order Manifest

## Status

- Docs/static-only.
- Sandbox-only.
- This does not approve live mode.

This manifest documents the safe dependency order for applying Level Two
billing migrations to a non-production Supabase database. It changes no
runtime behavior, no schema, no RPC, no UI, no webhook, no checkout, and
no entitlement logic.

## Purpose

Operators applying Level Two billing migrations to a non-production
environment must apply them in dependency order. Out-of-order application
can leave RPCs referencing tables that do not yet exist, or audit wrappers
referencing updater RPCs that have not been created. This doc lists the
known dependency groups so that a fresh environment can be brought up
safely and predictably.

## Apply Order

Apply migrations in the dependency order below. When an exact filename is
not confidently verified in `supabase/migrations/`, the entry is marked
`filename to verify in repo` rather than invented.

1. Billing subscription source-of-truth foundation
   (`public.billing_subscriptions` table + RLS)
   - `supabase/migrations/20260605223431_2bb04500-2fca-40a7-83b8-a6e3086fdbfe.sql`
2. Paddle events table
   (`public.paddle_events` raw event ledger)
   - `supabase/migrations/20260602090359_efebb43a-e4da-4f0e-8ffd-accce65ccffa.sql`
3. Paddle event processing table
   - `supabase/migrations/20260620234500_add_paddle_event_processing.sql`
   - `supabase/migrations/20260621003000_paddle_event_processing_operator_audit.sql`
4. Billing customer links
   - `supabase/migrations/20260621004500_billing_customer_links_foundation.sql`
5. Subscription updater RPC
   - `supabase/migrations/20260621015000_apply_paddle_subscription_update_rpc.sql`
6. Subscription updater harness, if migration-backed
   - no migration file found — verify before apply
7. Subscription updater audit table, audited wrapper RPC, and operator audit RPC
   - `supabase/migrations/20260622170000_billing_subscription_update_audit.sql`
8. Subscription updater audit retention purge RPC
   - `supabase/migrations/20260622171621_billing_subscription_update_audit_retention.sql`
9. Entitlement resolution operator audit RPC
   - `supabase/migrations/20260622174913_61dbedcc-3cd8-45e5-ae08-e241346822a0.sql`


Related supporting migration (apply before any AI-credit-touching billing
work):

- `supabase/migrations/20260620231000_harden_ai_credit_effective_entitlement.sql`

## Preflight Checks

Before applying any of the above to a Supabase database:

- Confirm current branch is the intended branch.
- Confirm target database is not production.
- Confirm Supabase project target (project ref) matches the intended
  non-production environment.
- Confirm migrations will be applied in dependency order above.
- Confirm service-role secrets are not printed to logs, terminal scrollback,
  CI output, or screenshots.
- Confirm the Paddle environment remains sandbox.
- Confirm the webhook signing secret exists only in secure environment
  configuration, never committed and never echoed.

## Post-Apply Verification

After applying the migrations to the non-production environment:

- Run `npm run typecheck`.
- Run the targeted billing vitest suite.
- Verify the following operator routes load and render sanitized output:
  - `/operator/paddle-processing`
  - `/operator/billing-subscription-updates`
  - `/operator/billing-entitlement-resolution`
- Verify duplicate webhook event delivery is idempotent in sandbox
  (no duplicate processing rows, no duplicate subscription writes).
- Verify a sandbox Pro Monthly transaction end-to-end.
- Verify a sandbox Pro Annual transaction end-to-end.
- Verify a blocked/failed event is visible in the operator audit views.
- Verify entitlement resolution matches the expected active /
  free_fallback / expired_fallback / blocked / unknown status for the
  sandbox accounts above.

## Failure / Rollback Notes

- Do not delete `billing_subscriptions` rows during rollback.
- Rollback schema only via dedicated rollback migrations, not ad-hoc SQL.
- If the audited wrapper RPC causes webhook errors, revert the webhook
  call site to invoke `apply_paddle_subscription_update` directly while a
  dedicated rollback migration is prepared.
- Audit tables may remain unused safely after rollback because access is
  service-role / operator sanitized and carries no client write path.
- Never expose service role keys or Paddle secrets in logs, error
  messages, screenshots, or shared notes.

## Explicitly Blocked

The following remain explicitly out of scope and must not be introduced
by applying these migrations or by any follow-up in this slice:

- live mode
- Founder allocation
- checkout-success entitlement grants
- browser/client billing writes
- direct webhook writes to `billing_subscriptions`
- raw provider IDs in operator UI
- Paddle payload JSON in operator UI
- automatic account upgrades outside the reviewed RPC path
- grow-room/device automation

## Safety Verdict

Docs/static-only. No live mode. No Founder allocation. No
checkout-success grant. No database write-path changes. No webhook
changes. No operator UI changes. No raw provider IDs surfaced. No
Paddle payload JSON surfaced. No grow-room writes. No AI, sensor,
Action Queue, alert, automation, or device-control writes.
