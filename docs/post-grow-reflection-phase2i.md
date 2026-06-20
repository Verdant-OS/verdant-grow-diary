# Phase 2I — Post-Grow Reflection Envelope Paste Integration

## Summary

Phase 2I wires the Phase 2H candidate envelope contract into the existing operator-only Candidate Paste Validator.

Operators can now paste either:

- raw `ReflectionOutput` JSON
- a `post_grow_reflection_candidate` envelope

Both paths remain manual, local, read-only, and operator-only.

## Route

```text
/operator/post-grow-reflection-dry-run
```

## Scope

Included:

- Candidate paste validator accepts raw candidate JSON or candidate envelopes
- Envelopes are normalized through the Phase 2H contract before reflection validation
- Rejected envelopes show issue codes before reaching the reflection validator
- Valid envelopes expose safe metadata labels
- Component renders envelope metadata when available
- Pure tests cover raw, valid envelope, rejected envelope, malformed candidate, unsafe candidate, and deterministic validation
- Component tests cover envelope metadata and envelope rejection visibility
- Static safety test covers the Phase 2I boundary

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

## Manual workflow

1. Open the operator diagnostics route.
2. Paste raw `ReflectionOutput` JSON or a candidate envelope.
3. Click `Validate pasted candidate`.
4. Review one of these outcomes:
   - `validated` — candidate passed the reflection validator.
   - `validation_failed` — candidate envelope was accepted, but output failed the reflection validator.
   - `envelope_rejected` — envelope failed the contract before reflection validation.
   - `invalid_json` — pasted text could not be parsed.

## Safety verdict

Safe. Operator-only manual envelope validation. No runtime generation, no provider call, no persistence, no schema/RLS/Edge/auth changes, no Action Queue writes, no automation, and no equipment control.

## Follow-up path

A later operator-only runtime candidate capture gate can reuse this same envelope path. That future work should still be read-only at first and should not save reflection records until candidate rejection behavior is stable.
