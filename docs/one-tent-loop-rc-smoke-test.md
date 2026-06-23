# One-Tent Loop RC Smoke Test

**Date:** 2026-06-23
**Mode:** Read-only QA + docs-only
**Verdict:** PASS — ready to tag and demo

## Surfaces checked

- Dashboard / Grow entry
- Tent detail
- Plant detail
- Quick Log (`src/lib/quick-log/createQuickLogEvent.ts` — idempotent RPC, snapshot provenance preserved)
- Plant timeline (category sections, evidence indicators, readability + print summary)
- Sensors page (`src/pages/Sensors.tsx`)
- Sensors Operator Mode (`?operator=1`) — EcoWitt live-row proof + ingest-audit proof panels
- One-Tent Live Proof page (`src/pages/OneTentLiveProof.tsx`)
- One-Tent copy/print report (markdown sanitized; no UUIDs / ISO-second timestamps)
- AI Doctor readiness surface (cautious, missing-context disclosed)
- Alerts list
- Action Queue (approval-required throughout)

## Pass / fail table

| Surface | Result | Notes |
| --- | --- | --- |
| Quick Log save | PASS | Idempotent RPC; snapshot source/captured_at preserved |
| Plant timeline | PASS | Category/evidence/readability/print sections render |
| Sensors operator EcoWitt live-row proof | PASS | live/stale/invalid/limited/no-recent states intact |
| Sensors operator ingest-audit proof | PASS | blocked vs error copy now distinguished |
| One-Tent Live Proof checklist | PASS | needs-confirmation when state cannot be inferred |
| One-Tent sensor-proof section | PASS | present / live_only / audit_only / stale / invalid / blocked / missing |
| One-Tent copy/print report | PASS | static-safety asserts no UUID / ISO-second leaks |
| AI Doctor readiness | PASS | no overconfidence, missing-context disclosed |
| Alerts | PASS | stale/invalid telemetry never marked healthy |
| Action Queue | PASS | approval-required; no auto-execution; no device control |
| EcoWitt-only scanner | PASS | no non-EcoWitt vendor regressions |

## Validation counts

- `npx vitest run one-tent-live-proof oneTentSensorProof ecowittLiveProof ecowittIngestAuditProof SensorsEcowittLiveProofWiring relative-timeline-projection timeline` — **130 files / 1580 tests passed**
- `npx vitest run live-sensor-server-gate premium-live-sensor-gate-hardening manual-sensor-fahrenheit-and-refresh` — **3 files / 52 tests passed**
- `npx tsc -p tsconfig.app.json --noEmit` — **clean**

## Known limitations

- Operator Mode (`?operator=1`) is a URL surface gate, not a role/capability check. Data access is still scoped by Supabase RLS; the URL cannot widen access. Documented in `docs/v0-release-checkpoint.md` §15.1.
- Ingest-audit proof depends on the `"Users view own ingest audit"` RLS policy; permission/network failures collapse to `blocked` / `error` states with calm copy and never imply a healthy state.
- Sensor-proof window is the last 24 hours by design; report copy says "current proof window" explicitly.
- AI Doctor remains advisory only — no Action Queue auto-write.

## Demo script (short)

1. Pick a grow, then a tent on the Sensors page.
2. Append `?operator=1` to the Sensors URL — show row-level live proof + ingest-audit proof panels (counts, last-accepted, last-rejected, proof window).
3. Open One-Tent Live Proof — show the 6-step checklist + sensor-proof section + shortcut links.
4. Click **Copy proof summary** — paste into a notes app to show the sanitized markdown report (no IDs, no timestamps below day-level for audit rows).
5. Walk the loop: Quick Log → Timeline category → AI Doctor readiness → Alert → Add to Action Queue (approval required) → Complete → Follow-up diary entry → Timeline back-pointer.
6. Refresh One-Tent Live Proof to show all six checklist steps green.

## Rollback notes

- This is a read-only smoke pass plus a single new docs file.
- To roll back: delete `docs/one-tent-loop-rc-smoke-test.md`. No product code changed.

## Recommended tag

`v0-one-tent-loop-rc1`

## Demo Proof CI verification

This docs-only update intentionally triggers the Demo Proof Walkthrough read-only CI workflow.

Expected CI checks:
- demo proof route guards
- proof report redaction guards
- targeted Demo Proof Walkthrough vitest suites
- TypeScript
- Playwright Demo Proof Walkthrough no-write E2E with Chromium installed

Success condition:
The workflow completes with the Playwright E2E executed in CI, not left pending due to a missing browser runtime.
