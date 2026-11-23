# QUICKLOG-V2-NOTE-TOAST-20261123

```text
TASK QUICKLOG-V2-NOTE-TOAST-20261123  priority: other  status: OPEN
goal: the Dashboard Quick Log sheet (QuickLogV2Sheet) save toast shows the first line of the saved note, the same as QuickLog.tsx after #3031.
why: issue #3063 (P3, from a simulated first-use walkthrough). The Dashboard save toast showed only "Log saved · <target>", so a new grower could not see which note went in.
branch: posthog-self-driving/fixquick-log-show-the-note-text-in-the-5e569c
base: verdant-grow-diary (started at 9c7339428)
checkout: git fetch origin posthog-self-driving/fixquick-log-show-the-note-text-in-the-5e569c verdant-grow-diary && git switch posthog-self-driving/fixquick-log-show-the-note-text-in-the-5e569c && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: draft PR from the branch above (number recorded on update)
head_sha: recorded on the PR; this file is written before the first push
state: pushed draft
current_step: draft PR open; CI running
next_action: confirm 35/35 required checks at the head, then request an eligible independent review at the exact head
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and its fixture plant: open Quick Log from the Dashboard, save a note "[smoke <timestamp>] toast check", and confirm the toast description quotes that first line
active_writer: PostHog self-driving Claude session for inbox report 01a20a2f-7e02-7edc-9c01-2f3bad46a6c1
decisions: reuse buildQuickLogNoteSavedToast (src/lib/quickLogNoteSaveRules.ts) and pass its description into showTimelineConfirmation. The text comes from res.persistedNote, which useQuickLogV2Save sets only for a confirmed note save, so Water and Feed toasts do not change. The toast title stays "Log saved · <target>" so the existing pins hold.
tried_and_rejected: changing the new-plant Tent default to the only tent. resolveInitialPlantTentId fails closed on purpose (#642, #645) and tests pin it; that needs Matthew's decision, so it is out of scope here.
commands: bunx vitest run src/test/quick-log-timeline-cta-integration.test.tsx src/test/quick-log-note-save-rules.test.ts src/test/quick-log-failed-save-retry.test.tsx src/test/quick-log-v2-refresh-sheet.test.tsx --reporter=dot
files_touched: src/components/QuickLogV2Sheet.tsx, src/test/quick-log-timeline-cta-integration.test.tsx
files_remaining: none planned
blockers: none
open_questions: should a new plant default to the grower's only tent (issue #3063, second item)? Matthew's decision.
gotchas: 21 QuickLogV2Sheet storage-failure tests fail in the PostHog sandbox on the base commit too (Node 26 runtime); CI is the evidence for those.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3063
artifacts: PR checks on the draft PR
reviewer_seat: eligible independent reviewer (not this session)
reviewer_sha: none yet
session_state: PostHog self-driving cloud task; no routines or paused workflows
claimed_by: PostHog self-driving Claude session, 2026-11-23 15:20 CT
owner: PostHog self-driving Claude session
last_updated: 2026-11-23 15:20 CT, by Claude
```
