# Paddle Verified-Event Entitlement Updater Design

**Status:** Design-only  
**Slice:** L2-H3  
**Date:** 2026-06-20  
**Implementation status:** Not implemented in this document

This document defines how Verdant should turn already-verified Paddle events into rows in `public.billing_subscriptions` in a later implementation slice.

This is intentionally docs-only. It does not change schema, RLS, Edge Functions, checkout behavior, webhook behavior, entitlement writes, AI behavior, sensor ingest, Action Queue behavior, alerts, automation, or device control.

---

## Summary

Verdant currently has the safe foundation:

- `public.paddle_events` stores signature-verified Paddle events with a unique `event_id`.
- The current `paddle-webhook` reads the raw request body, verifies the Paddle signature, requires sandbox mode, records the event idempotently, and intentionally does **not** update entitlements yet.
- `public.billing_subscriptions` is the current entitlement source of truth.
- Client-side checkout and URL state must never grant Pro or Founder access.

The next implementation slice should add a narrowly scoped server-side updater that consumes only verified rows from `public.paddle_events` and writes `public.billing_subscriptions` with service-role authority.

Core rule:

```text
Verified Paddle event recorded first. Entitlement update second. Client success never grants access.
```

---

## Current repo facts

### Existing event inbox

`public.paddle_events` currently has:

```sql
id uuid primary key default gen_random_uuid(),
event_id text not null unique,
event_type text not null,
environment text not null,
signature_verified boolean not null default false,
payload jsonb not null,
received_at timestamptz not null default now()
```

It grants access only to `service_role`, has RLS enabled, and has no anon/authenticated policies.

### Existing webhook posture

The current `paddle-webhook`:

1. Reads the raw request body before parsing JSON.
2. Verifies `Paddle-Signature` with `PADDLE_WEBHOOK_SECRET`.
3. Refuses non-sandbox environments while Verdant is sandbox-only.
4. Inserts into `public.paddle_events` idempotently by `event_id`.
5. Does not mutate `public.billing_subscriptions`.

That should remain true until this design is reviewed and implemented in a separate PR.

### Existing entitlement target

`public.billing_subscriptions` is the entitlement source of truth:

- `user_id` is unique.
- `plan_id` is one of `free`, `pro_monthly`, `pro_annual`, `founder_lifetime`.
- `status` is one of `active`, `past_due`, `canceled`, `paused`, `expired`.
- provider fields store Paddle identifiers.
- `founder_number` is unique when present and constrained to `1..75`.
- users can only SELECT their own row.
- client roles cannot write.

---

## Design goals

1. Grant paid access only from verified Paddle events already recorded in `public.paddle_events`.
2. Keep the browser non-authoritative.
3. Keep service-role writes isolated to a trusted server path.
4. Make event replay idempotent.
5. Make out-of-order events safe.
6. Preserve Founder Lifetime cap and slot uniqueness.
7. Fail closed when a Paddle event cannot be confidently mapped to a Verdant user or plan.
8. Keep `public.billing_subscriptions` as the source of truth.

---

## Non-goals

Do not include these in the implementation slice that follows this design:

- live Paddle mode
- client checkout success entitlement changes
- URL-param entitlement grants
- local/session storage entitlement state
- broad UI paywall work
- new live-sensor gates
- AI prompt/provider changes
- Action Queue changes
- alert changes
- automation
- device control

---

## Proposed architecture

Use the existing webhook as an inbox recorder. Then add one explicit updater boundary.

```text
Paddle -> paddle-webhook -> public.paddle_events -> entitlement updater -> public.billing_subscriptions
```

Recommended implementation shape:

1. Keep `paddle-webhook` responsible for verification and event recording.
2. Add a small pure parser module for extracting a normalized billing event from a Paddle payload.
3. Add a server-side updater function that accepts a recorded `paddle_events.id` or `event_id`.
4. The updater re-reads the event row from `public.paddle_events` using service role.
5. The updater refuses rows where `signature_verified !== true`.
6. The updater maps the event to a user, plan, status, period, provider IDs, and optional founder slot.
7. The updater upserts `public.billing_subscriptions` by `user_id` or provider subscription ID.
8. The updater records safe processing metadata so replay is idempotent.

---

## User linking design

A Paddle event must resolve to exactly one Verdant user before writing entitlement state.

Preferred linking order:

1. `provider_customer_id` already exists in `public.billing_subscriptions` for a user.
2. `provider_subscription_id` already exists in `public.billing_subscriptions` for a user.
3. A trusted checkout-created mapping table exists from a prior slice.
4. A verified Paddle event includes trusted customer email and it matches exactly one authenticated Verdant user email.

If none resolve to exactly one user, the updater must not write an entitlement row.

### Recommended future mapping table

If needed, add a later mapping table before live launch:

```sql
public.billing_customer_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('paddle')),
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_customer_id),
  unique (user_id, provider)
)
```

This design doc does not create the table. It only defines why the implementation may need it.

---

## Plan mapping design

Map Paddle price IDs to Verdant plan IDs server-side only.

Required env/config inputs for the updater:

| Verdant plan | Paddle price env/config | Notes |
| --- | --- | --- |
| `pro_monthly` | `PADDLE_PRICE_PRO_MONTHLY` | recurring monthly |
| `pro_annual` | `PADDLE_PRICE_PRO_ANNUAL` | recurring annual |
| `founder_lifetime` | `PADDLE_PRICE_FOUNDER_LIFETIME` | one-time or non-recurring Founder offer |

Do not trust plan labels sent by the browser. Do not trust URL slugs. Do not trust client metadata unless it was created by a trusted server path and can be reconciled with provider IDs.

Unknown Paddle price ID outcome:

```text
record event as unprocessed/unsupported; do not change billing_subscriptions
```

---

## Event handling matrix

Paddle Billing lifecycle docs identify `transaction.completed`, `subscription.created`, `subscription.updated`, and status-specific subscription events such as canceled, past_due, paused, and resumed as relevant lifecycle events.

| Paddle event | Intended updater behavior |
| --- | --- |
| `transaction.completed` | For initial successful purchase confirmation. Use to link customer/subscription/price IDs. For recurring products, wait for or reconcile with subscription event before granting recurring plan if subscription ID is missing. For Founder Lifetime, may activate if the event maps to the Founder price and user link is trusted. |
| `subscription.created` | Create/update `billing_subscriptions` with active recurring plan, provider customer/subscription IDs, and current period data. |
| `subscription.activated` | Set `status = 'active'` when plan and user link are known. |
| `subscription.updated` | Reconcile plan changes, renewal period changes, cancel-at-period-end, pause/resume changes, and subscription status. |
| `subscription.past_due` | Set `status = 'past_due'`; effective entitlements should degrade through resolver/SQL hardening. |
| `subscription.paused` | Set `status = 'paused'`; effective entitlements should degrade. |
| `subscription.resumed` | Set `status = 'active'` if provider state and period are valid. |
| `subscription.canceled` | Set `status = 'canceled'` or `expired` depending on provider period/end semantics. Preserve provider IDs. |
| `transaction.payment_failed` | Do not immediately grant access. If linked to a subscription and provider status indicates past due, move to `past_due`. |
| `transaction.canceled` | Do not grant access. If linked to an existing subscription and provider status warrants it, reconcile through subscription state. |
| `adjustment.created` / `adjustment.updated` | Design as future refund/credit-note input. Do not grant access. May downgrade or flag for review depending on provider payload. |

Implementation should prefer subscription state as the recurring entitlement source, with transaction events as payment confirmation and linkage evidence.

---

## Founder Lifetime design

Founder Lifetime must remain constrained to the first 75 buyers.

Rules:

1. Founder is activated only from a verified event mapped to the Founder price.
2. Founder gets `plan_id = 'founder_lifetime'`, `status = 'active'`, and `current_period_end = null`.
3. Founder AI credits remain capped at 100/month through existing entitlement catalog and SQL credit allowance.
4. `founder_number` must be allocated server-side only.
5. Allocation must happen in a transaction or RPC that locks allocation state.
6. If all 75 slots are taken, do not activate Founder automatically.
7. If slot collision occurs, fail closed and mark event for operator review.

Recommended allocation approach:

```sql
select n
from generate_series(1, 75) as n
where not exists (
  select 1 from public.billing_subscriptions s where s.founder_number = n
)
order by n
limit 1
for update;
```

If Postgres cannot lock the generated series directly, use a small `founder_slots` table in a later slice. Do not rely on a client-side count.

---

## Idempotency and replay

The existing `public.paddle_events.event_id` unique constraint prevents duplicate event rows.

The updater must also be idempotent because a recorded event may be processed more than once.

Recommended future columns or table:

```sql
public.paddle_event_processing (
  id uuid primary key default gen_random_uuid(),
  paddle_event_id uuid not null unique references public.paddle_events(id) on delete cascade,
  status text not null check (status in ('processed','ignored','blocked','failed')),
  reason text null,
  processed_at timestamptz not null default now()
)
```

Replay rules:

- If event already processed successfully, return success/no-op.
- If event was ignored as unsupported, return ignored/no-op.
- If event was blocked due to missing user link or unknown price, keep it blocked until an operator repair path exists.
- If event failed due to transient error, allow retry.

---

## Out-of-order event handling

Webhook delivery order is not guaranteed enough to trust blindly.

Updater should treat each event as a reconciliation signal, not as an absolute command.

Rules:

1. Prefer latest provider subscription state when available in the event payload.
2. Store provider subscription ID and customer ID as durable linkage.
3. Do not downgrade a Founder Lifetime user from a subscription cancellation event unless that event is explicitly tied to a different recurring provider subscription and the active plan is not Founder.
4. If a stale event has an older provider timestamp than the current stored state, ignore it or mark it for review.
5. If timestamps are missing, use conservative event-type precedence and fail closed for destructive changes.

Recommended future metadata:

- `provider_event_id`
- `provider_event_type`
- `provider_event_occurred_at`
- `last_provider_payload_hash`

This design doc does not add those columns.

---

## Status mapping

Map provider state to Verdant status conservatively:

| Provider condition | Verdant status |
| --- | --- |
| paid/active/current subscription | `active` |
| subscription past due | `past_due` |
| subscription paused | `paused` |
| canceled but period remains valid | `canceled` with `current_period_end` retained |
| canceled and access period ended | `expired` |
| refund/chargeback for one-time Founder | `canceled` or blocked for operator review until policy is finalized |
| unknown/ambiguous | no write; mark event blocked |

Effective access is still resolved by `resolveEntitlements()` and SQL credit hardening, not by UI copy.

---

## Failure modes

| Failure | Updater response |
| --- | --- |
| Event row not found | return not_found; no write |
| `signature_verified !== true` | blocked; no write |
| non-sandbox while still sandbox-only | blocked; no write |
| unknown event type | ignored; no write |
| unknown price ID | blocked; no write |
| no matching user | blocked; no write |
| multiple matching users | blocked; no write |
| founder slots exhausted | blocked; no write |
| database write error | failed; retryable |

---

## Security rules

Hard requirements for implementation:

1. Never grant access from client checkout success.
2. Never trust a client-provided `user_id`.
3. Never trust client-local storage/session storage.
4. Never trust URL query parameters for entitlement.
5. Never expose `service_role` to frontend code.
6. Never expose Paddle secrets to frontend code.
7. Never write grow, plant, tent, sensor, alert, Action Queue, or AI session rows from this updater.
8. Never change RLS to allow client billing writes.
9. Never classify unknown or failed billing state as paid/active.
10. Keep all writes limited to billing entitlement state and processing audit state.

---

## Suggested implementation slices after this doc

### L2-H4A — event parser and mapper tests

Pure TypeScript or Deno-compatible parser only.

Inputs:

- recorded `event_type`
- recorded `environment`
- recorded `payload`
- trusted server config for price IDs

Outputs:

- normalized event type
- provider customer ID
- provider subscription ID
- candidate plan ID
- candidate status
- current period end
- founder candidate flag
- block/ignore reason if unsupported

No database writes in this slice.

### L2-H4B — processing state table

Add processing metadata so replay and operator review are visible.

No entitlement mutation yet unless reviewed separately.

### L2-H4C — recurring subscription updater

Implement recurring plan updates for Pro Monthly and Pro Annual.

Must include tests for:

- create active subscription
- update period end
- cancel at period end
- past_due downgrade
- paused downgrade
- resumed reactivation
- out-of-order stale event ignored
- unknown price blocked
- duplicate event no-op

### L2-H4D — Founder Lifetime allocator

Implement Founder allocation only after recurring flow is stable.

Must include tests for:

- first slot allocation
- unique founder number
- slot 75 success
- slot 76 blocked
- duplicate event no-op
- refund/chargeback policy pending or implemented

---

## Validation for implementation PRs

Design-only validation for this PR:

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Future implementation validation should include:

```powershell
npx.cmd vitest run src/test/paddle-readiness.test.tsx --reporter=verbose
npx.cmd vitest run src/test/entitlements-resolver.test.ts src/test/entitlements-purity.test.ts --reporter=verbose
```

If a Supabase runtime harness is added, it should prove:

- anon/authenticated users cannot read or write `paddle_events` or processing rows
- only service-role processing can update `billing_subscriptions`
- client checkout success cannot update entitlement state
- duplicate Paddle events do not double-apply entitlement changes

---

## Safety verdict

Safe. This document designs a future server-side entitlement updater but does not implement it.

Live paid launch remains blocked until a reviewed implementation proves:

- verified events update `public.billing_subscriptions` safely
- user linking is unambiguous
- recurring cancellations and past-due states downgrade access
- Founder slot allocation is atomic
- client state cannot grant access
