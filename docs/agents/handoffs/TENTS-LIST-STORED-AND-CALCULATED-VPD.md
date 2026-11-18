# TENTS-LIST-STORED-AND-CALCULATED-VPD

```text
TASK TENTS-LIST-STORED-AND-CALCULATED-VPD  priority: P2  status: OPEN
goal: The /tents list shows a stored VPD reading and the VPD calculated from the card's own temperature and RH side by side, each labelled with where it came from ("Stored reading" / "Calculated from temperature and RH").
why: Core-loop walk L5 (2026-11-18): one tent at 77°F / 55% RH read 1.10 kPa on /tents (stored vpd_kpa) and 1.43 kPa on the Dashboard (calculated). Matthew picked "Both, labeled" on 2026-11-18 05:31 UTC in the project chat (reply to the coordinator's three-option question).
branch: claude/project-thread-nggu4s
base: verdant-grow-diary @ 898f4853842fdc70915ec03525565c2ec86117e4
pr: the PR for this branch (number in the PR body)
head_sha: read the current head from the PR and verify with git ls-remote
state: Matthew marked the PR ready and matt816cheek-bit approved it at ddea75b; that approval does not carry to the head that fixes the two Codex P2s below and must be given again at the new head. No independent review yet.
next_action: required checks at the new head; one eligible independent reviewer (not this session) at the exact head; then Matthew's approval and per-item yes at that head and the merge queue. This writer does not approve, enqueue or merge.
post_merge_check: after live /version.json reports the merge SHA, signed in on the disposable test account, open /tents and expect the walk's tent card (77°F / 55% RH, stored 1.10 kPa) to show "1.10 kPa · Stored reading" and "1.43 kPa · Calculated from temperature and RH". No write needed.
decisions:
  - Show, do not choose: Tonight's canonical selection and every existing withholding rule stay unchanged. The view model only tags the shown VPD number with origin stored/calculated (MetricView.origin) and passes Tonight's own `calculated` flag through CanonicalTentVpd.
  - The calculated companion (tentsListCalculatedVpd, pure, in tentsListVpdRules.ts) appears only when the shown VPD is stored, uses only the temperature and RH of the card's own latest cohort (snapshotFromReadings over the same rows), is withheld when either input is missing, unknown or invalid, inherits Stale/Degraded from its inputs, and never renders a healthy chip from a stale input. Zero is a value.
  - The companion uses calculateVPD (the view model's own cohort calculator), so the list and the view model cannot round differently.
  - The companion element uses data-calculated-status, not data-status, so existing counts of [data-status=...] on the strip are unaffected.
  - Dashboard is not changed: it builds the same view and ignores the new optional field.
  - Codex on #3006 at ddea75b (two P2s) asked for Tonight's own fences on the companion: it now picks the first temperature and RH rows at the latest instant (as snapshotFromReadings does), withholds when their known capture refs differ (two devices at one instant) or their sources differ (live with stale reads stale), withholds when RH is pinned at 0% or 100%, and marks CSV inputs degraded / Historical. Tonight's fences are module-private, so the companion mirrors them rather than importing.
tried_and_rejected:
  - Changing which value Tonight's canonical VPD picks: rejected; Matthew asked for both values shown, and the canonical rules carry many reviewed safety fences.
commands: bunx vitest run src/test/tents-list-stored-and-calculated-vpd.test.tsx src/test/tents-list-canonical-vpd.test.tsx src/test/tents-list-sensor-truth.test.tsx --reporter=dot
files_touched (both commits): src/lib/dashboardEnvironmentSnapshotViewModel.ts; src/lib/tentsListVpdRules.ts; src/components/TentEnvironmentSnapshotStrip.tsx; src/test/tents-list-stored-and-calculated-vpd.test.tsx (new); docs/agents/handoffs/CLOSE-CORE-LOOP-FIX-HANDOFFS-20261118.md (closed); this file (new)
files_remaining: none
blockers: local vitest and tsc are BLOCKED in this environment (no node_modules; the frozen install 403s and an unpinned install is not allowed). The rule paths were probed with bun against the real modules, with only date-fns stubbed; CI is the gate.
open_questions: none
gotchas: many strip tests pin behaviour with review history (Codex/Copilot on #2303, #2412, #2422, #2437, #2442, #2451). The change is additive; if a required shard fails, read the failing test's pinned case before touching canonical selection.
exclusions_for_review: the Claude thread session for the core-loop walk task (author)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no paused workflows; no scheduled routines.
claimed_by: the Claude thread session for the core-loop walk task, 2026-11-18 05:50 UTC
owner: the Claude thread session for the core-loop walk task
last_updated: 2026-11-18 06:05 UTC, by the Claude thread session for the core-loop walk task
```
