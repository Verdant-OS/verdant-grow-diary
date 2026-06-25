# Verdant Level Two — Supabase SQL Verification Checklist

## Status

- Docs/static-only.
- Sandbox-only.
- This does not approve live mode.

## Purpose

Give an operator a safe, read-only SQL checklist to confirm that
Level Two billing migrations were applied to a non-production Supabase
project in the documented order, and that the expected tables, RPCs,
and access boundaries are present. This document does not change
schema, RPCs, UI, webhook logic, checkout logic, or entitlement
resolution logic.

## Preconditions

- Run only against a sandbox / non-production Supabase project. Do not run against production.
- Do not print service-role keys in the SQL editor, logs, terminal
  scrollback, CI output, or screenshots.
- Do not paste Paddle secrets into the SQL editor.
- Verify migrations were applied using
  `docs/billing-level-two-migration-apply-order.md`.
- Use a role with read-only privileges where possible.

## Migration Order Verification

The snippets below are read-only and safe to run in the sandbox
Supabase SQL editor. They inspect Supabase's standard migration
tracking table if it is present in this project. Verify the migration
history table name in this Supabase project before running — table
names can differ between Supabase CLI versions.

Inspect applied migrations (read-only):

```
select version, name
from supabase_migrations.schema_migrations
order by version asc;
```

If the above table is not present in your project, try:

```
select *
from information_schema.tables
where table_schema = 'supabase_migrations';
```

Confirm the migrations applied include, in order, the dependency
groups from `docs/billing-level-two-migration-apply-order.md`. Do not
include or echo any secrets in these queries.

## Expected Objects

Run read-only checks that the following objects exist after applying
the documented migration order.

Tables:

```
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'billing_subscriptions',
    'paddle_events',
    'paddle_event_processing',
    'billing_customer_links',
    'billing_subscription_update_audit'
  )
order by table_name;
```

Functions / RPCs:

```
select n.nspname as schema, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'apply_paddle_subscription_update',
    'apply_paddle_subscription_update_with_audit',
    'billing_subscription_update_operator_audit',
    'purge_billing_subscription_update_audit',
    'billing_entitlement_resolution_operator_audit'
  )
order by p.proname;
```

Expected presence:

- `public.billing_subscriptions`
- `public.paddle_events`
- `public.paddle_event_processing`
- `public.billing_customer_links`
- `public.billing_subscription_update_audit`
- `public.apply_paddle_subscription_update`
- `public.apply_paddle_subscription_update_with_audit`
- `public.billing_subscription_update_operator_audit`
- `public.purge_billing_subscription_update_audit`
- `public.billing_entitlement_resolution_operator_audit`

## Access Safety Checks

- Confirm audit tables are service-role-only where appropriate; anon
  and authenticated roles must not be granted broad direct read or
  write access to raw audit payload columns.
- Confirm operator RPCs return sanitized output only — no provider
  IDs, no Paddle payload JSON, no internal UUIDs surfaced to operator
  UI.
- Confirm `anon` / `authenticated` direct table access remains blocked
  where required (no client write path to `billing_subscriptions`,
  `paddle_events`, `paddle_event_processing`,
  `billing_customer_links`, or `billing_subscription_update_audit`).
- Confirm the webhook still uses the reviewed RPC boundary
  (`apply_paddle_subscription_update_with_audit`) instead of writing
  directly to billing tables.
- Confirm there are no direct webhook writes to
  `billing_subscriptions`.

Inspect table grants (read-only):

```
select grantee, privilege_type, table_name
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'billing_subscriptions',
    'paddle_events',
    'paddle_event_processing',
    'billing_customer_links',
    'billing_subscription_update_audit'
  )
order by table_name, grantee, privilege_type;
```

## Sanitized Operator RPC Checks

Safe example calls (read-only) against the sandbox:

```
select * from public.billing_subscription_update_operator_audit(50);
```

```
select * from public.billing_entitlement_resolution_operator_audit(50);
```

Expected output must NOT include any of:

- `provider_customer_id`
- `provider_subscription_id`
- `provider_price_id`
- `payload`
- `raw_payload`
- `details`
- `event_id`
- internal UUIDs in visible operator evidence

If any of those appear, stop and treat the result as a sanitization
regression — do not screenshot, paste, or share the unsanitized
output.

## Failure / Rollback Notes

- Do not delete `billing_subscriptions` rows during rollback.
- Roll back schema only via dedicated rollback migrations, not ad-hoc
  SQL in the editor.
- If the audited subscription updater wrapper causes webhook errors,
  revert the webhook call site to invoke
  `apply_paddle_subscription_update` directly while a dedicated
  rollback migration is prepared.
- Audit tables may remain unused safely after rollback because access
  is restricted / sanitized and carries no client write path.
- Never expose service-role keys or Paddle secrets in logs, error
  messages, screenshots, or shared notes.

## Explicitly Blocked

The following remain explicitly out of scope and must not be
introduced by this checklist or by any follow-up in this slice:

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
