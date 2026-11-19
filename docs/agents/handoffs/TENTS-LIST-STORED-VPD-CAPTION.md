# TENTS-LIST-STORED-VPD-CAPTION

```text
TASK TENTS-LIST-STORED-VPD-CAPTION  priority: P3  status: OPEN
goal: Every stored VPD chip on the /tents list names its source and age the same way. The latest cohort's own stored VPD gains "· <source> · <age>" after its status word, matching a VPD from another capture ("Stale · Manual reading · 13d ago").
why: Live check on 2026-11-19 (verdantgrowdiary.com at 0d9e9c08, free test account, read only): QA-BlueDream Tent's stored 1.10 read only "Stale", while Fixture Tent A's stored 1.43 read "Stale · Manual reading · 13d ago". The first is the cohort's own stored reading (status word only); the second came from another capture (ownCaptureVpdMetric names source and age). The coordinator relayed a go-ahead for a draft PR under Matthew's standing rule that internal work flows; draft only.
branch: claude/project-thread-nggu4s
base: verdant-grow-diary @ 679e8f51b
pr: draft, number recorded on the pull request
head_sha: recorded on the pull request
state: draft; required checks run only after Matthew marks it ready.
next_action: Matthew decides whether to mark it ready. Leaving draft, review requests, comments and merge need his word.
post_merge_check: after live /version.json reports the merge SHA, signed in on the disposable test account, open /tents and expect QA-BlueDream Tent's stored VPD to read "Stale · <source> · <age>" (for example "Stale · Manual reading · 24d ago"). No write needed.
decisions:
  - The view model only exposes `cohortVpdProvenance` (optional) when the shown VPD is the cohort's own stored reading (not replaced, origin stored). Dashboard ignores it, so only the Tents list changes.
  - The caption rule is pure in tentsListVpdRules.ts (tentsListStoredVpdStatusLabel, clock injected) and uses the same sensorSourceLabel words as Tonight ("Manual reading", "CSV import", "Demo data", "Live sensor") and formatAgeLabel.
  - Live is named only beside an ok status, so a stale or flagged reading never reads as live. An unverified cohort names no source. An unknown VPD and every non-cohort VPD keep their status label unchanged.
tried_and_rejected:
  - Changing mkMetric's statusLabel in the shared view model: rejected, it would change the Dashboard too and many pinned tests.
commands: bunx vitest run src/test/tents-list-stored-vpd-caption.test.tsx src/test/tents-list-stored-and-calculated-vpd.test.tsx src/test/tents-list-canonical-vpd.test.tsx src/test/tents-list-sensor-truth.test.tsx --reporter=dot
files_touched: src/lib/dashboardEnvironmentSnapshotViewModel.ts; src/lib/tentsListVpdRules.ts; src/components/TentEnvironmentSnapshotStrip.tsx; src/test/tents-list-stored-vpd-caption.test.tsx (new); this file (new)
files_remaining: none
blockers: local vitest and tsc are BLOCKED here (no node_modules; the frozen install 403s and an unpinned install is not allowed). The rule and view model were probed with bun against the real modules, date-fns stubbed: with the view-model change set aside a stale manual cohort has no cohortVpdProvenance; restored it is "manual" and the caption reads "Stale · Manual reading · 24d ago". CI is the gate.
open_questions: none
gotchas: tents-list-canonical-vpd.test.tsx asserts "not Live" on VPDs from another capture; those are replaced VPDs and keep their own label.
exclusions_for_review: the Claude thread session for the core-loop walk task (author)
reviewer_seat: not routed; draft
reviewer_sha: none
session_state: one read-only sign-in to the free test account on 2026-11-19 (signed out after); no writes; no paused workflows; no scheduled routines.
claimed_by: the Claude thread session for the core-loop walk task, 2026-11-19 09:50 UTC
owner: the Claude thread session for the core-loop walk task
last_updated: 2026-11-19 09:50 UTC, by the Claude thread session for the core-loop walk task
```
