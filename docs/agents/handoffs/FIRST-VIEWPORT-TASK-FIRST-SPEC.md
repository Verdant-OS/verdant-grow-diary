# FIRST-VIEWPORT-TASK-FIRST-SPEC

```text
TASK FIRST-VIEWPORT-TASK-FIRST-SPEC  priority: other  status: CLOSED
closed: merged. #2826 merged into verdant-grow-diary on 2026-11-04 as f557bb8c41c35bac35b46366ff1b5b7a29b45347 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Spec how Timeline, AI Doctor, Action Queue and Reports put the grower's task before explanation, with founder decisions D1-D4.
why: Live audit 2026-11-03 finding 2 (remaining parts) and the layout half of finding 11. Source-traced: about 25 blocks precede the first Timeline entry; the One-Tent Loop next-step card ("Review alerts") sits above the AI Doctor plant picker; Action Queue renders a landing box, header, filters and pagination before its empty state; Reports orders empty learning cards first.
branch: claude/first-viewport-task-first-spec
base: verdant-grow-diary
checkout: git fetch origin claude/first-viewport-task-first-spec verdant-grow-diary && git switch claude/first-viewport-task-first-spec
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2826 (ready for review)
head_sha: read the current head on GitHub
state: spec committed; D1-D4 awaiting Matthew.
current_step: Seat A P2-1/P2-2 (b6b711a) fixed; awaiting Grok exact-head review.
next_action: record Matthew's D1-D4 answers in section 6, then route for review; implementation follows in four slices (section 9).
post_merge_check: none (docs only).
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: Safety fences F1-F5 keep truth notices (partial read, history limit, RPC unavailable), approval-required wording, no auto-start or preselect on AI Doctor, no remembered target, and sensor source labels.
tried_and_rejected: a read-only search subagent for the page map ran out of context on startup instructions; mapped directly with targeted greps instead.
commands: none (docs only)
files_touched: docs/specs/first-viewport-task-first.md; docs/agents/HANDOFF_LOG.md
files_remaining: none for the spec
blockers: founder decisions D1-D4
open_questions: D1 next-step card placement; D2 AI Doctor Review alerts; D3 Action Queue landing box; D4 Reports order.
gotchas: src/test/action-queue-ux.test.ts:125-134 pins source order between filters, pagination and no-results; the Action Queue slice must renegotiate it.
links: none
artifacts: none
reviewer_seat: Grok (Matthew's gate); Seat A reviewed b6b711a: PASS-with-P2 0/2/1
reviewer_sha: b6b711a (Seat A); new head needs review
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 18:55 CT, by Claude)
```
