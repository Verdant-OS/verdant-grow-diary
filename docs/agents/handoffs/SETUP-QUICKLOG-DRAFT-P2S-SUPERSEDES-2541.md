# SETUP-QUICKLOG-DRAFT-P2S-SUPERSEDES-2541

```text
TASK SETUP-QUICKLOG-DRAFT-P2S-SUPERSEDES-2541  priority: P2  status: CLOSED
closed: merged. #2565 merged into verdant-grow-diary on 2026-10-30 as 081f5132cb3ad3ec479d0af9a61390f1460ac316 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: supersede draft #2541 (head 7250689864da30155a4bb85d1f0eedb6de1298a9) with Sour Diesel review 5674348317's P2s addressed.
why: Matthew (2026-10-27) asked for a replacement PR for #2541 even though its handoff block names a Grok cloud agent as writer; cursor/setup-quicklog-draft-retry-8b19 was not touched.
branch: claude/setup-quicklog-draft-retry-p2s (created at 7250689864da30155a4bb85d1f0eedb6de1298a9)
base: verdant-grow-diary
checkout: git fetch origin claude/setup-quicklog-draft-retry-p2s verdant-grow-diary && git switch claude/setup-quicklog-draft-retry-p2s && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2565
head_sha: 0b96e783706335b8b4b88ada3914fc16264af571 was the remote tip, observed on origin at 2026-10-28 05:47 UTC, before this commit; the tip after it is the commit that carries this block (git rev-parse origin/claude/setup-quicklog-draft-retry-p2s)
state: ready for review; Matthew granted Claude authority to mark it ready (2026-10-28, session_017UoYKxgRTFgtyQW6ka38Ec); base verdant-grow-diary merged in. Ready is not merge: merge still needs 35/35 required checks, an independent exact-head PASS and the merge gate
current_step: Codex 2026-10-28 P2s addressed: stale reopen write (3f10b42), every-plan roster gate with step forms hidden until hydration (289b15f), plant retry id held until the plant id is recorded (de0101a); Copilot plantStage validation and sessionStorage test read (de0101a). Codex 4397081026 (clear the session draft when reviewing a mismatched saved note) and 4397081028 (re-baseline the response target on a mounted reopen) fixed; reviewer nits: STAGES derived from START_YOUR_ROOM_PLANT_STAGES, crypto unstubbed, roster-error gate scoped to before hydration for unlimited plans. Awaiting CI and an independent exact-head review
next_action: confirm 35/35 required checks at the new head, then route to an eligible reviewer who neither authored nor repaired this PR; then merge this branch into claude/start-room-one-step (#2582)
post_merge_check: after Publish, on the fixture account, open Quick Log for plant A, type a note, close; open for plant B: no note. NOT_MEASURED until live /version.json reports the SHA.
active_writer: Claude session_017UoYKxgRTFgtyQW6ka38Ec
decisions: review 5677106832 P2 (Matthew 2026-10-28, "restore text, no target"): with no explicit or route target, restorableQuickLogObservationDraft returns the draft's words with selectedKey null, saveFailed false and no idempotency key (only definitive rejections are stored, so nothing committed under that key); the notice reads QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY; the remembered-target ban holds. CodeRabbit 4395104891: Retry button and retry copy show only for definitive save errors (isStartRoomRetryableSaveError), not validation, gate, safe-save-start or unknown-outcome errors; P2-1 restore only when draft target equals the sheet's explicit/route target, plus a visible restored line; P2-3 append the server reason to the existing plain copy (keeps scorer-locked tests); P2-4 adopt a pending grow id already in the owned grows list after hydrate; P2-2 NOT changed (see tried_and_rejected).
tried_and_rejected: P2-2 persisting the idempotency key for ambiguous outcomes. It broke quick-log-v2-exact-recovery ("verified but subsequently edited saved note") by resurrecting the old key for a deliberate new entry. Durable Note/Watering recovery already keeps the key across reloads.
commands: bunx vitest run $(grep -rlE "StartYourRoom|startYourRoom|QuickLogV2Sheet|quickLogObservationDraft" src/test) (93 files / 970 tests at de0101a); NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
files_touched: src/components/QuickLogV2Sheet.tsx; src/lib/quickLogObservationDraftRules.ts; src/lib/startYourRoomDraftRules.ts; src/lib/startYourRoomRules.ts; src/pages/StartYourRoom.tsx; src/test/quick-log-observation-draft-scope.test.tsx; src/test/start-your-room-save-reason-and-adopt.test.tsx; src/test/start-room-quick-log-draft-p2-rules.test.ts; src/test/start-your-room-draft-grows-read-error.test.tsx; src/test/start-your-room-plant-retry-id.test.tsx; src/test/quick-log-v2-exact-recovery.test.tsx
files_remaining: none
blockers: none for repository work
open_questions: put to Matthew 2026-10-28: (1) Codex 4396973931, a deleted tent restores the plant step and every plant insert fails closed; fix here or in a follow-up? (2) Copilot 4397048019, busy flag can carry across an account switch during one in-flight save; no data crosses accounts; not changed. (3) CodeRabbit Major 2, persist Water/Feed inputs. (4) Copilot 4396952153, keep typed tent/plant names when the stored grow is gone (kept by design)
gotchas: src/test/start-your-room-draft-retry.test.tsx and start-your-room-draft-hydration.test.tsx are scorer-locked and unchanged; do not add saveIdempotencyKeyRef.current = newQuickLogSaveKey() assignments (counted by quicklog-manual-idempotency-static.test.ts)
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2565 (this PR); https://github.com/Verdant-OS/verdant-grow-diary/pull/2541 (superseded); https://github.com/Verdant-OS/verdant-grow-diary/pull/2582 (stacked on this branch)
artifacts: PR checks
reviewer_seat: not assigned (OG Kush routes; excluded: session_017UoYKzLzTv1RAhx1Cc7Pme as author, session_017UoYKxgRTFgtyQW6ka38Ec as repairer)
reviewer_sha: none
session_state: no routines; no paused workflows
claimed_by: Claude session_017UoYKxgRTFgtyQW6ka38Ec, 2026-10-28 (Matthew reassigned this branch from session_017UoYKzLzTv1RAhx1Cc7Pme to address review 5677106832; prior holder told to stop pushing)
owner: Claude session_017UoYKxgRTFgtyQW6ka38Ec
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-10-28 06:26 UTC, by Claude session_017UoYKxgRTFgtyQW6ka38Ec (merged verdant-grow-diary a5ac6a9; HANDOFF_LOG conflict resolved by keeping both blocks))
```
