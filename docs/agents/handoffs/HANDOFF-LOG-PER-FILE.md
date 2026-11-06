# HANDOFF-LOG-PER-FILE

```text
TASK HANDOFF-LOG-PER-FILE  priority: other  status: CLOSED
closed: merged. #2860 merged into verdant-grow-diary on 2026-11-04 as cae980f53c938c45dc260f9ced13fb38e5b3e242 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Stop pull requests colliding in docs/agents/HANDOFF_LOG.md by giving each task its own handoff file.
why: 28 of 34 open PRs edited the log on 2026-11-04. #2836, #2830, #2839 and #2824 were all removed from the merge queue at 06:01 UTC for conflicts in that file alone. In a sample of 60 PRs updated since 2026-11-01, the queue recorded 13 merge_conflict removals against 29 merges.
branch: claude/handoff-log-per-file
base: verdant-grow-diary
checkout: git fetch origin claude/handoff-log-per-file verdant-grow-diary && git switch claude/handoff-log-per-file
pr: NOT_MEASURED until opened; the PR is the current record
head_sha: NOT_MEASURED here; use the PR's current head
state: pushed draft
current_step: Waiting for review at the exact head.
next_action: Route the PR to an eligible reviewer at its exact head.
post_merge_check: A new PR adds docs/agents/handoffs/<TASK-ID>.md, leaves HANDOFF_LOG.md untouched, and merges with no log conflict. Failure reopens this work with the same owner.
active_writer: Claude session ce09a2e9-9fcc-42f2-9613-36ffc1d80911
decisions: Leave existing blocks in the log, because moving them would conflict with all 28 open PRs. Keep role-file gate wording, because AGENTS.md section 12 defines the log as both locations. Leave the OWNERSHIP.md low-risk lane alone, because widening review authority is Matthew's decision.
tried_and_rejected: Migrating all blocks now (rejected, see decisions). A merge=union attribute (rejected, whether GitHub honors it on queue merges is NOT_MEASURED). A CI gate rejecting log edits (deferred, it would evict open PRs that still carry log hunks).
commands: node scripts/check-sentinel-version-parity.mjs; node --test scripts/check-sentinel-version-parity.test.mjs
files_touched: docs/agents/handoffs/README.md; docs/agents/handoffs/HANDOFF-LOG-PER-FILE.md; docs/agents/HANDOFF_LOG.md; docs/agents/constitution/handoff-procedure.md; .claude/skills/verdant-collision-guard/SKILL.md; the eighteen versioned governance files
files_remaining: none
blockers: Reviewer APPROVE at the exact head and Matthew's yes.
open_questions: Whether the OWNERSHIP.md low-risk lane should cover docs/agents/handoffs/. #2853 also touches all eighteen governed files, so whichever lands second needs a new Sentinel bump.
gotchas: Each open PR that carries a log hunk must move it to its own file at its next base merge.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2836
artifacts: none
reviewer_seat: none yet
reviewer_sha: none yet
session_state: Matthew asked for this in Claude session ce09a2e9-9fcc-42f2-9613-36ffc1d80911 on 2026-11-04.
claimed_by: Claude session ce09a2e9-9fcc-42f2-9613-36ffc1d80911, 2026-11-04 00:30 CT
owner: Claude session ce09a2e9-9fcc-42f2-9613-36ffc1d80911
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-04 00:30 CT, by Claude)
```
