# Cursor Task Template — Verdant

> Use this template when sending a scoped task to Cursor (or any coding
> agent). It mirrors the Linear issue and adds implementation discipline.
> See `docs/engineering-velocity-os.md` and
> `docs/definition-of-ready-done.md`.

## Summary
<!-- One paragraph. Restate the Linear goal and the One-Tent Loop area
this change touches. -->

## Requirements / assumptions
<!-- Bullet the acceptance criteria from Linear plus any assumptions
Cursor is allowed to make. State the safety envelope explicitly:
- No schema / RLS / auth / edge-function changes
- No device control
- No automation
- Action Queue stays approval-required
- No fake live data
- Business logic stays out of `.tsx`
-->

## File-level plan
<!-- Path-by-path edits Cursor will perform. Example:
- src/lib/quickLogRules.ts — add `validateQuickLogEntry`
- src/components/QuickLog.tsx — call helper, no inline rule logic
- src/test/quicklog-rules.test.ts — happy path + edge boundaries
-->

## Implementation notes
<!-- Conventions to follow:
- Pure helpers in `src/lib/*Rules.ts`
- View models in `src/lib/*ViewModel.ts`
- Hooks in `src/hooks/*`
- Strong TypeScript; handle null, undefined, NaN, Infinity, malformed
  dates, and missing fields
- Use semantic Tailwind tokens, never raw colors
-->

## Tests required
- [ ] Happy path
- [ ] Edge boundaries (empty, max, malformed)
- [ ] Null / invalid inputs
- [ ] Regression coverage for the changed rule
- [ ] Playwright One-Tent Loop coverage (if loop UI changes)

## Validation commands
```bash
bun run lint
bunx tsc --noEmit
bunx vitest run
# bunx playwright test   # if loop UI changed
```

## Safety verdict
<!-- Cursor MUST fill this in before declaring the task done. Confirm:
- ✅ No fake live data
- ✅ No blind automation
- ✅ Action Queue approval-required preserved
- ✅ No device control
- ✅ No schema / RLS / auth / edge-function changes
- ✅ No business logic in `.tsx`
-->

## Risk / rollback notes
<!-- Blast radius, feature-flag status, and exact revert path. -->
