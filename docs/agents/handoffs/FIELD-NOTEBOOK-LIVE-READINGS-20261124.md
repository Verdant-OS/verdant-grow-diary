# FIELD-NOTEBOOK-LIVE-READINGS-20261124

```text
TASK FIELD-NOTEBOOK-LIVE-READINGS-20261124  priority: P2  status: OPEN
goal: the Dashboard field notebook card shows each tent's latest TEMP, RH and VPD with source and age, instead of "—" in every tile.
why: Cheek, 2026-11-24 07:21 UTC: "wiring readingsByTent into the card is a small fix, and it's the one growers would notice. EXECUTE". FieldNotebookScope had no readingsByTent prop and Dashboard never passed readings, so the card always rendered empty tiles. FIELD-NOTEBOOK-SLICE-1 (closed) listed "live sensor readings on the card" under files_remaining.
fix: client only. New pure src/lib/fieldNotebookReadingSlotsRules.ts maps the TentSnapshotView the Dashboard tent panel already builds (buildTentSnapshotView over selectDashboardSensorEvidenceRows rows) to ReadingSlot[]; Dashboard builds it per tent from latestPerTent and passes it through FieldNotebookScope to FieldNotebookMount. No new query. Stale, degraded and unverified metrics keep their label; invalid or unknown metrics and a view with no verified capture time give no slot; zero stays a value. PPFD is not in the tent snapshot view, so its tile stays empty.
branch: claude/project-thread-lchx85
base: verdant-grow-diary at 41d96bf194ca6db7790bf2a9a9d1763a5d98dc54
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3069 (marked ready for review at 07:38 UTC by the shared cheekhimself account, not by this session; merge not covered)
state: 35/35 required checks green at f2cb3748e7eb98e5e4fe5b11124f87f6736fef90 (CI run 45351888705); the handoff-only commit after it changes no code
next_action: required checks at the handoff head, then one eligible Reviewer A, C or D exact-head review, relayed by Cheek as a copy-paste block (his rule, 2026-11-23); then Cheek's own yes naming #3069 and the exact SHA; UK Cheese merges
post_merge_check: once live /version.json reports the merged SHA, read only, signed in as the disposable fixture account: Fixture Tent A's field notebook card shows TEMP/RH with a source and age line matching the tent panel under it (Stale when the panel says Stale). No writes. NOT_MEASURED until then.
decisions: (1) Reuse buildTentSnapshotView, not a new latest-reading rule, so the card and the panel cannot disagree on source or staleness. (2) One Dashboard helper, tentPanelSnapshotView, builds the view (with the panel's canonical VPD) for both the panel and the card (Codex P1 at 50b20af4: without canonicalVpd a 4 kPa stored VPD showed as usable). (3) A VPD from another capture (Tonight's canonical value, labeled like "Manual · 2m ago" in the view) gives no card slot, because the card labels VPD with the TEMP/RH capture's source. (4) Invalid hides the value; the panel still says Invalid. (5) The card's tent snapshots are collected with a for...of loop because dashboard-environment-stability-chip.test.ts anchors on the first "latestPerTent.map(".
coordination: PR #3049 changes the panel's snapshot input from tentRows to snapRows (adds Quick Log manuals). Whichever of #3049 and this PR merges second points the notebook's buildTentSnapshotView call at the same rows as the panel. PR #3055 changes formatReadingValue copy only ("Missing" for an empty tile); no overlap in logic.
not_in_scope: PPFD source; schema, RLS, auth, edge, migrations, billing; device control.
tests: src/test/field-notebook-reading-slots.test.ts; src/test/field-notebook-scope-readings.test.tsx; src/test/dashboard-field-notebook-live-readings.test.tsx
red_green: RED at 6a9f0854 (run 45348063210: test:legal-seo typecheck TS2307 and TS2322; shard 6 two scope tests; shard 10 rules import; shard 22 two Dashboard tests). RED at dda630cd (run 45349927809, shard 22: card showed the rejected 4.00 kPa). RED at 9452b6e2 (run 45350150893, shard 22: a 0.90 kPa VPD from another capture labeled Live). GREEN: 35/35 required at f2cb3748 (run 45351888705).
commands: bunx vitest run src/test/field-notebook-reading-slots.test.ts src/test/field-notebook-scope-readings.test.tsx src/test/dashboard-field-notebook-live-readings.test.tsx --reporter=dot ; bun run typecheck ; bun run lint
files_touched: src/lib/fieldNotebookReadingSlotsRules.ts (new); src/components/FieldNotebookMount.tsx; src/pages/Dashboard.tsx; src/test/field-notebook-reading-slots.test.ts; src/test/field-notebook-scope-readings.test.tsx; src/test/dashboard-field-notebook-live-readings.test.tsx; this file
files_remaining: none planned
gotchas: bun install --frozen-lockfile 403s on the lovable-core-prod tarball mirror in this cloud box (2026-11-24), so local vitest, typecheck, lint and build are BLOCKED; CI is the evidence. Do not regenerate bun.lock. Draft PRs skip ci.yml on pull_request; dispatch ci.yml on the branch.
blockers: none in code; local checks BLOCKED as above
reviewer_seat: one eligible Reviewer A, C or D session that did not author or repair this change; matt816cheek-bit and VReviewer do not count.
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decision: none until review.
claimed_by: Claude thread session (task uba068dca25e9be198e01be19385631c4), 2026-11-24 07:40 UTC
owner: Claude thread session (task uba068dca25e9be198e01be19385631c4)
last_updated: 2026-11-24 08:02 UTC, by Claude thread session (holder)
```
