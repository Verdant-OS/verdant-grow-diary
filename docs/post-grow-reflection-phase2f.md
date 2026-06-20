# Post-Grow Reflection — Phase 2F (Operator Preview Gate)

## Summary

Phase 2F adds an operator-only, read-only preview card for the Post-Grow
Reflection feature. The preview renders the first validated dry-run scenario's
`ReflectionOutput` in a production-like card layout so operators can inspect
shape, content, and validation context before any future runtime integration is
considered.

This slice does **not** implement runtime AI integration. No model is called,
nothing is persisted, and the preview never reaches grower-facing surfaces.

## Scope

- Pure preview view model: `src/lib/ai/postGrowReflectionPreviewViewModel.ts`
- Presenter card: `src/components/PostGrowReflectionPreviewCard.tsx`
- Operator diagnostics page now also renders the preview card.

## Route

The preview appears on the existing operator-only route:

- `/operator/post-grow-reflection-dry-run`

This route is operator-only and must not be added to normal grower navigation.

## Files changed

- `src/lib/ai/postGrowReflectionPreviewViewModel.ts` (new)
- `src/components/PostGrowReflectionPreviewCard.tsx` (new)
- `src/pages/OperatorPostGrowReflectionDryRun.tsx` (renders the preview card)
- `src/test/post-grow-reflection-preview-view-model.test.ts` (new)
- `src/test/post-grow-reflection-preview-card.test.tsx` (new)
- `src/test/post-grow-reflection-preview-static-safety.test.ts` (new)
- `docs/post-grow-reflection-phase2f.md` (new)

## Operator labels

The preview card explicitly displays:

- Operator preview
- Dry-run fixture
- Validated output
- Not saved
- No live AI call

These labels are part of the view model and persist on both present and empty
states so the preview is never mistaken for a real saved reflection.

## What is intentionally blocked

This slice does not add and must not be interpreted as adding:

- Live AI generation or any model / provider call
- Persistence, database reads or writes
- Schema, RLS, auth, or Edge Function changes
- Action Queue writes or device-control behavior
- Grower-facing navigation entries
- Generate / Save / Apply / Send / Create Action buttons

Rejected dry-run scenarios remain visible in the diagnostics table above the
preview card. Validator failures are not hidden.

## Safety verdict

Safe. Read-only operator preview only. No runtime generation, no provider call,
no persistence, no schema/RLS/Edge/auth changes, no Action Queue writes, no
automation, and no device control.

## Follow-up path

A future runtime integration gate would, in a separate phase:

1. Introduce a server-side adapter that calls the provider through a metered
   Edge Function.
2. Reuse the existing prompt contract, output validator, and adapter boundary.
3. Persist validated outputs only after explicit operator approval.
4. Gate exposure behind entitlements and the existing Action Queue review flow.

Phase 2F explicitly does not implement any of the above. It only previews the
already-validated dry-run output behind the operator-only route.
