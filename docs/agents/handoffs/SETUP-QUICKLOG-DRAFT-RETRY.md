# SETUP-QUICKLOG-DRAFT-RETRY

```text
TASK SETUP-QUICKLOG-DRAFT-RETRY  priority: other  status: CLOSED
goal: Keep every typed field in Start Your Room and the first Quick Log observation when a save fails or the grower leaves mid-flow, show a plain error, and let Retry write that same save once. Advance only after the server confirms the save.
why: A failed or abandoned setup step was dropping names and notes, and a second tap could start another write.
branch: cursor/setup-quicklog-draft-retry-8b19
base: verdant-grow-diary
checkout: git fetch origin cursor/setup-quicklog-draft-retry-8b19 verdant-grow-diary && git switch cursor/setup-quicklog-draft-retry-8b19 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2541
head_sha: 4c8b625c6db91502c161468608a4f241c869cc1e is the owner-switch repair. The branch tip is the handoff commit whose parent is that SHA; confirm with git rev-parse origin/cursor/setup-quicklog-draft-retry-8b19
state: CLOSED. Closed unmerged on 2026-11-01T21:23:55Z (#2541; superseded by #2565, see SETUP-QUICKLOG-DRAFT-P2S-SUPERSEDES-2541); final head cba472675a5d1307b8745abf7a38a970aa08ce4a. Closed 2026-11-04 by Claude session_017UoYKv4arxJYBMGNNh1bvN on Matthew's instruction (Grok no longer active); copied from its HANDOFF_LOG.md block, which stays unedited per docs/agents/handoffs/README.md.
current_step: Jack Herer review 5669691346 at bb54282818838544c0090493529a69f4274dd60d FAILed. The repair ignores a grow, tent, or plant save that finishes after the owner changes, and clears a tent or plant error when hydration falls back to the grow step. Quick Log was not changed.
next_action: none; closed. Any post_merge_check below still applies to its recorded owner.
post_merge_check: Full test suite shards and Lint, typecheck, test, build on the merged deploy head; if a required check fails, reopen this task with the same owner
active_writer: Grok cloud agent on cursor/setup-quicklog-draft-retry-8b19
decisions: Drafts live in sessionStorage under verdant.session-form.1.{userId}.{formId} and clear only after a confirmed save. Start Your Room reuses one hierarchy row id until that confirmation and blanks a name in the stored draft once its id is set so a later empty form does not inherit a confirmed name. Confirmed Quick Log observation retries keep the same p_idempotency_key, including after remount, by storing that key on the draft. The open-sheet key mint line stays so the existing five-rotation source pin still matches; a stored key overwrites it when present. Viewport coverage is jsdom innerWidth 390 and 1280 because the sheet is not viewport-branched.
tried_and_rejected: Editing src/test/start-your-room-enter-submits.test.tsx is refused by scripts/scorer-lock.mjs. Restoring confirmed names into sessionStorage made the next test read "Bound TentEnter Tent". Awaiting the first Retry click advanced the wizard before the second click. Treating two sequential Retry clicks as one RPC was wrong: the in-flight flag releases after a definitive rejection, so the second click is a second call with the same key. A remount that minted a new key was rejected because Retry would no longer be one logical save.
commands: export PATH="$HOME/.bun/bin:$PATH"; NODE_OPTIONS="--max-old-space-size=8192" bun run typecheck; bunx vitest run src/test/start-your-room-draft-owner-switch.test.tsx src/test/start-your-room-draft-hydration.test.tsx src/test/start-your-room-draft-retry.test.tsx src/test/start-your-room-enter-submits.test.tsx src/test/start-your-room-resume.test.tsx --reporter=dot
files_touched: src/pages/StartYourRoom.tsx src/components/QuickLogV2Sheet.tsx src/lib/sessionFormDraftRules.ts src/lib/sessionFormDraftStore.ts src/lib/startYourRoomDraftRules.ts src/lib/quickLogObservationDraftRules.ts src/test/start-your-room-draft-retry.test.tsx src/test/quick-log-observation-draft-retry.test.tsx src/test/start-your-room-draft-hydration.test.tsx src/test/start-your-room-draft-owner-switch.test.tsx docs/agents/HANDOFF_LOG.md
files_remaining: none for this slice
blockers: none for the code change. Merge, auto-merge, publish, and production writes are out of scope.
open_questions: none
gotchas: Do not restore a confirmed grow, tent, or plant name into the stored draft. Do not add another saveIdempotencyKeyRef.current = newQuickLogSaveKey() assignment; quicklog-manual-idempotency-static.test.ts counts five outside the two abandonment functions. Hydrate Start Your Room only after growsLoading is false, and only restore step when draft.ids.growId is still in the grows list. Do not persist until draftHydratedFor matches the current owner and the hydrated state has committed. An owner change with no draft must reset the form, ids, pending row ids, error, and step before any write under the new key. After each save await, return without setIds or setStep when ownerIdRef no longer matches the owner captured before that await. A tent or plant save error is cleared when hydration falls back to the grow step because that grow is gone. src/test/start-your-room-draft-retry.test.tsx and src/test/start-your-room-draft-hydration.test.tsx are scorer-locked; owner-switch cases live in src/test/start-your-room-draft-owner-switch.test.tsx. Effects that read ownerId must be declared after const ownerId. Free plan still does not create a grow automatically.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2541
artifacts: RED then GREEN on src/test/start-your-room-draft-owner-switch.test.tsx (2 failed, then 5 files / 18 passed including hydration, draft-retry, resume, and enter-submits). typecheck passed with NODE_OPTIONS=--max-old-space-size=8192.
reviewer_seat: Jack Herer review 5669691346 FAILed bb54282818838544c0090493529a69f4274dd60d. That verdict does not cover the repair head.
reviewer_sha: bb54282818838544c0090493529a69f4274dd60d (FAIL, superseded by the repair)
session_state: Cursor cloud agent on cursor/setup-quicklog-draft-retry-8b19. No production smoke write.
claimed_by: Grok, 2026-10-26 11:15 CT
owner: Grok
last_updated: 2026-10-27 10:30 CT, by Grok
```
