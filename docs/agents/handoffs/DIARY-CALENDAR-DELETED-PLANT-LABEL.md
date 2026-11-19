# DIARY-CALENDAR-DELETED-PLANT-LABEL

```text
TASK DIARY-CALENDAR-DELETED-PLANT-LABEL  priority: P2  status: CLOSED
goal: The Timeline calendar's detailed history labeled a live plant "Deleted plant" whenever a log row had a plant_id but no stored details.plant_name. Most save paths never store that name, so live plants read as deleted. Fix: check the owner's plant directory before saying "deleted".
branch: claude/project-thread-0b5tgz
base: verdant-grow-diary at 1f138a5
pr: #2980 into verdant-grow-diary
head_sha: a6fccd518f46dac53c0631eb462fd51dc68d9cbb (final PR head)
state: CLOSED. Squash-merged into verdant-grow-diary as 9f5950dc1b4dfddb39949eb38c9e71069167da0b (#2980) on 2026-11-17 08:53 UTC by the cheekhimself account, while the PR was still marked draft. Merged is not deployed.
decisions: (1) Stored details.plant_name still wins, so historic names survive a rename or delete. (2) Otherwise the id is looked up in the owner's plant directory (useTimelineNameDirectory, already loaded on Timeline). (3) "Deleted plant" only when that directory has loaded and lacks the id. (4) While the directory is loading, failed, or not passed, the label stays blank, never "deleted". This matches how Timeline cards already resolve names (resolveTimelineCardPlaceLabels). (5) Logic lives in the pure view model; the component only passes the map through.
tried_and_rejected: Querying plants inside the calendar (a second read path); rejected because Timeline already holds the owner's directory.
known_limit: If the directory query is ever truncated by a row limit, a live plant beyond it would still read as deleted. Timeline cards share this risk; not changed here.
files_touched: src/lib/diaryCalendarViewModel.ts; src/components/DiaryCalendarSection.tsx; src/pages/Timeline.tsx; src/test/deleted-plant-display.test.ts (pin renegotiated: the leftover-id case now passes a loaded empty directory); src/test/diary-calendar-deleted-plant-directory.test.ts (new, 13 tests); this file.
files_remaining: none planned.
commands: bun test --preload <scratch>/vitest-shim.ts ./src/test/deleted-plant-display.test.ts ./src/test/diary-calendar-deleted-plant-directory.test.ts ./src/test/diary-calendar-view-model.test.ts ./src/test/diary-calendar-filter-persist-safety.test.ts  (the shim maps "vitest" to bun:test plus vi; local stand-in only)
validation: Local, pure tests only: 36 pass, 0 fail across 4 files. RED proof: with the view-model fix set aside, the new file had 8 fail / 5 pass; with it, 13/13. Component (.tsx) tests, typecheck and lint: BLOCKED locally, because node_modules could not be installed (the frozen Bun install gets 403 on the private registry the lockfile pins, and an unpinned install from the public registry is not allowed). CI is authoritative for those: 35/35 required checks NOT_MEASURED until CI runs on the PR head.
post_merge_check: After a founder-approved merge and deploy, with live /version.json reporting the merge SHA: on the disposable smoke account, open Timeline, expand a calendar day with a log for a live plant saved via Quick Log, and confirm it shows the plant's name, not "Deleted plant". NOT_MEASURED.
reviewer_seat: NOT_MEASURED. No Reviewer-seat verdict was recorded before the merge. The only review is an APPROVE from matt816cheek-bit at a6fccd5, an account not on the roster, so it is not an independent exact-head PASS under OWNERSHIP.md. A post-merge independent review of 9f5950d is still owed. Exclude this Claude thread session (author).
reviewer_sha: NOT_MEASURED
blockers: none. 35/35 required checks were green at a6fccd5 before the merge. Process flag: merged without a recorded independent PASS, minutes after Matthew asked for #2980 to be taken out of the merge queue until Reviewer C or D passed it.
session_state: Claude thread session (author, single writer). No comments posted, no workflows paused.
claimed_by: Claude thread session, at Matthew's "Build it" on 2026-11-16.
resume_here: none for this slice. Owed: a post-merge independent review of 9f5950d, then the post_merge_check after the founder publishes.
last_updated: 2026-11-17, by the Claude thread session (author).
```
