# CONTRAST-TOKENS-SPEC

```text
TASK CONTRAST-TOKENS-SPEC  priority: other  status: OPEN
goal: Measure Verdant's text contrast from the theme tokens and decide how to fix the failures.
why: Live audit 2026-11-03 finding 12 flagged muted text on dark green as a contrast risk without measuring it. Measured from src/styles.css at c03f64a: base muted text passes AA (5.5-7.1:1); the dark-theme --destructive fails as text (3.47-4.30:1) and as a white-label button fill (4.40:1); muted text at /70 or below fails (2.1-4.0:1), including the stale and missing labels in PlantManualSensorFreshnessCard.
branch: claude/contrast-measurements-spec
base: verdant-grow-diary
checkout: git fetch origin claude/contrast-measurements-spec verdant-grow-diary && git switch claude/contrast-measurements-spec
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub
state: spec committed; Matthew decided D1 (a) and D2 (a) on 2026-11-04.
current_step: draft PR open.
next_action: route an exact-head review; implementation slices follow (D1 tokens + guard, then the D2 sweep).
post_merge_check: none (docs only).
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: Token measurements only; rendered contrast over images and tinted panels is NOT_MEASURED. Recommend D1(a) split --destructive into a text token (0 85% 68%) and a darker fill (0 70% 48%), and D2(a) a /80 floor for meaningful muted text.
tried_and_rejected: a single --destructive lightness (no value passes both text and button).
commands: none (docs only)
files_touched: docs/specs/contrast-tokens.md; docs/agents/HANDOFF_LOG.md
files_remaining: none for the spec
blockers: none
open_questions: none (D1 a, D2 a)
gotchas: text-destructive has 310 uses and bg-destructive 127; the split must map both utilities in the Tailwind theme block of src/styles.css (lines 40-41).
links: none
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03
owner: Claude
last_updated: 2026-11-03 18:45 CT, by Claude
```
