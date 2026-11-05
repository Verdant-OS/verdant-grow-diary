# GROK-FLEET-WAKE-BASELINE

```text
TASK GROK-FLEET-WAKE-BASELINE  priority: other  status: OPEN
goal: Verify the Ultra fleet wake wiring, prepare an exact consistency patch for the roster and the Ultra Fixer (Brachs) instructions, and set a baseline from the current routine definitions and one evidenced end-to-end handoff.
why: Matthew approved items 1 and 3 on 2026-11-05 ("Approve preparing an exact consistency patch for the roster and Brachs' instructions, verifying the wake wiring before proposing changes." / "Approve establishing a baseline from current routine definitions and one evidenced end-to-end Verdant handoff."). Item 2 (Projects Manager's Verdant delivery responsibility) has no repository source and is a pending owner decision, not in this file.
branch: claude/zen-wright-a2mhbw
base: verdant-grow-diary at 66134ba4ac5aed841ef882e1537a5a315e809a01
checkout: git fetch origin claude/zen-wright-a2mhbw verdant-grow-diary && git switch claude/zen-wright-a2mhbw && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA"
pr: draft, see the PR on branch claude/zen-wright-a2mhbw
head_sha: this commit cannot embed its own SHA; read git rev-parse origin/claude/zen-wright-a2mhbw
state: draft
current_step: Audit and baseline written to docs/agents/grok-bot-fleet-baseline.md. The patch is proposed in its section 3 and not applied.
next_action: Matthew answers D1-D4 in docs/agents/grok-bot-fleet-baseline.md section 4 and says whether the five mechanical hunks in section 3 go in this PR or a separate one.
post_merge_check: NOT_APPLICABLE (docs only). Fleet behaviour stays NOT_MEASURED until T5a and T9-T12 receipts exist.
active_writer: Claude session_017UoYKvmvXoZiYSxmiEBcuv on claude/zen-wright-a2mhbw
decisions: Patch proposed, not applied, because seat files are read live by the bots (common.md START-HERE) and three of the defects need owner decisions. Baseline handoff is #2856: closed task file, reviewed head equals final head, independent review session recorded. Did not touch docs/agents/handoffs/GROK-ULTRA-FLEET.md (open PR #2901 closes it).
tried_and_rejected: Applying the roster line 41 rewording (rejected: it changes what the Relay may do; Matthew's call, D3).
commands: node scripts/assert-docs-safety.mjs; npx prettier --check docs/agents/grok-bot-fleet-baseline.md docs/agents/handoffs/GROK-FLEET-WAKE-BASELINE.md; git diff --check origin/verdant-grow-diary; node scripts/check-sentinel-version-parity.mjs origin/verdant-grow-diary
files_touched: docs/agents/grok-bot-fleet-baseline.md; docs/agents/handoffs/GROK-FLEET-WAKE-BASELINE.md
files_remaining: if approved, docs/agents/grok-bots/ultra-fixer.md, docs/agents/grok-bots/ultra-builder.md, docs/agents/OWNERSHIP.md, docs/agents/grok-bot-fleet.md, docs/agents/grok-bot-fleet-manifest.json
blockers: Live Grok account state (routines R1, R4, R5 re-save; T5a, T9-T12) is unreadable from this session: BLOCKED.
open_questions: D1-D4 in the baseline file; Projects Manager definition (item 2).
gotchas: The #2856 baseline shows the PR enqueued at 23:22:47Z, 6 min 15 s before the PASS review at 23:29:02Z, and marked ready by verdant-ultra-bot. Those are recorded as baseline FAILs, not re-litigated.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2856 ; https://github.com/Verdant-OS/verdant-grow-diary/pull/2897 ; https://github.com/Verdant-OS/verdant-grow-diary/pull/2901
artifacts: docs/agents/grok-bot-fleet-baseline.md
reviewer_seat: none requested yet; any eligible non-contributing Main reviewer (docs-only)
reviewer_sha: none
session_state: Claude Code remote session; no cloud agent; no routine; uncommitted: none; pending human decision: D1-D4 and item 2
claimed_by: Claude session_017UoYKvmvXoZiYSxmiEBcuv, 2026-11-05
owner: Claude (this session); default inheritor OG Kush
last_updated: 2026-11-05, by Claude
```
