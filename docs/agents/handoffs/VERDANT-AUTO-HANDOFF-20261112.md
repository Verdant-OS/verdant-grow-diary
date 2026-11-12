# VERDANT-AUTO-HANDOFF-20261112

```text
TASK VERDANT-AUTO-HANDOFF-20261112  priority: other  status: OPEN
goal: Long Claude Code sessions get an automatic handoff prompt. A PostToolUse hook reads the session's context size from the transcript, tells the agent once when it crosses about 150k tokens to refresh its handoff entry and push, and tells it after a compaction to re-read that entry before trusting the summary.
why: Matthew asked for long-chat safeguards with an automatic handoff (2026-11-12). Compaction summaries are lossy, and a session that runs past its budget without a pushed handoff cannot be resumed (AGENTS.md section 12, handoff-procedure.md "Stop and retirement").
branch: claude/project-thread-6gtedg
base: verdant-grow-diary
checkout: git fetch origin claude/project-thread-6gtedg verdant-grow-diary && git switch claude/project-thread-6gtedg && git merge origin/verdant-grow-diary
pr: draft; read the URL from GitHub (head branch claude/project-thread-6gtedg)
head_sha: read the current head on GitHub (this block's commit is the first)
state: handoff entry written; implementation follows on the same branch.
current_step: build .claude/skills/verdant-auto-handoff/ (SKILL.md and context-mark.mjs), wire one PostToolUse hook in .claude/settings.json, add src/test/verdant-auto-handoff-hook.test.ts.
next_action: route an independent exact-head review once checks are green (not this Claude thread session).
post_merge_check: in a fresh Claude Code session on the deploy branch, the hook stays silent below the mark, prints one handoff reminder after context passes about 150k tokens, and prints a re-read reminder on the first tool call after a compaction.
active_writer: Claude thread session (Taproot), branch claude/project-thread-6gtedg
decisions: one hook key only (PostToolUse) as the coordinator asked; it covers both the mark and the post-compaction reminder, so no SessionStart or PreCompact key is added. The hook never blocks: it exits 0 on every path and prints nothing unless a mark fires. Per-session state lives in .claude/data/ (already gitignored). The existing PreToolUse scorer-lock hook is unchanged. .claude/settings.json is scorer-locked, so it is edited under a branch-bound scorer-lock unlock whose report goes in the PR body.
tried_and_rejected: SessionStart(compact) plus UserPromptSubmit (two hook keys; outside the one-hook-setting scope). UserPromptSubmit alone (misses long autonomous tool loops between messages).
commands: bunx vitest run src/test/verdant-auto-handoff-hook.test.ts src/test/scorer-lock-rules.test.ts --reporter=dot; node scripts/check-sentinel-version-parity.mjs origin/verdant-grow-diary; node scripts/scorer-lock.mjs --report
files_touched: docs/agents/handoffs/VERDANT-AUTO-HANDOFF-20261112.md
files_remaining: .claude/skills/verdant-auto-handoff/SKILL.md; .claude/skills/verdant-auto-handoff/context-mark.mjs; .claude/settings.json; src/test/verdant-auto-handoff-hook.test.ts
blockers: none
open_questions: none
gotchas: .claude/skills/ is governance scope (docs/agents/OWNERSHIP.md), so acceptance needs an eligible outside reviewer, not Graft's low-risk allowlist. It is not one of the eighteen Sentinel-Version files, so no version bump. Overlap check on 2026-11-12: PR 2933, the Chemdawg role-label branch and PRs 2922, 2923, 2928, 2934, 2936, 2938, 2940, 2941, 2946, 2947, 2948 touch no .claude/ file.
links: AGENTS.md section 12; docs/agents/constitution/handoff-procedure.md
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access; no merge, publish or production write authorized
claimed_by: Claude thread session (Taproot), 2026-11-12
owner: Claude
last_updated: 2026-11-12, by Claude thread session (Taproot)
```
