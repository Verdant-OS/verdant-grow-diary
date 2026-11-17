# RULEBOOK-CLAUDE-SEAT-GATED-APPROVE-20261117

```text
TASK RULEBOOK-CLAUDE-SEAT-GATED-APPROVE-20261117  priority: other  status: OPEN
goal: Settle the two rulebook disagreements left open by the 2026-11-11 team ops audit (weak spot 3): the Claude role line, and AGENTS.md §11 APPROVE versus §13 COMMENT on gated pull requests.
why: Each disagreement can stop an agent and send the question back to the founder. The audit asked for one amendment pull request with the founder picking the answers. He picked both on 2026-11-17 in the authoring session.
branch: claude/rulebook-claude-seat-gated-approve
base: verdant-grow-diary
checkout: git fetch origin claude/rulebook-claude-seat-gated-approve verdant-grow-diary && git switch claude/rulebook-claude-seat-gated-approve && VERIFIED_SHA=$(git rev-parse origin/claude/rulebook-claude-seat-gated-approve) && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA"
pr: see the draft pull request opened from this branch (this entry was written before the first push)
head_sha: confirm origin/claude/rulebook-claude-seat-gated-approve and the pull request head before resuming. Baseline is c468bc90e83f4a7d2c1e15937d88e0e14a0da741.
state: pushed draft
current_step: draft pull request open; not marked ready
next_action: independent review by an eligible outside reviewer for governance scope (docs/agents/OWNERSHIP.md §4.3) at the exact head, then the founder's yes naming the pull request and SHA. The authoring session does not review, mark ready, enqueue or merge.
post_merge_check: on verdant-grow-diary after merge, node scripts/check-sentinel-version-parity.mjs reports one Sentinel-Version across 18 governance files. NOT_MEASURED until then.
active_writer: Claude Code session on claude/rulebook-claude-seat-gated-approve
decisions: Founder pick 1 ("Assigned work"): docs/agents/roles/claude.md opens with "No standing seat. A Claude session owns the build work assigned to it, and the Merge Steward queues eligible pull requests (Matthew, 2026-11-04). The roster names seat holders." in place of "Historical — no current seat." The wording comes from the Claude seat bullet in the "Start here" section of docs/agents/CURRENT_STATE.md. Founder pick 2 ("APPROVE after your yes"): AGENTS.md §13 gains one sentence, the step docs/agents/OWNERSHIP.md already states: after Matthew's yes the reviewer seat posts APPROVE at that commit, and that is the approval §11 waits for. Sentinel-Version is 2026-11-17.1 on all eighteen governed files, with a §17 changelog line. GEMINI.md's embedded copy was re-synced by script. The roster and OWNERSHIP.md are not edited, so this does not touch the files open pull request #2988 edits.
tried_and_rejected: Editing the roster's "Historical, no current seat" list (rejected: #2988 is the open roster change, and "no standing seat" agrees with the roster as it stands). Changing OWNERSHIP.md so reviewers APPROVE any clean pull request (rejected by the founder's pick). Running prettier --write on docs/agents/roles/claude.md (rejected: on a Windows checkout it rewrote every line ending; the file at the baseline gives the same prettier warning locally).
commands: node scripts/sync-sentinel-mirror.mjs --set-version=2026-11-17.1 ; node scripts/sync-sentinel-mirror.mjs --check (already in sync) ; node scripts/check-sentinel-version-parity.mjs (Sentinel-Version OK, 2026-11-17.1 across 18 governance files) ; npm run -s test:sentinel-governance (31 pass, 0 fail) ; bunx vitest run src/test/sentinel-mirror-prettier-fence.test.ts src/test/loop-engineering-doc.test.ts --reporter=dot (20 passed, 1 failed: loop-engineering-doc "exists with frontmatter name and description" reads .claude/skills/verdant-loop-habits/SKILL.md with CRLF line endings on this Windows checkout; that file is not changed here. Whether it fails on the baseline locally was not run; CI on Linux is the measure.)
files_touched: AGENTS.md, GEMINI.md, CLAUDE.md, .grok/rules/verdant-grok-role.md, docs/agents/README.md, docs/agents/HANDOFF_PROTOCOL.md, the twelve files in docs/agents/roles/, docs/agents/handoffs/RULEBOOK-CLAUDE-SEAT-GATED-APPROVE-20261117.md
files_remaining: none in this slice
blockers: governance scope needs an eligible outside reviewer and the founder's yes at the exact head. Any other pull request that bumps Sentinel-Version and merges first forces a fresh bump here.
open_questions: The Claude seat bullet in CURRENT_STATE.md says a roster pull request will reconcile the role file; #2872 closed unmerged. After this merges, that bullet can point here. Not edited in this slice. The third disagreement the audit listed (the Chemdawg merge-gate line) was settled by #2948.
gotchas: Stamp versions with the sync script, not by hand. Windows checkouts convert line endings; do not commit a whole-file line-ending rewrite.
links: docs/audits/team-ops-audit-2026-11-11.md (weak spot 3), PR #2948, PR #2988, PR #2959
artifacts: none
reviewer_seat: an eligible outside reviewer for governance scope per docs/agents/OWNERSHIP.md §4.3
reviewer_sha: none yet
session_state: founder picks were given through the session's question prompt on 2026-11-17; no GitHub comment posted; no workflow paused
claimed_by: Claude Code session, 2026-11-17 CT
owner: Claude Code session for this task
last_updated: 2026-11-17, by Claude Code
```
