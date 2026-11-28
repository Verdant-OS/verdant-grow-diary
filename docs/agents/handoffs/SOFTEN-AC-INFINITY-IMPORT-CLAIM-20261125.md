# SOFTEN-AC-INFINITY-IMPORT-CLAIM-20261125

```text
TASK SOFTEN-AC-INFINITY-IMPORT-CLAIM-20261125  priority: P2  status: OPEN

goal: Live copy stops promising AC Infinity CSV import until a real AC Infinity app export passes the importer. Spider Farmer GGS import, which was tested on real exports, stays promised.
why: No real AC Infinity app export has ever been run through the importer (repo handoffs, tests, fixtures, git history and PRs checked 2026-11-25; the only AC Infinity file is a Verdant-made synthetic fixture). A public decompile of the AC Infinity Android app 1.5.8 suggests its export puts info rows above the header, which csvParser would likely reject. Matthew, 2026-11-25, picking from two options: "Only soften the claim".
branch: claude/soften-ac-infinity-import-claim
base: verdant-grow-diary @ 19dd62a9e65d4d102c75f41eeb85cc2d89488034
checkout: git fetch origin claude/soften-ac-infinity-import-claim && git switch claude/soften-ac-infinity-import-claim
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3107 (ready for review: cheekhimself took it out of draft 2026-11-28 05:36 UTC; read from GitHub before this commit)
head_sha: parent before this handoff commit is 59805115c9217494768330c3e385b41a9da6191d (remote confirmed). This commit moves the head; read the live PR head before any exact-head verdict. Reviews and approvals given at 59805115 (Codex code and security review, VReviewer approval) are historical for the new head.
state: Open PR, out of draft. Copy says AC Infinity app exports are not confirmed yet and leads with Spider Farmer GGS. Guard widened in 1d6be2cc. Importer and parser untouched.
current_step: Waiting on one independent exact-head review (Seat A) at the head after this commit.
next_action: Seat A reviews the exact head. Cheek decides whether the Cursor agent's two commits (6eba7f27, 59805115) stay. Merge only on Cheek's per-item yes naming PR and full SHA, through the Merge Steward. Do not merge or enable auto-merge from this note.
post_merge_check: After deploy, view /guides/ac-infinity-data-logging, /guides/import-grow-sensor-csv and the site FAQ; no AC Infinity import promise without "not confirmed yet". NOT_MEASURED until done.
active_writer: Claude (Taproot thread, AC Infinity claim task). Cheek, 2026-11-27 11:43 PM CT, relayed from his main chat by the coordinator (a relay, not his message attached): "The writer is on a Claude branch, so would be the writer, of course, Claude." The Cursor cloud agent's commits 6eba7f27 and 59805115 are kept as they are; keeping or dropping them is Cheek's call.
decisions:
- 2026-11-25 Matthew: "Only soften the claim". Parser fix for info rows above the header declined for now; importer and parser behavior untouched.
- Questions (h1 "Is there an app that imports AC Infinity or Spider Farmer CSV sensor logs?", FAQ questions) kept; their answers carry the honest wording.
- import-grow-sensor-csv title changed from "Import AC Infinity & Spider Farmer CSV Logs Free" to "Import Spider Farmer & Controller CSV Logs Free"; slug unchanged.
- In-app copy softened too: EnvironmentCsvImportLauncher intro and CSV_IMPORT_DESCRIPTION.
- 2026-11-27 guard strengthened after Copilot review: it now also catches "bring in" phrasing, FAQ answers whose question names AC Infinity, and claims split by inline JSX tags. Two FAQ answers (controller-CSV-vs-diary, does-Verdant-replace) gained the qualifier.
- Three scorer-locked tests were touched, named by `node scripts/scorer-lock.mjs --report --strict` against merge-base 19dd62a9e65d4d102c75f41eeb85cc2d89488034: `src/test/guide-csv-import-explainer-rendering.test.tsx`, `src/test/steady-climate-multi-tent.test.ts`, and `src/test/environment-csv-import-ui.test.tsx`.
- `environment-csv-import-ui.test.tsx` line 36 was updated in c0b7f1884a29d834ac93f73b769a2960ef1d9226 from `/Spider Farmer, AC Infinity, or other environment CSV/i` to `/Spider Farmer or other environment CSV/i`. The :36 "not confirmed yet" pin was added on Cheek's 5:23 PM CT file:line yes, at parent `6eba7f2768409adb681354fc2d2ec6142e4cead5`: `expect(screen.getByText(/not confirmed yet/i)).toBeTruthy();` immediately after that expect.
- Scorer lock, 2026-11-27 11:41 PM CT, Cheek, relayed from his main chat by the coordinator (a relay, not his message attached): "Unlock both". That covers `src/test/guide-csv-import-explainer-rendering.test.tsx` and `src/test/steady-climate-multi-tent.test.ts`. With the :36 yes above, all three locked-test changes have Cheek's word.
tried_and_rejected:
- Removing AC Infinity mentions entirely: the guides target AC Infinity searchers, and an honest "not confirmed yet" is more useful than silence.
files_touched: src/constants/verdantSeoContent.ts; src/constants/verdantSeoCopy.ts; src/lib/publicGrowGuideArticles.ts; src/lib/environmentCsvPreviewCopyRules.ts; src/pages/HardwareIntegrations.tsx; src/components/EnvironmentCsvImportLauncher.tsx; src/test/ac-infinity-import-claim-honesty.test.ts (new); src/test/steady-climate-multi-tent.test.ts; src/test/guide-csv-import-explainer-rendering.test.tsx; src/test/environment-csv-import-ui.test.tsx
files_remaining:
- none
blockers:
- none. Local vitest is still BLOCKED (proxy refuses a lockfile tarball); CI is the test run.
open_questions:
- When a real AC Infinity export arrives: if it imports cleanly, restore the promise and update ac-infinity-import-claim-honesty.test.ts in the same PR.
gotchas:
- CI run 45596460783 on 6d390e38ba8331550c4383db6e7be2e33af030f6: Full test suite (shard 10/32) failed. Job 139143701644 could not find `/Spider Farmer, AC Infinity, or other environment CSV/i` in `environment-csv-import-ui.test.tsx` entry screen (test 19). c0b7f1884a29d834ac93f73b769a2960ef1d9226 changes that pin. No Actions run was found with head c0b7f188. On fcc6ebb212f05b03e6746eb5e706bea8a0cce59d (run 46074769543) and 1d6be2cc418cb8d44ef22e0d7424ba229ce283d1 (run 46075642998) the CI workflow concluded success and the job named `Full test suite (shard ${{ matrix.shard }}/32)` is recorded skipped, so a green shard 10 after the pin change is NOT_MEASURED from that jobs API.
- Guard proof at 1d6be2cc, restored afterward and not committed: reverting `EnvironmentCsvImportLauncher.tsx` line 355 to "Bring in an AC Infinity CSV or other environment export." failed the guard (1 failed, 15 passed). Reverting `CSV_IMPORT_DESCRIPTION` to "Bring in your Spider Farmer, AC Infinity, or other environment CSV. Verdant will source-tag it as historical CSV context." failed the guard the same way (1 failed, 15 passed). The guard was not edited.
- PR #3086 edits src/lib/publicGrowGuideArticles.ts in a different hunk (steady-climate FAQ); no semantic overlap.
- The guard test reads source text of the listed copy files; a new copy source that mentions AC Infinity import should be added to COPY_SOURCES.
last_updated: 2026-11-28 by Claude (Taproot thread, AC Infinity claim task): owner and relayed answers recorded
```
