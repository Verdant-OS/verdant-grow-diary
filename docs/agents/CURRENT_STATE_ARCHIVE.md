# Verdant — Operating State Archive

> HISTORICAL RECORD — NOT ACTIVE AGENT INSTRUCTIONS
>
> Entries here reached a terminal disposition and were moved, verbatim, from
> `docs/agents/CURRENT_STATE.md`. They are evidence, not guidance. Facts are
> point-in-time as of each entry's own recorded dates. The live shift report
> remains `docs/agents/CURRENT_STATE.md`.

Executed under the approved Tranche 1 of
`docs/specs/current-state-archival-slice.md`. Moved text is byte-for-byte
unmodified; only the `## Archived` stamp lines below were added.

---

## Archived 2026-08-18 — Update-attribution header chain (2026-08-13 → 2026-08-15)

**Prior update:** 2026-08-15 UTC
**Updated by:** Grok (2026-08-15 merge: resolved two simple `CURRENT_STATE.md`
conflicts against origin `1c094a2a3`. Incoming since `89ddea93f`:
`74be85232` (#967 verdant-grow-os Cursor plugin scaffold — no overlap)
and `1c094a2a3` (#970 DIRTY PR conflict-reconciliation dispositions —
overlapping header plus topology row; the DIRTY-PR section auto-merged).
Topology tip is now `1c094a2a3`. Production `/version.json` was **not**
re-measured in this merge; the 2026-08-15 observation `5e2fcedd4271`
(#984) still stands. Does **not** apply migrations or set Day 0.)

**Prior same-day update:** 2026-08-15 UTC
**Updated by:** Grok (merge-conflict resolve of #970 onto fetched deploy tip
`89ddea93f` (#993). Takes the incoming Claude migration-drift header as prior
identity. Unique surviving work remains the DIRTY-PR reconciliation section.
No production, GA4, GSC, sitemap, or release-identity row was re-measured.)

**Prior same-day update:** 2026-08-15 UTC
**Updated by:** Grok (2026-08-15 merge: resolved the `CURRENT_STATE.md`
attribution-header conflict against origin `89ddea93f`. Incoming since
`bb66f4302`: `f3324a2b0` (#992 migration-drift alarm — the overlapping
header plus the new ⚠️ section, which auto-merged) and `89ddea93f`
(#993 protected signup-repair delivery path). Topology tip is now
`89ddea93f`. #993 does **not** apply the signup repair; the attributed-
signup incident stays OPEN. Production `/version.json` was **not**
re-measured in this merge; the 2026-08-15 observation `5e2fcedd4271`
(#984) still stands. Does **not** apply migrations or set Day 0.)

**Prior same-day update:** 2026-08-15 UTC
**Updated by:** Claude (2026-08-15, additive: answers Cheek's "migration ledger
reconciliation" ask with the finding that the reconciliation tool **already
exists and has never once completed a measurement** — four scheduled runs since
2026-08-12, all `failure`, plus an on-demand re-run at Cheek's instruction that
reproduced the connection failure byte-for-byte (three of the five runs reach
the socket; the other two never got that far); issues #912 and #916 open and
unactioned;
the `verdant-production` environment's `SUPABASE_DB_URL` resolves to the
**sandbox** project ref and to an unreachable IPv6 address — **and**, found in review, the
probe's exact-version matching would misreport Lovable-recorded migrations as
drift even once it connects, so the ledger is blocked behind two independent
faults, not one. New section
"The migration-drift alarm has never once completed a measurement". No new tool
was built and none should be; the existing one needs repairing. Merged with
deploy tip `bb66f4302` to resolve an
attribution-header conflict; every Grok note below is retained unchanged and no
other section was touched. No production, GA4, GSC, sitemap, or release-identity
row was re-measured in this edit.)

**Prior same-day update:** 2026-08-15 UTC
**Updated by:** Grok (2026-08-15 merge: resolved the `CURRENT_STATE.md`
conflict against origin `bb66f4302`. Incoming since this branch's previous
base `0522eefb1` (#990): `a54040c30` (#989 pgmq / PUBLIC EXECUTE restrict),
`22c130600` (#986 One-Tent Loop operating-order — the overlapping
CURRENT_STATE edit), `bb66f4302` (#960 zero-defect board refresh). Topology
tip is now `bb66f4302`. Production `/version.json` was **not** re-measured
in this merge; the 2026-08-15 observation `5e2fcedd4271` (#984) still
stands. Agent row keeps both the Lovable Knowledge rewrite and the merged
`ONE_TENT_LOOP_OPERATING_ORDER` assignment. Does **not** apply migrations
or set Day 0.)

**Prior update:** 2026-08-15 UTC
**Updated by:** Grok (2026-08-15, later additive: refresh the stale cited
rows — topology still named `f2a03998f` / older buffers still showed
`6434ea2a8`; production identity still named `3f773b680dcc` (2026-08-05);
`/` still `FAIL` (2026-08-07); agent table still said Grok Unassigned /
Claude spec-only / Council Chair waiting. Live re-measure 2026-08-15:
production `/version.json` serves `5e2fcedd4271` (#984) with treeHash MATCH;
`/` SSR is `PASS` (landing h1 + canonical, 1141 body words) after #949.
Origin tip at that refresh was `0522eefb1` (#990). Publish lags git.
GA4/GSC/Day 0 were not re-opened. Lovable Knowledge pack updated to match.
Does **not** apply migrations or set Day 0.)

**Prior same-day update:** 2026-08-15 UTC
**Updated by:** Grok (2026-08-15 merge: combined `ONE_TENT_LOOP_OPERATING_ORDER`
on this branch with deploy tip `534b28434` — Cursor SDK local-orchestration
spike #985, Free signup / Quick Log handoff #987, AI Doctor E2E path #988,
and nanoid pin #966. Both programs stay active; neither pauses Convex or
Postgres spikes. No production, GA4, GSC, sitemap, or release-identity row
was re-measured in this edit; those retain their earlier verification dates.
Superseded as the tip row by the later merge to `bb66f4302`.)

**Prior same-day update:** 2026-08-15 UTC
**Updated by:** Grok (2026-08-15, later additive: next gates on
`VERDANT_CURSOR_SDK_LOCAL_ORCHESTRATION_SPIKE`. `POSTGRES_RESTRICTED_ROLE_SPIKE`
was not touched. Optional live proof remains `BLOCKED` — `CURSOR_API_KEY` is
absent here. Dispatcher security review is at
`spikes/cursor-sdk-local-orchestration/docs/dispatcher-security-review.md`.
Host receipt-integrity findings are closed; live SDK tool enforcement stays
`NOT_MEASURED`; reuse is not approved. No production, GA4, GSC, sitemap, or
release-identity row was re-measured in this edit.)

**Prior same-day update:** 2026-08-15 UTC
**Updated by:** Grok (2026-08-15, additive: records implementation of isolated
`VERDANT_CURSOR_SDK_LOCAL_ORCHESTRATION_SPIKE` under
`spikes/cursor-sdk-local-orchestration/`. This spike does **not** replace,
pause, or delay `POSTGRES_RESTRICTED_ROLE_SPIKE`. Manual Cursor SDK live proof
is `BLOCKED` without `CURSOR_API_KEY`. No production, GA4, GSC, sitemap, or
release-identity row was re-measured in this edit.)

**Prior same-day update:** 2026-08-15 UTC
**Updated by:** Grok (2026-08-15 later: `ONE_TENT_LOOP_OPERATING_ORDER`
repo slices 2–4 landed; Slice 5 recorded as owner-`BLOCKED` with an
honest `missing_session_json` browser-proof receipt — no fabricated
login. Post-change smoke is 32 files / 512 tests. This does **not**
pause Convex or Postgres spikes. No production, GA4, GSC, sitemap, or
release-identity row was re-measured in this edit; those retain their
earlier verification dates.)

**Prior same-day update:** 2026-08-15 UTC
**Updated by:** Grok (2026-08-15: records Cheek's in-session implement
instruction for `ONE_TENT_LOOP_OPERATING_ORDER`. This does **not** pause
`CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` or `POSTGRES_RESTRICTED_ROLE_SPIKE`.
Slice 0 baseline measured on deploy tip `f2a03998f`. Colliding PRs #828 /
#817 / #696 stay open and parked. No production, GA4, GSC, sitemap, or
release-identity row was re-measured in this edit; those retain their earlier
verification dates.)

**Prior update:** 2026-08-14 UTC
**Updated by:** Claude (2026-08-14, later edit: records Cheek's in-session
approval of `POSTGRES_RESTRICTED_ROLE_SPIKE` and the **delivered, measured**
Phase 0 detector — 22 service-role edge functions, 8 cross-domain table reaches
against deploy tip `e1214d3df`. Records Cheek's decision to abandon
`claude/breeder-mode-genetics` and `claude/cultivar-library-p1`. Refreshes the
Branch topology row from `cbbd7122` to `e1214d3df` after five merges this
session (#979, #815, #710, #795, #980). Sentinel-Version moved to 2026-08-09.3
via #710; the tip then moved to `7843a3fcb` (#981, Phase 0) and `f2a03998f`
(#982, Phase 1). Records Cheek's "execute phase 1" decision and the
**demonstrated** local-only role harness — 10/10 proofs. Also records Cheek's
2026-08-14 approval-in-principle of **Phase 2 production adoption** (execution
gated on three items, see the slice entry) and the **Convex-vs-Postgres
recommendation**: adopt Postgres incrementally, hold Convex. No production, GA4,
GSC, sitemap, or release-identity row was re-measured in this edit; those retain
their earlier verification dates.)

**Prior update:** 2026-08-13 UTC
**Updated by:** Claude (records Cheek's 2026-08-13 in-session approval of the
named isolated Convex component sandbox spike, plus the deploy-branch HEAD
observed while writing that spec. Public-surface, GA4, and release-identity
rows retain their earlier verification dates; none were re-measured in this
update. Same-day follow-up: records the previously-untracked Lovable
knowledge-pack mechanism and this session's audit of its pre-2026-08-13
backup content against deploy-branch HEAD `e7690396e` — see the new
"Completed, out of slice (recorded 2026-08-13)" entry below; that audit's
evidence is pinned to `e7690396e` and was not re-verified against a later
tip. Second same-day follow-up, per Codex review on PR #975: the Branch
topology row below was stale at `6434ea2a8` (#942) even before this file's
own `e7690396e` (#943) reference was added, and the branch has since moved
again — refreshed the row to the actual current tip, `fb42ce00e` (#968),
verified with a fresh `git fetch` rather than by re-asserting either older
number)

---

## Archived 2026-08-18 — Latest deploy-head validation (pinned to `5611b130e81a`)

Section heading retained in `CURRENT_STATE.md` with a pointer; this is the body.

**Replay-repair slice landed 2026-08-05.** Merged migration `20260804091142` revokes
EXECUTE on three function signatures that exist only in production, so every fresh
disposable-local-Supabase replay failed with SQLSTATE 42883, breaking the Security DB
Local, irrigation, and pgTAP replay lanes — and `continue-on-error: true` masked the
resulting job failure as a run-level success for a full day (run `30940375065`).
[PR #724](https://github.com/Verdant-OS/verdant-grow-diary/pull/724)
(`fc144485409a`) repaired the replay with a fingerprinted `compatibility_patches`
entry guarding exactly the three verified-missing signatures (`email_queue_dispatch()`,
`email_queue_wake()`, two-argument `admin_schema_audit`) — the migration file itself is
byte-unchanged — and removed the `continue-on-error` masking; the lane stays
non-required, but enabled failures now propagate to the run conclusion.
[PR #726](https://github.com/Verdant-OS/verdant-grow-diary/pull/726)
(`5611b130e81a`) tightened the audit provenance and lane docs and added a contract test
that fails the suite if any `continue-on-error` key returns to that workflow.

GitHub Actions push runs observed 2026-08-05 ~16:05 UTC for deploy commit
`5611b130e81a` (not exhaustive; listed runs are those observed):

| Check                                      | Status         | Evidence                                                                                                                                             |
| ------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck (tsgo) + build                   | `PASS`         | run `31021832816`                                                                                                                                    |
| Security DB Local                          | `PASS`         | run `31021835479` — full enabled run, not an opt-out skip: replay workspace prepared, `db reset` applied every migration, all harness steps executed |
| Irrigation evidence gate                   | `PASS`         | run `31021834439`                                                                                                                                    |
| Dependency & Security CI                   | `PASS`         | run `31021832498`                                                                                                                                    |
| auto-tag-release                           | `PASS`         | run `31021832735`                                                                                                                                    |
| Full Vitest Suite (PR gate)                | `NOT_MEASURED` | push run `31021833370` cancelled by queue supersession (not an intentional skip); all 35 required checks were `PASS` on the pre-merge PR head        |
| Core Link and Form Census                  | `NOT_MEASURED` | run `31021832698` still in progress at observation; the census pair is a pre-existing non-required failure on every branch                           |
| Required core schema present               | `FAIL`         | run `31021832568`                                                                                                                                    |
| Required money-critical migrations present | `FAIL`         | run `31021837013`                                                                                                                                    |

The validation evidence in this section is tied to deploy commit `5611b130e81a` and
must not be carried forward to later commits. The tip has since advanced through
`acad6cb938e5` (#727), `864eab892` (#725), `1ae1677645a0` (#729), `1a2df78ac3`
(#735), `6c78266edb7f` (#737), `a9a88e6ed` (#809), `63ed76c6d` (#794),
`ad29943ea9ec` (#785), `821adb9fafda` (#812), `b972ad8225ef` (#821) and on to
`c09b33d95ed2` (#814) — **69 commits ahead of `5611b130e81a`**, counted with
`git log --oneline 5611b130e81a..c09b33d95ed2` on 2026-08-07.
(PR numbers on this branch do not order by merge time: #809 merged before #794, which
merged before #785. Order commits with `git log`, never by PR number.)
None of the checks in the table above have been re-measured against any of those
commits; treat every row as evidence about `5611b130e81a` only. The Branch
topology row above names its own verification snapshot and is decoupled from this
section's evidence.
Notably, the full enabled Security DB Local run cited above (`31021835479`)
executed against `5611b130e81a` and is the replay-repair proof point regardless of
tip movement.

The two failing schema/migration guards remain outside the replay-repair and Mode A SEO
slices (board item #561). They are not converted to passes and prevent describing the
deploy branch as fully green; they require their own scoped owner/integration follow-up.

---

## Archived 2026-08-18 — Five "Completed, out of slice" records (2026-08-07 → 2026-08-18)

**Completed, out of slice (recorded 2026-08-07):** #586 Action Queue atomic create. This
shipped as three separate merges, recorded separately because each carries different
migrations and different client moves:

- [PR #586](https://github.com/Verdant-OS/verdant-grow-diary/pull/586) merged as
  `dc29093b5`. **Introduced the RPC migration**
  `supabase/migrations/20260807010000_action_queue_create_rpc.sql` (nullable `dedupe_key`
  column, partial unique index on non-terminal statuses, and the `action_queue_create`
  SECURITY DEFINER RPC that writes the queue row and its `created` audit event in one
  transaction), plus `src/lib/actionQueueCreateRules.ts`,
  `src/lib/actionQueueCreateService.ts`, and the **Alert Detail** and **AI Doctor** client
  moves onto the RPC.
- [PR #809](https://github.com/Verdant-OS/verdant-grow-diary/pull/809) merged as
  `a9a88e6ed`. Added **only** `20260807140000_action_queue_create_allow_ai_coach.sql`
  (adds `ai_coach` to the RPC source allowlist) and the **Coach** client move, with tests.
  It did **not** introduce the RPC migration — that file already exists in `a9a88e6ed^`.
- [PR #812](https://github.com/Verdant-OS/verdant-grow-diary/pull/812) merged as
  `821adb9fa`, reconciling three lagging Action Queue pins against the atomic RPC.

All three (`dc29093b5`, `a9a88e6ed`, `821adb9fa`) are ancestors of the deploy tip recorded
in Branch topology above — verified 2026-08-07 with `git merge-base --is-ancestor` against
`c09b33d95ed2290c3364e54c77d5d980eb4e714a`. Re-verify this block
alongside the Branch-topology row: if a later reader advances that row, the ancestry claim
here is only as current as the head it was checked against.

Read directly from the migration bodies: the RPC inserts `status` `'pending_approval'`
literally, inserts `target_device` as NULL literally, and derives `user_id` from
`auth.uid()` rather than any client argument. That is an observation about this RPC only —
it is **not** a cleared system-wide fence. Per the migration's own header this is an expand
step: client `INSERT` on `action_queue` is deliberately not revoked and legacy
direct-insert paths remain functional, so the RPC's constraints do not bind writers that
bypass it. A contract/revoke step would be a separate slice.

Authoring agent is **not determinable from git**: all three commits are squash merges
attributed to the repository owner, and #809's source branch is deleted. The fact recorded
here is that this work shipped while this file listed the active slice as Mode A SEO and
every agent row except Codex as `Unassigned`. This entry records that; it does not
retroactively authorize it, and it does not assign it to an agent.

Production application state of both migrations: `BLOCKED` — not verified, and not
verifiable from an agent session. The Supabase MCP path available to agents resolves to the
**sandbox** project `bzatgtgjvuojpoxcknaa`, not production `knkwiiywfkbqznbxwqfh`
(refs pinned in `scripts/lib/supabaseDatabaseTargetIdentity.mjs`). A sandbox check on
2026-08-07 found the column, index, and function absent there; that is a sandbox
observation and carries no implication about production.
`scripts/apply-pinned-production-migrations.mjs` is SHA-pinned to three 2026-07-28 files
and does not cover these two.

**Completed, out of slice (recorded 2026-08-11):** #885 agent-integrations MCP
publication audit.
[PR #885](https://github.com/Verdant-OS/verdant-grow-diary/pull/885) merged
2026-08-11 via the merge queue as squash `1a9082bb1`. Documentation only — it adds
`docs/agent-integrations-mcp-server-spec.md` and changes no runtime, tool, schema,
or manifest code. Authoring agent **is** determinable for this one: Claude, in a
Claude Code session tasked with Lovable's "publish your app as an MCP server" flow,
while this file listed Claude as Unassigned. The audit found the MCP server itself
already shipped (PR #253, fixes #255/#256/#363) and needed no new implementation;
the doc records the three read-only tool contracts, the OAuth access model, the
pinned-surface change-control rule (repo-wide search for existing tool names before
any tool change), PASS/HOLD/REJECT expansion gates (Action Queue mutation, device
control, and no-login access all REJECT), and two sensor-contract gaps recorded as
specified-but-unapproved follow-up slices: `McpSensorReading` carries no
`confidence` field, and noncanonical legacy `source` labels (`sim`, vendor names)
pass through verbatim to connecting assistants. Live publication state (Lovable
Active status, OAuth 2.1 dashboard setting, endpoint reachability) remains
`BLOCKED` from agent sessions — the doc's §6 lists the owner actions. Five rounds
of automated (Codex-connector) inline review were verified against source and
addressed pre-merge. This entry records the work; it does not open a new slice.

**Completed, out of slice (recorded 2026-08-13):** Lovable knowledge-pack mechanism now
tracked. Cheek supplied a backup of the pre-2026-08-13 Lovable "Workspace/Project
Knowledge" pack content (`verdant_project_knowledge_BACKUP_pre-2026-08-13.md`, saved
outside this repo before Lovable's connector overwrote it) with no other instruction.
Claude audited its 8 factual claims against deploy-branch HEAD `e7690396e` (#943, this
branch's tip observed at audit time). The Branch topology row above has since been
refreshed to the branch's actual current tip, `fb42ce00e` (#968) — this audit's evidence
remains pinned to `e7690396e` specifically and was not re-verified against the newer
commits. On request, this entry records the mechanism here. This is the first appearance of
this mechanism anywhere in governance docs: it is a separate, ungoverned knowledge
surface (Lovable's project-level "Knowledge" field, populated via its own connector) that
`AGENTS.md`, this file, and every role file were previously silent on.

Audit verdicts (full evidence trail — file/line citations, git commits, PR numbers — lives
in the originating Claude Code session; not reproduced here):

- `PARTIALLY_ACCURATE` — public `/welcome` + `/demo` shipped with writes excluded from a
  "demo mode": `/welcome` holds; `/demo` does not — the standalone Demo page was deleted
  2026-06-03, six weeks before the pack's own ~2026-07-14 capture window, and `/demo` is
  now only a client-side redirect to `/welcome`. No app-wide demo-mode write-exclusion
  mechanism exists for any public surface.
- `PARTIALLY_ACCURATE` — CSV/TSV handling is a read-only review surface with disabled
  persistence: true for `CsvPreviewReviewGate.tsx` itself, which remains genuinely
  unreachable (imported only by its own test files, no page or route mounts it) — but
  that component is distinct from the public `/sensors/csv-preview` route, which is a
  live, reachable page (`src/pages/SensorCsvPreview.tsx` mounting
  `CsvSensorPreviewPanel.tsx`, linked from `/hardware-integrations` and
  `/partners/csv-preview`). `/sensors/csv-preview` is read-only in the same sense —
  no Supabase/network call in that component either — so the no-persistence verdict
  holds, but "unreachable" does not; do not conflate the two components. Separately,
  a live, authenticated write flow (`EnvironmentCsvImportLauncher` →
  `environmentCsvImportPersistence.ts`, mounted in `src/pages/Sensors.tsx`) really
  does insert into `sensor_readings` on confirm, shipped 2026-06-28, before the
  pack's own capture date — so "CSV/TSV handling" as a whole is not read-only either.
- `PARTIALLY_ACCURATE` — grower action follow-up evidence supported, outcomes never
  inferred, automatic diary creation unsupported: the outcome-never-inferred half holds.
  But `ActionDetail.tsx` does auto-insert (best-effort, not transactional — an insert
  failure does not roll back the completed status) a templated, outcome-less
  `diary_entries` marker row when an action is completed **from the Action Detail
  page** — a mechanism from 2026-05-26, predating the pack. This is narrower than "every
  Action Queue completion": completing via the Action Queue **list's** own "Mark
  Complete" control (`ActionQueue.tsx`, calling the `action_queue_transition` RPC
  directly) does not create a diary row at all.
- `PARTIALLY_ACCURATE` — real-data One-Tent smoke test blocked pending an actual tent
  reading, ghost seeding prohibited: the ghost-seeding prohibition is real and current.
  The actual block condition is a missing authenticated managed Supabase session, not
  literally an absent physical tent reading — once authenticated, the e2e spec enters a
  scripted, labeled "manual" reading.
- `STALE_NOW_DIFFERENT` — AI Doctor semantic output evaluator labeled an unmerged draft
  PR: [PR #230](https://github.com/Verdant-OS/verdant-grow-diary/pull/230) is confirmed
  **MERGED** (2026-07-14) and wired into required CI (`ci.yml` step
  `ai_doctor_output_eval`). Its content landed on the deploy branch via squash commit
  `0c4b3c1a4`, titled after unrelated PR #229 ("harden re-consent gate") — another
  instance of this repo's known squash-merge title/content mismatch pattern (see the
  #586/#809/#812 entry above for a prior example).
- `PARTIALLY_ACCURATE` — expanded pheno taxonomy migration merged but unverified on the
  live schema, cross-form UI gated pending confirmation: the migration-merged half holds,
  and production-schema verification remains genuinely `BLOCKED` from any agent session
  (same sandbox-vs-production Supabase MCP mismatch already documented in the #586 entry
  above). But no schema-confirmation gate exists in the live `PhenoKeepersPage` code — it
  silently degrades to an empty list / generic error on any Supabase error instead of
  holding for confirmation.
- `STILL_ACCURATE` — EcoWitt continuous live sync unverified until one real payload
  completes the full payload → dry-run → webhook → in-app provenance path: the repo's own
  acceptance ledger (`docs/ecowitt-hardware-validation-runbook.md`, "Final live proof
  ledger") remains a blank template as of its last edit (2026-07-18); every EcoWitt CI
  lane runs on fixtures/mocks only. This file carried zero EcoWitt mentions before this
  edit.
- `STILL_ACCURATE` — Quick Log legacy and V2 contracts remain separate with typecheck as
  a stop-ship gate: unchanged since PR #156 (2026-07-06); `quicklog-gate.yml` still runs
  `bun run typecheck` as a hard first gate before either note-sync test suite.

This entry does not authorize any new automation to keep the Lovable pack synchronized
with this repo, does not assign an owner for that mechanism going forward, and does not
claim the pack that replaced it on 2026-08-13 (which no agent session has read) is
accurate — only that the mechanism now exists in governance memory and that its prior
content's accuracy has been checked once.

**Completed, out of slice (recorded 2026-08-15):** Cheek asked Grok to rewrite the
Lovable project Knowledge field from current CURRENT_STATE rather than restore the
July backup. Applied 2026-08-15 via Lovable `set_project_knowledge` to
`verdantgrowdiary-com` (`66255e7b-892c-4be5-8686-ab1cfc3666db`). Same-day follow-up:
Cheek cited the stale 2026-08-13 buffer rows (topology `6434ea2a8`, Claude Convex
header, `/` `FAIL`, Grok Unassigned). Those rows were refreshed from live
production and origin tip; Lovable Knowledge re-applied as Version 2026-08-15.1.
Dated snapshot: `docs/lovable/verdant-project-knowledge-2026-08-15.md`. This still
does not authorize a sync bot. Workspace knowledge was not changed. Migrations
were not applied. Day 0 remains `UNSET`.

**Completed, out of slice (recorded 2026-08-18):** Claude PR/branch cleanup
sweep, at Cheek's request ("Clean up all of your PRs and ensure your work tree
is clean"). Findings, all `established fact` from same-day GitHub/API and
`git ls-remote` measurements:

- **Zero open Claude-authored PRs existed at sweep time.** The six open PRs
  (#1020, #1019, #1018, #1008, #1014, #719) are Codex, Cursor, and Grok work
  and were not touched.
- **23 stale `claude/*` branches existed on origin**, every one with a
  terminal disposition verified per-branch against PR history: seven squash-
  merged (#880, #935, #896, #736, #767, #730, #979/#992), thirteen closed
  without merge as superseded/rejected (#936→#971, #760, #766, #810, #802,
  #799, #800, #973, #804, #793, #933, #777, #788 — plus #997 closed on the
  spec branch), two abandoned by Cheek 2026-08-14 (`breeder-mode-genetics`,
  `cultivar-library-p1`), and one never-PR'd scratch branch
  (`vibrant-liskov-22927f`) whose three unique doc files were verified
  byte-identical on the deploy branch before deletion.
- **Branch deletion stays impossible from agent sessions.** `git push origin
  --delete` returns HTTP 403 for any ref other than the session's designated
  branch (branch-scoped push credential), and the GitHub MCP server has no
  branch-deletion tool. This re-confirms the 2026-08-14 observation with a
  fresh failure, and re-attaching the repo with push access did not widen the
  scope.
- **Cheek deleted all 23 branches himself on 2026-08-18** using the command
  list Claude supplied. A live `git ls-remote --heads origin` afterwards
  found **zero** `claude/*` refs remaining; 152 branches from other lanes
  remain untouched. Branches that had PRs stay recoverable via GitHub's
  `refs/pull/N/head`.

This entry records housekeeping only: no application code, schema, or policy
was touched, no PRs belonging to other agents were closed, and nothing here
opens a new slice.

---

## Archived 2026-08-18 — Known blocker 6: production release-identity resilience (RESOLVED 2026-08-05)

6. Production release-identity resilience — **RESOLVED repo-side and verified
   live 2026-08-05**. History: the 15:47:45Z build stamped `commit: "unknown"`
   (history-less Lovable publish sandbox, unborn-HEAD `git init`, no `GITHUB_*`
   env — proven and sandbox-reproduced); production self-healed at 15:52:18Z.
   Resilience shipped via PR #735 (`1a2df78ac3`, merged 17:41Z) with hardening
   in #737 (`6c78266edb`, merged 22:28:50Z) and follow-ups. **Verified live
   against the 22:06:15Z publish** — which, per its own commit `3f773b680dcc`,
   contained #735's stamper but predated #737's merge, so the live evidence
   attributes to #735's code; #737's hardening (trust-gated cross-era
   execution, annotation-line anchoring) awaits its first published build.
   The verification itself: production served `commitSource: "git"` and
   `treeHash: c8fc076f0011…`, and the resolver matched that hash to the exact
   commit via the `v2026.08.05-3f773b680dcc` tag annotation — Lovable's sandbox
   and the GitHub runner computed identical hashes independently, which shows
   the publish pipeline did not mutate hashed inputs **for that publish**
   (point-in-time evidence, not a permanent guarantee). Residual owner-side
   items (optional): raise the intermittent history-less sandbox with Lovable;
   retire the stale pre-SSR `vercel.json`.
   See the release-provenance runbook below for how to read and resolve stamps.
