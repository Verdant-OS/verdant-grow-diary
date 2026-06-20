# Phase 2J — Post-Grow Reflection Envelope Sample Loader

## Summary

Phase 2J adds deterministic local envelope samples to the existing operator-only Candidate Paste Validator.

The goal is to make the manual validation gate easier to test without typing JSON by hand.

## Route

```text
/operator/post-grow-reflection-dry-run
```

## Scope

Included:

- Pure deterministic envelope sample builder
- Valid envelope sample expected to pass local validation
- Contract-rejected envelope sample expected to fail before reflection validation
- Local sample load buttons on the existing paste validator card
- Tests for sample output and validation behavior
- Component tests for both sample buttons
- Static safety guard

Not included:

- Runtime generation
- Provider calls
- Network requests
- Persistence
- New tables or policy changes
- Server runtime changes
- Report record writes
- Action creation
- Automation
- Equipment control
- Grower-facing navigation

## Operator workflow

1. Open the operator diagnostics route.
2. Click `Load valid envelope sample` or `Load rejected envelope sample`.
3. The textarea is populated with deterministic local JSON.
4. Click `Validate pasted candidate`.
5. Review either the validated preview or envelope rejection summary.

The loader does not auto-validate and does not save anything. It only places local sample JSON into the textarea.

## Safety verdict

Safe. Operator-only local sample loader. No runtime generation, no provider call, no persistence, no schema/RLS/Edge/auth changes, no Action Queue writes, no automation, and no equipment control.

## Follow-up path

A future operator-only runtime candidate capture gate can reuse the same envelope validator once manual sample behavior remains stable. That future work should still start read-only and should not save reflection records until rejection behavior is stable across real candidate examples.
