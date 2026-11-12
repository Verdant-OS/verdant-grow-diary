# REMOVE-RETIRED-CHEMDAWG-REVIEWER

```text
TASK REMOVE-RETIRED-CHEMDAWG-REVIEWER  priority: P2  status: OPEN
goal: Live agent instruction text stops routing to the retired Chemdawg / Grok 91 name. Each mention that meant a current duty now names the seat (Merge Readiness, the Coordinator or the Merge Steward), and the roster gains stable labels so instruction files never need a bot name.
why: Matthew, 2026-11-12 (relayed by the coordinator): agents kept waiting on Chemdawg, which has been retired for weeks ("our Achilles heel the past month"). He asked for routing by role, with labels like Reviewer A/B and Writer A/B, because he renames bots (UK Cheese was once named Chemdog).
branch: claude/remove-retired-chemdawg-reviewer-4u1yxl
base: verdant-grow-diary @ c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8, stacked on #2933's head 29c958fc813763d573d42a6bf6fb89300b88ae5c
stacking: built on top of #2933 because both touch the eighteen governance files and the sentinel version. Merge #2933 first. If #2933's head moves, merge it into this branch; never rebase or force-push.
checkout: git fetch origin claude/remove-retired-chemdawg-reviewer-4u1yxl verdant-grow-diary && git switch claude/remove-retired-chemdawg-reviewer-4u1yxl && git ls-remote origin claude/remove-retired-chemdawg-reviewer-4u1yxl  # compare with the PR head before trusting any review
pr: see the draft PR for this branch (a file cannot hold its own PR link before it exists)
head_sha: the commit that adds this file; a file cannot hold its own SHA. Verify with git ls-remote.
state: pushed draft; awaiting independent exact-head review
next_action: an eligible independent reviewer (see exclusions) reviews the full head; then Matthew's per-item yes and the Merge Steward, after #2933 merges. Builder seats do not mark ready, enqueue or merge.
post_merge_check: NOT_APPLICABLE for app behavior (docs only). After merge, grep the deploy branch's live instruction files for "Chemdawg" and "Grok 91"; only historical sections, the roster's rename note and the changelog should remain.
active_writer: Claude session_017UoYKvVZYWXWayQWJ9z81a
decisions:
  - Treated Chemdawg as a renamed seat, not a deleted one (coordinator guidance). Each live mention now names the duty it meant: pre-check and CI verdicts go to Merge Readiness, reviewer assignment to the Coordinator, merging to the Merge Steward.
  - Roster gains "Stable labels" (Writer A/B, Fixer, Reviewer A-D, Main lead, Ultra lead, Merge Steward, Merge Readiness, Steward Backup, QA) and "Rename history". Holders stay only in the roster.
  - Header paragraph in CLAUDE.md, the Grok rule file and the claude, codex and grok role files now reads "The merge gate still requires ... seats are named only in the roster."
  - Sections marked "kept word for word" or "Historical routing" are untouched (HANDOFF_PROTOCOL.md, README.md, roster "Historical", OWNERSHIP.md historical profile and receipts).
  - Sentinel-Version bumped to 2026-11-12.1 on all eighteen files; GEMINI.md mirror re-synced; AGENTS.md section 17 entry added.
  - The roster holder for Coordinator was not changed (roster says OG Kush; Matthew's message names UK Cheese as the Main lead). Recorded as an open question for Matthew.
tried_and_rejected: replacing the header in HANDOFF_PROTOCOL.md and README.md historical blocks (reverted: those blocks are kept word for word); renaming roles/chemdawg.md (scripts and tests pin the filename).
commands: node scripts/sync-sentinel-mirror.mjs --set-version=2026-11-12.1 ; node scripts/sync-sentinel-mirror.mjs ; node scripts/sync-sentinel-mirror.mjs --check ; node scripts/check-sentinel-version-parity.mjs c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8 ; node scripts/check-sentinel-version-parity.mjs 29c958fc813763d573d42a6bf6fb89300b88ae5c ; the parity test and the docs-safety asserts
validation: mirror --check in sync (exit 0); parity vs c03ea6fd OK; parity vs 29c958fc OK; parity test fail 0; docs-safety PASS; no test, script, e2e or config file pins any removed line. vitest, eslint and build NOT_MEASURED locally (bun install returns 403 here); CI's 35 required checks are the gate.
files_touched: AGENTS.md; CLAUDE.md; GEMINI.md; .grok/rules/verdant-grok-role.md; docs/agents/README.md and HANDOFF_PROTOCOL.md (version line only); docs/agents/OWNERSHIP.md; docs/agents/claude-slices.md; docs/agents/constitution/roster.md; docs/agents/roles/*.md (twelve; content changes in claude, codex, grok, verdante, canopy; version line in the rest); .agents/skills/verdant-exact-sha-review/SKILL.md; docs/production-only-verification-runbook.md; this file (new)
files_remaining: none
out_of_scope: code and CI that still say Chemdawg (.github/workflows/claude-slices.yml, plugins rules.ts) - the brief allows no code or CI change; the roles/chemdawg.md filename; dated docs, specs, archives, HANDOFF_LOG.md and CURRENT_STATE.md.
open_questions:
  - Matthew: the roster names OG Kush as Coordinator, but your 2026-11-12 message names UK Cheese as the Main lead. Which holds the Coordinator seat? (OG Kush is also Steward Backup, so it cannot be reviewer of record on the same PR.)
  - Matthew: the roster says Ultra seats and Ultra Relay never review, but your message names the Ultra Team via Roots as reviewers. Should the roster change?
  - Matthew: the roster lists Codex as historical, but your message names Codex as a reviewer. Should Codex be a current Reviewer seat?
blockers: none for the docs.
exclusions_for_review: session_017UoYKvVZYWXWayQWJ9z81a (this writer); every author of #2933 for the stacked commit 29c958fc
reviewer_seat: requested; proposed a non-author Main Reviewer seat (A-D) routed by the Main lead, or Codex if Matthew confirms Codex as a current reviewer. Governance scope: Graft's low-risk allowlist does not cover it.
reviewer_sha: none yet
review_verdict: NOT_MEASURED
session_state: no production access used. No live /version.json read. No messages outside this project.
claimed_by: Claude session_017UoYKvVZYWXWayQWJ9z81a, 2026-11-12 04:40 UTC
owner: Claude
last_updated: 2026-11-12, by Claude session_017UoYKvVZYWXWayQWJ9z81a
```
