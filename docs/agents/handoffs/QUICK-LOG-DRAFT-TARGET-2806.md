# QUICK-LOG-DRAFT-TARGET-2806

```text
TASK QUICK-LOG-DRAFT-TARGET-2806  priority: P2  status: OPEN
goal: Keep a Quick Log observation draft with the plant or tent it was typed for, and warn before Cancel, Back, or refresh when that entry is not empty.
why: Issue #2806. One sessionStorage slot held every target. Opening Quick Log with no target restored an older draft (the no-target copy "Restored your unsaved entry. Choose a plant or tent before you save."), and typing for a second target overwrote the first. Cancel, Back, and F5 dropped a half-typed note with no warning.
branch: cursor/quick-log-draft-target-d610
base: verdant-grow-diary
checkout: git fetch origin cursor/quick-log-draft-target-d610 verdant-grow-diary && git switch cursor/quick-log-draft-target-d610
pr: created with this push; read the PR URL from the branch
head_sha: 138e21e43c28311de0886cf933f6642a4a3318d0 is the fix. Review the branch tip of origin/cursor/quick-log-draft-target-d610 (this handoff stamp is the child of that fix). Confirm with git rev-parse.
state: implemented, draft PR
current_step: per-target session slots, exact-match restore, leave warning, regression tests
next_action: independent exact-head review after required CI is green at the pushed SHA. Do not merge. No production write.
post_merge_check: after /version.json on https://verdantgrowdiary.com reports this SHA, open Quick Log, type a note, use Back or refresh or Cancel, reopen the same plant or tent, and confirm that note returns and a different tent does not show it. NOT_MEASURED until then. No production write.
active_writer: Grok cloud agent on cursor/quick-log-draft-target-d610
decisions: one session slot per plant or tent (action stays inside the payload, so Feed notes still restore on the same target); a targeted draft never restores when the sheet target is null or different; an older single-slot draft is adopted only when its target matches, then removed; an untargeted note may move onto the first empty target the grower picks and never from target A onto target B; Cancel, Back, and refresh ask only when the observation is not empty, and confirming leave keeps the draft; confirm runs after the in-flight and retry close blocks
tried_and_rejected: splitting storage by action would drop the Feed-note restore, because reopen would not know which action slot to read; a standing history.pushState on every keystroke was not used, because AppShell already closes the sheet on location.key change and the draft has to survive that close
commands: NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck; bunx vitest run src/test/quick-log-observation-draft-target-scope.test.tsx src/test/quick-log-observation-draft-scope.test.tsx src/test/start-room-quick-log-draft-p2-rules.test.ts src/test/quick-log-observation-draft-fields-retry.test.tsx src/test/quick-log-feed-draft-restored-notice.test.tsx src/test/quick-log-v2-exact-recovery.test.tsx src/test/quick-log-v2-sheet-watering.test.tsx src/test/quick-log-v2-recent-target-suggestion.test.tsx src/test/quick-log-recent-target-chip.test.tsx --reporter=dot
files_touched: src/lib/quickLogObservationDraftRules.ts src/components/QuickLogV2Sheet.tsx src/test/quick-log-observation-draft-target-scope.test.tsx src/test/quick-log-observation-draft-scope.test.tsx src/test/start-room-quick-log-draft-p2-rules.test.ts src/test/quick-log-observation-draft-fields-retry.test.tsx src/test/quick-log-v2-exact-recovery.test.tsx src/test/quick-log-v2-sheet-watering.test.tsx docs/agents/handoffs/QUICK-LOG-DRAFT-TARGET-2806.md
files_remaining: none for this slice
blockers: none for repository work. Review and merge stay with their seats. No migration, Edge, secret, or production write.
open_questions: none
gotchas: RED before the sheet was wired was 2 failed | 2 passed in src/test/quick-log-observation-draft-target-scope.test.tsx (target collision, and Cancel/Back/refresh warning). Exact-match restore already stopped the no-target restore. Pins that expected a targeted draft to come back with no target, the legacy storage key, and two Close/Cancel paths that now confirm, were renegotiated in this change. .claude/scorer-unlock.json is local only. jsdom window.confirm is a no-op that returns undefined, so tests that dismiss a non-empty sheet must stub confirm to true.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/2806
artifacts: src/test/quick-log-observation-draft-target-scope.test.tsx
reviewer_seat: not requested
reviewer_sha: none
session_state: Grok implementation session
claimed_by: Grok 2026-11-06
owner: Grok
last_updated: 2026-11-06, by Grok
```
