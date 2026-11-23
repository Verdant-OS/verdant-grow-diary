# QUICKLOG-ALL-ACTIVITIES-REFRESH-2697

```text
TASK QUICKLOG-ALL-ACTIVITIES-REFRESH-2697  priority: P1  status: OPEN
goal: after a confirmed save from the All activity types section, the plant page (entry count, last activity) and Timeline show the new entry without a reload (#2697).
why: QuickLogAllActivitiesSection only sent verdant:entry-created. The plant page and Timeline React Query reads do not listen for that event, so they kept stale cache data. The other Quick Log save paths already call applyQuickLogV2Refresh.
branch: posthog-self-driving/fixquick-log-refresh-plant-timeline-316954 (name fixed by the PostHog run harness)
base: verdant-grow-diary (started at 9c7339428)
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3066 (draft)
head_sha: recorded on the PR; this file is written before the first push
state: pushed draft
current_step: fix and test committed together; RED proven locally (4 of 9 new tests fail without the component wiring)
next_action: request an eligible independent review (not this session) at the exact head after CI is green
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and its fixture plant: open the plant page, Quick Log > Note panel > Save a [smoke <timestamp>] note, stay on the page; the entry count, LAST ACTIVITY and Timeline update without a reload
active_writer: PostHog self-driving Claude session (inbox report 01a20a2f-6d8e-7e9d-9f57-ac600c239935)
decisions: one refreshConfirmedSave callback in the section calls applyQuickLogV2Refresh at each confirmed-write branch (photo insert, RPC save, finishConfirmedPendingActivity for retry and receipt recovery). The single verdant:entry-created dispatch is unchanged. The query client comes from useContext(QueryClientContext) (precedent: useManualSensorCorrectionRefresh), so a mount without a provider still saves. Scope mapping is pure: resolveQuickLogV2RefreshScope in src/lib/quickLogV2RefreshRules.ts.
tried_and_rejected: useQueryClient() (throws in the many existing tests that mount the section without a provider); refresh inside useQuickLogActivitySave (misses the photo and receipt-recovery branches, which do not go through the hook).
commands: bunx vitest run src/test/quick-log-all-activities-refresh.test.tsx --reporter=dot
files_touched: src/components/QuickLogAllActivitiesSection.tsx, src/lib/quickLogV2RefreshRules.ts, src/test/quick-log-all-activities-refresh.test.tsx
files_remaining: none planned
blockers: none. 5 tests in quick-log-activity-retry-recovery.test.tsx fail on the base commit too under Node 26 in the sandbox; CI is the evidence.
gotchas: no schema, RLS, edge, auth, billing or production change. No migration.
reviewer_seat: eligible independent reviewer, not this session
reviewer_sha: none yet
claimed_by: PostHog self-driving Claude session, 2026-11-23
owner: PostHog self-driving Claude session
last_updated: 2026-11-23, by Claude
```
