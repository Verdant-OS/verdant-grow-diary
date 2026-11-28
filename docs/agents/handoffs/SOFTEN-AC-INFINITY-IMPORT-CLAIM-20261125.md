# SOFTEN-AC-INFINITY-IMPORT-CLAIM-20261125

```text
TASK SOFTEN-AC-INFINITY-IMPORT-CLAIM-20261125  priority: P2  status: OPEN

goal: Live copy stops promising AC Infinity CSV import until a real AC Infinity app export passes the importer. Spider Farmer GGS import, which was tested on real exports, stays promised.
why: No real AC Infinity app export has ever been run through the importer (repo handoffs, tests, fixtures, git history and PRs checked 2026-11-25; the only AC Infinity file is a Verdant-made synthetic fixture). A public decompile of the AC Infinity Android app 1.5.8 suggests its export puts info rows above the header, which csvParser would likely reject. Matthew, 2026-11-25, picking from two options: "Only soften the claim".
branch: claude/soften-ac-infinity-import-claim
base: verdant-grow-diary @ 19dd62a9e65d4d102c75f41eeb85cc2d89488034
checkout: git fetch origin claude/soften-ac-infinity-import-claim && git switch claude/soften-ac-infinity-import-claim
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3107 (open, out of draft: cheekhimself marked it ready for review 2026-11-28 05:36 UTC)
head_sha: parent before this commit is 3fc9ee14d3506e5d7e63f33b23a3008b4191f636 (remote confirmed). This commit moves the head; read the live PR head before any exact-head verdict. Reviews and approvals given at earlier heads (including VReviewer's approval and the Codex reviews at 59805115) are historical.
state: Copy-only change. Every grower-facing sentence that named AC Infinity and promised import now says AC Infinity app exports are not confirmed yet, and leads with Spider Farmer GGS (tested on real exports). New guard test added. Importer and parser untouched.
current_step: Waiting on one independent exact-head review (Seat A).
next_action: Seat A reviews the exact head for honesty and meaning of the new copy. Merge and deploy only on Matthew's per-item yes naming PR and full SHA, through the Merge Steward. Do not merge or enable auto-merge from this note.
post_merge_check: After deploy, view /guides/ac-infinity-data-logging, /guides/import-grow-sensor-csv and the site FAQ; no AC Infinity import promise without "not confirmed yet". NOT_MEASURED until done.
active_writer: Claude (Taproot thread, AC Infinity claim task). Matthew, 2026-11-27 11:43 PM CT, relayed from his main chat by the coordinator (a relay, not his message attached): "The writer is on a Claude branch, so would be the writer, of course, Claude."
decisions:
- 2026-11-25 Matthew: "Only soften the claim". Parser fix for info rows above the header declined for now; importer and parser behavior untouched.
- Questions (h1 "Is there an app that imports AC Infinity or Spider Farmer CSV sensor logs?", FAQ questions) kept; their answers carry the honest wording.
- import-grow-sensor-csv title changed from "Import AC Infinity & Spider Farmer CSV Logs Free" to "Import Spider Farmer & Controller CSV Logs Free"; slug unchanged.
- In-app copy softened too: EnvironmentCsvImportLauncher intro and CSV_IMPORT_DESCRIPTION.
- 2026-11-27 guard strengthened after Copilot review: it now also catches "bring in" phrasing, FAQ answers whose question names AC Infinity, and claims split by inline JSX tags. Two FAQ answers (controller-CSV-vs-diary, does-Verdant-replace) gained the qualifier.
- Three scorer-locked tests pinned the old wording and were updated because the specified copy changed; their intent is unchanged: steady-climate-multi-tent (regex), guide-csv-import-explainer-rendering (link label), environment-csv-import-ui line 36 (entry-screen text, in c0b7f1884a29d834ac93f73b769a2960ef1d9226).
- Scorer lock, Matthew 2026-11-27 11:41 PM CT, relayed from his main chat by the coordinator (a relay): "Unlock both". Covers steady-climate-multi-tent and guide-csv-import-explainer-rendering.
- Cursor agent commits dropped, Matthew 2026-11-27 11:46 PM CT, relayed from his main chat by the coordinator (a relay): "Drop them". 6eba7f2768409adb681354fc2d2ec6142e4cead5 (handoff rewrite) and 59805115c9217494768330c3e385b41a9da6191d (extra "not confirmed yet" pin in environment-csv-import-ui.test.tsx plus handoff edits) are reverted by this commit, without a force-push. This handoff is restored to the Claude writer's record.
tried_and_rejected:
- Removing AC Infinity mentions entirely: the guides target AC Infinity searchers, and an honest "not confirmed yet" is more useful than silence.
files_touched: src/constants/verdantSeoContent.ts; src/constants/verdantSeoCopy.ts; src/lib/publicGrowGuideArticles.ts; src/lib/environmentCsvPreviewCopyRules.ts; src/pages/HardwareIntegrations.tsx; src/components/EnvironmentCsvImportLauncher.tsx; src/test/ac-infinity-import-claim-honesty.test.ts (new); src/test/steady-climate-multi-tent.test.ts; src/test/guide-csv-import-explainer-rendering.test.tsx; src/test/environment-csv-import-ui.test.tsx
files_remaining:
- none
blockers:
- Local vitest BLOCKED: bun install --frozen-lockfile refused by the proxy (403 on a tarball); node_modules lacks pathe and react/jsx-runtime. Pure-data tests were run with bun test as a stand-in. CI is the real run.
open_questions:
- environment-csv-import-ui.test.tsx line 36 is scorer-locked. Its change in c0b7f188 (from /Spider Farmer, AC Infinity, or other environment CSV/i to /Spider Farmer or other environment CSV/i) is required by the copy change, and no unlock from Matthew for that line is recorded here. Matthew decides.
- When a real AC Infinity export arrives: if it imports cleanly, restore the promise and update ac-infinity-import-claim-honesty.test.ts in the same PR.
gotchas:
- CI on 6d390e38 (2026-11-25): shard 10/32 failed because environment-csv-import-ui.test.tsx pinned the old CSV_IMPORT_DESCRIPTION; fixed in the next commit. Secret scan on that run used the wrong base (the PR was first opened against main, then retargeted); the next push reruns it on the right base.
- PR #3086 edits src/lib/publicGrowGuideArticles.ts in a different hunk (steady-climate FAQ); no semantic overlap.
- The guard test reads source text of the listed copy files; a new copy source that mentions AC Infinity import should be added to COPY_SOURCES.
last_updated: 2026-11-28 by Claude (Taproot thread, AC Infinity claim task)
```
