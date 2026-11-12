TASK WATER-UNIT-LITERS-DEFAULT priority: P2 status: OPEN

goal: A phone that never picked a Water unit opens Quick Log Water in liters. A stored choice wins. Saved rows stay whole ml.
why: Step 1 of the one-tap Watered plan. Matthew, 2026-11-12: "Let's go with one unit per phone in liters, if that is the path of least resistance." Then "Draft step 1". Then "Liters for all" (D-L1).
branch: claude/water-unit-liters-default
base: verdant-grow-diary @ c2884348875b3dd39f2059ecc323ac10c33cfde5 (2026-11-12; draft was read at a6be0915, target files unchanged)
checkout: git fetch origin claude/water-unit-liters-default verdant-grow-diary && git switch claude/water-unit-liters-default
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2966 (draft)
head_sha: 24b940f848ca093ae5240678ff846ce672be83ab (last code/test commit; this handoff-only commit moves the head)
state: Step 1 fully built on the draft PR, including the seven approved locked test edits. Tests NOT_MEASURED: local install blocked, CI skips tests on drafts.
current_step: Waiting on an independent exact-head review.
next_action: An eligible reviewer seat reviews the exact head; the test jobs run once the PR leaves draft. Merge only through the Merge Steward with Matthew's per-item yes.
post_merge_check: On a phone that never chose a unit, Quick Log, Water shows `Volume (L)`; `2` shows `Saves as 2,000 ml.`; save, reload, the entry is there. Tap `ml`, reopen, it stays ml. NOT_MEASURED until done.
active_writer: Claude (Taproot thread)
decisions:
- 2026-11-12 Matthew: one unit per phone, liters, path of least resistance.
- 2026-11-12 Matthew, D-L1: "Liters for all". Every phone with no stored unit opens in L. This is a pick, not approval to edit locked files.
- 2026-11-12T14:28:59Z Matthew: "Edit them" (the five spec §6.2 locked files). Done in 9288351a2.
- 2026-11-12T15:25:57Z Matthew: "Edit both" (tent-plant-roster-preferences and tent-plant-tabs-preferences no-write checks). Done in 24b940f84.
- src/test/setup.ts seeds `ml` so the older Water suites keep modelling an ml phone; the units suites and the new suite own the default.
tried_and_rejected:
- Heuristic "existing phone keeps ml" write (D-L1 option 2): second writer to a preference R13 says only the unit control writes; guesses who is new; 2-3x the work. Recommended against.
- Per-suite seed in 18 locked suites: same effect, 18 approvals instead of 1.
commands:
- `node scripts/scorer-lock.mjs --status`
- `node scripts/scorer-lock.mjs --unlock <path...> --reason "<why>"` (branch-bound, 24 h)
- Validation commands: spec §7.
files_touched: src/lib/quickLogWaterVolumeUnitRules.ts; src/lib/waterVolumeEntryUnitPreference.ts; docs/specs/quick-log-water-volume-units.md; docs/specs/quick-log-water-unit-liters-default.md (new); src/test/quick-log-water-liters-default.test.tsx (new); this handoff (new); LOCKED, approved: src/test/setup.ts; src/test/quick-log-water-volume-units-rules.test.ts; src/test/quick-log-water-volume-units-ui.test.tsx; e2e/quicklog-smoke.spec.ts; src/test/quicklog-route-contract-static.test.ts; src/test/tent-plant-roster-preferences.test.ts; src/test/tent-plant-tabs-preferences.test.ts
files_remaining:
- none
blockers:
- Independent exact-head review (unassigned seat).
- Test, lint and build jobs are skipped while the PR is a draft; local vitest BLOCKED (install refused by proxy, partial node_modules missing `pathe`).
open_questions:
- none
gotchas:
- The app writes the unit key only when the unit control is pressed, so "new phone" cannot be detected.
- src/test/setup.ts clears localStorage before every test. A suite testing the default must remove the unit key itself after the seed, or it passes on the seeded ml.
- The quicklog smoke label is pinned as text by quicklog-route-contract-static; change both together.
- QuickLogWateringForm.tsx and QuickLogV2Sheet.tsx `"ml"` literals are canonical-ml gate calls, not defaults. Do not touch them.
- 500 typed in L is blocked (over 50,000 ml); 20 asks to confirm (over 10,000 ml). Values under 10 typed as ml habits are not caught; accepted residual.
- A GH013 on push means stop; do not retry.
- Shared setup seeds one storage key, so any test asserting `localStorage.length === 0` must compare against the length before its own write.
links:
- Spec: docs/specs/quick-log-water-unit-liters-default.md
- Parent spec: docs/specs/quick-log-water-volume-units.md (R4, R6, R8, R9, R10, R13, R14; §8 D1 to D3)
- Concept page (v11): https://claude.ai/artifact/H49v4xXxz8zqKYxx9F2Z8o
artifacts: spec and this handoff, drafted outside the repo in the project folder verdant-step1-liters-default/
reviewer_seat: unassigned; must be a seat that did not author the build
reviewer_sha: none
session_state: Full step 1 pushed as a draft PR; waiting on independent review.
claimed_by: Claude (Taproot thread)
owner: Claude
last_updated: 2026-11-12

resume here: read the spec, confirm the locked-file approval is recorded in Matthew's own words, re-run the open-handoff overlap check if the base moved, then do next_action.
