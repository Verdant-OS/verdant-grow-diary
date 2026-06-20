# Post-Grow Reflection Phase 2C

## Summary

Phase 2C adds a pure adapter boundary for future Post-Grow Reflection work.

This slice does not generate reflections. It builds a deterministic request object from `GrowContext`, then validates a supplied candidate output through the Phase 2B validator before returning a trusted `ReflectionOutput`.

## Scope

Included:

- Adapter request builder
- Candidate-result adapter
- Derived validation options from grow context
- Structured success and failure results
- Adapter tests
- Static safety tests

Not included:

- Runtime model requests
- Server runtime changes
- New persistence tables
- Report UI changes
- Saved reflection records
- Automatic grower actions
- Equipment control

## Boundary behavior

The adapter has two jobs:

1. Build a deterministic request from a supplied `GrowContext`.
2. Accept a supplied candidate output and return `ReflectionOutput` only if the validator passes.

If validation fails, the adapter returns:

- `ok: false`
- `status: "validation_failed"`
- `output: null`
- validation issues
- a compact failure reason

## Why this exists

This creates the seam Verdant needs before any future reflection generation is connected. The product can test prompt construction, candidate handling, and validator failure paths without adding runtime generation or write paths.

## Safety rules

- Do not trust candidate output until validation passes.
- Do not treat high-confidence output as valid when the context is thin or has known gaps.
- Do not allow equipment-control language through the adapter.
- Do not save generated reflection text in this slice.
- Do not expose this in the report UI in this slice.

## Validation plan

Run:

```bash
npx vitest run src/test/post-grow-reflection-adapter.test.ts src/test/post-grow-reflection-adapter-static-safety.test.ts --reporter=verbose
npm run typecheck
npm run build
```

## Rollback

Rollback is simple: remove the adapter file, tests, and this doc. No persisted data changes are included.
