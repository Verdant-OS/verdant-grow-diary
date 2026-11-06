# UNIFIED-TIMELINE-STREAM-SPEC

```text
TASK UNIFIED-TIMELINE-STREAM-SPEC  priority: other  status: CLOSED
closed: merged. #2832 merged into verdant-grow-diary on 2026-11-04 as 9f2327a525f43043269a442ac17d3a4c6e9f4e82 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Spec one chronological Timeline stream with source and type filters, and a no-duplicate way to classify notes, with founder decisions D1-D3.
why: Live audit 2026-11-03 finding 5. Source-traced: diary entries load 100 at a time with an exact count and load-older (disclosed, not data loss); grow and environment events 100 each; manual captures 200 behind a limit notice; per-type panels classify by entry_type or details.event_type, so a feeding note stays a note and Feeding history truthfully reads "No feeding entries yet".
branch: claude/unified-timeline-spec
base: verdant-grow-diary
checkout: git fetch origin claude/unified-timeline-spec verdant-grow-diary && git switch claude/unified-timeline-spec
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub
state: spec committed; D1-D3 awaiting Matthew.
current_step: draft PR open.
next_action: record D1-D3; slice 1 is pure merge-and-order rules with tests.
post_merge_check: none (docs only).
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: Bounded reads from #2795 stay; no auto-classification of notes; source labels and retraction exclusion stay. Builds on #2826 R7 (History by type) rather than duplicating it.
tried_and_rejected: "classify through the existing revision path" - QuickLogCorrectionChanges (src/lib/quick-log/quickLogRevisionRules.ts:245-255) has no entry-type field, so D2(a) needs a new server revision field and its own write-path spec.
commands: none (docs only)
files_touched: docs/specs/unified-timeline-stream.md; docs/agents/HANDOFF_LOG.md
files_remaining: none for the spec
blockers: founder decisions D1-D3
open_questions: D1 stream as default vs tab; D2 note classification (needs write-path change) vs read-only hint; D3 per-type panels.
gotchas: none
links: docs/specs/first-viewport-task-first.md (#2826)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 18:02 CT, by Claude)
```
