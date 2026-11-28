# PLANTS-CARD-DIARY-PHOTO-20261128

```text
TASK PLANTS-CARD-DIARY-PHOTO-20261128  priority: other  status: OPEN
goal: /plants card shows the plant's newest diary photo when it has no usable profile photo (#2257, VER-221 option A), instead of "No plant photo yet".
why: QA walks FA-20261127-M1 and FA-20261128-M1 saw the card say "No plant photo yet" after a saved photo, 4 runs in a row. Cheek picked #2257 on 2026-11-28.
branch: claude/project-thread-m07xp7
base: verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3121 (draft)
head_sha: the PR head after this docs commit (a file cannot name its own commit). Code head before it: 54c46bdbc6120763ee257d7f35933ec320a4a929. Read the live head from the PR.
state: pushed draft
current_step: RED proven at 2e3eb289bfd990a7aa41132670443e23df38635f (dispatched CI run 46137285445: shards 20 and 22 fail, 9 page tests in the two page files, all other jobs green). Fix 54c46bdbc6120763ee257d7f35933ec320a4a929 green (dispatched CI run 46137305220, 35/35 required). Draft PRs skip ci.yml jobs, so CI is run with workflow_dispatch on the branch.
next_action: confirm 35/35 at the current head (dispatch ci.yml on the branch), then one independent Seat A pass at that exact head. Then Cheek's yes naming PR and SHA. Do not ready, enqueue or merge.
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
reviewer_seat: Seat A (Sour Diesel), to be routed by Cheek to UK Cheese; exclusions: Claude author session, VReviewer, matt816cheek-bit
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude thread session, 2026-11-28 10:40 UTC
owner: Claude thread session on this branch
last_updated: 2026-11-28, by Claude
```
