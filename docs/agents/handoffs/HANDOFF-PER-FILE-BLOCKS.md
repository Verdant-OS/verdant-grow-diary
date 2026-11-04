### HANDOFF-PER-FILE-BLOCKS

```text
TASK HANDOFF-PER-FILE-BLOCKS  priority: other  status: OPEN
goal: Move every handoff block out of docs/agents/HANDOFF_LOG.md into its own file, docs/agents/handoffs/<TASK-ID>.md, so a merge no longer makes every open branch conflict on the log.
why: Every PR inserted its block at the top of ## Open; each merge then conflicted all other open branches and invalidated their reviews (16 branches at once on 2026-11-04). Matthew approved the move in chat on 2026-11-04 ("yes").
branch: claude/handoff-per-file-blocks
base: verdant-grow-diary
checkout: git fetch origin claude/handoff-per-file-blocks verdant-grow-diary && git switch claude/handoff-per-file-blocks
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: split committed.
current_step: draft PR open.
next_action: Matthew names reviewer and gate; route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ).
post_merge_check: after the next merge to the deploy branch, open PRs that only add their own handoff file do not conflict.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: HANDOFF_LOG.md keeps its path as template + index, so the 18 sentinel-versioned governance files that reference it stay true unedited (no Sentinel-Version bump). All 106 blocks (open and closed) moved byte for byte; the file name is the block's ### heading. Three legacy blocks with historical merge damage (CREATE-DIALOG-DISABLED-REASON, TIMELINE-GROW-DAY-2005, VER-288-SERVED-BUILD-BASELINE) moved unrepaired and are named in the log and in the guard's frozen list. Non-governed docs and skills that said where blocks live now point at docs/agents/handoffs/.
tried_and_rejected: appending at the end of ## Open (still conflicts on the shared insertion point); a .gitattributes union merge (GitHub's server-side merge and merge queue do not apply custom merge attributes).
commands: bunx vitest run src/test/handoff-blocks-per-file.test.ts src/test/loop-engineering-doc.test.ts; node scripts/check-sentinel-version-parity.mjs origin/verdant-grow-diary
files_touched: docs/agents/HANDOFF_LOG.md; docs/agents/handoffs/*.md (107); docs/agents/constitution/handoff-procedure.md; docs/agents/loop-engineering.md; .claude/skills/verdant-collision-guard/SKILL.md; .claude/skills/verdant-loop-habits/SKILL.md; src/test/handoff-blocks-per-file.test.ts
files_remaining: none in this PR. After it merges, each open branch that added a block to HANDOFF_LOG.md conflicts once and must move its block into its own file.
blockers: none
open_questions: whether to also update the governed files' wording to name docs/agents/handoffs/ (needs an 18-file Sentinel-Version bump; deliberately out of scope here).
gotchas: the guard rejects any TASK line in HANDOFF_LOG.md other than the template's.
links: none
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-04 00:55 CT, by Claude
```
