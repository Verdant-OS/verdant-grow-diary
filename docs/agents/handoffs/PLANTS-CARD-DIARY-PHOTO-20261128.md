# PLANTS-CARD-DIARY-PHOTO-20261128

```text
TASK PLANTS-CARD-DIARY-PHOTO-20261128  priority: other  status: OPEN
goal: /plants card shows the plant's newest diary photo when it has no usable profile photo (#2257, VER-221 option A), instead of "No plant photo yet".
why: QA walks FA-20261127-M1 and FA-20261128-M1 saw the card say "No plant photo yet" after a saved photo, 4 runs in a row. Cheek picked #2257 on 2026-11-28.
branch: claude/project-thread-m07xp7
base: verdant-grow-diary
pr: pending (draft)
head_sha: pending first push
state: local commits, first push next
current_step: commit 1 = rules module, Plant Detail strip refactor and all tests (RED in CI expected for the page tests); commit 2 = /plants wiring and PlantPhoto onProfileUnavailable.
next_action: push, open draft PR, record RED run, push fix, record green 35/35, request one Seat A review.
post_merge_check: signed in on the test fixture grow, save a Quick Log photo on a plant with no profile photo, open /plants, card shows that photo (not "No plant photo yet"). Until then NOT_MEASURED.
active_writer: Claude thread session on claude/project-thread-m07xp7
decisions: ported the reviewed code from closed draft #2262 (commits 4e8742bc0, ad03fb277, 892077f0e) instead of rewriting. Dropped its allowPartial option because base useDiaryPhotoDisplayRows already keeps partially signed batches. Reads the scoped diary rows (rawDiary) the page already loads; no new query. TentDetail cards (same pattern) left out of scope.
tried_and_rejected: bun install --frozen-lockfile in this sandbox (Lovable registry 403), so local vitest/tsc are BLOCKED; CI is the gate.
commands: bunx vitest run src/test/plant-list-photo-fallback-rules.test.ts src/test/plants-card-diary-photo-fallback.test.tsx src/test/plants-card-deleted-profile-fallback.test.tsx --reporter=dot
files_touched: src/lib/plantListPhotoFallbackRules.ts; src/hooks/usePlantDetailPhotoStripItems.ts; src/pages/Plants.tsx; src/components/PlantPhoto.tsx; three test files; this file
files_remaining: none in scope. Follow-up outside scope: TentDetail.tsx plant cards.
blockers: one independent Seat A pass at the exact head and Cheek's yes naming PR + SHA. This session does not merge.
open_questions: none
gotchas: no schema, RLS, edge or _shared change. Signing stays owner-guarded by diaryPhotoDisplayRules.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/2257 ; prior draft https://github.com/Verdant-OS/verdant-grow-diary/pull/2262
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude thread session, 2026-11-28 10:40 UTC
owner: Claude thread session on this branch
last_updated: 2026-11-28, by Claude
```
