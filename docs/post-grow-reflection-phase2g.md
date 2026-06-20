# Phase 2G — Post-Grow Reflection Candidate Paste Validator

## Summary

Phase 2G adds a manual, operator-only candidate paste validator to the existing Post-Grow Reflection dry-run diagnostics route.

Route:

```text
/operator/post-grow-reflection-dry-run
```

The operator can paste a `ReflectionOutput`-shaped JSON candidate into the page, run local validation, and inspect either a validated preview or a rejection summary.

## Scope

Included:

- Pure candidate paste validator rules
- Presenter-only paste validator card
- Operator page placement below the fixture preview
- Unit tests for validator states
- Component tests for manual paste behavior
- Static safety tests

Not included:

- Runtime generation
- Provider calls
- Persistence
- New tables or policy changes
- Server runtime changes
- Report record writes
- Action creation
- Automation
- Equipment control
- Grower-facing navigation

## Manual paste workflow

1. Open the operator diagnostics route.
2. Paste a candidate reflection JSON into the textarea.
3. Click `Validate pasted candidate`.
4. Review the result:
   - `validated` shows a sectioned preview with confidence and validation options.
   - `validation_failed` shows issue codes and failure reason.
   - `invalid_json` shows a parse error.
   - `empty` asks for candidate content.

The card labels validated output with:

- Operator candidate
- Manual paste
- Validated output
- Not saved
- No live AI call

Rejected output is labeled as a rejected candidate and stays visible to the operator.

## What validates

The pasted JSON is parsed locally and passed through the existing adapter and output validator boundary. The default context is the rich photoperiod fixture context so the validator can exercise evidence references, confidence rules, and safety wording checks without live runtime integration.

## Intentionally blocked

This slice does not add live runtime integration. It does not save validated candidates. It does not create recommendations or actions. It does not read or write external data. It does not send commands to equipment.

## Safety verdict

Safe. Operator-only manual candidate validation. No runtime generation, no provider call, no persistence, no schema/RLS/Edge/auth changes, no Action Queue writes, no automation, and no device control.

## Follow-up path

A later runtime-provider gate may be considered only after this manual validation path proves that candidate outputs can be rejected, previewed, and audited safely. That future gate should remain operator-only first and should not write records until the validation contract is stable.
