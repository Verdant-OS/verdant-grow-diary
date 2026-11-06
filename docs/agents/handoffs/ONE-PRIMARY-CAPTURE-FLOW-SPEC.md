# ONE-PRIMARY-CAPTURE-FLOW-SPEC

```text
TASK ONE-PRIMARY-CAPTURE-FLOW-SPEC  priority: other  status: CLOSED
closed: merged. #2831 merged into verdant-grow-diary on 2026-11-04 as 584e1a96fad2f828ce991ce1087490b74420bfba (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Spec one primary daily-capture flow with optional guides, with founder decisions D1-D3.
why: Live audit 2026-11-03 finding 9 (and the open part of finding 4). Source-traced: the global QuickLogV2Sheet and the /daily-check page are both titled "Quick Log"; four Field Edition visit modes (Fast Check, Routine Walk, Deep Evidence Walk, Alert Walk) render ahead of the action; /daily-check adds "Choose today's check" and a six-step guided check; "Daily Grow Check" names the derived status.
branch: claude/capture-flow-spec
base: verdant-grow-diary
checkout: git fetch origin claude/capture-flow-spec verdant-grow-diary && git switch claude/capture-flow-spec
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub
state: spec committed; D1-D3 awaiting Matthew.
current_step: draft PR open.
next_action: record D1-D3; implementation in three slices (section 9), each renegotiating its pins.
post_merge_check: none (docs only).
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: Two earlier decisions are test-pinned and would be reversed: Field Edition owns first paint (quick-log-guided-grow-walk-grower-path.test.tsx:103, app-shell-header-fab-field-edition-first.test.tsx:145) and /daily-check is titled "Quick Log" (daily-check-quick-log-header.test.tsx:15). Fences keep the single quicklog_save_manual write path, the remembered-target ban, presentation-only visit modes and the Daily Grow Check counting rule.
tried_and_rejected: none
commands: none (docs only)
files_touched: docs/specs/one-primary-capture-flow.md; docs/agents/HANDOFF_LOG.md
files_remaining: none for the spec
blockers: founder decisions D1-D3
open_questions: D1 naming of /daily-check; D2 Field Edition placement; D3 number of capture concepts.
gotchas: the first-paint order is pinned with compareDocumentPosition; a D2 change must renegotiate it in the same commit.
links: none
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 17:56 CT, by Claude)
```
