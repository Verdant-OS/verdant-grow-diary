# Post-Grow Reflection Phase 2E

## Summary

Phase 2E adds an operator-only diagnostics page for the Post-Grow Reflection dry-run harness.

The page renders the deterministic Phase 2D harness summary so an operator can inspect whether fixture scenarios are validating or rejecting as expected before any grower-facing reflection feature is exposed.

## Route

Primary route:

```text
/operator/post-grow-reflection-dry-run
```

This route is diagnostic-only and must not be added to normal grower navigation.

## Scope

Included:

- Operator diagnostics page
- Presenter-focused view model
- Route registration
- Route manifest registration
- View model tests
- Page render test
- Static safety tests

Not included:

- Runtime generation
- Server runtime changes
- New persistence tables
- Report UI changes
- Saved reflection records
- Automatic grower actions
- Equipment control

## Page content

The page shows:

- Overall green / needs-review status
- Scenario count
- Passed and failed scenario counts
- Validated and rejected candidate counts
- Safety reason codes
- Per-scenario expected status, actual status, result, issue codes, and validation options
- Operator guardrails

## Safety rules

- Operator-only route.
- Read-only local fixture diagnostics.
- No grower-facing navigation.
- No generated reflection text beyond existing fixtures.
- No saving or syncing.
- No action creation.
- No equipment control.

## Validation plan

Run:

```bash
npx vitest run src/test/post-grow-reflection-operator-diagnostics-view-model.test.ts src/test/post-grow-reflection-operator-diagnostics-page.test.tsx src/test/post-grow-reflection-operator-diagnostics-static-safety.test.ts --reporter=verbose
npm run typecheck
npm run build
```

## Rollback

Rollback is simple: remove the page, view model, route, manifest entry, tests, and this doc. No persisted data changes are included.
