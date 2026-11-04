### QUICKLOG-CORRECTION-EDITABLE-VALUES

```text
TASK QUICKLOG-CORRECTION-EDITABLE-VALUES  priority: P2  status: CLOSED
goal: Make the Correct this Quick Log dialog edit volume, dose, or sensor values for that entry type, and keep the original value in the correction history. Keep the Wrong value reason. Do not follow closed #2116.
branch: cursor/quicklog-correction-editable-values-fc1d
base: verdant-grow-diary
checkout: none; merged. Start new work from origin/verdant-grow-diary.
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2118
head_sha: e732a157d387d38d9ac76b71b1ed6208d9145744, the final head of #2118 (32 files).
state: #2118 squash-merged through the merge queue from head e732a157 as 48b6134462bf3b2a04046c82af646fdfc1da5b8f. The merge queue created that commit at 2026-10-20 18:25:12 UTC (committer timestamp); it reached verdant-grow-diary and GitHub closed the PR as merged at 2026-10-20 18:55:50 UTC, after the queued #2272 group ahead of it passed on verdant-grow-diary (sole parent 0f9d1a5ce). Migration 20261014210000_quicklog_correction_editable_values.sql is NOT applied to production; applying it is Matthew's separate decision. NOT deployed: live /version.json still reports c0ce65cb. Production acceptance NOT_MEASURED.
next_action: CLOSED for the repository change. Production migration apply and publish only on Matthew's separate explicit yes; then signed-in verification on the disposable QA account.
files: .github/workflows/ci.yml; docs/agents/HANDOFF_LOG.md; scripts/assert-required-core-migrations-applied.mjs; scripts/prove-quicklog-correction-measured-values.mjs; scripts/prove-quicklog-correction-owner-fence.mjs; src/components/FeedingHistoryPanel.tsx; src/components/QuickLogEntryIntegrityControls.tsx; src/components/QuickLogGroupedTimelineSection.tsx; src/components/QuickLogHistoryPanels.tsx; src/components/WateringHistoryPanel.tsx; src/lib/quick-log/quickLogRevisionRules.ts; src/pages/Timeline.tsx; src/test/ci-pr-concurrency.test.ts; src/test/quicklog-correction-copilot-followup.test.tsx; src/test/quicklog-correction-editable-values-dialog.test.tsx; src/test/quicklog-correction-editable-values.test.ts; src/test/quicklog-correction-environment-check-envelope.test.ts; src/test/quicklog-correction-environment-link-match.test.ts; src/test/quicklog-correction-fast-check-companion.test.ts; src/test/quicklog-correction-quick-log-envelope-sensor.test.ts; src/test/quicklog-correction-unresolved-linked-root.test.ts; src/test/quicklog-correction-watering-volume-cap.test.tsx; src/test/quicklog-feeding-correction-volume-context.test.ts; src/test/quicklog-feeding-correction-volume.test.tsx; src/test/quicklog-grouped-feeding-correction.test.tsx; src/test/quicklog-watering-sensor-correction.test.tsx; src/test/quicklog-watering-tied-sibling-correction.test.ts; src/test/timeline-correction-sensor-wiring.test.tsx; src/test/timeline-first-page-linked-roots.test.tsx; src/test/timeline-load-older-sensor-siblings.test.tsx; src/test/timeline-supplemental-root-sensor-siblings.test.tsx; supabase/migrations/20261014210000_quicklog_correction_editable_values.sql
blockers: none for the merged change. Production migration apply and publish not approved.
artifacts: PR #2118 body (unlock receipts); merge commit 48b6134462bf3b2a04046c82af646fdfc1da5b8f
reviewer_seat: Codex exact-head review. Matthew decided on 2026-10-20 (~18:33 UTC, VER-216) that a clean Codex review replaces the Graft half of the Oct 15 12:38 PM CT receipt condition.
claimed_by: claude, 2026-10-20 18:40 UTC
last_updated: 2026-10-20 19:04 UTC, by Claude (VER-216 close-out; block closed after merge, follow-up to Codex r4328730607)
```
