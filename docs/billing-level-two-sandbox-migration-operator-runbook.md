# Verdant Level Two — Sandbox Migration Operator Runbook

## Status

- Docs/static-only.
- Sandbox-only.
- This does not approve live mode.

## Purpose

This runbook gives an operator a short, practical sequence for applying
Level Two billing migrations to a non-production Supabase project and
verifying the operator audit surfaces afterward. It does not change
schema, RPCs, UI, webhook logic, checkout logic, or entitlement
resolution logic.

The authoritative dependency order lives in
`docs/billing-level-two-migration-apply-order.md`. This runbook executes
against that order; it does not redefine it.

## Preconditions

- Confirm current branch is the intended branch.
- Confirm target Supabase project is sandbox / non-production (not
  production).
- Confirm Paddle environment is sandbox.
- Confirm service-role keys and Paddle secrets are not printed or pasted
  into logs, terminal scrollback, CI output, screenshots, or shared
  notes.
- Confirm migrations will be applied in the documented order from
  `docs/billing-level-two-migration-apply-order.md`.
- Confirm the launch gate in `docs/billing-level-two-launch-gate.md`
  has been reviewed.

## Migration Apply Steps

1. Open `docs/billing-level-two-migration-apply-order.md` and read the
   apply order top to bottom.
2. For each dependency group, apply the listed migration file(s) to the
   non-production Supabase project, in order.
3. If a dependency group is listed as
   `no migration file found — verify before apply`, stop and confirm
   whether that group is required for the target environment before
   continuing. Do not invent or guess a filename.
4. After each migration applies cleanly, move to the next group. Do not
   batch out-of-order.
5. After all groups apply, run the Validation Commands below before
   verifying operator routes.

## Validation Commands

Run, in order:

```
npm.cmd run typecheck
```

```
npx.cmd vitest run src/test/billing-level-two-migration-apply-order-doc-static.test.ts src/test/billing-level-two-launch-gate-doc-static.test.ts src/test/billing-level-two-sandbox-verification-runbook-doc-static.test.ts src/test/operator-billing-entitlement-resolution-audit-static.test.ts src/test/operator-billing-subscription-update-audit-static.test.ts src/test/billing-subscription-update-audit-static.test.ts src/test/paddle-webhook-subscription-update-static.test.ts src/test/paddle-subscription-update-rpc-static.test.ts --reporter=verbose
```

```
npm.cmd run build
```

## Operator Route Checks

After the migrations apply cleanly in the non-production environment,
load each route under an operator role and confirm it renders sanitized
output only — no raw provider IDs, no Paddle payload JSON, no internal
UUIDs in visible copy:

- `/operator/paddle-processing`
- `/operator/billing-subscription-updates`
- `/operator/billing-entitlement-resolution`

## Failure / Rollback Notes

- If a migration fails, stop applying further migrations.
- Do not delete `billing_subscriptions` rows during rollback.
- Roll back schema only via dedicated rollback migrations, not ad-hoc
  SQL.
- If the audited subscription updater wrapper causes webhook errors,
  revert the webhook call site to invoke the unaudited updater RPC
  directly while a dedicated rollback migration is prepared.
- Audit tables may remain unused safely after rollback because access is
  service-role / operator sanitized and carries no client write path.
- Never expose service-role keys or Paddle secrets in logs, error
  messages, screenshots, or shared notes during rollback.

## Explicitly Blocked

The following remain explicitly out of scope and must not be introduced
by this runbook or by any follow-up in this slice:

- live mode
- Founder allocation
- checkout-success entitlement grant
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
