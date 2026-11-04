### QUICK-LOG-WATER-VOLUME-UNITS-IMPL

```text
TASK QUICK-LOG-WATER-VOLUME-UNITS-IMPL  priority: other  status: OPEN
goal: Implement ml / L / gal entry for Quick Log Water volume and runoff per docs/specs/quick-log-water-volume-units.md (spec PR #2813; D1 b, D2 yes, D3 b).
why: Live audit 2026-11-03 finding 4: Water accepted millilitres only.
branch: claude/quick-log-water-volume-units-impl
base: verdant-grow-diary
checkout: git fetch origin claude/quick-log-water-volume-units-impl verdant-grow-diary && git switch claude/quick-log-water-volume-units-impl
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2814 (ready for review)
head_sha: read the current head on GitHub (this block rides the first commit)
state: implemented and tested locally; draft PR, awaiting CI and independent review.
current_step: Seat A P2s at 54715ba fixed (body test counts; this timestamp); awaiting re-review at the new head.
next_action: route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ). Signed-in visual check of the Water form at 393px is NOT_MEASURED.
post_merge_check: after Publish, on https://verdantgrowdiary.com with the fixture account, choose gal, enter 1, save a tagged [smoke <timestamp>] Water entry, and confirm the Timeline shows 3785 ml. NOT_MEASURED until live /version.json reports the merge SHA.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: storage stays volume_ml / runoff_ml; typed text converts once (exact rational, rounded once to whole ml); form keeps canonical volumeMl/runoffMl plus optional volumeEntryUnit/volumeEntryText/runoffEntryText; switching unit reinterprets typed text, never a prefilled or restored amount; a preset sets ml without changing the remembered unit; the prefill clears stale typed text.
tried_and_rejected: per-unit copies of the 50,000 ml gate (two gates could disagree).
commands: bunx vitest run src/test/quick-log-water-volume-units-rules.test.ts src/test/quick-log-water-volume-units-ui.test.tsx --reporter=dot; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
files_touched: src/lib/quickLogWaterVolumeUnitRules.ts; src/lib/waterVolumeEntryUnitPreference.ts; src/constants/quickLogWaterVolumeUnitCopy.ts; src/lib/quickLogWateringFormViewModel.ts; src/components/QuickLogWateringForm.tsx; src/components/QuickLogV2Sheet.tsx; src/test/quick-log-water-volume-units-rules.test.ts; src/test/quick-log-water-volume-units-ui.test.tsx; docs/agents/HANDOFF_LOG.md
files_remaining: none for this slice
blockers: none
open_questions: none
gotchas: commit with NODE_OPTIONS=--max-old-space-size=8192 (pre-commit tsc). The spec file lives in #2813, not on this branch, until #2813 merges.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2813
artifacts: none
reviewer_seat: Grok (Matthew's gate); Seat A reviewed 54715ba: PASS-with-P2 0/2/1
reviewer_sha: 54715ba (new head needs review)
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03
owner: Claude
last_updated: 2026-11-03 21:10 CT, by Claude
```
