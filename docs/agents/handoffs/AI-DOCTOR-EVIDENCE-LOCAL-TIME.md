# AI-DOCTOR-EVIDENCE-LOCAL-TIME

```text
TASK AI-DOCTOR-EVIDENCE-LOCAL-TIME  priority: P2  status: CLOSED
closed: 2026-11-18, merged. Landed on verdant-grow-diary as 6cdfd720599f41860abcacc73275cf480b60e836 (#3000, 2026-11-18 03:12 UTC) through the merge queue after Matthew's approval and enqueue. Closed by the Claude thread session for the core-loop walk task. The post_merge_check below carries forward unchanged; it is not measured by this close.
goal: AI Doctor Phase 1 evidence cards on the Quick Log grouped timeline show their saved time in the viewer's own zone with the zone's short name ("Nov 17, 2026, 19:16 CST"), not UTC.
why: Found in the 2026-11-18 core-loop walk on production. The card read a UTC time for a grower in Chicago, so an evening entry looked like it was saved the next morning. Matthew asked (2026-11-18, via coordinator relay) for each rough spot found in the walk to get its own focused branch and draft PR with tests, no merges.
root_cause: formatAiDoctorPhase1TimelineSavedAt in src/lib/aiDoctorPhase1TimelineEvidenceViewModel.ts hard-coded timeZone "UTC".
branch: claude/ai-doctor-evidence-local-time
base: verdant-grow-diary at 9e7e51eeee595c7c941613b5dca0116da1777cc8
pr: draft, opened after the first push
state: pushed; draft PR open; required checks running; no independent review yet
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this; (3) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: after live /version.json reports the merge SHA, open a timeline with an AI Doctor Phase 1 evidence card and expect the saved line in local time with a zone name (CST/CDT for Chicago).
decisions: (1) The formatter and view-model builder take an optional { timeZone }; omitted, empty, "UTC" or invalid keep the old labelled UTC output, so existing callers and tests are unchanged. (2) QuickLogGroupedTimelineSection passes the viewer's zone from Intl.DateTimeFormat().resolvedOptions().timeZone, the same idiom src/pages/Timeline.tsx uses. (3) The zone name is always shown so a local-looking time is never ambiguous.
not_in_scope: VPD mismatch between views (separate slice); Alerts one-sided range (#2999); irrigation refresh (#2997); Timeline unit (#2998).
tests: new src/test/ai-doctor-phase1-timeline-evidence-local-time.test.ts (5 tests). Local vitest BLOCKED (no node_modules; frozen install 403s on the Lovable registry mirror). Bun probe of the pure functions: Chicago -> "Nov 17, 2026, 19:16 CST"; no zone and "Not/AZone" -> "Nov 18, 2026, 01:16 UTC"; bad date -> null; view model metadataLine -> "Saved Nov 17, 2026, 19:16 CST". CI is the evidence for this head.
commands: bunx vitest run src/test/ai-doctor-phase1-timeline-evidence-local-time.test.ts src/test/ai-doctor-phase1-timeline-evidence-view-model.test.ts src/test/ai-doctor-phase1-timeline-evidence-card.test.tsx --reporter=dot ; bun run typecheck
red_proof_recipe: git diff origin/verdant-grow-diary -- src/lib/aiDoctorPhase1TimelineEvidenceViewModel.ts > x.patch && git apply -R x.patch ; run the new test, expect the zone assertions to fail ; git apply x.patch
files_touched: src/lib/aiDoctorPhase1TimelineEvidenceViewModel.ts; src/components/QuickLogGroupedTimelineSection.tsx; src/test/ai-doctor-phase1-timeline-evidence-local-time.test.ts (new); this file
files_remaining: none for this slice
blockers: local checks BLOCKED as above. No npm fallback used, per AGENTS.md section 16.
reviewer_seat: not yet requested; requested once required checks are green
reviewer_sha: none
session_state: no routines, no paused workflows. Pending human decisions: Matthew's merge yes after review.
claimed_by: Claude thread session for the core-loop walk task, 2026-11-18 01:55 UTC
owner: Claude thread session for the core-loop walk task
last_updated: 2026-11-18 03:45 UTC, by the Claude thread session for the core-loop walk task (previously 2026-11-18 01:55 UTC, by Claude thread session for the core-loop walk task)
```
