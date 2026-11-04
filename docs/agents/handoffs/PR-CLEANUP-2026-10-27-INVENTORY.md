### PR-CLEANUP-2026-10-27-INVENTORY

```text
TASK PR-CLEANUP-2026-10-27-INVENTORY  priority: other  status: OPEN
goal: Matthew's open-PR cleanup, whose program goal is zero open PRs. Phase 1 (done) was a read-only inventory of every open PR with a proposed disposition. Each later phase (closes, consolidations, survivor repair) runs only on Matthew's approval.
why: 127 open PRs (2026-10-27); many are superseded, stale, or test follow-ups whose parent merged.
branch: claude/new-session-wp1j5i (the session-bound branch; the cleanup prompt named claude/pr-cleanup-inventory, and the session binding wins)
base: verdant-grow-diary at a18cb8479c8dd150c6e3c9b1147bb82c75ebac24
checkout: git fetch origin claude/new-session-wp1j5i verdant-grow-diary && git switch claude/new-session-wp1j5i && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2556 (ready for review; Matthew marked it ready on 2026-10-27)
head_sha: 91d396fd2d34fc8b4f1b812d4232c91fb3431901, observed on origin/claude/new-session-wp1j5i at 2026-10-28T01:45Z (35/35 required green there); the commit that records this line moves the head past it, so re-read the PR head before any current-head claim
state: pushed, ready for review, docs only. The governance change (CLAUDE.md session-recovery block and the 2026-10-27.1 bump in 175cfbd15) was withdrawn on Matthew's approval in e35c49a0d and a79d0a1ae: all 18 governance files match base at 2026-10-26.2, and the PR changes only docs/agents/pr-cleanup-2026-10-27.md and this block. The context-recovery hook writes to ~/.claude/CLAUDE.md instead (a container-local patch, not durable).
current_step: Phases 1, 2 and 3 done. Phase 2: #2226 #2214 #2182 #1951 #1955 #1980 closed as superseded and #2372 #2299 closed as stale, each on Matthew's approval; he kept #1986 #2010 #2024 #2333 #1904 #1902. Phase 3 (approved 2026-10-28): draft consolidation PRs #2575 sensors, #2576 community, #2577 timeline, #2578 quick-log, #2579 plants, #2580 other. 2026-10-28 decisions from Matthew: this session holds #2032; the harvest CI wiring (b79785ff1), the second scorer unlock (growAdapters.test.ts, vpd-stage-missing-badge-gates.test.ts) and the regression-test deferral are confirmed and recorded in the #2032 body. #2032 head 4c0d71b6587 merges base 30d6d9643 (Settings.tsx and QuickLogAllActivitiesSection.tsx conflicts resolved). #1979 head 72aa1cf68 merges base (Settings.tsx).
next_action: Do not repeat the Phase 2 closes or re-open Phase 3 work. Drive #2575-#2580 and #2032 to green; close each folded source PR, with a comment, only after its consolidation merges. Phase 4 (survivors) needs Matthew's approval.
post_merge_check: NOT_APPLICABLE (inventory doc; not a feature)
active_writer: Claude session session_017UoYKyHCyHbSMw6VpDj2mb
decisions: Hands-off PRs (OG Kush) and holds (#2539 #2532 #2252) left untouched. Test-only follow-ups fold into area consolidation PRs, or into their still-open parent. Product fixes are never folded into test consolidations. Protected-scope PRs go to Matthew.
tried_and_rejected: gh pr list (GH_TOKEN reported invalid for gh auth, though gh api reads worked); metadata came from the GitHub MCP instead. Single-agent semantic review of all PRs was rejected for context size; batched read-only subagents plus git evidence were used.
commands: git fetch origin '+refs/pull/*/head:refs/remotes/pr/*'; git merge-tree --write-tree origin/verdant-grow-diary refs/remotes/pr/<n>; gh api repos/Verdant-OS/verdant-grow-diary/commits/<sha>/check-runs?per_page=100&page=<k>
files_touched: docs/agents/pr-cleanup-2026-10-27.md; docs/agents/HANDOFF_LOG.md (this block only)
files_remaining: Phase 5 report appended to docs/agents/pr-cleanup-2026-10-27.md
blockers: #2032's regenerated Supabase types for badge_evidence.harvest_id are BLOCKED in this container: there's no Docker daemon and no Supabase CLI for `bun run sb:types:local`, production lacks migration 20261027235500, and types.ts must not be hand-edited.
open_questions: Needs Matthew: (1) #2140 is NOT a duplicate (corrected 2026-10-28): it drops the plants.health NOT NULL and the 'unknown' default that 20260924120000 set, so keep it or close it as a product call; (2) Phase 4 go-ahead; (3) where to run the #2032 type generation.
gotchas: A green 35/35 at a head 100+ commits behind base is not current; the strict up-to-date policy re-runs CI after a base merge. #2333 carries a product security commit (98f48c08a) that must be checked before closing.
links: docs/agents/pr-cleanup-2026-10-27.md
artifacts: docs/agents/pr-cleanup-2026-10-27.md
reviewer_seat: an eligible independent session routed by OG Kush; not this session
reviewer_sha: none yet
session_state: Claude cloud session; self check-in trig_01Qi9RH9aH5Dg64ZSU1XiQUL (2026-10-28T02:09Z); subscribed to #2556 #2032 #2575-#2580; no paused workflows; pending human decisions: open_questions
claimed_by: Claude, 2026-10-27 12:13 CT (first commit of this block, e99de0741; session_017UoYKyHCyHbSMw6VpDj2mb)
owner: Claude (default inheritor OG Kush)
last_updated: 2026-10-27 21:05 CT, by Claude
```
