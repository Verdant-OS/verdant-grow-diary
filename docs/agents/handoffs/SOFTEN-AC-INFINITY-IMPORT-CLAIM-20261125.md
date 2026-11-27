# SOFTEN-AC-INFINITY-IMPORT-CLAIM-20261125

```text
TASK SOFTEN-AC-INFINITY-IMPORT-CLAIM-20261125  priority: P2  status: OPEN

goal: Live copy stops promising AC Infinity CSV import until a real AC Infinity app export passes the importer. Spider Farmer GGS import, which was tested on real exports, stays promised.
why: No real AC Infinity app export has ever been run through the importer (repo handoffs, tests, fixtures, git history and PRs checked 2026-11-25; the only AC Infinity file is a Verdant-made synthetic fixture). A public decompile of the AC Infinity Android app 1.5.8 suggests its export puts info rows above the header, which csvParser would likely reject. Matthew, 2026-11-25, picking from two options: "Only soften the claim".
branch: claude/soften-ac-infinity-import-claim
base: verdant-grow-diary @ 19dd62a9e65d4d102c75f41eeb85cc2d89488034
checkout: git fetch origin claude/soften-ac-infinity-import-claim && git switch claude/soften-ac-infinity-import-claim
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3107 (draft)
head_sha: last observed remote head fcc6ebb212f05b03e6746eb5e706bea8a0cce59d at 2026-11-27 22:15 UTC; the commit that adds this line moves the head, so read the live head from the PR and compare before any exact-head verdict.
state: Copy-only change on a draft PR. Every grower-facing sentence that named AC Infinity and promised import now says AC Infinity app exports are not confirmed yet, and leads with Spider Farmer GGS (tested on real exports). New guard test added.
current_step: Waiting on one independent exact-head review (Seat A).
next_action: Seat A reviews the exact head for honesty and meaning of the new copy. Out of draft, merge and deploy only on Matthew's per-item yes, through the Merge Steward.
post_merge_check: After deploy, view /guides/ac-infinity-data-logging, /guides/import-grow-sensor-csv and the site FAQ; no AC Infinity import promise without "not confirmed yet". NOT_MEASURED until done.
active_writer: Claude (Taproot thread, AC Infinity claim task)
decisions:
- 2026-11-25 Matthew: "Only soften the claim". Parser fix for info rows above the header declined for now; importer and parser behavior untouched.
- Questions (h1 "Is there an app that imports AC Infinity or Spider Farmer CSV sensor logs?", FAQ questions) kept; their answers carry the honest wording.
- import-grow-sensor-csv title changed from "Import AC Infinity & Spider Farmer CSV Logs Free" to "Import Spider Farmer & Controller CSV Logs Free"; slug unchanged.
- In-app copy softened too: EnvironmentCsvImportLauncher intro and CSV_IMPORT_DESCRIPTION.
- 2026-11-27 guard strengthened after Copilot review: it now also catches "bring in" phrasing, FAQ answers whose question names AC Infinity, and claims split by inline JSX tags. Two FAQ answers (controller-CSV-vs-diary, does-Verdant-replace) gained the qualifier.
- Two existing tests pinned the old wording and were updated because the specified copy changed: steady-climate-multi-tent (regex) and guide-csv-import-explainer-rendering (link label). Their intent is unchanged.
tried_and_rejected:
- Removing AC Infinity mentions entirely: the guides target AC Infinity searchers, and an honest "not confirmed yet" is more useful than silence.
files_touched: src/constants/verdantSeoContent.ts; src/constants/verdantSeoCopy.ts; src/lib/publicGrowGuideArticles.ts; src/lib/environmentCsvPreviewCopyRules.ts; src/pages/HardwareIntegrations.tsx; src/components/EnvironmentCsvImportLauncher.tsx; src/test/ac-infinity-import-claim-honesty.test.ts (new); src/test/steady-climate-multi-tent.test.ts; src/test/guide-csv-import-explainer-rendering.test.tsx; src/test/environment-csv-import-ui.test.tsx
files_remaining:
- none
blockers:
- Local vitest BLOCKED: bun install --frozen-lockfile refused by the proxy (403 on a tarball); node_modules lacks pathe and react/jsx-runtime. Pure-data tests were run with bun test as a stand-in. React tests (.tsx) and the full suite were not run here; CI is the real run, and CI skips vitest while the PR is a draft.
open_questions:
- When a real AC Infinity export arrives: if it imports cleanly, restore the promise and update ac-infinity-import-claim-honesty.test.ts in the same PR.
gotchas:
- CI on 6d390e38 (2026-11-25): shard 10/32 failed because environment-csv-import-ui.test.tsx pinned the old CSV_IMPORT_DESCRIPTION; fixed in the next commit. Secret scan on that run used the wrong base (the PR was first opened against main, then retargeted); the next push reruns it on the right base.
- PR #3086 edits src/lib/publicGrowGuideArticles.ts in a different hunk (steady-climate FAQ); no semantic overlap.
- The guard test reads source text of the listed copy files; a new copy source that mentions AC Infinity import should be added to COPY_SOURCES.
last_updated: 2026-11-27 by Claude (Taproot thread, AC Infinity claim task)
```
