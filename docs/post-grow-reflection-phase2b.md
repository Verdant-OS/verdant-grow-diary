# Post-Grow Reflection Phase 2B

## Summary

Phase 2B adds a pure output validation gate for future Post-Grow Reflection responses.

This slice does not generate reflections. It validates AI-like reflection output before any future product surface can trust it.

## Scope

Included:

- Reflection output parser and validator
- Valid, malformed, overconfident, missing-evidence, and unsafe-language fixtures
- Targeted validator tests
- Fixture tests
- Static safety tests

Not included:

- Runtime generation
- Server runtime changes
- New persistence tables
- Report UI changes
- Saved reflection records
- Automatic grower actions
- Equipment control

## Validator rules

The validator checks:

- Required `ReflectionOutput` fields are present
- Required fields have the expected primitive or string-array shape
- Confidence is exactly `Low`, `Medium`, or `High`
- Text is not empty
- Output includes enough explicit evidence references
- High confidence is rejected when supplied context is thin or has known gaps
- Overconfident language is rejected
- Automation and equipment-control language is rejected

## Evidence rule

The validator expects output to reference specific evidence such as:

- dates
- event ids
- counts
- percentages
- VPD values
- weight values
- RH values
- quality scores

Generic claims like “the grow went well” are not enough.

## Safety rule

Reflection output must stay observational and cautious.

Accepted language:

- “coincided with”
- “correlated with”
- “in this run”
- “worth tracking next run”

Rejected language:

- certainty claims
- guarantee claims
- proof claims
- direct causation claims from one run
- automation suggestions
- equipment-control suggestions

Unsafe examples are kept in rejection-only fixtures so the validator proves it blocks them.

## Validation plan

Run:

```bash
npx vitest run src/test/post-grow-reflection-output-validator.test.ts src/test/post-grow-reflection-output-fixtures.test.ts src/test/post-grow-reflection-output-static-safety.test.ts --reporter=verbose
npm run typecheck
npm run build
```

## Rollback

Rollback is simple: remove the Phase 2B validator files, fixtures, tests, and docs. No persisted data changes are included.
