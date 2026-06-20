# Post-Grow Reflection Phase 2D

## Summary

Phase 2D adds a deterministic dry-run harness for the Post-Grow Reflection pipeline.

This harness does not generate reflection text. It runs fixture contexts and fixture candidate outputs through the Phase 2C adapter and returns a compact summary of expected pass/fail behavior.

## Scope

Included:

- Default dry-run scenarios
- Harness summary object
- Pass/fail counts
- Validated/rejected counts
- Validation reason code summary
- Harness tests
- Static safety tests

Not included:

- Runtime generation
- Server runtime changes
- New persistence tables
- Report UI changes
- Saved reflection records
- Automatic grower actions
- Equipment control

## Default scenarios

The default harness runs:

1. Rich photoperiod context with valid evidence-backed candidate
2. Thin autoflower context rejecting high-confidence candidate
3. Conflicting context rejecting certainty language
4. Rich context rejecting generic missing-evidence candidate
5. Rich context rejecting unsafe equipment-control candidate

## Summary output

The harness returns:

- harness version
- adapter version
- scenario count
- passed count
- failed count
- validated count
- rejected count
- safety reason codes
- per-scenario status, issue codes, and validation options

## Safety rules

The harness stays fixture-only and adapter-only.

It must not:

- create candidate text
- call a model/provider
- save output
- alter schema
- expose UI
- create actions
- control equipment

## Validation plan

Run:

```bash
npx vitest run src/test/post-grow-reflection-dry-run-harness.test.ts src/test/post-grow-reflection-dry-run-harness-static-safety.test.ts --reporter=verbose
npm run typecheck
npm run build
```

## Rollback

Rollback is simple: remove the harness file, tests, and this doc. No persisted data changes are included.
