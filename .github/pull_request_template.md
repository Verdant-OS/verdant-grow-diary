# Verdant Pull Request

> Production: https://verdantgrowdiary.com
> Please complete every section. Link to [`docs/security-checklist.md`](../docs/security-checklist.md)
> and [`docs/security-exceptions.md`](../docs/security-exceptions.md) when an
> item needs more context.

## Summary

<!-- What does this PR do and why? Keep it to a few sentences. -->

## Files changed

<!-- High-level list of files touched. Group by area when helpful. -->

## Behavior changed

<!-- User-visible or runtime behavior changes. Write "None" if docs/tests only. -->

---

## Security checklist

Reviewed against [`docs/security-checklist.md`](../docs/security-checklist.md).
Document any exceptions in [`docs/security-exceptions.md`](../docs/security-exceptions.md).

- [ ] No client-trusted `user_id` (server always re-derives ownership via `auth.uid()`)
- [ ] No `service_role` introduced in frontend or Edge Functions
- [ ] RLS preserved on every touched table (policies still enforce `auth.uid()` ownership)
- [ ] No fake live / demo data introduced or surfaced as real
- [ ] No new device-command / external-control surface introduced
- [ ] AI Coach unchanged, or changes have been safety-reviewed
- [ ] Action Queue unchanged, or changes preserve user-approval-required semantics
- [ ] Tests added/updated when behavior changes

## V0 Operating Loop impact

The V0 operating loop is Verdant's protected product spine — see
[`docs/v0-operating-loop-demo.md`](../docs/v0-operating-loop-demo.md)
and the stop-ship contract test
`src/test/v0-operating-loop-contract.test.ts`.

Confirm any change touching the loop is intentional and safety-reviewed:

- [ ] Sensor readings (manual ingest, freshness, source) — unchanged or reviewed
- [ ] Dashboard latest environment snapshot — unchanged or reviewed
- [ ] Environment alerts (derivation rules) — unchanged or reviewed
- [ ] Alert persistence (`alerts`, `alert_events`) — unchanged or reviewed
- [ ] AlertDetail — unchanged or reviewed
- [ ] ActionQueue — unchanged or reviewed
- [ ] ActionDetail — unchanged or reviewed
- [ ] Action Queue transitions (approve / reject / complete / cancel) — unchanged or reviewed
- [ ] AI Coach → Action Queue handoff — unchanged or reviewed
- [ ] `src/test/v0-operating-loop-contract.test.ts` still passes

## RLS / ownership impact

<!-- New tables, new policies, changed policies, or ownership joins. Write "None" if not applicable. -->

## AI Coach impact

<!-- New call sites, new prompts, new tools, or output handling changes. Write "None" if not applicable. -->

## Action Queue impact

<!-- Any change to creation, approval, completion, cancellation, or audit events. Write "None" if not applicable. -->

## Sensor / live-data truthfulness

<!-- Confirm displayed data comes from real authenticated readings. Note stale/missing handling. -->

## External-control / device-command impact

<!-- Confirm no actuator/device-command writes were added. Write "None" if not applicable. -->

---

## Tests run

- [ ] `bunx vitest run` — all tests pass
- [ ] `bunx eslint` on changed files — clean
- [ ] `npm run build` — succeeds

<!-- Paste the final test summary line, e.g. "Tests 663 passed (663)". -->

## Build / lint results

<!-- Any warnings worth calling out, or "Clean". -->

## Risk / rollback notes

<!-- What could go wrong, and how to roll back safely. -->
