# Verdant Level Two — Sandbox Operator Checklist

## Status

- Docs/static-only.
- Sandbox-only.
- This does not approve live mode.

## Purpose

A one-page operator checklist for bringing up and verifying Level Two
billing in a non-production Supabase environment. It links to each
existing runbook and the apply-order manifest. It does not change
schema, RPCs, UI, webhook logic, checkout logic, or entitlement
resolution logic.

## Quick Links

- [Launch gate](./billing-level-two-launch-gate.md) — `docs/billing-level-two-launch-gate.md`
- [Migration apply order manifest](./billing-level-two-migration-apply-order.md) — `docs/billing-level-two-migration-apply-order.md`
- [Sandbox migration operator runbook](./billing-level-two-sandbox-migration-operator-runbook.md) — `docs/billing-level-two-sandbox-migration-operator-runbook.md`
- [Sandbox verification runbook](./billing-level-two-sandbox-verification-runbook.md) — `docs/billing-level-two-sandbox-verification-runbook.md`
- [Supabase SQL verification checklist](./billing-level-two-supabase-sql-verification-checklist.md) — `docs/billing-level-two-supabase-sql-verification-checklist.md`

## Before Applying Migrations

- Confirm target Supabase project is sandbox / non-production.
- Confirm Paddle environment is sandbox.
- Confirm service-role keys and Paddle secrets will not be printed or
  pasted into logs, terminal scrollback, CI output, screenshots, or
  shared notes.
- Review the launch gate.
- Review the migration apply-order manifest.

## Apply Migrations

- Follow `docs/billing-level-two-sandbox-migration-operator-runbook.md`.
- Apply migrations strictly in the order from
  `docs/billing-level-two-migration-apply-order.md`.
- Do not batch out-of-order.
- If a dependency group is listed as
  `no migration file found — verify before apply`, stop and confirm.

## After Applying Migrations

- Run `npm.cmd run typecheck`.
- Run the targeted billing vitest suite.
- Run `npm.cmd run build`.
- Follow `docs/billing-level-two-supabase-sql-verification-checklist.md`
  to confirm expected tables and RPCs exist.

## Operator Route Checks

Load each route under an operator role in the non-production
environment and confirm sanitized output only:

- `/operator/paddle-processing`
- `/operator/billing-subscription-updates`
- `/operator/billing-entitlement-resolution`

## Sandbox Transaction Checks

- Verify one sandbox Pro Monthly transaction end-to-end.
- Verify one sandbox Pro Annual transaction end-to-end.
- Verify duplicate webhook delivery is idempotent.
- Verify a blocked / failed event is visible in the operator audit
  views.
- Verify entitlement resolution matches the expected plan and status.

## Evidence Rules

- Do not screenshot or paste service-role keys.
- Do not screenshot or paste Paddle secrets.
- Do not expose raw provider IDs.
- Do not expose Paddle payload JSON.
- Operator screenshots should show only sanitized rows / counts.

## Explicitly Blocked

The following remain explicitly out of scope and must not be introduced
by this checklist or by any follow-up in this slice:

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
