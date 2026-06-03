# Linear Issue Template — Verdant

> Copy this template into the Linear issue description. Every section is
> required. If a section does not apply, write "N/A — <one-line reason>"
> rather than deleting it. See `docs/definition-of-ready-done.md`.

## Goal
<!-- Plain-language user story from a grower's perspective. What problem
does this solve in the One-Tent Loop? -->

## Scope
<!-- The smallest correct change. Name the V0 loop area touched: Quick
Log, Timeline, Sensor Snapshot, AI Doctor, Alert, or Action Queue. -->

## Out of scope
<!-- What this issue will NOT touch. Default exclusions: Supabase schema,
RLS, auth, edge functions, device control, automation, AI Doctor prompt
surgery. List anything else explicitly excluded. -->

## Files likely involved
<!-- Best-guess paths. Cursor will refine. Example:
- src/components/QuickLog.tsx
- src/lib/quickLogRules.ts
- src/test/quicklog-*.test.ts
-->

## Acceptance criteria
<!-- Observable, testable, written before implementation. -->
- [ ]
- [ ]
- [ ]

## Tests required
<!-- At minimum: happy path, edge boundaries, null/invalid inputs,
regression coverage. Add Playwright if One-Tent Loop UI is touched. -->
- [ ] Unit / rule tests in `src/test/*`
- [ ] Playwright loop coverage (if loop UI changes)

## Sensor truth / safety checks
<!-- Confirm explicitly: -->
- [ ] No fake live data introduced
- [ ] No blind automation introduced
- [ ] Action Queue remains **approval-required**
- [ ] No device control added
- [ ] No business logic added to `.tsx`
- [ ] Sensor source labels honest (live / manual / csv / demo / stale / invalid)

## Validation commands
```bash
bun run lint
bunx tsc --noEmit
bunx vitest run
# Playwright, if loop UI changed:
# bunx playwright test
```

## Rollback note
<!-- How to undo this change safely if it regresses the loop. Name the
exact revert, feature flag, or migration reversal required. -->
