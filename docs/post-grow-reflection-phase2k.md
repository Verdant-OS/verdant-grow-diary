# Phase 2K — Post-Grow Reflection Sanitized Validation Summary Panel

## Summary

Phase 2K adds a sanitized operator summary panel to the existing Candidate Paste Validator.

After local validation, the panel summarizes the validation outcome without exposing the raw pasted JSON or candidate body text.

## Route

```text
/operator/post-grow-reflection-dry-run
```

## Scope

Included:

- Pure sanitized validation summary builder
- Summary rows for outcome, input kind, confidence, issue codes, failure reason, validation options, envelope source, envelope format, and persistence status
- Presenter-only summary panel on the existing paste validator card
- Unit tests for summary output
- Component tests for summary rendering
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
- Copy/export actions

## Safety boundary

The summary intentionally excludes raw pasted JSON, candidate body text, private metadata, credentials, and device/action targets. It is display-only and not saved.

## Operator workflow

1. Open the operator diagnostics route.
2. Paste raw candidate JSON or load a local envelope sample.
3. Click `Validate pasted candidate`.
4. Review the detailed validation result and the sanitized summary panel.

## Safety verdict

Safe. Operator-only sanitized validation summary. No runtime generation, no provider call, no persistence, no schema/RLS/Edge/auth changes, no Action Queue writes, no automation, and no equipment control.

## Follow-up path

A future operator-only export or review handoff can build on this summary shape, but that should remain explicit, sanitized, and approval-based. This slice does not copy, save, export, or transmit the summary.
