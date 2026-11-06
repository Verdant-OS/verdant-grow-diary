# TOUCH-TARGET-MINIMUM

```text
TASK TOUCH-TARGET-MINIMUM  priority: other  status: CLOSED
closed: merged. #2841 merged into verdant-grow-diary on 2026-11-04 as a7652479f7959b52de3bb9474a6ae748245eba8a (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Every icon-only button is at least 24x24 CSS px (WCAG 2.2 AA 2.5.8), with a guard.
why: Audit 2026-11-03 finding 12 listed touch targets as unmeasured; docs/specs/contrast-tokens.md section 7 left it for its own pass. A syntax-tree scan found six icon-only buttons at 12-20px, including the shared InfoPopover trigger that documents itself as built for gloved hands.
branch: claude/touch-target-audit
base: verdant-grow-diary
checkout: git fetch origin claude/touch-target-audit verdant-grow-diary && git switch claude/touch-target-audit
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: implemented; guard 2/2; 44 related test files pass.
current_step: draft PR open.
next_action: route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ).
post_merge_check: on the live build at phone width, the Info "i" next to a heading, the Daily Grow Check "What is a manual snapshot?" icon and the HyperLog close X each take a 24px tap area.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: raise each to h-6 w-6 with the icon centred and its size unchanged (smallest change that meets AA). 44px (AAA) would change layouts and is not proposed here. Buttons with visible text are out of scope; their height comes from line-height plus padding and was not measured.
tried_and_rejected: none
commands: bunx vitest run src/test/touch-target-minimum.test.ts
files_touched: src/components/InfoPopover.tsx; src/components/DailyGrowCheckOnboardingCard.tsx; src/components/HyperLogModal.tsx; src/components/PhenoBreedingObjectiveEditor.tsx; src/components/PhenoStabilityLedger.tsx; src/test/touch-target-minimum.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: none
gotchas: the guard estimates height from Tailwind classes; a size set by inline style or a variable class is not seen. Width is not checked (the fixes set both).
links: docs/specs/contrast-tokens.md section 7
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 21:05 CT, by Claude)
```
