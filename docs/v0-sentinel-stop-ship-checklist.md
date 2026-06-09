# V0 Sentinel Stop-Ship Checklist

This checklist defines the **stop-ship conditions** for Verdant V0. If any
condition below is red, do not publish, do not merge to `main`, and do not
mark the release candidate green. Fix the underlying signal first, then
re-run the relevant scan.

This document is the authoritative reference for the daily Sentinel review.
It is intentionally short, blunt, and binary.

---

## Hard stop-ship rules

A red signal on any of these means **stop ship**:

1. **Auth loading smoke is red.**
   - Workflow: `.github/workflows/auth-loading-smoke.yml`
   - Covers mocked, non-destructive Playwright auth flow
     (`e2e/auth-loading.spec.ts`, `e2e/auth-redirect-safety.spec.ts`,
     `e2e/auth-desktop.spec.ts`, `e2e/auth-route-protection.spec.ts`,
     `e2e/auth-route-protection-mobile.spec.ts`).
   - Stop ship if the mocked auth loading path fails, hangs, or
     bypasses `RequireAuth`.

2. **One-Tent Loop smoke is red.**
   - Command: `bun run test:one-tent-loop-smoke`
   - Workflow: `.github/workflows/one-tent-loop-smoke-test.yml`
   - Protects the V0 spine:
     `Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot →
     AI Doctor → Alert → Approval-Required Action Queue`.

3. **EcoWitt-only safety scan is red.**
   - Command: `node scripts/assert-ecowitt-only-sensor-direction.mjs`
   - Workflow: `.github/workflows/ecowitt-only-safety-scan.yml`
   - Stop ship if any retired sensor brand (e.g. SwitchBot) re-enters
     the codebase, or if EcoWitt evidence loses its source label.

4. **Any "fake live" claim.**
   - Demo, manual, CSV, stale, or invalid telemetry described or
     rendered as `live`.
   - Includes copy, badges, alert payloads, AI Doctor output, snapshot
     cards, and exports.

5. **Invalid or stale telemetry rendered as healthy.**
   - Unknown / stuck / out-of-range / old readings must never appear
     as a healthy environment state.
   - Allowed source labels: `live | manual | csv | demo | stale | invalid`.

6. **Automatic Action Queue creation or device action.**
   - Action Queue must remain **approval-required**.
   - No alert, AI Doctor session, or sensor event may create an Action
     Queue row, dispatch a command, or change device state without an
     explicit operator approval click.

7. **`service_role` key or bridge token reachable from the frontend.**
   - Includes `src/**`, `public/**`, built bundles, and any client-side
     env value. Bridge tokens belong only in edge functions and signed
     server-to-server flows.

8. **Sensor evidence missing a source label.**
   - Every reading surfaced to the operator must carry one of the
     allowed source labels and a `captured_at` value.

---

## Sentinel triage order

When multiple signals are red, fix in this order:

1. Auth loading smoke (Gate 1 — without auth nothing else is trusted).
2. EcoWitt-only safety scan (sensor truth integrity).
3. One-Tent Loop smoke (operating loop integrity).
4. Any sensor truth, Action Queue, or secret-exposure rule above.

Only after all of the above are green may chrome-polish slices land.

---

## Required local commands

```bash
# Auth loading (mocked, non-destructive)
bunx playwright test \
  e2e/auth-loading.spec.ts \
  e2e/auth-redirect-safety.spec.ts \
  e2e/auth-desktop.spec.ts \
  e2e/auth-route-protection.spec.ts \
  e2e/auth-route-protection-mobile.spec.ts \
  --project=chromium-mocked

# One-Tent Loop smoke
bun run test:one-tent-loop-smoke

# EcoWitt-only safety scan
node scripts/assert-ecowitt-only-sensor-direction.mjs

# Static safety scans (Action Queue, V0 guardrails)
bun run test:static-safety

# Full unit/component suite
bunx vitest run
```

If any of the above is red, this checklist is red.

---

## Related references

- `docs/checklists/one-tent-loop-smoke-test-checklist.md`
- `docs/sensor-truth-rules.md`
- `docs/action-queue-safety-rules.md`
- `docs/ecowitt-only-sensor-direction.md`
- `docs/safety/static-safety-scans.md`
