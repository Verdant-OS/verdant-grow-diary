### VER-298-QUICKLOG-NOTE-VS-ISSUE

```text
TASK VER-298-QUICKLOG-NOTE-VS-ISSUE  priority: P2  status: CLOSED
goal: a saved Quick Log note reads "Note" and an issue reads "Issue" on every saved-entry surface, and the two tiles stop sounding the same.
why: Toad Venom onboarding fix (Cheeko yes, 2026-10-27 3:56 PM CT); VER-298 SENTINEL prompt; Matthew 2026-10-28: option (b) + join, renegotiate tests; widen to the Quick Log history panel; issue heading "Issue"; "Push both".
branch: claude/quicklog-note-vs-issue-tiles
base: verdant-grow-diary
checkout: None; closed (merged). Historical: git fetch origin claude/quicklog-note-vs-issue-tiles verdant-grow-diary && git switch claude/quicklog-note-vs-issue-tiles && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2583 (merged)
head_sha: 2c7b282896c19022fad5a7fc77897220d77dac8d (final PR head; merge of base d590b2c1 resolving the HANDOFF_LOG conflict); merge commit b5230474d94fe39fe6c3ac0f64b43c88c4fe0cc2 on the deploy branch, made by the merge queue with parents bbc77ae2 (integration base) and 2c7b2828 (final PR head)
state: CLOSED (merged). At final head 2c7b2828: 35/35 required checks green; re-review 5679303966 no blocking findings (seat not named; see reviewer_seat); Codex no findings; founder per-item yes recorded at this SHA (PR comment 6469011705). First queue attempt 2026-10-28 19:38 UTC was removed for CI_FAILURE that hit every PR (jobs failed before a runner started; PR comment 6478808603); re-queued by cheekhimself 2026-10-29 00:26 UTC and merged
current_step: Closed
next_action: None; closed. The post_merge_check below stays owned by this block: if the live Note/Issue check fails after Publish, this work reopens with the same owner
post_merge_check: after Publish, on the disposable fixture account, save a Note and an Issue on the fixture plant (tag [smoke <timestamp>]): Timeline card, Quick Log history badge and Dashboard recent row read "Note" and "Issue". NOT_MEASURED until live /version.json reports the SHA.
active_writer: none; branch claude/quicklog-note-vs-issue-tiles retired after merge
decisions: review 5677116739 (Matthew 2026-10-28): keep (b)+join, so old unmarked notes stay "Observation" and the marker stays; tile copy is Note / "Anything you want to remember." and Problem spotted / "Something looks off: leaves, pests, smell."; marker predicates live in dependency-free quickLogNoteMarkerRules so the edge mirror stays small. new note saves add p_details.quick_log_activity = "note" (V2 payload, useQuickLogActivitySave manual route, legacy unified save for eventType "note"; never water, environment checks or legacy "observation"); one rule: marked row = Note, observation + subtype "issue" = Issue, any other observation (old unmarked notes) = Observation; display-only NOTE/ISSUE kinds in getEventType, kept out of EVENT_TYPES; issues keep the observation history lane; Dashboard/grow-detail read the linked diary mirror already fetched (5-row window; outside it the row stays "Observation"); AI Doctor, ecowitt and diagnostics note builders stay unmarked.
tried_and_rejected: delegate:builder stopped at the 200k context mark before writing code; implemented in-session. Editing QuickLogHistoryPanels.tsx was not needed (badge flows through resolveEffectiveQuickLogCareType).
commands: bunx vitest run src/test/quick-log-note-vs-issue-labels.test.ts src/test/quick-log-v2-save-payload.test.ts src/test/quick-log-activity-save-manual-rpc-contract.test.ts src/test/diary-timeline-event-wiring.test.ts src/test/quick-log-activity-types-saved-items.test.ts
files_touched: src/constants/quickLogActivityTypes.ts; src/lib/quickLogNoteMarkerRules.ts (new) and its edge mirror; src/lib/{quickLogActivityRules,diary,environmentCheckTimelineViewModel,quickLogEventIdentityRules,quickLogHistoryRules,growDiaryTimelineRules,dailyCheckPostSubmitRules,quickLogV2SavePayload,legacyQuickLogUnifiedSave}.ts; src/hooks/{useQuickLogActivitySave,useDashboardScopedData,useGrowDetailData}.ts; src/test/quick-log-note-vs-issue-labels.test.ts (new); renegotiated (approved): quick-log-v2-save-payload, quick-log-activity-save-manual-rpc-contract, quick-log-activity-types-saved-items, diary-timeline-event-wiring
files_remaining: none
blockers: none for repository work; Publish and the live check are Matthew's
open_questions: none
gotchas: the idempotency request hash covers p_details; pending-note recovery replays stored payloads unchanged, so never rebuild a stored payload; getEventType unknown/null fallback to observation and EVENT_TYPE_MAP size are pinned by locked tests
links: VER-298
artifacts: PR checks
reviewer_seat: Sour Diesel PASS at 48e64e8b (review 5678308303: verdict PASS, P1 0 / P2 0 / P3 2, 35/35 required). Re-reviews with no blocking findings at 9968d9be (review 5678655323) and at the final head 2c7b2828 (review 5679303966). Those two receipts do not name their seat, session or role: a gap in the record, not a PASS this log can attribute. All three are posted under the shared cheekhimself identity, which alone does not establish independence (excluded: session_017UoYKzLzTv1RAhx1Cc7Pme as author, session_017UoYKxgRTFgtyQW6ka38Ec as repairer)
reviewer_sha: 2c7b282896c19022fad5a7fc77897220d77dac8d (review 5679303966, scope: delta since 9968d9be, the base merge of d590b2c1); the last named-seat PASS covers 48e64e8b2f6c03a8b189b0a238f0ac4e9e6ab767
session_state: no check-ins armed for this block; no paused workflows
claimed_by: Claude session_017UoYKxgRTFgtyQW6ka38Ec, 2026-10-28 (Matthew reassigned this branch from session_017UoYKzLzTv1RAhx1Cc7Pme to address review 5677116739; prior holder told to stop pushing)
owner: Claude session_017UoYKxgRTFgtyQW6ka38Ec
last_updated: 2026-10-29 00:55 UTC, by Claude session_017UoYKxgRTFgtyQW6ka38Ec (closed after #2583 merged)
closure: #2583 merged as b5230474d94fe39fe6c3ac0f64b43c88c4fe0cc2 (merge-queue commit dated 2026-10-29 00:26:25 UTC) from final head 2c7b282896c19022fad5a7fc77897220d77dac8d
```
