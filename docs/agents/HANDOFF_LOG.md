# Verdant handoff log

Pointed to by AGENTS.md (Agent Handoff / Coverage). One block per in-flight task. Each block
lives in its own file, `docs/agents/handoffs/<TASK-ID>.md`; this file holds the template, the
procedure and the index (see "Where blocks live" below). Update your block daily and before
stopping. Selection follows AGENTS.md's priority order and oldest-update tie breaker.

This initial log records Codex's explicitly assigned current tasks. It does not claim that
every open PR has been accepted, reviewed or imported. Do not infer a holder from the PR author.
Owner locks remain binding even when a block is unclaimed or older than 24 hours.
Remote heads in the blocks are observations at their named times; confirm them before resuming.
An unpushed candidate is not a remote head and must never be treated as hosted CI evidence.

## Template

A cold agent (Claude Code, Codex, Cursor, or Grok) must be able to take the next step
from this entry, the PR, and the repo, with no chat history. Use plain repo paths, full
SHAs, and URLs. Do not write "as discussed" or "per my earlier message".

```text
TASK <id>  priority: publish-gate | P1 | P2 | other  status: OPEN | CLOSED
goal:
why:
branch: codex/<task-id>-<slug> for new Codex tasks; preserve existing names
base: verdant-grow-diary or the recorded parent branch
checkout: git fetch origin <branch> <base> && git switch <branch> && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/<base>
pr: URL or NOT_MEASURED
head_sha: full exact remote SHA, with observation time
state: implemented / local only / pushed draft / CI / review / merged / live measured
current_step:
next_action: the single smallest next step a cold agent can run
post_merge_check: the check that reopens this work with the same owner if it fails after merge; or NOT_APPLICABLE
active_writer: the branch holder; only that holder pushes; nobody edits another holder's branch
decisions: what was decided, and the reason for each
tried_and_rejected: what was tried, and why it was rejected
commands: exact commands to reproduce the current state and run the relevant tests
files_touched: repo paths
files_remaining: repo paths still to touch
blockers: blocker and who can clear it
open_questions:
gotchas:
links: review, issue, and run URLs
artifacts: repository paths or PR/check URLs; local receipts may supplement them
reviewer_seat:
reviewer_sha: full SHA the current review or human go-ahead covers; never an older SHA
session_state: cloud agent ids, routines, paused workflows, pending human decisions
claimed_by: agent and date/time/zone, or empty
owner: current owner; on retirement, transfer the CURRENT_STATE row (default inheritor: OG Kush)
last_updated: YYYY-MM-DD HH:MM CT, by agent
```

Before stopping, run the cold start test: a fresh agent reading only the PR, this
entry, and the repo can take `next_action`. The matching PR comment starts with
`resume here` and repeats goal, why, decisions, rejected attempts, commands, files
touched and remaining, open questions, gotchas, links, and the exact head SHA.
Retirement adds a `handed off: <agent>, <YYYY-MM-DD HH:MM> UTC` comment on the PR.

Before the checkout command, run `git fetch origin <branch> <base>`, then compare the
freshly fetched `git rev-parse origin/<branch>` with head_sha as AGENTS.md (Agent Handoff /
Coverage) describes: equal, continue; ahead (it equals the PR's current head and head_sha
is its ancestor), adopt that head and name it in your claim; diverged or rewritten, stop
and reconcile. Then set `VERIFIED_SHA` to the SHA that passed that check
(`VERIFIED_SHA=<sha>`). `--ff-only` never moves past the verified head, and the `test` stops
the command unless `HEAD` then equals it exactly, so neither a stale local copy nor a local
branch with unpushed commits can stand in for the verified head. Any mismatch invalidates the block's
current-head CI/review claims: refresh the block and preserve the existing branch. Never
rename, recreate or force-push.
Use the original base and declared closed scope. The example command assumes no other
active checkout has the branch open; inspect worktree ownership before selecting a checkout.

## Where blocks live

Every task block is its own file: `docs/agents/handoffs/<TASK-ID>.md`. The file holds the
`### <TASK-ID>` heading and the fenced block in the template's shape. The ID in the file name
matches the block's `TASK <TASK-ID>` line.

- Create or update only your own task's file. Never edit another holder's block.
- Never add task blocks to this file. One file per block means two pull requests never edit the
  same lines, so a merge no longer makes every other open branch conflict here.
- Open or closed is the block's `status:` line. Closing a task updates its file in place; the
  file is not moved or deleted.
- List the open blocks in a checkout: `grep -l "status: OPEN" docs/agents/handoffs/*.md`.
- From the deploy branch without checking it out:
  `git grep -l "status: OPEN" origin/verdant-grow-diary -- docs/agents/handoffs/`.

Three legacy files carry historical merge damage and are kept byte for byte, not repaired:
`CREATE-DIALOG-DISABLED-REASON.md` also holds the `QUICK-LOG-TARGET-SAVE` task,
`TIMELINE-GROW-DAY-2005.md` also holds `DASHBOARD-SINGLE-LOG-ENTRY`, and
`VER-288-SERVED-BUILD-BASELINE.md` names its task `VER-288`.

## Coverage not yet imported

The completed read-only snapshot at 2026-09-28 23:40 UTC covered 61 open PR heads:
17 had a failing check, 17 had pending checks, and 35 had all 35 source-pinned
required contexts successful. Those categories overlap; none is independent acceptance.
#1778 was opened afterward. Other agents' in-flight claims and full task context remain
NOT_MEASURED here; do not infer them from PR authors or replace active work without a claim.

The standing holds include #1250, #1369, #1625, #1727, #1735, #1737 and #1740 NEVER MERGE.
#1741/#1745 retain production-database approval holds; #1742/#1658 remain locked.
No stale or unclaimed block releases these locks. Follow OWNERSHIP for role seats.
