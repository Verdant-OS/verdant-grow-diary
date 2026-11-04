# CLAUDE-MD-NPM-LOCK-RETIRED

```text
TASK CLAUDE-MD-NPM-LOCK-RETIRED  priority: other  status: OPEN
goal: Stop CLAUDE.md from calling package-lock.json a "synchronized compatibility lock". #1873 retired it; bun.lock is the only lockfile and package-lock.json is forbidden.
why: The architecture contract audit of 2026-11-04 (deploy tip e3ecc2b2214314526c9149000ac5932351fd82cd) found the stale wording in CLAUDE.md "Repository operating facts" and "Daily commands". Every Claude session loads CLAUDE.md, so the stale wording teaches a retired setup. Matthew asked for this slice.
branch: claude/claude-md-npm-lock-retired
base: verdant-grow-diary (merged in at cae980f53c938c45dc260f9ced13fb38e5b3e242, #2860)
checkout: git fetch origin claude/claude-md-npm-lock-retired verdant-grow-diary && git switch claude/claude-md-npm-lock-retired && git merge --ff-only origin/claude/claude-md-npm-lock-retired && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2853 (ready for review)
head_sha: the base merge of cae980f5 into 8914868cb66cf1c05dec7e83327ae43afc131229. A commit cannot name its own SHA; read the current head from the PR. Earlier reviewed head: 8914868cb66cf1c05dec7e83327ae43afc131229.
state: review. Every gate recorded at 8914868c (Reviewer D verdict, 35/35 CI, Matthew's merge yes) is void at the new head.
current_step: #2860 (Sentinel-Version 2026-11-04.2, per-task handoff files) merged and conflicted with all 18 governance files. Merged the base, took the base side of every conflict, re-applied the two CLAUDE.md edits and the AGENTS.md §17 line, and re-bumped all 18 files to 2026-11-04.3. Moved this block from HANDOFF_LOG.md into this file under #2860's rule; HANDOFF_LOG.md now equals the base.
next_action: Fresh Reviewer D exact-head review, 35/35 required checks, and Matthew's merge yes at the new head. Then the Merge Steward queues it.
post_merge_check: on the merged tip, `grep -c "synchronized compatibility lock" CLAUDE.md` returns 0, and `node scripts/check-sentinel-version-parity.mjs` reports one version across 18 files
active_writer: Claude session_017UoYKywiErQ3bEQMo9dYGe
decisions: Wording only; no rule changes. The text cites #1873 rather than a date, because config/dependency-lockfile-transition.json (approved 2026-10-04) and scripts/check-bun-lockfile-policy.mjs (retired 2026-10-03) give different dates. AGENTS.md §17 carries the changelog line that §0.2 requires, now as 2026-11-04.3 above #2860's 2026-11-04.2.
tried_and_rejected: Folding this into the architecture-contract restamp. Rejected: a governance edit needs the 18-file bump and an outside reviewer, while the restamp is docs-only.
commands: node scripts/sync-sentinel-mirror.mjs --set-version=2026-11-04.3 ; node scripts/check-sentinel-version-parity.mjs origin/verdant-grow-diary ; node scripts/check-bun-lockfile-policy.mjs ; node scripts/assert-docs-safety.mjs ; bunx vitest run $(grep -rlE "CLAUDE\.md|Sentinel-Version|AGENTS\.md|GEMINI\.md|HANDOFF_LOG|handoffs/" src/test --include=*.test.ts)
files_touched: CLAUDE.md, AGENTS.md (§17 and the version line), GEMINI.md (version line and mirror), .grok/rules/verdant-grok-role.md, docs/agents/README.md, docs/agents/HANDOFF_PROTOCOL.md, docs/agents/roles/*.md (12 files), docs/agents/handoffs/CLAUDE-MD-NPM-LOCK-RETIRED.md (this file)
files_remaining: none
blockers: Reviewer D re-review at the new head; Matthew's merge yes at the new head.
open_questions: none
gotchas: (1) If any other governance PR merges first, this PR needs another re-bump (a new N for the date) and a GEMINI.md re-sync. (2) The old block in HANDOFF_LOG.md was never on the base, so nothing remains there; this file is the only record.
links: Grok route (superseded) https://github.com/Verdant-OS/verdant-grow-diary/pull/2853#issuecomment-6622425459 ; Reviewer D route https://github.com/Verdant-OS/verdant-grow-diary/pull/2853#issuecomment-6623286753 ; verdict at 8914868c https://github.com/Verdant-OS/verdant-grow-diary/pull/2853#issuecomment-6626312426 ; #1873 ; #2860
artifacts: PR #2853 check runs; no local receipts
reviewer_seat: Reviewer D (transfer 1 of 1 already used; author excluded: Claude session_017UoYKywiErQ3bEQMo9dYGe)
reviewer_sha: 8914868cb66cf1c05dec7e83327ae43afc131229 (superseded; needs re-review)
session_state: PR activity subscription and a safety-net check-in in the author session; no paused workflows; pending human decision: Matthew's merge yes at the new head
claimed_by: Claude session_017UoYKywiErQ3bEQMo9dYGe, 2026-11-03 22:15 CT
owner: Claude session_017UoYKywiErQ3bEQMo9dYGe
last_updated: 2026-11-04 09:30 UTC, by Claude
```
