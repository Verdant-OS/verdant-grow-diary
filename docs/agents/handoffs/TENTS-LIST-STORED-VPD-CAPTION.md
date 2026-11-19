# TENTS-LIST-STORED-VPD-CAPTION

```text
TASK TENTS-LIST-STORED-VPD-CAPTION  priority: P3  status: CLOSED
goal: Every stored VPD chip on the /tents list names its source and age the same way. The latest cohort's own stored VPD gains "· <source> · <age>" after its status word, matching a VPD from another capture ("Stale · Manual reading · 13d ago").
why: Live check on 2026-11-19 (verdantgrowdiary.com at 0d9e9c08, free test account, read only): QA-BlueDream Tent's stored 1.10 read only "Stale", while Fixture Tent A's stored 1.43 read "Stale · Manual reading · 13d ago". The first is the cohort's own stored reading (status word only); the second came from another capture (ownCaptureVpdMetric names source and age). The coordinator relayed a go-ahead for a draft PR under Matthew's standing rule that internal work flows; draft only.
branch: claude/project-thread-nggu4s
base: verdant-grow-diary @ 679e8f51b
pr: #3028 (merged)
head_sha: d521eab9946395b09812ec48f94341d857530c0f (final reviewed head); merge commit e8e847864512c8f6f8fb432ddd18e1b9a33d1707
state: merged as #3028 at e8e847864512c8f6f8fb432ddd18e1b9a33d1707 (2026-11-19 12:57 UTC) through the merge queue. 35/35 required checks green at d521eab; Codex code and security reviews clean; matt816cheek-bit approved at d521eab; [ROUTE] to Reviewer A, D or C posted on Matthew's word (no seat verdict recorded before Matthew queued it). The first queue run was removed by a test:legal-seo setup failure (Ubuntu package mirrors timed out), not this change; Matthew re-queued it.
next_action: none on this entry; the post_merge_check below runs once live /version.json reports the merge commit (NOT_MEASURED until then).
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
reviewer_seat: [ROUTE] to Reviewer A, D or C at d521eab (no seat verdict before merge); matt816cheek-bit approval at d521eab
reviewer_sha: d521eab9946395b09812ec48f94341d857530c0f
session_state: one read-only sign-in to the free test account on 2026-11-19 (signed out after); no writes; no paused workflows; no scheduled routines.
closed: 2026-11-19, merged as #3028; final SHA e8e847864512c8f6f8fb432ddd18e1b9a33d1707
claimed_by: the Claude thread session for the core-loop walk task, 2026-11-19 09:50 UTC
owner: the Claude thread session for the core-loop walk task
last_updated: 2026-11-19 13:00 UTC, by the Claude thread session for the core-loop walk task
```
