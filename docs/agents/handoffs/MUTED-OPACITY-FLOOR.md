# MUTED-OPACITY-FLOOR

```text
TASK MUTED-OPACITY-FLOOR  priority: other  status: CLOSED
closed: merged. #2840 merged into verdant-grow-diary on 2026-11-04 as f071075d10d1036253879d91d3ccadd0a044cb78 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Implement contrast decision D2 (a): no meaningful muted text at /70 or fainter; only aria-hidden decoration may go fainter; a guard keeps it that way.
why: Audit 2026-11-03 finding 12; docs/specs/contrast-tokens.md (#2827) measured muted text at /70 and below at 2.1-4.0:1 (fails AA). Matthew chose D2 (a) on 2026-11-04.
branch: claude/muted-opacity-floor
base: verdant-grow-diary
checkout: git fetch origin claude/muted-opacity-floor verdant-grow-diary && git switch claude/muted-opacity-floor
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: implemented; guard 1/1; 128 related test files pass.
current_step: draft PR open.
next_action: route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ). When #2830 merges, remove PlantManualSensorFreshnessCard from PENDING in src/test/muted-text-opacity-floor.test.ts.
post_merge_check: on the live build, the plant quick-status strip's loading and unavailable labels and disabled-link reasons read clearly; Timeline fallback timestamps are no fainter than other muted text.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: meaningful uses move to base text-muted-foreground, not /80, because /80 still fails on glass (4.20:1). Three unmarked "·" separators in PhenoFightNight gain aria-hidden and stay faint (F3). The three uses in PlantManualSensorFreshnessCard are left to #2830 and allowlisted in the guard until it merges.
tried_and_rejected: /80 as the replacement (fails on glass).
commands: bunx vitest run src/test/muted-text-opacity-floor.test.ts
files_touched: 12 components/pages (see PR); src/test/muted-text-opacity-floor.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: drop the PENDING entry after #2830 merges
blockers: none
open_questions: none
gotchas: the guard reads className string literals inside cn(...) and template literals; a class built from a variable elsewhere is not seen.
links: docs/specs/contrast-tokens.md (#2827); #2830
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 19:20 CT, by Claude)
```
