# AGENT-START-PAGE-20261120

```text
TASK AGENT-START-PAGE-20261120  priority: other  status: OPEN
goal: One short start page, one shared sentinel block, a stop-anywhere note, and status-label instructions for issue #2939.
why: Matthew asked for agent instructions that are short, and for work to continue when an agent stops. Issue #2939. #2933 has merged.
branch: cursor/agent-start-page-037e
base: verdant-grow-diary
checkout: git fetch origin cursor/agent-start-page-037e verdant-grow-diary && git switch cursor/agent-start-page-037e
pr: see the open pull request for this branch
head_sha: filled in the stop-anywhere note after the push
state: local, about to push
current_step: parity self-test passed locally; pull request not opened yet
next_action: independent review of the exact head by a seat that did not write this change (A, D, or C). Do not merge.
post_merge_check: node scripts/check-sentinel-version-parity.mjs <merge-parent> prints Sentinel-Version OK — 2026-11-20.1 across 18 governance files, and docs/agents/SENTINEL_BLOCK.md still contains each pin in scripts/check-sentinel-version-parity.mjs. Docs only.
active_writer: Cursor Grok session on cursor/agent-start-page-037e
decisions: AGENTS.md stays the shared rule file. The repeated routing paragraphs moved verbatim into docs/agents/SENTINEL_BLOCK.md. The GEMINI.md constitution mirror stayed, because removing it would drop the safeguard that Gemini cannot follow a link. The three contradictions are listed and not resolved.
tried_and_rejected: replacing the GEMINI.md embed with a pointer. Rejected for this pull request. The parity test fails that shape on purpose.
commands: node scripts/check-sentinel-version-parity.mjs origin/verdant-grow-diary; node scripts/check-sentinel-version-parity.test.mjs; node scripts/sync-sentinel-mirror.mjs --check; node scripts/assert-docs-safety.mjs
files_touched: the eighteen governance files; docs/agents/START_HERE.md; docs/agents/SENTINEL_BLOCK.md; docs/agents/RULEBOOK_CONTRADICTIONS.md; scripts/check-sentinel-version-parity.mjs; scripts/check-sentinel-version-parity.test.mjs; this file
files_remaining: GEMINI.md still embeds AGENTS.md. CLAUDE.md still carries the codebase orientation. Role files still have their own "read these files" lines. The historical Chemdawg routing block in HANDOFF_PROTOCOL.md stayed in place.
blockers: independent exact-head review and the founder's per-SHA yes. This session will not merge.
open_questions: none for this slice
gotchas: scorer-lock must be unlocked before editing the parity script. The unlock file is git-ignored. Do not weaken the GEMINI mirror check.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/2939
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Cursor Grok, 2026-11-20
owner: Cursor Grok session on this branch
last_updated: 2026-11-20, by Cursor Grok
```
