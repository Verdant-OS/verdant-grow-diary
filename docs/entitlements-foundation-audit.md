# Entitlements Foundation Audit

**Status:** Audit-only  
**Scope:** Level Two entitlement foundation, paid-launch readiness, and remaining blockers.  
**Date:** 2026-06-20  

This audit is intentionally documentation-only. It does not add schema, RLS, Edge Functions, checkout, webhook processing, UI gating, AI behavior, sensor ingest, Action Queue behavior, automation, or device control.

---

## Summary

Verdant's entitlement foundation is further along than the original Level Two plan assumed.

The repo already contains:

- `public.billing_subscriptions` as the entitlement source-of-truth table.
- SELECT-own RLS for authenticated users and service-role-only writes.
- Pure TypeScript entitlement types, catalog, free fallback capabilities, and resolver.
- A presentation-only `useMyEntitlements()` hook.
- AI credit ledger and spend/refund SQL functions.
- Server-side entitlement gates for Environment Summary Report and premium exports.
- A server-gate scaffold for future premium live-sensor surfaces.
- Paddle sandbox-only client and webhook scaffolding.

The remaining work is not “build the foundation from zero.” The remaining work is to harden the pieces that already exist, align pricing/docs, and close live-payment entitlement activation safely.

---

## Current repo findings

### Entitlement source of truth exists

`public.billing_subscriptions` exists in a Supabase migration.

Key shape:

- `user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE`
- `plan_id` constrained to `free`, `pro_monthly`, `pro_annual`, `founder_lifetime`
- `status` constrained to `active`, `past_due`, `canceled`, `paused`, `expired`
- nullable billing provider fields
- `founder_number` constrained to `1..75` when present
- partial unique founder-number index
- partial unique provider-subscription index

Security posture:

- Authenticated users get `SELECT` only.
- `service_role` gets full access.
- RLS policy allows users to read only their own row.
- There are no client insert/update/delete policies.
- Absence of row is documented as Free.

Important naming note: the table is `billing_subscriptions`, not `subscriptions`. Treat `billing_subscriptions` as the current canonical table unless a future migration intentionally renames it.

### Pure resolver and catalog exist

The entitlement library exists under `src/lib/entitlements/*`.

Key files:

- `types.ts`
- `capabilities.ts`
- `planCatalog.ts`
- `resolveEntitlements.ts`
- `index.ts`

The resolver correctly documents and handles:

- `null` row -> Free capabilities
- active row with no elapsed period -> plan capabilities
- expired/canceled/past_due/paused/elapsed period -> Free capabilities, inactive
- unknown `plan_id` -> Free fallback
- unknown `status` -> Free fallback
- malformed or elapsed `current_period_end` -> expired/fallback path

The catalog pins Founder Lifetime to Pro-equivalent capabilities with `aiMonthlyCredits: 100`; it is not unlimited AI.

### Client read hook exists and is correctly labeled non-authoritative

`src/hooks/useMyEntitlements.ts` reads `billing_subscriptions` for the signed-in user and resolves capabilities for UX.

The hook explicitly states:

- It is presentation-only.
- It is never authoritative.
- Paid gates must re-check server-side.
- Auth missing, null row, or lookup error falls back to Free capabilities.

This is the right posture.

### AI credit ledger and SQL enforcement exist

`public.ai_credit_spends` exists as an append-only ledger with:

- spend/refund rows
- idempotency keys
- per-user/period indexes
- authenticated SELECT-own RLS
- service-role full access
- no client write policy

`public.ai_credit_allowance(plan_id)` mirrors the plan catalog for AI credits.

`public.ai_credit_spend(...)` is a SECURITY DEFINER RPC that:

- requires authenticated user context
- validates feature/model tier/idempotency key
- serializes per-user with advisory lock
- checks grow ownership for Free per-grow usage
- writes an append-only spend row when allowed
- denies when the relevant limit is reached

`public.ai_credit_refund(...)` appends negative refund rows and is idempotent.

### AI Doctor review uses server-side credit spend/refund

`supabase/functions/ai-doctor-review/index.ts` calls `ai_credit_spend` before the upstream model request and `ai_credit_refund` on upstream failures or invalid responses.

The function documents hard constraints:

- no writes beyond credit ledger spend/refund
- no `ai_doctor_sessions`, alerts, Action Queue, or sensor writes
- no equipment/device control
- server-side model tier/weight
- no raw model text returned

### Environment Summary Report is server-gated

The Environment Summary Report page uses `useEnvironmentSummaryReportServerGate()`, which calls the `environment-summary-report-entitlement` edge function.

The edge function:

- verifies JWT with `auth.getUser()`
- reads `billing_subscriptions` using the caller JWT and RLS
- runs `resolveEntitlements()` server-side
- allows only when `capabilities.advancedExports === true`
- fails closed on lookup errors
- never uses service role
- performs no writes, sensor ingest, automation, device control, or AI calls

### Premium exports have server-side preflight

`usePremiumExportServerGate()` and `premium-export-entitlement` exist.

The server gate:

- verifies JWT
- validates feature against an allow-list
- validates optional scope IDs and date ranges
- reads `billing_subscriptions` using RLS
- runs `resolveEntitlements()` server-side
- allows only when `capabilities.advancedExports === true`
- performs optional ownership probes using RLS
- returns no export bytes
- uses no service role

Current allow-listed premium export features:

- `ai_doctor_report`
- `ai_doctor_evidence_csv`
- `ai_doctor_report_package`

### Live sensor entitlement gate scaffold exists

`live-sensor-entitlement` exists as a future server-side preflight for premium live-sensor surfaces.

Important current state:

- It is a scaffold for future premium live-sensor widgets.
- Current live sensor displays are documented as not premium-gated.
- The function verifies JWT, reads `billing_subscriptions` through RLS, runs `resolveEntitlements()`, checks `capabilities.liveSensors`, and ownership-probes optional scope IDs.
- It returns no telemetry, raw payloads, device identifiers, bridge tokens, or sensor bytes.

### Paddle sandbox-only scaffolding exists

Paddle is configured as sandbox/test mode only.

Current billing posture:

- Client config refuses `live` / `production` environments.
- Billing page states no live charges and no entitlement grant from the client.
- Paddle webhook verifies raw body signature, requires sandbox environment, records events idempotently in `paddle_events`, and intentionally does not change entitlements.

This is safe for sandbox testing, but not enough for live paid launch.

---

## Existing pricing / plan copy findings

### Plan capability alignment

Core plan capability intent is consistent:

| Plan | Current intended capability |
| --- | --- |
| Free | 1 active grow, 3 AI credits per grow, manual/csv sensor basics, 90-day sensor history cap |
| Pro Monthly | unlimited grows, 100 AI credits/month, live sensor capability flag, advanced exports, multi-tent, priority support |
| Pro Annual | same capabilities as Pro Monthly |
| Founder Lifetime | Pro-equivalent, 100 AI credits/month, first 75 founder slots |

### Pricing inconsistency found

There is a mismatch that should be fixed before paid launch:

- `docs/billing.md` lists Pro Annual as `$115 / year`.
- `src/pages/BillingPlaceholder.tsx` lists Pro Annual as `$115 / year`.
- `src/constants/pricing.ts` defines `PRICING.pro.annualPrice` as `99`.
- `Pricing.tsx` imports `PRO_ANNUAL_PRICE_USD` from `src/constants/pricing.ts`, so the public pricing page can show `$99/year` while billing/docs say `$115/year`.

Recommendation: choose one annual price and update constants, billing placeholder, docs, and tests together.

### Founder copy risk

Founder copy says:

- pay once / lifetime Pro
- 100 AI Doctor credits per month
- “Overage applies”

But credit-pack/overage purchase logic is not implemented. Keep the 100/month cap, but clarify overage copy until credit packs exist.

---

## Existing auth and user ownership patterns

Patterns are good overall:

- Client hook uses current authenticated user and RLS read-own behavior.
- Server entitlement gates use caller JWT, not client-supplied `user_id`.
- Premium export and live sensor scaffolds ownership-probe scoped IDs with RLS.
- AI credit SQL validates grow ownership for Free per-grow scope.
- Paddle webhook does not trust client user IDs.

Recommendation: keep every future entitlement gate server-side and user-JWT scoped unless it is a trusted webhook/admin operation.

---

## Existing Supabase migration and RLS conventions

Current conventions are mostly consistent:

- Dedicated tables have explicit grants.
- Authenticated users usually get SELECT-own for their rows.
- Client write policies are avoided for sensitive billing/credit state.
- Service-role writes are reserved for future webhook/admin flows.
- Security-sensitive operations use SQL functions or Edge Functions.

Recommendation: any future entitlement update path should be a narrowly reviewed server-side path that consumes verified Paddle events and writes `billing_subscriptions` with service role.

---

## Existing Edge Function / service-role conventions

### Good patterns

- `environment-summary-report-entitlement`, `premium-export-entitlement`, and `live-sensor-entitlement` do not use service role.
- These gates verify JWT and rely on RLS for read ownership.
- `paddle-webhook` uses service role only in a trusted webhook context after signature verification.
- AI Doctor review uses authenticated RPCs for spend/refund instead of client-side counters.

### Boundary to preserve

Do not introduce service role into user-triggered entitlement preflight functions unless there is a specific reason and a separate security review.

---

## Existing AI / sensor / export surfaces that need entitlement attention

### AI Doctor and AI Coach

AI credit enforcement is present, but see the critical risk below about SQL using `plan_id` directly.

### Environment Summary Report

Server-gated through `advancedExports`. Good.

### Premium AI Doctor exports

Server preflight exists. Browser still generates bytes from already-visible view-model data after server approval. This is acceptable for now, but should remain documented.

### Live sensors

Current live sensor surfaces are free/not gated. If the product decides live sensor features are Pro-only, each premium widget must use the server live-sensor gate before rendering children. Do not rely on `useMyEntitlements()` for access control.

---

## Current risks

### P0 before live paid launch — AI credit SQL appears to ignore billing status and period expiry

The TypeScript resolver correctly handles `status` and `current_period_end`.

However, `public.ai_credit_spend(...)` currently appears to select only `plan_id` from `billing_subscriptions` and then calls `ai_credit_allowance(plan_id)`.

Risk: a row with `plan_id = 'pro_monthly'` but `status = 'canceled'`, `status = 'past_due'`, or an elapsed `current_period_end` could still receive Pro monthly AI credits in the SQL path unless another migration/function layer corrects this.

Recommendation: before live payments, harden SQL credit enforcement to resolve effective entitlement server-side using `plan_id`, `status`, and `current_period_end`, matching `resolveEntitlements()` semantics. Add SQL/RLS harness tests for:

- active Pro with future period => Pro allowance
- active Pro with elapsed period => Free fallback/deny according to plan
- canceled Pro => Free fallback
- past_due Pro => Free fallback
- paused Pro => Free fallback
- expired Pro => Free fallback
- founder_lifetime active with null period => 100/month
- unknown/impossible plan/status defensive fail-closed where applicable

### P0 before live paid launch — Paddle webhook records events but does not update entitlements

This is intentional and safe in sandbox mode.

Live paid launch still needs a reviewed server-side entitlement updater that consumes verified Paddle events and writes `billing_subscriptions`.

Do not grant Pro from:

- client checkout success
- URL params
- local/session storage
- user-controlled metadata

### P1 before paid launch — pricing annual amount mismatch

Resolve `$99` vs `$115` before any public paid CTA is considered final.

### P1 before paid launch — founder slot allocation not implemented

The DB constrains founder numbers to 1..75 and has a partial unique index, but allocation policy is not implemented.

Need a service-side allocator tied to verified payment events before selling Founder Lifetime.

### P1 before paid launch — cancellation/refund/chargeback handling missing

Docs already list this as required. Keep paid launch blocked until cancellation, refund, chargeback, past-due, and subscription-update events update `billing_subscriptions` safely.

### P2 — live sensor product policy unclear

Entitlement catalog says `liveSensors: true` for Pro/Founder and false for Free, but current live sensor displays are documented as free/not gated.

That can be fine, but it must be a product decision:

- Either keep current live sensor views free and reserve `liveSensors` for future premium real-time widgets.
- Or gate new/selected live sensor surfaces through `PremiumLiveSensorGate` and server preflight.

### P2 — public pricing copy promises “overage applies” before overage exists

Either implement credit packs/overage later or revise the copy now to avoid implying a currently available purchase path.

---

## Recommended foundation design from here

Do not rebuild the foundation. Preserve the current architecture and harden it.

Recommended canonical model:

1. `billing_subscriptions` remains the entitlement source-of-truth table.
2. `resolveEntitlements()` remains the client/server TypeScript semantic reference.
3. `useMyEntitlements()` remains presentation-only.
4. User-facing premium data/features are gated by Edge Functions that re-resolve entitlement server-side.
5. AI credit spend/refund remains append-only and idempotent.
6. Paddle webhook remains signature-verified and sandbox-only until live readiness is explicit.
7. Verified billing events, not client checkout success, update `billing_subscriptions` in a future service-role path.

---

## Proposed next implementation slices

### Slice L2-H1 — harden AI credit SQL entitlement resolution

Goal: make `ai_credit_spend` honor effective plan state, not just raw `plan_id`.

Scope:

- Add/modify SQL helper to resolve effective credit plan from `billing_subscriptions` using `plan_id`, `status`, and `current_period_end`.
- Mirror `resolveEntitlements()` degradation semantics.
- Add SQL harness/static tests for expired/canceled/past_due/paused cases.
- Preserve append-only ledger and idempotency.

Avoid:

- checkout
- webhook entitlement updates
- UI gating changes
- device/sensor changes

### Slice L2-H2 — pricing copy alignment

Goal: remove annual pricing mismatch and clarify Founder overage copy.

Scope:

- Choose canonical Pro Annual price.
- Update `src/constants/pricing.ts`, `src/pages/BillingPlaceholder.tsx`, `docs/billing.md`, and tests.
- Clarify “Overage applies” if credit packs are not live.

### Slice L2-H3 — Paddle verified-event entitlement updater design doc

Goal: design the service-role updater before implementation.

Scope:

- Map Paddle event types to billing state transitions.
- Define how users are linked to Paddle customers/subscriptions.
- Define idempotency and replay rules.
- Define founder slot allocation rules.
- Define cancellation/refund/chargeback behavior.

Docs-only first.

### Slice L2-H4 — verified-event entitlement updater implementation

Only after H3 is reviewed.

Scope:

- Service-role update path from verified `paddle_events` to `billing_subscriptions`.
- No client entitlement grant.
- RLS unchanged.
- Tests for idempotency, downgrade, refund/cancel, founder slot collision.

---

## Deferred slices

Keep deferred until the above blockers are resolved:

- Live Paddle mode.
- Client checkout success handling beyond safe sandbox intent.
- Billing portal / manage subscription.
- Credit-pack / overage purchasing.
- Founder slot public claiming flow.
- New premium live-sensor widgets.
- Broad UI paywalls beyond server-gated premium surfaces.
- Any automation/device-control entitlement.

---

## Files intentionally not changed

This audit did not change:

- migrations
- RLS policies
- Edge Functions
- React UI
- entitlement resolver logic
- pricing constants
- Paddle config
- webhook behavior
- tests

---

## Validation

Docs-only recommended validation:

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Optional entitlement-focused validation to run before the next implementation slice:

```powershell
npx.cmd vitest run src/test/entitlements-resolver.test.ts src/test/entitlements-purity.test.ts src/test/entitlements-rls.test.ts src/test/ai-credit-allowance-parity.test.ts src/test/ai-doctor-founder-entitlement-bypass.test.ts src/test/premium-export-server-gate.test.tsx src/test/environment-summary-report-server-gate.test.tsx src/test/live-sensor-server-gate.test.ts --reporter=verbose
```

---

## Safety verdict

Safe. This is documentation-only.

The audit confirms Verdant should not move to live paid launch yet. The strongest blocker is the apparent mismatch between the pure resolver semantics and the SQL AI-credit spend path. Fix that before live payments or any public paid claim that depends on subscription status.

No device control, blind automation, fake live data, AI overconfidence, Action Queue bypass, or sensor-ingest changes are introduced.
