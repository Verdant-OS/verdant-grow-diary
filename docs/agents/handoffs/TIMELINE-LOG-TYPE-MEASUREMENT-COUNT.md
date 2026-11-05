# TIMELINE-LOG-TYPE-MEASUREMENT-COUNT

```text
TASK TIMELINE-LOG-TYPE-MEASUREMENT-COUNT  priority: P2  status: OPEN
goal: #2733 / VER-404 remainder - the Timeline "Filter by log type" dropdown counts and filters a whole-tent Quick Log note with a manual climate under Measurement, matching the card badge
why: Blue Dream QA recheck on prod 72e17e5d1d18 (#2733 comment 6617485455): the Measurement dropdown count stayed at 8 across saves and a hard reload while the Measurements chip went 16->17->18 and Observation 23->24->25
root_cause: the note's linked observation spine stamps details.event_type "observation" (diaryLinkedEventTypeRules.ts applyLinkedEventTypes). #2799 made the card (resolveEffectiveQuickLogCareType) and the chip (diaryEntryHasMeasurementEvidence) read the attached environment sibling, but the dropdown (timelineEvidenceFilterRules.ts rowEventType) still read only the stored token
branch: claude/timeline-measurement-count-fix-ozil20
base: verdant-grow-diary at 7d720e705c969321aa4411e35ca4bd52bfb622b7
pr: see the draft PR for this branch
head_sha: read the current head on GitHub
state: implemented; draft PR; needs 35/35 and an independent exact-head PASS
next_action: independent exact-head review; then Matthew's per-item yes before any queue
post_merge_check: once /version.json reports the merge SHA, a disposable-account whole-tent Quick Log note with temperature/humidity moves "Measurement (N)" in /timeline's log-type dropdown by +1 per save and after a hard reload; "Observation (N)" does not move; selecting Measurement lists the row
active_writer: Claude session session_017UoYKvaD66HKYPL8bnvTH3
decisions: Matthew chose option (A) on 2026-11-05: the dropdown means "what the card says"; the Measurements chip keeps its broader count (manual sensor receipts, waterings with pH), so its total still differs from the dropdown total but both move +1 per save. Only stored null/observation/note/quick_log can be re-classed, and only to measurement. Keyword search still matches the stored token. No stored row, payload, schema or write-path change
tried_and_rejected: option (B) - dropdown Measurement on the chip predicate; rejected because it would move waterings with pH out of Watering
commands: node_modules/.bin/vitest run src/test/timeline-log-type-measurement-count.test.ts --reporter=dot; node --max-old-space-size=6144 node_modules/typescript/bin/tsc -p tsconfig.json --noEmit (plain bun run typecheck aborted on heap in this container)
evidence: new test RED on base 2 failed / 4 passed; with the fix 6/6; fix set aside again 2 failed / 4 passed; affected files 18 files / 190 tests passed (all filter-helper tests, #2799 classification, chip-count, v0 operating loop contract); tsc 0 errors; eslint and prettier clean on the two files; scorer-lock no tracked scorer modified
files_touched: src/lib/timelineEvidenceFilterRules.ts, src/test/timeline-log-type-measurement-count.test.ts, docs/agents/handoffs/TIMELINE-LOG-TYPE-MEASUREMENT-COUNT.md
files_remaining: none
blockers: none
open_questions: none
gotchas: only src/pages/Timeline.tsx calls deriveTimelineEventTypeOptions / filterTimelineEvidenceRows; the test fixture needs a UUID linked_grow_event_id or the spine stamp is skipped
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/2733 https://github.com/Verdant-OS/verdant-grow-diary/pull/2799 https://github.com/Verdant-OS/verdant-grow-diary/pull/2745 https://linear.app/verdantgrowdiary/issue/VER-404
reviewer_seat: eligible non-contributing reviewer per OWNERSHIP.md 4.3 (excludes this session)
reviewer_sha: none yet
session_state: this session watches the draft PR
claimed_by: Claude session_017UoYKvaD66HKYPL8bnvTH3, 2026-11-05 (assigned by Matthew)
owner: Claude
last_updated: 2026-11-05, by Claude
```
