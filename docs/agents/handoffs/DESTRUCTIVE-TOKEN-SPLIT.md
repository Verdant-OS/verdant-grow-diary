# DESTRUCTIVE-TOKEN-SPLIT

```text
TASK DESTRUCTIVE-TOKEN-SPLIT  priority: other  status: OPEN
goal: Implement contrast decision D1 (a): error text and white-on-danger fills meet WCAG AA in the dark and light themes.
why: Audit 2026-11-03 finding 12; docs/specs/contrast-tokens.md (#2827) measured --destructive at 3.47-4.30:1 as text and 4.21:1 as a white-label fill. Matthew chose D1 (a) on 2026-11-04.
branch: claude/destructive-token-split
base: verdant-grow-diary
checkout: git fetch origin claude/destructive-token-split verdant-grow-diary && git switch claude/destructive-token-split
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: implemented; guard test 7/7.
current_step: draft PR open.
next_action: route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ). The D2 (a) muted-opacity sweep is the next slice.
post_merge_check: on the live build, an error message and a red Delete button read clearly in the default theme; computed colour of .text-destructive is hsl(0 85% 68%).
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: --color-destructive now reads --destructive-text, so all 309 text-destructive uses, borders and tints get the lighter text red; a new bg-destructive-fill utility reads the darker --destructive (0 70% 48%) and replaces solid bg-destructive on the five white-label fills (Button, Badge, Toast x2, OperatorEcowittCanary). Tailwind maps one colour to every utility, so text and fill cannot be split under one class name. Decorative dots keep bg-destructive. The light theme gets its own --destructive-text (0 70% 45%), because the spec's dark value would measure 2.81:1 on the light background.
tried_and_rejected: keeping bg-destructive as the fill and renaming 309 text uses (large diff, many pinned tests).
commands: bunx vitest run src/test/theme-destructive-contrast.test.ts
files_touched: src/styles.css; src/components/ui/button.tsx; src/components/ui/badge.tsx; src/components/ui/toast.tsx; src/pages/OperatorEcowittCanary.tsx; src/test/theme-destructive-contrast.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: none for D1
blockers: none
open_questions: none
gotchas: OperatorEdgeMetrics.tsx:58 reads hsl(var(--destructive)) directly for a chart colour; it now gets the darker fill red, which is fine for a chart line.
links: docs/specs/contrast-tokens.md (#2827)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-03 19:05 CT, by Claude
```
