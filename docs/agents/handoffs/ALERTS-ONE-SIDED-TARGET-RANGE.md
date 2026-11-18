# ALERTS-ONE-SIDED-TARGET-RANGE

```text
TASK ALERTS-ONE-SIDED-TARGET-RANGE  priority: P2  status: CLOSED
closed: 2026-11-18, merged. Landed on verdant-grow-diary as 975099c8eae28ecd356d827e88d9b440d54e4bb0 (#2999, 2026-11-18 03:12 UTC) through the merge queue after Matthew's approval and enqueue. Closed by the Claude thread session for the core-loop walk task. The post_merge_check below carries forward unchanged; it is not measured by this close.
goal: The Alerts page context header reads a target with only one bound as "up to 85°F" or "at least 70°F", never "—–85°F". Two-sided ranges are unchanged ("70–85°F").
why: Found in the 2026-11-18 core-loop walk on production (UX Audit Test Tent, test entries tagged [smoke]). The header read "Temp —–85°F." for a temperature target with a maximum and no minimum, which looks like broken data to a grower. Matthew asked (2026-11-18, via coordinator relay) for each rough spot found in the walk to get its own focused branch and draft PR with tests, ready for independent review, no merges.
root_cause: formatRange in src/components/AlertsContextHeader.tsx printed "—" for each missing bound and always joined them with an en dash.
branch: claude/alerts-one-sided-target-range
base: verdant-grow-diary at 9e7e51eeee595c7c941613b5dca0116da1777cc8
pr: draft, opened after the first push
state: pushed; draft PR open; required checks running; no independent review yet
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this; (3) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: after live /version.json reports the merge SHA, signed in on the test account, open Alerts for a grow whose temperature target has a max and no min, and expect "Temp up to <max>°F." in the context header.
decisions: (1) The bounds text moved into a pure, exported formatAlertsHeaderRangeBounds in src/lib/alertFreshnessContext.ts; the component only renders it. (2) Zero is a real bound; a non-finite bound counts as missing. (3) Both bounds missing still reads "—" (buildXRange already returns null for that case, so it is not normally reached).
not_in_scope: the "repeating old note" seen on Alerts in the walk (not traced yet); Dashboard.tsx target range text uses the same "— – max" pattern and is left as is (outside this request); VPD mismatch and AI Doctor UTC time; irrigation refresh (#2997); Timeline unit (#2998).
tests: new src/test/alerts-header-one-sided-range.test.tsx (6 tests: pure formatter cases plus a render of AlertsContextHeader with a max-only °F target). Local vitest BLOCKED (no node_modules; frozen install 403s on the Lovable registry mirror). A bun probe of the pure functions returned ["70–85","up to 85","at least 70","0–1.2","up to 85","—"] and a °F temp range {min:null,max:85}. CI is the evidence for this head.
commands: bunx vitest run src/test/alerts-header-one-sided-range.test.tsx src/test/alerts-context-header-stage-settle.test.tsx --reporter=dot ; bun run typecheck
red_proof_recipe: git diff origin/verdant-grow-diary -- src/lib/alertFreshnessContext.ts src/components/AlertsContextHeader.tsx > x.patch && git apply -R x.patch ; run the new test, expect failure ; git apply x.patch
files_touched: src/lib/alertFreshnessContext.ts; src/components/AlertsContextHeader.tsx; src/test/alerts-header-one-sided-range.test.tsx (new); this file
files_remaining: none for this slice
blockers: local checks BLOCKED as above. No npm fallback used, per AGENTS.md section 16.
reviewer_seat: not yet requested; requested once required checks are green
reviewer_sha: none
session_state: no routines, no paused workflows. Pending human decisions: Matthew's merge yes after review.
claimed_by: Claude thread session for the core-loop walk task, 2026-11-18 01:45 UTC
owner: Claude thread session for the core-loop walk task
last_updated: 2026-11-18 03:45 UTC, by the Claude thread session for the core-loop walk task (previously 2026-11-18 01:45 UTC, by Claude thread session for the core-loop walk task)
```
