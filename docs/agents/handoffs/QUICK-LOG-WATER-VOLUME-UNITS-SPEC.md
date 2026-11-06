# QUICK-LOG-WATER-VOLUME-UNITS-SPEC

```text
TASK QUICK-LOG-WATER-VOLUME-UNITS-SPEC  priority: other  status: CLOSED
closed: merged. #2813 merged into verdant-grow-diary on 2026-11-03 as c03f64a0172c43d9735cf1860cf03f4fcf69d408 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Spec ml / L / gal entry for the Quick Log Water volume, storing volume_ml unchanged (docs/specs/quick-log-water-volume-units.md).
why: Live audit 2026-11-03 finding 4: Water requires millilitres; growers note gallons.
branch: claude/quick-log-water-volume-units
base: verdant-grow-diary
checkout: git fetch origin claude/quick-log-water-volume-units verdant-grow-diary && git switch claude/quick-log-water-volume-units
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: spec drafted; Matthew decided D1 (b) remembered unit, D2 yes runoff, D3 (b) ml presets switch to ml (2026-11-03).
current_step: draft PR open.
next_action: route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ); implementation slice follows on Matthew's go.
post_merge_check: docs only; none until the implementation slice.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: storage stays volume_ml; convert typed text to canonical ml exactly once; existing gates read only canonical ml.
tried_and_rejected: a per-unit copy of the 50,000 ml gate (two gates could disagree).
commands: none (docs only)
files_touched: docs/specs/quick-log-water-volume-units.md; docs/agents/HANDOFF_LOG.md
files_remaining: none for the spec slice
blockers: none
open_questions: none (D1-D3 decided)
gotchas: remembered entry unit (D1 b) is a display preference, not a remembered target; the target ban still holds.
links: audit finding 4 (private upload, not committed)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03, by Claude)
```
