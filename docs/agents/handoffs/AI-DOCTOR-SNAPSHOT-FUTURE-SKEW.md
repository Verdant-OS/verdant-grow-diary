# AI-DOCTOR-SNAPSHOT-FUTURE-SKEW

```text
TASK AI-DOCTOR-SNAPSHOT-FUTURE-SKEW  priority: other  status: OPEN
goal: A manual sensor snapshot dated more than MANUAL_SNAPSHOT_FUTURE_SKEW_MS (5 min) in the future is never fresh AI Doctor evidence. Optional P3 follow-ups from the independent reviews of #2940 at 5847dc178c6faaaafa34a0285d4ad5bd3f6f4f5c.
why: evaluateAiDoctorContext, buildAiDoctorSnapshotFreshnessStatus and buildAiDoctorSnapshotStalenessExplanation graded freshness with `now - t <= freshMs`, which any negative age passes, so a snapshot dated a day ahead read as fresh. isManualSnapshotCurrent already rejects a capture time beyond the skew. Stale or unknown data must never read as fresh.
branch: claude/happy-mendel-12oj7t (stacked on claude/ai-doctor-snapshot-fresh-window @ 5847dc178c6faaaafa34a0285d4ad5bd3f6f4f5c, #2940)
base: verdant-grow-diary (PR target; CI only runs for PRs into it). Until #2940 merges, the PR diff also shows #2940's two commits.
checkout: git fetch origin claude/happy-mendel-12oj7t verdant-grow-diary && git switch claude/happy-mendel-12oj7t
pr: see the PR for this branch (draft)
head_sha: see the PR; the PR body names the reviewed head
state: pushed draft
current_step: draft PR open; waiting for #2940 to merge, then merge the deploy branch into this branch so the diff shows only this slice; then route independent review.
next_action: after #2940 merges, `git merge origin/verdant-grow-diary` on this branch (normal merge, no rebase), re-run the commands below, push, and route an independent review at the new head.
post_merge_check: after deploy, on the disposable fixture grow, read-only: the AI Doctor readiness chip for a plant whose newest manual snapshot is under 24h old reads "Fresh"; there is no grower path to create a future-dated snapshot on the fixture, so the future case is NOT_MEASURED live and covered by unit tests only.
active_writer: Claude session_017UoYKyH3oGiskkaD6i9oSV
decisions: (1) The skew constant moved to src/constants/sensorTiming.ts (the single home for sensor windows, already mirrored); manualSensorSnapshotQualityRules re-exports it under the same name and value, so that module is not pulled into the edge mirror. (2) In evaluateAiDoctorContext only the freshness grade changes: the fresh check uses the newest snapshot within the skew, so a future-dated row cannot hide an older fresh one. Recent-snapshot counts and `latest.manualSnapshotAt` are unchanged. (3) buildAiDoctorSnapshotStalenessExplanation is included because ai-doctor-freshness-fuzz pins that it agrees with the freshness chip; without it the chip would say stale while the launch dialog showed no explanation. (4) Future copy says "dated in the future, so its age is unknown" and never claims an age. (5) P3-2: owner chose "Leave as is" (2026-11-12): #2940 has not deployed, so any checked_at cutoff date would either hide real 48h-graded checks or keep the gap; the badge already shows the age beside the grade. (6) P3-3: only one doc described the readiness window as 48h (G5 in docs/bridge-sensor-ingest-security-audit-checklist.md, a dated 2026-08 audit); updated to 24h with a note that it said 48h when written. The "48 h" in docs/ai-doctor-output-contract.md is about photos and was left.
tried_and_rejected: importing MANUAL_SNAPSHOT_FUTURE_SKEW_MS from manualSensorSnapshotQualityRules into aiDoctorContextRules (would drag that module and sensorTruthRules into the edge mirror); skipping future snapshots from the recent count (changes evidence beyond the request).
commands: bunx vitest run src/test/ai-doctor-snapshot-future-skew.test.ts src/test/ai-doctor-freshness-fuzz.test.ts src/test/ai-doctor-snapshot-freshness-status.test.ts src/test/ai-doctor-snapshot-staleness-explanation.test.ts src/test/ai-doctor-context-rules.test.ts; node scripts/sync-edge-shared.mjs && node scripts/verify-edge-shared-in-sync.mjs; NODE_OPTIONS=--max-old-space-size=8192 bunx tsc -p tsconfig.json --noEmit; node scripts/scorer-lock.mjs --report --strict --base 5847dc178c6faaaafa34a0285d4ad5bd3f6f4f5c
files_touched: src/constants/sensorTiming.ts; src/lib/manualSensorSnapshotQualityRules.ts; src/lib/aiDoctorContextRules.ts; src/lib/aiDoctorSnapshotFreshnessStatusViewModel.ts; src/lib/aiDoctorSnapshotStalenessExplanationViewModel.ts; src/test/ai-doctor-snapshot-future-skew.test.ts (new); src/test/ai-doctor-freshness-fuzz.test.ts (pin); supabase/functions/_shared/lib/{.sync-manifest.json,constants/sensorTiming.ts,lib/aiDoctorContextRules.ts} (generated); docs/bridge-sensor-ingest-security-audit-checklist.md; this file
files_remaining: none
blockers: #2940 must merge first (it is blocked only on an APPROVE from a second GitHub account at its head).
open_questions: none
gotchas: `bun run typecheck` aborted with a heap OOM in the authoring container; tsc with --max-old-space-size=8192 exits 0 (#2938 addresses the heap ceiling). Required CI skips draft PRs. The scorer-lock unlock file is git-ignored, so CI cannot see it; the PR body declares the pin.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2940 (P3 list in the Seat D fix request comment)
artifacts: none besides the tests
reviewer_seat: not routed yet
reviewer_sha: none
session_state: no routines, no paused workflows. Pending human decisions: none.
claimed_by: Claude session_017UoYKyH3oGiskkaD6i9oSV, 2026-11-12 08:40 UTC
owner: Claude session_017UoYKyH3oGiskkaD6i9oSV
last_updated: 2026-11-12 02:40 CT, by Claude
```
