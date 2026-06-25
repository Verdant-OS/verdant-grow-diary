
# One-Tent Loop Release Candidate Audit (Read-Only)

## Executive verdict
**PASS WITH WARNINGS** — Verdant can be tagged as a One-Tent Loop RC checkpoint. No P0/P1 stop-ship findings. Three small warn-level gaps remain; none break the loop or safety invariants.

## Stop-ship findings (P0/P1)
None.

- No writes detected in proof surfaces (`EcowittLiveProofPanel`, `EcowittIngestAuditProofPanel`, `OneTentSensorProofSection`, `useEcowittIngestAuditProofRows`).
- No `service_role`, `functions.invoke`, raw payload, bridge token, MAC, or user_id rendering in operator/proof surfaces.
- Action Queue handoff remains approval-required (verified by existing `action-queue-*` and `alert-to-action-queue` suites referenced in smoke audit).
- EcoWitt-only scanner clean per `scripts/assert-ecowitt-only-sensor-direction.mjs` wiring in CI.

## Warn-level findings
1. **One-Tent Live Proof copy/print report** — sensor-proof section is markdown-injected; verify the final report still excludes audit row IDs / `created_at` precision below day-level if any operator pastes it externally. Currently safe (only counts + status), but worth a 1-line guard test.
2. **Operator Mode disclosure** — `?operator=1` gate on `Sensors.tsx` is URL-only; no role check. Acceptable for an internal proof surface, but doc note in `docs/v0-release-checkpoint.md` Section 14 should call this out explicitly so it isn't mistaken for a privileged gate.
3. **Ingest-audit "blocked" vs "error" UX** — both collapse to read-only states, but the panel copy could more clearly distinguish "RLS-denied" from "network error" for operator triage. Cosmetic only.

## Confirmed safe areas (files reviewed)
- `src/pages/OneTentLiveProof.tsx` — read-only hooks, sanitized report.
- `src/pages/Sensors.tsx` — operator panels behind `?operator=1`, no writes.
- `src/components/EcowittLiveProofPanel.tsx`, `EcowittIngestAuditProofPanel.tsx`, `OneTentSensorProofSection.tsx` — presenters only.
- `src/lib/oneTentSensorProofViewModel.ts`, `ecowittLiveProofRules.ts`, `ecowittIngestAuditProofRules.ts` — pure deterministic rules.
- `src/hooks/useEcowittIngestAuditProofRows.ts` — strict SELECT allowlist (`source, tent_id, rows_received, rows_inserted, captured_at, created_at`); excludes `user_id`, `bridge_token_id`, `raw_payload`.
- Quick Log path: `src/lib/quick-log/createQuickLogEvent.ts` — preserves `source`/`captured_at`, never relabels stale/invalid as live, idempotent RPC.
- Plant timeline: `DiaryTimelineCategorySections.test.tsx` and sibling timeline tests cover category/evidence/readability/print.
- Action Queue: full `action-queue-*` suite intact (approval-required, no device control, redaction, follow-up linkage).
- CI guardrails: `one-tent-loop-smoke-test.yml`, `ecowitt-only-safety-scan.yml`, `sensor-intelligence-safety`, `vpd-stage-normalization-ownership` all wired.

## Minimal next fix plan (max 3, all small, read-only-friendly)
1. **Docs-only**: Append a short note to `docs/v0-release-checkpoint.md` Section 14 clarifying that `?operator=1` is a URL surface gate (not a role gate) and listing the exact column allowlist actually selected by `useEcowittIngestAuditProofRows`.
2. **Test-only**: Add a static-safety assertion that the One-Tent copy/print markdown for the sensor-proof section never contains substrings matching UUID patterns or ISO-second-precision timestamps from audit rows. ~10 lines.
3. **Presenter-only (tiny)**: In `EcowittIngestAuditProofPanel.tsx`, split the "blocked" UI copy into `blocked (permission)` vs `error (network)` using the existing status enum — no logic change.

Defer everything else. Do not start a new feature branch until RC is tagged.

## Validation plan
Targeted (fast):
```
bun run test:one-tent-loop-smoke
node scripts/assert-ecowitt-only-sensor-direction.mjs
bun run test:sensor-intelligence-safety
npx vitest run EcowittLiveProof ecowittLiveProof EcowittIngestAuditProof ecowittIngestAuditProof OneTentSensorProof oneTentSensorProof SensorsEcowittLiveProofWiring --reporter=verbose
npx tsc -p tsconfig.app.json --noEmit
```
Full regression (pre-tag):
```
bunx vitest run
```

## Release-candidate verdict
**Tag as One-Tent Loop RC checkpoint.** Safety invariants hold; proof surfaces are read-only and RLS-scoped; Action Queue remains approval-required; no fake-live regressions; EcoWitt-only direction preserved. Address the three warn-level items in a single follow-up slice (docs + 1 test + 1 copy split) before promoting RC → GA.
