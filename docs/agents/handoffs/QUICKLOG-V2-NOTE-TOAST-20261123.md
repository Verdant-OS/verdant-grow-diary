# QUICKLOG-V2-NOTE-TOAST-20261123

```text
TASK QUICKLOG-V2-NOTE-TOAST-20261123  priority: other  status: OPEN
goal: the Dashboard Quick Log sheet (QuickLogV2Sheet) save toast shows the first line of the saved note, the same as QuickLog.tsx after #3031.
why: issue #3063 (P3, from a simulated first-use walkthrough). The Dashboard save toast showed only "Log saved · <target>", so a new grower could not see which note went in.
branch: posthog-self-driving/fixquick-log-show-the-note-text-in-the-5e569c
base: verdant-grow-diary (started at 9c7339428)
checkout: git fetch origin posthog-self-driving/fixquick-log-show-the-note-text-in-the-5e569c verdant-grow-diary && git switch posthog-self-driving/fixquick-log-show-the-note-text-in-the-5e569c && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3067
head_sha: code commit acd4d6a1d940a608e2a7927c415b10553cf8153a (2026-11-23 15:22 CT); the commit that adds this update is the PR head, so read the exact head from the PR
state: ready (non-draft)
current_step: PR #3067 is ready (non-draft). The required CI set is 40 checks (39 pass + 1 skip) at the previously reviewed head e8a6afa65f475d3d49ae2cecd1d65c9b050710f0. No CI result is recorded for any later head.
next_action: GATED: clean Seat A + Seat C PASS at exact head + Cheek's own-words yes at the SHA (locked test src/test/quick-log-timeline-cta-integration.test.tsx modified, additive).
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and its fixture plant: open Quick Log from the Dashboard, save a note "[smoke <timestamp>] toast check", and confirm the toast description quotes that first line
active_writer: PostHog self-driving Claude session for inbox report 01a20a2f-7e02-7edc-9c01-2f3bad46a6c1
decisions: reuse buildQuickLogNoteSavedToast (src/lib/quickLogNoteSaveRules.ts) and pass its description into showTimelineConfirmation. The text comes from res.persistedNote, which useQuickLogV2Save sets only for a confirmed note save, so Water and Feed toasts do not change. The toast title stays "Log saved · <target>" so the existing pins hold.
tried_and_rejected: changing the new-plant Tent default to the only tent. resolveInitialPlantTentId fails closed on purpose (#642, #645) and tests pin it; that needs Matthew's decision, so it is out of scope here.
commands: bunx vitest run src/test/quick-log-timeline-cta-integration.test.tsx src/test/quick-log-note-save-rules.test.ts src/test/quick-log-failed-save-retry.test.tsx src/test/quick-log-v2-refresh-sheet.test.tsx --reporter=dot
files_touched: src/components/QuickLogV2Sheet.tsx, src/test/quick-log-timeline-cta-integration.test.tsx
files_remaining: none planned
blockers: none. A `resume here` PR comment was not posted: CURRENT_STATE "Start here" says GitHub comments need Matthew's approval
open_questions: should a new plant default to the grower's only tent (issue #3063, second item)? Matthew's decision.
gotchas: 21 QuickLogV2Sheet storage-failure tests fail in the PostHog sandbox on the base commit too (Node 26 runtime); CI is the evidence for those.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3063
artifacts: required CI set is 40 checks (39 pass + 1 skip) at the previously reviewed head e8a6afa65f475d3d49ae2cecd1d65c9b050710f0. No CI result is recorded for any later head.
reviewer_seat: GATED: clean Seat A + Seat C PASS at exact head + Cheek's own-words yes at the SHA (locked test src/test/quick-log-timeline-cta-integration.test.tsx modified, additive).
reviewer_sha: none yet
session_state: PostHog self-driving cloud task; no routines or paused workflows
claimed_by: PostHog self-driving Claude session, 2026-11-23 15:20 CT
owner: PostHog self-driving Claude session
last_updated: 2026-11-24 05:56 CT, by Grok (paperwork only)
```
