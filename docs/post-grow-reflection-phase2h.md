# Phase 2H — Post-Grow Reflection Provider Candidate Envelope Contract

## Summary

Phase 2H adds a contract-only normalizer for future Post-Grow Reflection candidate envelopes.

This is not runtime integration. It does not call any model or external service. It only defines how a future candidate envelope can be accepted or rejected before being passed into the existing adapter/output validator boundary.

## Scope

Included:

- Pure envelope normalizer
- Accepted/rejected result types
- Adapter candidate conversion for accepted envelopes
- Safe metadata extraction
- Rejection for missing candidate output
- Rejection for invalid envelope shape
- Rejection for unsupported candidate format
- Rejection for blocked private metadata keys
- Unit tests
- Static safety tests

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
- UI changes

## Envelope shape

Expected envelope kind:

```text
post_grow_reflection_candidate
```

Accepted candidate formats:

- object
- JSON string

Accepted metadata is limited to safe labels:

- sourceLabel
- requestLabel
- createdAt

Private values are intentionally rejected. This contract does not preserve credentials, authorization headers, sessions, or private keys.

## Output

Accepted envelopes return:

- `ok: true`
- `status: accepted`
- envelope version
- `PostGrowReflectionAdapterCandidate`
- safe metadata

Rejected envelopes return:

- `ok: false`
- `status: rejected`
- envelope version
- issue codes
- failure reason

## Safety verdict

Safe. Contract-only. No runtime call, no provider integration, not saved, no persistence, no schema/RLS/Edge/auth changes, no Action Queue writes, no automation, and no equipment control.

## Follow-up path

A future runtime-provider gate can use this envelope contract as the first normalization step, then pass accepted candidates through the existing adapter/output validator. That future gate should remain operator-only first and should not write reflection records until validation, preview, and rejection behavior remain stable across real candidate examples.
