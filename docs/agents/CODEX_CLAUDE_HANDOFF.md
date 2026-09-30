# Codex + Claude ownership handoff (from Chemdawg), 2026-09-29 22:30 CT

From this point, Codex and Claude finish the open Verdant repo work without Chemdawg. Matthew is still the only person who publishes, applies SQL, or lifts a hold.

## Who owns what

**Codex is the writer.** It owns every code change on open PRs: fixes, base merges and PR descriptions. It never reviews or merges its own PR.

**Claude is the reviewer and merge owner.** It reviews Codex's PRs at the exact head SHA, runs the merge gate below, and enqueues merges. It never merges a PR it wrote itself. If Claude wrote a PR, Codex reviews it, and Matthew enqueues the merge.

## Merge gate (all of these must be true at the exact head SHA)

1. The PR is not a draft and targets `verdant-grow-diary`, not a stacked branch.
2. Every check is passing: 35/35 required, and no red or pending non-required check either. The dependency-audit job counts. If it's red only because the branch is behind, merge the base in first.
3. The reviewer (not the writer) has given a PASS or PASS-with-P2 with 0 P1 at that SHA, and there are no unresolved review threads or requested changes.
4. The PR isn't on the hold list.

Enqueue: `gh api -X PUT repos/Verdant-OS/verdant-grow-diary/pulls/N/merge-async -f sha=<full head> -f merge_action=merge_queue`.

Never force-push, rebase a pushed branch, publish, apply SQL, or touch production Supabase (knk). If the head moves after a review, the review is void; review it again.

## Holds (don't merge; Matthew only)

#1735, #1741, #1810 (migration/SQL stack); #1737; #1736; #1369. #1740 is never-merge until Codex's save/retrieve proof is final and green, and it gets a security-focused review.

## Open work ledger

| PR | State at handoff | Owner | Next step |
|---|---|---|---|
| #1761 | FAIL, 1 P1 at `dde3a9ec` (tent gating lets Training, Defoliation and Harvest save without a tent) | Codex | Follow the fix request comment on the PR: only Note, Photo and Issue save without a tent, add tests, merge the base, fix the PR body. Then Claude reviews. |
| #1816 | Draft at `aad349f9`, CI queued | Claude (watch only) | When a required check first fails, or all 35 finish, report to Matthew: the head SHA, any failed or missing contexts, whether native save/retrieve proves the new drop barrier, and the smallest next step. **Don't rerun it, mark it ready, merge it or change it without Matthew's approval.** |
| #1798 | PASS-with-P2 at `c076016c`; base merged, now at `d61f23c4` with CI running | Claude | Once all checks are green at `d61f23c4`, review again, mark ready, enqueue. |
| #1783 | Head keeps moving (EcoWitt multi-tent); CI pending | Codex, then Claude | Codex finishes the work and posts the final SHA. Claude reviews it and merges once green. |
| #1676 | Conflicts with tip `4a94ca27` | Codex | Merge the tip in with a normal merge commit and push. Then Claude reviews. |
| #1760 | Draft; shard 10 fails (`daily-check-active-grow-fallback.test.ts:93`) | Codex | Fix the test failure. |
| #1675 | Draft; CI pending | Claude | Review once green. |
| #1763 | 7 required checks fail; the Timeline wiring was asked of Copilot | Codex | Finish the wiring or close the PR. |
| #1815 | PR description check; no P1, CI pending | Claude | Merge once green with a counting PASS. Add it to required checks only after one green PR run and one green merge-queue run. |
| 23 branches updated after #1812 | CI rerunning | Claude | Sweep them on weekdays and review/merge any that clear the gate. |

## Weekday cadence

Weekdays at 9 AM CT, Claude sweeps the open, non-draft PRs against the gate, merges what passes, and posts a short status summary on this PR. Codex picks up any PR with a FAIL or conflict. At 8:45 PM CT, Claude tells Matthew whether the live site is behind the tip; publishing stays his call.
