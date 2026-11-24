# TIMELINE-NOTE-MARKER-CHIP-3073

```text
TASK TIMELINE-NOTE-MARKER-CHIP-3073  priority: other  status: OPEN
goal: a saved Quick Log Note shows no raw "quick_log_activity: note" chip on the Timeline card. Display only.
why: issue #3073. A new Note carries the internal details key quick_log_activity (src/lib/quickLogNoteMarkerRules.ts). presentTimelineDiaryEntryDetails sends every details key that is not in HIDDEN_DIARY_DETAIL_KEYS to the raw extra chips, and Timeline.tsx draws each one as a capitalized "key: value" chip. The marker was not in the list.
branch: posthog-self-driving/fixtimeline-hide-the-raw-ba0aab (name fixed by the PostHog run that opened it)
base: verdant-grow-diary (started at 9c844347c)
checkout: git fetch origin posthog-self-driving/fixtimeline-hide-the-raw-ba0aab verdant-grow-diary && git switch posthog-self-driving/fixtimeline-hide-the-raw-ba0aab && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: the draft PR from posthog-self-driving/fixtimeline-hide-the-raw-ba0aab
head_sha: the PR's live head (not pinned here)
state: pushed draft
current_step: fix and test committed together
next_action: required CI at the PR head, then an eligible independent exact-head review
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and its fixture plant: save a [smoke <timestamp>] Note from Quick Log, open Timeline, and confirm the card has no "Quick_log_activity: Note" chip; NOT_MEASURED until then
active_writer: PostHog Desktop self-driving Claude session (inbox report 01a20cc2-557d-7f11-8bc2-a2a5114ccf47)
decisions: add QUICK_LOG_NOTE_MARKER_KEY to HIDDEN_DIARY_DETAIL_KEYS, imported from the dependency-free marker module (the presentation rules file is not mirrored to supabase/functions/_shared, so no mirror change). The marker stays on the row: Note/Issue headings read it.
tried_and_rejected: none
commands: bunx vitest run src/test/timelineDiaryEntryDetailPresentationRules.test.ts --reporter=dot
files_touched: src/lib/timelineDiaryEntryDetailPresentationRules.ts, src/test/timelineDiaryEntryDetailPresentationRules.test.ts
files_remaining: none planned
blockers: none
open_questions: other Note/Observation label differences named in #3073 (other pages, a photo card with "Note" and no body) are separate surfaces and are not in this change.
gotchas: no schema, RLS, edge, auth, billing or production change. No migration.
reviewer_seat: eligible independent reviewer per the roster, not this session
reviewer_sha: none yet
session_state: PostHog Desktop self-driving run; no routines or paused workflows
claimed_by: PostHog Desktop self-driving Claude session, 2026-11-24
owner: PostHog Desktop self-driving Claude session
last_updated: 2026-11-24, by Claude
```
