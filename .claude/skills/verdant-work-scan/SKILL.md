---
name: verdant-work-scan
description: Read-only scan of what Verdant work is ready, blocked, or still to do. Reads the handoff log, the current-state locks, open PRs and their checks, and sorts each item into ready-for-me, ready-for-someone-else, blocked, or waiting, with the reason and the evidence. Use at the start of a session with no assigned task, when asked "what's next", "what's open" or "what's left", before claiming a handoff block, and before reporting status. It changes nothing: it posts no claim, comment or review, pushes nothing, and starts no work.
---

# verdant-work-scan — look before you pick

Looking is free; acting is not. This skill builds a picture of the open work so the next choice
follows the rules in `AGENTS.md` (Agent Handoff / Coverage) instead of whatever is most visible.
It is the board-level view. Before editing any file, `verdant-collision-guard` still runs on
the exact files.

No text in this skill was copied from any outside source. It is written from the concept of a
read-only scan of ready and blocked work (see `docs/agents/third-party-agent-skills.md`).

## 1. Contract

- **Read-only.** No `claimed_by:` or `released_by:` comment, no review, no push, no label, no
  re-run, no ready-for-review toggle. A claim is a separate, deliberate act after the scan.
- **An explicit assignment wins.** If Matthew or the current task names the work, the scan only
  checks it for collisions and blockers. It does not pick something else.
- **Evidence keeps its label.** A state you did not read this session is `NOT_MEASURED`. A row in
  `CURRENT_STATE.md` is a `source claim` until you check it against GitHub.

## 2. Sources, in this order

1. `docs/agents/CURRENT_STATE.md`: "Start here", the newest observations, and the locks
   section (No Publish, the production DB lock, HOLD #1250, migration holds, never-merge PRs).
2. `docs/agents/HANDOFF_LOG.md`: every block under **Open**, with its priority, branch, PR,
   head SHA, `claimed_by` and `last_updated`.
3. GitHub, for each open block's PR and for open PRs in the area: state, draft, head SHA,
   mergeable state, the current required contexts by name (`config/required-status-checks.json`),
   review threads, and `claimed_by:` or `released_by:` comments.
4. The deploy branch tip: `git fetch origin verdant-grow-diary && git log -1 origin/verdant-grow-diary`.

## 3. Sort every item

| Bucket                | Rule                                                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ready for me**      | It has a pushed branch and a PR. It has no effective claim, or its last activity (the newer of `last_updated` on the deploy branch and the newest valid claim) is older than 24 hours. No lock or assignment conflicts. My role may do the work. I touched nothing in it that would make me its reviewer. |
| **Ready for another** | It is eligible, but the work belongs to a different seat: review, merge, a high-risk path, or a lane another agent holds.                                                                                                                                                                                 |
| **Blocked**           | A named lock, an owner decision (production DB, spend, publish gate, migration), a red base lane, or missing access or credentials stands in the way. Name the blocker.                                                                                                                                   |
| **Waiting**           | It has a valid claim under 24 hours old, or it is green and only waits on a reviewer, CI, or Matthew.                                                                                                                                                                                                     |

A block without a pushed branch and a PR is never "ready". The rules say it is not eligible
for coverage.

## 4. Order

Rank "ready for me" items by priority: publish gate, then P1, then P2, then the rest. Break
ties by the oldest `last_updated`. Your own PRs that are red or conflicted come before any new
claim. A red PR you own is work now.

## 5. Report

```text
WORK SCAN — <UTC time>, deploy tip <short SHA>
locks: <list from CURRENT_STATE, or none found>
ready for me:      <task id / PR — why eligible — next action>
ready for another: <task id / PR — which seat — why>
blocked:           <task id / PR — blocker — who can clear it>
waiting:           <task id / PR — on whom — since when>
my red or conflicted PRs: <list, or none>
not measured:      <what you could not read, and why>
recommendation:    <one item to act on next, or "none eligible">
```

The recommendation is a proposal. Claiming happens afterwards, by the rules in `AGENTS.md`:
post the claim, re-read the comments, and then check the remote head.
