# Paid-Launch Entitlement Blocker Status

**Status:** Partial hardening. Per-surface readiness MUST be tracked
individually. A guard succeeding on one surface does NOT clear blocked
status for any other surface.

**Last audit:** 2026-06-19

---

## Audit foundation

- `useMyEntitlements` is presentation-only and explicitly documented as
  never-authoritative.
- `resolveEntitlements` is pure and fails closed for: null row, unknown
  plan_id, unknown status, expired, canceled, past_due, paused, and
  malformed `current_period_end`. (28 resolver/purity tests, green.)
- Generated Supabase types include `billing_subscriptions`; the previous
  `as never` cast in `useMyEntitlements` has been removed. RLS still
  enforces select-own.
- Server-side authoritative read of `billing_subscriptions` happens inside
  the `public.ai_credit_spend` SECURITY DEFINER function, which derives
  `plan_id` server-side from the table (never trusts client claims).

---

## Per-surface enforcement status

### AI Doctor review (`supabase/functions/ai-doctor-review`)
- **Status:** SERVER-VALIDATED.
- Path: edge function -> `ai_credit_spend` RPC -> reads
  `billing_subscriptions` server-side -> enforces per-grow / per-month caps.
- Founder bypass: **server-validated, not client-trustable.** The RPC
  pins `founder_lifetime` at 100 credits/month. Client cannot forge plan.
- Failure mode on denial: edge function returns structured denial; client
  surfaces `AiCreditLimitNotice` (no crash, no generic error page).

### AI Coach (`supabase/functions/ai-coach`)
- **Status:** SERVER-VALIDATED. Same `ai_credit_spend` enforcement path
  as AI Doctor. Refund-on-failure via `ai_credit_refund`.

### Environment Summary Report (`src/pages/EnvironmentSummaryReportPage.tsx`)
- **Status:** PAID-LAUNCH BLOCKED — CLIENT-GATED ONLY.
- Gate: `entitlement.capabilities.advancedExports === true` evaluated in
  the React render path. A tampered client can bypass this gate and read
  whatever the RLS layer allows (per-user sensor / environment rows).
- Mitigation today: RLS already restricts to own rows; the gate only
  protects the *premium aggregation/report UX*, not access to raw rows.
- Remaining risk: a client with `advancedExports=false` could still
  re-implement the report client-side from RLS-allowed rows.
- Required before paid launch: move report aggregation into an edge
  function that re-resolves entitlement via `billing_subscriptions` and
  returns 403 for non-premium plans.

### Premium CSV / report exporters (`src/lib/*Export*`)
- **Status:** PAID-LAUNCH BLOCKED — CLIENT-ONLY.
- All current export builders run in the browser. No server-side gate.
- Same risk class as Environment Summary Report.

### Live sensor surfaces (`capabilities.liveSensors`)
- **Status:** PAID-LAUNCH BLOCKED — CLIENT-GATED ONLY.
- No edge function currently gates live-sensor visibility on plan tier.

### Pricing / upgrade copy (`src/pages/Pricing.tsx`)
- **Status:** N/A. Public copy; no gating required.

---

## Founder-lifetime bypass — explicit status

- **Server side:** Pinned at 100 AI credits/month inside
  `public.ai_credit_allowance` and `public.ai_credit_spend`. NOT
  client-trustable; client cannot self-grant.
- **Client side (`src/lib/aiDoctorEntitlementRules.ts`):** Suppresses
  upsell COPY for misclassified denials. Never grants credits, never
  mutates server state. Safe.

---

## What this slice fixed
- Removed `as never` cast on `billing_subscriptions` client read.
- Authored this per-surface blocker doc.
- Added regression tests asserting the client-gated surfaces are
  documented as paid-launch blockers (so a future "looks done" PR cannot
  silently mark them shipped).

## What this slice did NOT fix
- Environment Summary Report still has no server-side guard.
- Premium CSV/report exporters still have no server-side guard.
- Live sensor surfaces still have no server-side plan check.

These remain individually paid-launch-blocked.
