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
- **Status:** SERVER-VALIDATED (paid-launch blocker fixed for this surface).
- Path: page mounts → `useEnvironmentSummaryReportServerGate` →
  `supabase.functions.invoke('environment-summary-report-entitlement')` →
  edge function verifies JWT (`auth.getUser`) → reads
  `public.billing_subscriptions` (RLS select-own; no service_role) →
  runs the pure `resolveEntitlements()` server-side → returns 200 only when
  `capabilities.advancedExports === true`. All other outcomes return 403
  (`upgrade_required`) or fail closed.
- Client-side `useMyEntitlements` remains presentation-only. Tampered client
  state cannot unlock the report — the page hides report content unless the
  server response is `ok: true`.
- Failure mode on denial: the page renders the upgrade/paywall state with
  copy "Environment Summary Report is a Pro feature." No crash, no generic
  error page, no client-side bypass path.
- Client-side entitlement state is not authoritative.

### Premium CSV / report exporters (`src/lib/*Export*`, AI Doctor PDF/CSV/Package)
- **Status:** SERVER-GATED PREFLIGHT (paid-launch blocker fixed for this surface).
- Path: download button click → `checkPremiumExportEntitlement(feature, scope?)`
  (alias `requirePremiumExportAccess`) →
  `supabase.functions.invoke('premium-export-entitlement', { body: { feature, ... } })` →
  edge function verifies JWT (`auth.getUser`), strictly validates the body
  (feature allow-list, UUID format for `grow_id`/`tent_id`/`plant_id`, ISO
  dates + `start <= end` + bounded `MAX_RANGE_DAYS`), reads
  `public.billing_subscriptions` (RLS select-own; no service_role), runs the
  pure `resolveEntitlements()` server-side, and only returns 200 when
  `capabilities.advancedExports === true`. When IDs are supplied the
  function also runs an RLS-scoped ownership probe (`scope_denied` on
  cross-user / missing rows). Other outcomes return 400 (`invalid_request`),
  401 (`not_authenticated`), or 403 (`upgrade_required` / `scope_denied` /
  `entitlement_lookup_failed`). Fail-closed.
- Premium exports currently confirmed in scope:
  `ai_doctor_report` (AI Doctor PDF), `ai_doctor_evidence_csv`,
  `ai_doctor_report_package`. **Audit found no other premium user-facing
  export buttons in the app today.** Free/operator/debug downloads (e.g.
  sensor CSV preview / ingest audit / one-tent-proof / lineage repair) are
  intentionally NOT routed through this gate.
- Client integration: `usePremiumExportServerGate()` returns a typed result
  with `state` ∈ {`allowed`, `denied`, `invalid_request`, `network_error`}.
  Download buttons in `AiDoctorDiagnosisPanel` disable while the preflight
  is in flight (`aria-busy`), reject duplicate clicks, and never invoke the
  builder unless the server returns `ok: true` for the matching feature.
- Failure mode on denial: the panel renders the inline paywall copy
  ("Premium exports are a Pro feature. Upgrade required to export this
  report.") via the existing `package-message` slot. No crash, no generic
  error, no client-side bypass — the download functions are never invoked
  when the gate denies.
- **Remaining residual risk:** the actual PDF/CSV bytes are still generated
  in the browser from already-redacted view-model inputs (the same inputs
  used for on-screen rendering). A determined attacker who has somehow
  evaded auth could not benefit from the preflight, but also could not
  read any premium-only data they did not already see on screen.
- Client-side entitlement state is not authoritative.

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
- Live sensor surfaces still have no server-side plan check.

These remain individually paid-launch-blocked.
