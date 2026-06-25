# Verdant Level Two — Paddle Sandbox Verification Runbook

## Status

- Docs/static-only.
- Sandbox-only.
- This does not approve live mode.

## Purpose

This runbook defines how an operator verifies the Level Two billing safety
chain end-to-end in the Paddle sandbox before any live-mode work is
considered. It exercises the webhook event recording, processing audit,
customer link capture, audited subscription updater, retention boundary,
and entitlement resolution surfaces without introducing any new runtime
behavior.

This runbook does not change schema, RPCs, UI, webhook logic, checkout
logic, or entitlement resolution logic.

## Required Preconditions

- Migrations applied in the documented order from
  `docs/billing-level-two-migration-apply-order.md`.
- Launch gate reviewed from `docs/billing-level-two-launch-gate.md`.
- Paddle environment remains sandbox. Live mode is not approved.
- Webhook signing secret is configured securely in environment
  configuration, never committed to the repo, and never echoed to logs,
  terminal scrollback, CI output, or screenshots.
- Service-role key is not printed or pasted into logs, terminal
  scrollback, CI output, screenshots, or shared notes.
- The following operator routes are available in the non-production
  environment under operator role:
  - `/operator/paddle-processing`
  - `/operator/billing-subscription-updates`
  - `/operator/billing-entitlement-resolution`

## Test Matrix

| # | Case | Notes |
|---|------|-------|
| 1 | Pro Monthly sandbox transaction | New sandbox checkout |
| 2 | Pro Annual sandbox transaction | New sandbox checkout |
| 3 | Duplicate webhook delivery | Same event id replayed |
| 4 | Blocked event case | Event recorded but not applied |
| 5 | Failed / invalid signature case | Signature mismatch path |
| 6 | Canceled / paused / past_due subscription state | Only if feasible in sandbox |
| 7 | Entitlement resolution fallback case | Only if feasible without unsafe mutation |

## Step-by-Step Verification

1. Create a sandbox checkout for Pro Monthly.
2. Complete the sandbox payment.
3. Verify the Paddle event is recorded in the events ledger.
4. Verify a processing row appears for that event.
5. Verify the billing customer link capture either succeeded or is safely
   blocked with a sanitized reason.
6. Verify the audited subscription updater result appears in
   `/operator/billing-subscription-updates`.
7. Verify entitlement resolution matches the expected plan and status in
   `/operator/billing-entitlement-resolution`.
8. Repeat steps 1–7 for Pro Annual.
9. Replay a duplicate event (or trigger duplicate delivery safely from
   Paddle sandbox).
10. Verify duplicate delivery is idempotent — no duplicate processing
    rows and no duplicate subscription writes.
11. Trigger a blocked/failed event (for example invalid signature or
    unsupported event type) and verify it appears in the operator audit
    views with a sanitized status.
12. Record pass/fail notes for each row of the Test Matrix.

## Expected Operator Evidence

- Evidence from `/operator/paddle-processing` showing recent webhook
  events with sanitized status only.
- Evidence from `/operator/billing-subscription-updates` showing audited
  wrapper success/failure counts and sanitized latest rows.
- Evidence from `/operator/billing-entitlement-resolution` showing
  resolution counts and sanitized latest rows.
- No raw provider IDs in screenshots.
- No Paddle payload JSON in screenshots.
- No service-role keys, Paddle secrets, or webhook signing secrets in
  screenshots or logs.

## Failure Triage

- Signature mismatch — verify webhook signing secret matches the Paddle
  sandbox secret; do not echo the secret while diagnosing.
- Sandbox / live environment mismatch — confirm Paddle environment is
  sandbox; live mode is not approved in this slice.
- Missing customer link attribution — check that the customer link
  capture path saw the expected sandbox customer identifier.
- Blocked Founder candidate — Founder allocation is not approved; a
  blocked sanitized row is the expected outcome here.
- Duplicate event — confirm idempotency by event id; duplicates must not
  create duplicate processing rows or duplicate subscription writes.
- Updater blocked / noop / failed — inspect the sanitized status in
  `/operator/billing-subscription-updates`; do not bypass the audited
  wrapper.
- Entitlement free fallback — confirm whether the underlying
  subscription row is missing or expired before assuming a bug.
- Migration not applied — re-check
  `docs/billing-level-two-migration-apply-order.md` for required order.
- Stale cloud database schema — re-run the documented apply order in the
  non-production environment.

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

## Pass / Fail Criteria

Pass only if all of the following hold:

- Pro Monthly resolves correctly end-to-end in sandbox.
- Pro Annual resolves correctly end-to-end in sandbox.
- Duplicate webhook delivery is idempotent.
- Blocked / failed events are visible in the operator audit views.
- Entitlement resolution audit matches the expected state for the
  sandbox accounts above.
- No secrets, raw provider IDs, or Paddle payload JSON are exposed in
  operator evidence.

Fail if any of the following occur:

- Live mode is required to complete verification.
- Entitlement grants are issued from the checkout-success page.
- Webhook writes directly to `billing_subscriptions`.
- Raw provider IDs or Paddle payload JSON appear in the operator UI.
- A service-role key or Paddle secret appears in logs or screenshots.
- Grow-room or device automation is touched as part of verification.

## Safety Verdict

Docs/static-only. No live mode. No Founder allocation. No
checkout-success grant. No database write-path changes. No webhook
changes. No operator UI changes. No raw provider IDs surfaced. No
Paddle payload JSON surfaced. No grow-room writes. No AI, sensor,
Action Queue, alert, automation, or device-control writes.
