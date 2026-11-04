### PLANT-TIMELINE-PHOTO-THUMBNAIL

```text
TASK PLANT-TIMELINE-PHOTO-THUMBNAIL  priority: P2  status: CLOSED
goal: show the photo on a Plant Detail Relative Timeline row; prod showed only the note for a Photo-only log (Hashato #1, 2026-10-27 ~3:55 PM CT) while the header and Recent photos showed it.
why: the row's "Photo" badge came from the raw row, but PlantRelativeTimelineSection never signed or rendered photo_url. Blocks Lemon G's Photo Quick Log episode.
branch: claude/new-session-6xw9g6
base: verdant-grow-diary
checkout: None; closed (merged). Historical: git fetch origin claude/new-session-6xw9g6 verdant-grow-diary && git switch claude/new-session-6xw9g6 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2559 (merged)
head_sha: 422df91667a13204988093fa0029b76dcb5d19d5 (final PR head; base merge of 27991451 over a0381f65 resolving the HANDOFF_LOG conflict); merge commit b99d7cb80d95b525c62863d4390f41295e68d51d on the deploy branch
state: CLOSED (merged). Last recorded open state: pushed; marked ready by Matthew 2026-10-27 21:48 UTC
current_step: Closed. Last open step: ready for review (Matthew, 21:48 UTC), auto-merge on; review fixes pushed; awaiting required CI and an independent exact-head PASS at the current head
next_action: None; closed. The post_merge_check below stays owned by this block: if the live photo-row check fails after Publish, this work reopens with the same owner.
post_merge_check: after Publish, on verdantgrowdiary.com open the fixture plant's timeline with a Photo-only log; the row shows a thumbnail that opens full size. Until live /version.json reports the SHA: NOT_MEASURED.
active_writer: none; branch claude/new-session-6xw9g6 retired after merge
decisions: sign through the existing owner-guarded useDiaryPhotoDisplayRows; keep projection on raw rows so a pending/failed signature never flips the Photo badge; reuse TimelinePhotoLightbox for tap-to-open; order lightbox by visible timeline items via new pure buildOrderedTimelinePhotoLightboxList.
tried_and_rejected: signing rows before projection (would relabel photo rows as Note while signing is pending or failed).
commands: bunx vitest run src/test/plant-relative-timeline-photo-thumbnail.test.tsx; node --max-old-space-size=6144 node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
files_touched: src/components/PlantRelativeTimelineSection.tsx; src/lib/timelinePhotoLightboxRules.ts; src/test/plant-relative-timeline-photo-thumbnail.test.tsx; src/test/relative-timeline-projection.test.tsx, src/test/plant-last-updated-local-date-2206.test.tsx, src/test/plant-last-updated-utc-midnight-2206.test.tsx (stub the signing hook: they render without a QueryClient)
files_remaining: none
blockers: none for repository work; Publish and the live check are Matthew's
open_questions: none
gotchas: relative-timeline-projection.test.tsx was already prettier-unclean on base (line 704); left as is
links: handoff 2026-10-27 4:20 PM CT (OG Kush)
artifacts: PR checks
reviewer_seat: Sour Diesel review session (login cheekhimself), review-only, neither authored nor repaired; recorded as the OWNERSHIP.md section 4.3 independent acceptance. Excluded: Claude session_017UoYKzLzTv1RAhx1Cc7Pme (author), connector bots.
reviewer_sha: 422df91667a13204988093fa0029b76dcb5d19d5, review 5675123292 at 2026-10-27 22:11 UTC: "no blocking findings" (merge-only head; none of the 7 PR code/test files changed vs a0381f65, where review 5675069721 was 0 blocking / 1 should-fix / 1 nit, both fixed in 422df916 per comment 6454987310)
session_state: no routines; no paused workflows
claimed_by: Claude session_017UoYKzLzTv1RAhx1Cc7Pme, 2026-10-27 16:25 CT (Matthew's handoff prompt, item 1)
owner: Claude session_017UoYKzLzTv1RAhx1Cc7Pme
last_updated: 2026-10-28 04:45 UTC, by Claude (handoff-close session, branch claude/handoff-close-2559-2028) (closure)
closure: #2559 merged as b99d7cb80d95b525c62863d4390f41295e68d51d at 2026-10-27 22:22:53 UTC by cheekhimself from final head 422df91667a13204988093fa0029b76dcb5d19d5. Required checks at that head: 35/35 SUCCESS (all 32 Full test suite shards, "Lint, typecheck, test, build", "Preflight — edge shared-lib mirror in sync", test:legal-seo), read from the PR status rollup at closure time; no non-green supplemental check. Independent acceptance: Sour Diesel 5675123292 at the exact head. Post-merge live check (photo-row thumbnail on verdantgrowdiary.com) NOT_MEASURED at closure; it reopens this block with the same owner if it fails. Closed by this follow-up PR.
```
