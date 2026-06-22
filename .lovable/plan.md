## Verdant V0 One-Tent Loop — Full Audit + Fix Pass

### Approach

This is a large audit-and-fix slice across the entire V0 loop. To stay safe and minimize churn, I'll run it in two phases with a checkpoint between them.

**Phase 1 — Read-only audit (no code changes)**
- Walk the loop step-by-step in the codebase: Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert → Action Queue.
- For each step, verify the safety invariants from the One-Tent Loop smoke checklist (`docs/checklists/one-tent-loop-smoke-test-checklist.md`) and `docs/sensor-truth-rules.md`.
- Re-read recent slice (Action Queue trace-link copy + keyboard nav) which was already hardened — confirm no regressions.
- Run the existing static + smoke scanners (read-only):
  - `npx tsc --noEmit`
  - `bun run test:static-safety`
  - `bun run test:one-tent-loop-smoke`
  - `node scripts/assert-ecowitt-only-sensor-direction.mjs`
  - `bun run test:sensor-intelligence-safety`
  - Targeted Vitest suites for Quick Log, Timeline, Sensor, AI Doctor, Alerts, Action Queue.
- Produce the full 9-section audit report with a Severity | Area | Finding | Root cause | Fix proposal | Files | Tests table.

**Checkpoint** — Present findings to you. You confirm which severities to fix (default: all P0/P1, P2 if small, P3 only if directly tied to loop). No code changes happen before this checkpoint.

**Phase 2 — Minimal fix slices (only after checkpoint)**
- Each confirmed finding becomes its own narrow slice:
  - Pure helpers land in `src/lib/*Rules.ts` / `*Advisor.ts` / `*ViewModel.ts`.
  - UI changes stay presenter-only in `src/pages/*` / `src/components/*`.
  - Every fix gets targeted tests (happy path, edge, null/invalid, regression, safety fence).
- Re-run all validation commands after each fix.
- Return the final 9-section report with exact pass/fail counts.

### Hard non-goals (will not touch)

- No schema, RLS, Edge Function, auth, or migration changes unless a confirmed P0 blocker requires them — and even then I'll stop and ask first.
- No automation, device control, or service_role in client.
- No automatic Action Queue rows from alerts.
- No new features, no broad refactors, no copy changes outside fix scope.
- No fake/demo data in live flows.

### Why a checkpoint

The previous two audit passes (read-only audit + P1/P2 hardening) already landed and reported **PASS — no stop-ship findings**, with the recent slice covered by 41 targeted tests and 745 Action Queue regression tests green. A third full pass is most likely to surface only P2/P3 polish items. Confirming severity-to-fix at the checkpoint prevents me from rewriting working code under the banner of "audit hardening."

### Deliverable

Final response in your required 9-section format:
1. Summary
2. Audit findings table
3. Loop status after fixes
4. Files changed
5. Implementation notes
6. Validation results
7. Safety verdict (all 6 rules)
8. Risk / rollback notes
9. Known follow-ups (out-of-scope)

### Risk / rollback

Phase 1 is pure reads — zero runtime risk. Phase 2 fixes will each be independently revertible (one logical slice per concern, small diffs, test-backed).

---

**Approve to start Phase 1 (read-only audit + scanner run).** If you'd rather I skip the checkpoint and auto-fix anything P0/P1 the audit finds (stopping only for schema/RLS/Edge), say "auto-fix P0/P1" and I'll run end-to-end.