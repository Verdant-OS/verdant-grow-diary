# Billing Entitlement Updater RPC Design

**Status:** Design-only  
**Slice:** L2-H4E-1  
**Date:** 2026-06-21  
**Implementation status:** Not implemented in this document

This document defines the first safe server-side updater boundary for turning already-recorded Paddle processing decisions and billing customer links into `public.billing_subscriptions` updates.

This is intentionally docs-only. It does not add SQL, RPCs, schema changes, RLS changes, Edge Function changes, webhook wiring, checkout behavior, entitlement writes, AI behavior, sensor ingest, Action Queue behavior, alerts, automation, or device control.

---

## Summary

Verdant now has the safe pre-write stack:

1. `public.paddle_events` records verified Paddle events idempotently.
2. `public.paddle_event_processing` records mapper outcomes for replay/audit.
3. `public.billing_customer_links` records server-owned customer attribution.
4. `buildBillingCustomerLinkCapturePlan()` builds link payloads without writes.
5. `planBillingEntitlementUpdate()` builds a proposed recurring entitlement payload without writes.
6. Operator audit views expose sanitized processing/link state without raw provider identifiers.

The next implementation after this design should add a narrow service-role RPC that:

```text
paddle_event_processing row
+ billing_customer_links row
+ pure planner result
-> one idempotent billing_subscriptions update
```

Core rule:

```text
Verified event recorded first. Processing recorded second. Customer attribution linked third. Entitlement update last.
```

---

## Current repo facts

### Event inbox

`public.paddle_events` is service-role only, RLS-enabled, and idempotent by unique `event_id`.

The webhook still verifies the raw body before parsing JSON, records/replays the event, and does not grant access directly from browser state.

### Processing table

`public.paddle_event_processing` is service-role only and stores one row per recorded Paddle event.

Relevant fields for the updater:

```text
id
paddle_event_id
event_id
event_type
environment
status
reason
candidate_plan_id
candidate_status
provider_customer_id
provider_subscription_id
provider_price_id
current_period_end
cancel_at_period_end
is_founder_candidate
processed_at
```

Only rows with `status = 'processed'` are eligible for entitlement planning.

### Customer link table

`public.billing_customer_links` is service-role only and links one Verdant `user_id` to Paddle identifiers.

Relevant fields for the updater:

```text
user_id
provider
provider_customer_id
provider_subscription_id
link_status
confidence
```

Only rows with `provider = 'paddle'`, `link_status = 'linked'`, and `confidence = 'verified'` are eligible.

### Pure planner

`planBillingEntitlementUpdate(processing, link)` already defines the safe recurring-plan decision boundary.

It currently supports:

```text
pro_monthly
pro_annual
```

It intentionally blocks:

```text
founder_lifetime
ignored / blocked / failed processing rows
missing or mismatched customer identifiers
missing or mismatched subscription identifiers
unverified links
non-linked links
non-Paddle links
unknown candidate status
```

### Entitlement target

`public.billing_subscriptions` remains the entitlement source of truth.

The future updater may write only this table and only through the reviewed server-side RPC.

---

## Design goals

1. Write entitlement state only after verified processing + verified customer attribution.
2. Keep the browser non-authoritative.
3. Keep all writes service-role/server-side.
4. Use the existing pure planner as the final pre-write decision gate.
5. Make replay idempotent.
6. Make duplicate webhook delivery safe.
7. Make partial failures retryable when safe.
8. Preserve downgrade behavior for `past_due`, `paused`, `canceled`, and `expired`.
9. Keep Founder Lifetime blocked until a separate allocator slice.
10. Keep operator visibility sanitized.

---

## Non-goals

Do not include these in the first implementation slice:

- Founder Lifetime allocation
- live Paddle mode
- client checkout success entitlement changes
- URL-param entitlement grants
- local/session storage entitlement state
- broad UI paywall work
- checkout page rewrites
- new billing provider support
- schema/RLS expansion outside the updater RPC needs
- AI prompt/provider changes
- sensor ingest changes
- alert changes
- Action Queue changes
- automation
- device control

---

## Proposed RPC

Recommended RPC name:

```sql
public.apply_paddle_entitlement_update(p_processing_id uuid)
```

Recommended properties:

```sql
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
```

Recommended grants:

```sql
REVOKE ALL ON FUNCTION public.apply_paddle_entitlement_update(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_paddle_entitlement_update(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.apply_paddle_entitlement_update(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paddle_entitlement_update(uuid) TO service_role;
```

No authenticated/anon execute grant. This RPC is for trusted server execution only.

---

## Rows read

The RPC should read exactly:

1. One `public.paddle_event_processing` row by `id = p_processing_id`.
2. The related `public.paddle_events` row by `paddle_event_id`, only to verify the event is present and `signature_verified = true`.
3. One matching `public.billing_customer_links` row where:

```text
provider = 'paddle'
provider_customer_id = processing.provider_customer_id
provider_subscription_id = processing.provider_subscription_id
link_status = 'linked'
confidence = 'verified'
```

4. Existing `public.billing_subscriptions` row for the resolved `user_id`, if present.

The RPC should not read grow, plant, tent, sensor, alert, Action Queue, AI Doctor, diary, photo, or storage tables.

---

## Row written

The RPC may write exactly one row in:

```text
public.billing_subscriptions
```

It may insert or update by:

```text
user_id
```

The proposed recurring payload shape mirrors the pure planner output:

```text
user_id
plan_id
status
provider = 'paddle'
provider_customer_id
provider_subscription_id
current_period_end
cancel_at_period_end
founder_number = null
```

The RPC must not write:

```text
public.paddle_events
public.billing_customer_links
grow/plant/tent tables
sensor tables
alerts
action_queue
AI Doctor tables
storage objects
```

Processing/audit write-back is intentionally deferred unless a separate audit-state column/table is explicitly added in a later PR.

---

## Transaction boundary

The RPC should run in one database transaction.

Recommended order:

1. Load and lock the processing row.
2. Verify related recorded event exists and `signature_verified = true`.
3. Reject if processing row is not eligible.
4. Load matching verified billing customer link.
5. Load and lock existing `billing_subscriptions` row for the linked user, if present.
6. Reconstruct the same decision enforced by `planBillingEntitlementUpdate()` in SQL or a reviewed server helper.
7. Insert/update `billing_subscriptions`.
8. Return a sanitized result object.

Locking recommendation:

```sql
SELECT ...
FROM public.paddle_event_processing
WHERE id = p_processing_id
FOR UPDATE;
```

For existing entitlement row:

```sql
SELECT ...
FROM public.billing_subscriptions
WHERE user_id = v_user_id
FOR UPDATE;
```

This avoids two concurrent replays applying conflicting state for the same user.

---

## Idempotency rules

The updater must be safe to call repeatedly with the same processing row.

### Same event, same payload

If the current `billing_subscriptions` row already equals the planned payload, return:

```json
{ "ok": true, "status": "noop", "reason": "already_applied" }
```

### Same event, harmless update

If the existing row has the same `user_id`, `provider`, `provider_customer_id`, and `provider_subscription_id`, but period/status fields changed, update the row and return:

```json
{ "ok": true, "status": "updated" }
```

### Existing row for different provider

If the user already has a non-Paddle entitlement row, the first implementation should fail closed unless a migration/precedence policy has been reviewed.

Return:

```json
{ "ok": false, "status": "blocked", "reason": "existing_non_paddle_subscription" }
```

### Existing row with conflicting provider customer/subscription

If the existing row belongs to the same user but has different Paddle customer/subscription identifiers, fail closed.

Return:

```json
{ "ok": false, "status": "blocked", "reason": "existing_provider_identifier_conflict" }
```

Do not silently reassign provider identifiers in the first updater.

---

## Eligibility checks

The RPC must block unless all are true:

```text
paddle_events.signature_verified = true
paddle_event_processing.environment = 'sandbox' while sandbox-only
paddle_event_processing.status = 'processed'
candidate_plan_id in ('pro_monthly', 'pro_annual')
candidate_status in ('active', 'past_due', 'canceled', 'paused', 'expired')
provider_customer_id is present
provider_subscription_id is present
is_founder_candidate = false
matching billing_customer_links row exists
link_status = 'linked'
confidence = 'verified'
link provider = 'paddle'
link customer/subscription IDs match processing customer/subscription IDs
```

The SQL implementation should mirror the TypeScript planner reasons wherever practical.

---

## Planned result states

The RPC should return sanitized JSON only.

Recommended result shape:

```json
{
  "ok": true,
  "status": "created | updated | noop | blocked | failed",
  "reason": "safe_reason_code_or_null",
  "processing_id": "uuid",
  "user_id": "uuid",
  "plan_id": "pro_monthly | pro_annual | null",
  "subscription_status": "active | past_due | canceled | paused | expired | null"
}
```

Do not return raw provider customer IDs, subscription IDs, price IDs, payload JSON, event payload details, tokens, or secrets.

---

## Failure states

| Failure | Result | Retry? | Write? |
| --- | --- | --- | --- |
| Processing row missing | `not_found` | no | no |
| Related event missing | `event_missing` | maybe after repair | no |
| Signature not verified | `event_not_verified` | no | no |
| Wrong environment | `environment_not_allowed` | no | no |
| Processing not processed | `processing_not_processed` | no | no |
| Unknown plan | `unknown_plan` | no | no |
| Founder candidate | `founder_allocation_deferred` | no, separate slice | no |
| Unknown candidate status | `unknown_candidate_status` | no | no |
| Missing customer ID | `missing_provider_customer_id` | no | no |
| Missing subscription ID | `missing_provider_subscription_id` | no | no |
| Missing verified link | `missing_verified_customer_link` | yes after link repair | no |
| Existing provider conflict | `existing_provider_identifier_conflict` | operator review | no |
| Existing non-Paddle row | `existing_non_paddle_subscription` | operator review | no |
| Database exception | `update_failed` | yes | no/transaction rollback |

---

## Out-of-order event handling

The first recurring updater should be conservative.

Rules:

1. Use `processed_at` and provider period fields to avoid older events overwriting newer stored period data.
2. If incoming `current_period_end` is older than the existing row and the status is less severe, return `noop` or `blocked` with `stale_processing_row`.
3. Allow explicit downgrade statuses (`past_due`, `paused`, `canceled`, `expired`) to update state even if period end is unchanged.
4. Do not upgrade from degraded state to `active` unless the processing row is `processed`, linked, verified, and matches the same provider subscription.
5. Founder rows must not be overwritten by recurring subscription events in this first updater.

Recommended additional block reason:

```text
founder_row_not_overwritten
```

---

## Operator audit expectations

Existing operator views should remain read-only.

After the implementation slice, operators should be able to answer:

```text
Which processing rows are eligible?
Which links exist?
Which entitlement updates were applied/nooped/blocked?
Why was a row blocked?
```

But operator views must still hide raw provider identifiers and payloads.

If the first RPC does not add a durable entitlement-update audit table, it should at least return safe result JSON to the server caller. A later visibility slice can add a service-role-only table such as:

```text
public.billing_entitlement_update_audit
```

Recommended fields for that later table:

```text
id
processing_id
user_id
status
reason
candidate_plan_id
candidate_status
created_at
```

No raw provider IDs required in operator UI.

---

## Rollback behavior

Because this is the first real entitlement writer, rollback must be simple.

Implementation PR should include a migration rollback plan:

1. Disable webhook caller path first, if wired.
2. Revoke service-role execute grant from the updater RPC if needed.
3. Drop the updater RPC only after confirming no server code still calls it.
4. Do not delete `billing_subscriptions` rows automatically in rollback.
5. If a bad entitlement write occurred, repair with a targeted manual/admin migration reviewed separately.

Recommended emergency SQL posture:

```sql
REVOKE EXECUTE ON FUNCTION public.apply_paddle_entitlement_update(uuid) FROM service_role;
```

Only use after confirming the function signature.

---

## Validation requirements for implementation PR

The future implementation PR should add tests for:

1. Processed Pro Monthly creates a billing row.
2. Processed Pro Annual creates a billing row.
3. Replaying the same processing row is a no-op.
4. `past_due`, `paused`, `canceled`, and `expired` statuses update/degrade.
5. Missing link blocks.
6. Unverified link blocks.
7. Customer mismatch blocks.
8. Subscription mismatch blocks.
9. Founder candidate blocks.
10. Existing provider conflict blocks.
11. Existing Founder row is not overwritten.
12. Client roles cannot execute the RPC.
13. No grow-room/device-control tables are touched.

Suggested local validation commands for this docs-only slice:

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Suggested future implementation validation:

```powershell
npm.cmd run typecheck
npx.cmd vitest run src/test/billing-entitlement-update-planner-rules.test.ts --reporter=verbose
npx.cmd vitest run src/test/paddle-readiness.test.tsx --reporter=verbose
npm.cmd run build
```

If a Supabase SQL test harness exists by then, include RPC privilege and transaction tests.

---

## Safety verdict

Safe. This document designs a future entitlement updater RPC but does not implement it.

No schema changes, no RPC creation, no RLS changes, no Edge Function changes, no webhook wiring, no checkout behavior changes, no `billing_subscriptions` writes, no entitlement grants, no AI behavior, no sensor ingest, no Action Queue behavior, no alerts, no automation, and no device control.
