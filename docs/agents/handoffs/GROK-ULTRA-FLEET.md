# GROK-ULTRA-FLEET

```text
TASK GROK-ULTRA-FLEET  priority: other  status: CLOSED
goal: Record the rebuilt Ultra Grok Bot fleet in the repo: the Ultra Relay seat (Roots) in the roster, one description file per Ultra seat, a secret-free fleet doc and manifest, and the [YES] / [HANDOFF] tags in OWNERSHIP 4.2, so any cold agent can rebuild the account and resume a dark bot's work from GitHub alone.
why: On 2026-11-05 Matthew deleted every Ultra bot and started fresh. Grok Bot usage is exhausted per account, and bot memory is per bot, so continuity must live in the repo, not in a bot. Matthew's decisions (10:17-10:23 CT): Roots holds Ultra Relay; Roots posts his yeses on PRs verbatim; bots wake only on repository triggers.
branch: claude/grok-ultra-fleet-setup
base: verdant-grow-diary
checkout: git fetch origin claude/grok-ultra-fleet-setup verdant-grow-diary && git switch claude/grok-ultra-fleet-setup && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2897 (draft)
head_sha: ea2448bae2b5a1defb6bce05a5dd03d48fc23023 is the validated docs commit (observed 2026-11-05 10:29 CT). The branch tip is this handoff stamp whose parent is that SHA; confirm with git rev-parse origin/claude/grok-ultra-fleet-setup
state: merged. PR #2897 merged 2026-11-05 18:35:21Z as 66134ba4ac5aed841ef882e1537a5a315e809a01 (squash of head 3df14bc310f9f6316e1b48080f2c3e1c4ca6cd97), merged_by cheekhimself
current_step: CLOSED. Last open step: queued 12:27 CT and merged 12:35 CT by cheekhimself with 35/35 required checks green at 3df14bc3 and Matthew's [YES] on the PR, but with no APPROVE review at that head and no [ROUTE]/[PRECHECK]/[MERGE] receipts; whether the actor was Matthew or a Main seat is NOT_MEASURED. Recorded, not hidden.
next_action: none; closed. Follow-ups live in their own tasks: roster change for OG Kush's retirement (Roots takes Coordinator; Steward Backup holder is Matthew's open decision), Q7 owner-only [YES] login, T5a and T9-T12 fleet receipts.
post_merge_check: NOT_APPLICABLE (docs only); the fleet itself is NOT_MEASURED until T5a, T9-T12 in docs/agents/grok-bot-fleet.md have dated receipts
active_writer: Claude session_017UoYKyV8KsaUHw4dJMbg16 on claude/grok-ultra-fleet-setup
decisions: Five Ultra bots, not more (usage pool is per account; extra bots add parallelism, not resilience). Handoff packet is the existing per-task file with head_sha, next_action, commands, session_state mandatory at every stop point. One scheduled routine on the account; all others GitHub-event triggered. Verifier seat is phase 2 and has no holder. The eighteen sentinel-versioned files are untouched, so no version bump.
tried_and_rejected: A separate handoff format (rejected: the HANDOFF_LOG template already requires a cold-start entry). Bot memory or /workspace as the record (rejected: unreadable by Main, Claude, Codex; dies with the account). Slack, Composio, Notion plugins on Ultra (rejected: blast radius on a shared computer).
commands: node scripts/assert-docs-safety.mjs; npx prettier --check docs/agents/grok-bot-fleet.md docs/agents/grok-bots/*.md docs/agents/grok-bot-fleet-manifest.json docs/agents/handoffs/GROK-ULTRA-FLEET.md docs/agents/constitution/roster.md docs/agents/OWNERSHIP.md; git diff --check; node scripts/check-sentinel-version-parity.mjs origin/verdant-grow-diary
files_touched: docs/agents/constitution/roster.md docs/agents/OWNERSHIP.md docs/agents/grok-bot-fleet.md docs/agents/grok-bot-fleet-manifest.json docs/agents/grok-bots/common.md docs/agents/grok-bots/ultra-builder.md docs/agents/grok-bots/ultra-fixer.md docs/agents/grok-bots/merge-steward.md docs/agents/grok-bots/ultra-relay.md docs/agents/grok-bots/ultra-verifier.md docs/agents/handoffs/GROK-ULTRA-FLEET.md
files_remaining: docs/agents/CURRENT_STATE.md receipt rows for T5a (gh auth status) and the fleet bootstrap, written by the Relay seat after the account is rebuilt; not this PR
blockers: none for the docs. Merge needs an independent Main reviewer verdict at the exact head and Matthew's per-item yes.
open_questions: Q7 (Codex security P2): create an owner-only GitHub identity for [YES] comments that no bot holds, and shrink the yes-author allowlist to it? Matthew's decision. Q3 plan tier (X Subscription shared pool vs separate Bot pool) decides whether cloud agents save usage; Q2 whether the 4.1 CI webhook routine is live and which bot owns it. Neither gates this PR.
gotchas: Live Ultra routines R1, R4, R5 were saved from the pre-fix text and must be re-saved by their bots to match this revision (R1 quoted scope, R4 canonical [SLICE] #N @sha form, R5 author exclusion + idempotency); that needs Matthew's yes to each bot. OWNERSHIP 4.2's heading still names GDP/Chemdawg (retired); left as is to keep this PR narrow. Roots and Moonbow appeared in receipts before this seat existed; Moonbow still has no seat.
links: docs/agents/grok-bot-fleet.md; claude.ai project doc claude/specs/grok-ultra-fleet-setup-2026-11-05.md
artifacts: validation output recorded in the PR body
reviewer_seat: Codex (chatgpt-codex-connector) code review 5789284532 at cfe22b27: 4 P2, superseded by the repair head. Independent acceptance still NOT_MEASURED; Main seat or Codex re-review at the new head.
reviewer_sha: cfe22b276b81ab63460691c387a4de0247e20f36 (Codex 4xP2, superseded)
session_state: Claude Code remote session; no cloud agent; no routine; pending human decision: none for the docs
claimed_by: Claude session_017UoYKyV8KsaUHw4dJMbg16, 2026-11-05 10:24 CT
owner: Claude (this session); default inheritor OG Kush
last_updated: 2026-11-05 12:38 CT, by Claude
```
