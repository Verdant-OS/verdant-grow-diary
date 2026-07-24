# Verdant Level Two — Billing Operator Launch Gate Checklist

## Status

Sandbox-only. Live mode is not approved in this slice.

This document is the operator launch readiness gate for Verdant Level Two billing.
It defines what must be true before any movement from sandbox-only billing toward
any live-mode work. Live mode remains explicitly blocked until a future, dedicated
slice approves it.

## Scope

- Documentation-only and static-safety slice.
- No new UI, no new migrations, no new RPCs, no webhook changes, no checkout
  changes, no entitlement logic changes.
- No new billing capability is added in this slice.
- Applies to the existing Paddle sandbox billing chain and operator audit
  surfaces introduced in H4E-5, H4E-6, and H4E-7.

## Current Billing Chain

**Canonical entitlement chain (Lovable lane, since 2026-07-16):**

1. `payments-webhook` verifies the Paddle signature via the shared helper.
2. Events are recorded idempotently in `lovable_paddle_events`
   (unique on `paddle_event_id`; 23505 = duplicate no-op).
3. Recurring subscription events upsert `public.subscriptions` directly
   (service role, keyed on `paddle_subscription_id`).
4. Founder Lifetime purchases go through `allocate_lovable_founder_lifetime`
   (advisory-locked, cap-enforced, atomic).
5. `has_pheno_tracker_entitlement` and `ai_credit_spend` read entitlement
   only from `public.subscriptions` where `environment='live'`.

**Audit-only chain (legacy BYO lane, retained for operator visibility):**

6. `paddle-webhook` (sandbox-only) verifies the raw-body signature before
   parsing and records events in `paddle_events`.
7. Processing decisions are recorded in `paddle_event_processing`.
8. Customer/user attribution is captured in `billing_customer_links`.
9. Subscription updater writes to `billing_subscriptions` only through
   reviewed RPC boundaries (audited in `billing_subscription_update_audit`).
10. Retention purge for the audit table is service-role-only.
11. Operator surfaces (`/operator/paddle-processing`,
    `/operator/billing-subscription-updates`,
    `/operator/billing-entitlement-resolution`) read from these tables.

**Note:** rows written to `billing_subscriptions` no longer grant
entitlement. New paid access must arrive through the Lovable lane.

## Required Green Checks Before Live Mode

All of the following must be green and reviewed before any live-mode slice is
opened:

- typecheck clean
- full targeted billing vitest suite green
- build green
- Supabase migrations applied in order in a non-production environment
- Paddle sandbox webhook signing verified
- at least one sandbox Pro Monthly transaction verified end-to-end
- at least one sandbox Pro Annual transaction verified end-to-end
- duplicate webhook delivery verified idempotent
- failed/blocked event visible in operator audit
- entitlement resolution audit matches expected plan/status
- rollback checklist reviewed

## Explicitly Blocked Until Future Slice

The following are explicitly out of scope and must not be introduced until a
dedicated, reviewed future slice approves them:

- live mode
- Founder allocation
- checkout-success entitlement grant
- browser/client billing writes
- direct webhook writes to `billing_subscriptions`
- raw provider IDs in operator UI
- Paddle payload JSON in operator UI
- automatic account upgrades outside the reviewed RPC path
- grow-room/device automation

## Operator Verification Steps

The operator should verify the following pages in a non-production environment.
Do not paste raw internal UUIDs into shared notes or screenshots.

### `/operator/paddle-processing`

- Confirm recent webhook events appear with sanitized status only.
- Confirm idempotent re-delivery does not duplicate processing rows.
- Confirm failed/blocked events are visible and clearly labeled.
- Confirm no raw provider IDs, no raw Paddle payload JSON, and no internal
  UUIDs appear in visible copy.

### `/operator/billing-subscription-updates`

- Confirm the audited subscription updater wrapper success/failure counts
  reflect recent sandbox transactions.
- Confirm the latest sanitized rows include expected sandbox Pro Monthly and
  Pro Annual transactions.
- Confirm no raw provider IDs, no raw Paddle payload JSON, no `details` JSON,
  and no internal UUIDs appear in visible copy.

### `/operator/billing-entitlement-resolution`

- Confirm entitlement resolution counts and latest rows reflect the expected
  active / free_fallback / expired_fallback / blocked / unknown distribution.
- Confirm resolved plan/status matches the sandbox transactions verified
  above.
- Confirm no raw provider IDs, no raw Paddle payload JSON, and no internal
  UUIDs appear in visible copy.

## Rollback Notes

- Revert the audited wrapper RPC call from the webhook back to the raw
  subscription updater only if the wrapper itself causes webhook errors.
- Do not delete `billing_subscriptions` rows during rollback.
- Audit tables may remain unused after rollback because they are
  service-role/operator sanitized and carry no client write path.
- Drop RPCs/tables only via dedicated rollback migrations, not ad-hoc.
- Keep the operator audit pages intact unless their underlying RPCs are also
  rolled back in the same dedicated rollback slice.

## Safety Verdict

Docs and static-test only. No live mode. No Founder allocation. No
checkout-success grant. No database write-path changes. No webhook changes.
No operator UI changes. No raw provider IDs surfaced. No Paddle payload JSON
surfaced. No grow-room writes. No AI, sensor, Action Queue, alert,
automation, or device-control writes.
