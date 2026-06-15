# Verdant Release Notes Index

Chronological index of internal release notes for Verdant. Each entry links
to a detailed release doc in this directory.

Release docs must pass `node scripts/assert-release-docs-safety.mjs`, which
guards against accidental claims of live telemetry, import writes, AI
behavior changes, Action Queue auto-writes, device control, schema/RLS/Edge
changes, or exposed secrets/raw payloads in docs-only or test-only slices.

## Entries

### 2026-06-15 — Manual Sensor Snapshot Quality Badges

Adds presenter-safe quality badges for manual and current sensor snapshots
so growers can see whether readings are usable for AI Doctor context and
Action Queue suggestion preview eligibility.

- Behavior: read-only badge; no schema changes; no Supabase writes; no AI/model calls; no device control.
- Validation: 18/18 helper + badge tests pass; 65/65 related readiness / imported-history / action-preview tests pass; 5/5 integration tests pass.
- Docs: see `docs/ai-doctor-output-contract.md` "Current sensor snapshot quality" section and `qa/manual-sensor-snapshot-quality-checklist.md`.
- Related: `runbooks/ai-doctor-action-suggestion-preview-qa.md`, `testing/ai-doctor-preview-safety-scanner.md`.

### 2026-06-15 — AI Doctor Imported History Safety Slice

Documents the test-backed safety path for imported CSV history in AI Doctor
context without live telemetry claims, import writes, AI behavior changes,
or device control.

- Release note: [`ai-doctor-imported-history-safety.md`](./ai-doctor-imported-history-safety.md)
- Runbook: [`../runbooks/ai-doctor-imported-history.md`](../runbooks/ai-doctor-imported-history.md)
- QA checklist: [`../qa/ai-doctor-imported-history-safety-checklist.md`](../qa/ai-doctor-imported-history-safety-checklist.md)
- Known flake note: [`../testing/known-vitest-flakes.md`](../testing/known-vitest-flakes.md)

### 2026-06-15 — AI Doctor Action Queue Suggestion Preview Safety Hardening

Related follow-up to the imported-history safety slice. Adds the
read-only Action Queue suggestion preview inside AI Doctor context
readiness, with deterministic eligibility rules, UI-level safety
filters, and accessibility improvements.

- Behavior: preview-only; no Action Queue rows created; no Supabase
  writes; no AI/model calls; no device control.
- Validation: 27/27 preview helper + presenter tests pass.
- Regression: 38/38 imported-history + readiness tests pass.
- Docs: see `ai-doctor-output-contract.md` "Action Queue suggestion
  preview" section, `qa/ai-doctor-imported-history-safety-checklist.md`
  preview checklist, and `runbooks/ai-doctor-imported-history.md`.
