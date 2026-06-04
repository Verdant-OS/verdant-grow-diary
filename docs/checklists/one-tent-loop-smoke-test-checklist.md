# One-Tent Loop Smoke Test Checklist

Use before publishing any change that could touch sensors, alerts, the
Action Queue, follow-up diary, or grow targets. See
`docs/one-tent-loop-smoke-test-audit.md` for the full audit contract.

## Required commands

- [ ] `bun run test:one-tent-loop-smoke` is green
- [ ] `node scripts/assert-ecowitt-only-sensor-direction.mjs` is clean
- [ ] `bun run test:sensor-intelligence-safety` is clean
- [ ] `bunx vitest run` is green (full regression)

## Safety invariants (re-verified)

- [ ] Manual readings never render as "Live"
- [ ] Latest snapshot reflects the most recent manual reading
- [ ] Target breach can persist an alert
- [ ] Alert persistence does **not** auto-create Action Queue rows
- [ ] Alert → Action Queue handoff is user-initiated only
- [ ] New Action Queue items default to approval-required / pending
- [ ] Action Queue items carry no executable device commands
- [ ] Action Queue items reference originating alert context
- [ ] Re-clicking "Add to Action Queue" does not duplicate
- [ ] Completion creates or links a follow-up diary entry
- [ ] Action Detail shows the follow-up link
- [ ] Timeline shows the follow-up chip/link
- [ ] Refresh / revisit does not duplicate rows
- [ ] Original grow target can be restored
- [ ] No `service_role` in client code
- [ ] No new `functions.invoke` in scanned surfaces
- [ ] No automatic device-control paths introduced
- [ ] EcoWitt-only sensor direction preserved (no SwitchBot references)
- [ ] VPD targets remain derived; never labeled "Live"

## Scope guardrails for this PR

- [ ] No UI, schema, RLS, edge function, alert, or Action Queue
      behavior changes outside the stated scope
- [ ] No fake / seeded ghost sensor readings
- [ ] No loosened safety tests or scanner allow-list expansions

If any box above is unchecked, **do not publish**.
