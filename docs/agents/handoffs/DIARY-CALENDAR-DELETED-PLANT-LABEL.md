# DIARY-CALENDAR-DELETED-PLANT-LABEL

```text
TASK DIARY-CALENDAR-DELETED-PLANT-LABEL  priority: P2  status: OPEN
goal: The Timeline calendar's detailed history labeled a live plant "Deleted plant" whenever a log row had a plant_id but no stored details.plant_name. Most save paths never store that name, so live plants read as deleted. Fix: check the owner's plant directory before saying "deleted".
branch: claude/project-thread-0b5tgz
base: verdant-grow-diary at 1f138a5
pr: draft PR into verdant-grow-diary (see the PR for its number and current head)
head_sha: read the PR head; this file is committed in the same commit as the fix, so it cannot name its own SHA.
state: Implementation and unit tests done; draft PR opened. No merge, no deploy, no production read or write.
decisions: (1) Stored details.plant_name still wins, so historic names survive a rename or delete. (2) Otherwise the id is looked up in the owner's plant directory (useTimelineNameDirectory, already loaded on Timeline). (3) "Deleted plant" only when that directory has loaded and lacks the id. (4) While the directory is loading, failed, or not passed, the label stays blank, never "deleted". This matches how Timeline cards already resolve names (resolveTimelineCardPlaceLabels). (5) Logic lives in the pure view model; the component only passes the map through.
tried_and_rejected: Querying plants inside the calendar (a second read path); rejected because Timeline already holds the owner's directory.
known_limit: If the directory query is ever truncated by a row limit, a live plant beyond it would still read as deleted. Timeline cards share this risk; not changed here.
files_touched: src/lib/diaryCalendarViewModel.ts; src/components/DiaryCalendarSection.tsx; src/pages/Timeline.tsx; src/test/deleted-plant-display.test.ts (pin renegotiated: the leftover-id case now passes a loaded empty directory); src/test/diary-calendar-deleted-plant-directory.test.ts (new, 13 tests); this file.
files_remaining: none planned.
commands: bun test --preload <scratch>/vitest-shim.ts ./src/test/deleted-plant-display.test.ts ./src/test/diary-calendar-deleted-plant-directory.test.ts ./src/test/diary-calendar-view-model.test.ts ./src/test/diary-calendar-filter-persist-safety.test.ts  (the shim maps "vitest" to bun:test plus vi; local stand-in only)
validation: Local, pure tests only: 36 pass, 0 fail across 4 files. RED proof: with the view-model fix set aside, the new file had 8 fail / 5 pass; with it, 13/13. Component (.tsx) tests, typecheck and lint: BLOCKED locally, because node_modules could not be installed (the frozen Bun install gets 403 on the private registry the lockfile pins, and an unpinned install from the public registry is not allowed). CI is authoritative for those: 35/35 required checks NOT_MEASURED until CI runs on the PR head.
post_merge_check: After a founder-approved merge and deploy, with live /version.json reporting the merge SHA: on the disposable smoke account, open Timeline, expand a calendar day with a log for a live plant saved via Quick Log, and confirm it shows the plant's name, not "Deleted plant". NOT_MEASURED.
reviewer_seat: NOT_MEASURED. Needs a non-contributing independent reviewer (Codex, a non-contributing Claude or Grok session, or Durban Poison) at the exact PR head. Exclude this Claude thread session (author).
reviewer_sha: NOT_MEASURED
blockers: none for review; merge needs 35/35 required checks, an independent exact-head PASS with no P1/P2, and Matthew's per-item yes.
session_state: Claude thread session (author, single writer). No comments posted, no workflows paused.
claimed_by: Claude thread session, at Matthew's "Build it" on 2026-11-16.
resume_here: Check CI on the PR head; fix any failure in these files only; route an independent review at the exact head.
last_updated: 2026-11-16, by the Claude thread session (author).
```
