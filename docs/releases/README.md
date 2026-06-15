# Verdant Release Notes Index

Chronological index of internal release notes for Verdant. Each entry links
to a detailed release doc in this directory.

Release docs must pass `node scripts/assert-release-docs-safety.mjs`, which
guards against accidental claims of live telemetry, import writes, AI
behavior changes, Action Queue auto-writes, device control, schema/RLS/Edge
changes, or exposed secrets/raw payloads in docs-only or test-only slices.

## Entries

### 2026-06-15 — AI Doctor Imported History Safety Slice

Documents the test-backed safety path for imported CSV history in AI Doctor
context without live telemetry claims, import writes, AI behavior changes,
or device control.

- Release note: [`ai-doctor-imported-history-safety.md`](./ai-doctor-imported-history-safety.md)
- Runbook: [`../runbooks/ai-doctor-imported-history.md`](../runbooks/ai-doctor-imported-history.md)
- QA checklist: [`../qa/ai-doctor-imported-history-safety-checklist.md`](../qa/ai-doctor-imported-history-safety-checklist.md)
- Known flake note: [`../testing/known-vitest-flakes.md`](../testing/known-vitest-flakes.md)
