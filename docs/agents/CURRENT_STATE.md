> Ownership and the connector spec: see [docs/agents/OWNERSHIP.md](OWNERSHIP.md). It wins on conflicts.

## Start here (agents)

Read this section first. It doesn't replace the observation log below.

- **This section supersedes stale OWNERSHIP.md rows.** Line 1 says OWNERSHIP.md wins on conflicts, but its GDP routing and product-call rows and its "Chemdawg only" merge rows are out of date. GDP retired on 2026-09-29. Grok 91 routes and merges in practice; older docs and other bots may still call this role Chemdawg or GDP. Where OWNERSHIP.md and this section disagree on roles or merging, this section describes current practice until OWNERSHIP.md is updated (pending).
- **Roles:**
  - Grok 91: merge-queue owner. Routes PRs to reviewers, sends findings back, and merges under the rule below.
  - Blue Dream and Durban Poison: code reviewers (peers) for `.tsx`/UI, auth, RLS, DB and Edge.
  - Critical Mass: reviewer for lib and logic, tests, docs-only, QA, accessibility, search and content (OWNERSHIP.md line 74). Until OWNERSHIP.md assigns it, Critical Mass also gives the independent verdict on CI, build and dependency PRs; line 75 gives Codex only _technical_ CI/build review.
  - Claude, Codex and Grok 91: authors.
  - Nobody reviews their own work.
- **Review loop:** [`.agents/skills/verdant-exact-sha-review/SKILL.md`](../../.agents/skills/verdant-exact-sha-review/SKILL.md).
  - Every verdict is tied to one exact SHA, or it is BLOCKED.
  - PASS-with-P2 always goes back to the author for a full re-review at the new head. It is never merged as is.
  - PRs stay draft until merge.
  - **Merge rule:** **Matthew's decision (2026-10-03, 10:53 PM CT):** all merges go through the merge queue, and the `--admin` bypass is emergency-only, at his call. Matthew's standing merge-when-green rule covers non-migration PRs: a clean PASS at the exact head SHA plus 35/35 required checks green at that SHA means mark it ready and enqueue it at that SHA with `gh pr merge <N> --squash --auto --match-head-commit <SHA>`. On this branch a plain `gh pr merge <N>` also joins the queue rather than merging directly. The queue re-runs the required checks against the latest tip before the PR lands (see [`merge-queue.md`](merge-queue.md)). There is no extra wait for a go-ahead. Skipping the queue takes the repository-admin bypass. In gh that is `gh pr merge --admin`; because the bypass belongs to the admin role, any admin merge path (the UI bypass option, or a REST or MCP merge by an admin) likely skips the queue too (untested). merge-queue.md line 9 calls that emergency-only, and whether a bypass on green is ever allowed is Matthew's call. Migration PRs need Matthew's explicit decision. Dated note (2026-10-03): #1867, #1869, #1887, #1888 and #1890 merged 5–28 s after being marked ready; #1889 (ready since 2026-10-03 11:13 UTC) merged 53 s after #1890. None has a merge-queue event, so (an inference from the GitHub events, not measured directly) they used the admin bypass. All six merged before the 10:53 PM CT decision above.
- **Before asking for review:** run [`recurring-review-findings.md`](recurring-review-findings.md).
- **Gates (until Matthew lifts them):**
  - No Publish.
  - knk production database lock: no writes.
  - HOLD #1250: PR #1250 merged on 2026-09-29 as `d2e8dbc3`. Its 4 files (`migration-drift-probe.yml`, `money-migration-drift-alert.yml` and their two tests) still must not be touched until Matthew clears it.
  - Migration PRs held for Matthew.
  - Never merge #1740.
  - GitHub comments (PR, review or issue comments) need Matthew's approval.
  - There's no staging site. Smoke tests run on production only, and only on the test fixture grow.
  - The Vercel "Account is blocked." status isn't a required check.
  - No agent changes to auth, RLS, migrations, Edge, `supabase/` or lockfiles unless Matthew names the action.
  - The live list is on the agents' shared box at `/workspace/shared/context/fleet-locks.md`.

# Verdant — Current Operating State

## Follow-up observation — 2026-10-10

- **established fact, collision fence (Matthew Cheek, 2026-10-10, 1:33 AM CT):** Claude's Tranche B+ product-code lock was reassigned to Canopy while Claude is out of tokens. Standing collision fences still bind, for example the remaining Tranche A edit points for Codex and no competing Timeline / Alerts / Action Queue rewrite. Canopy takes over each lapsed Claude claim with a `claimed_by:` comment, under Agent Handoff / Coverage. This entry records that reassignment. It does not change who Chemdawg, Grand Daddy Grok, Golden Toad, Lovable, or Council Chair are.

## Follow-up observation — 2026-10-02T15:39 UTC

- **BLOCKED, decision D1 widened (GDP):** Codex automated review on #1844 (comment 4167087657, P2) found that a page-body count misses AppShell's chrome triggers. The thread was marked resolved by the shared `cheekhimself` account with no reply or change. Source classes predict (not measured in a browser) that, after the header link goes, a one-tent Dashboard has card `Log` + page `QuickLogV2Fab` + `header-quick-log-trigger` on desktop, and card `Log` + `mobile-quick-log-fab` ("Open Quick Log") on mobile. The spec defines browser-level visible-control checks in E2 (desktop) and E4 (390/320 px) to test actual visibility; they have not run, and splits D1 into two blocking parts plus one non-blocking: D1.1 page FAB (A drop, recommended / B exempt), D1.2 AppShell triggers on Dashboard (A named chrome exemption, recommended / B hide on Dashboard / C card `Log` opens the sheet, separate slice), and D1.3 `Start Check` (non-blocking, unchanged). This supersedes the 15:12 checkpoint's two-option D1. #1833 still blocks; no merge, auto-merge, Publish or production operation.
- **#1844 head and review state:** #1844's exact head is not written here, because a commit cannot contain its own SHA; read it from the PR. Every push voids earlier CI and verdicts. Recorded: `bae8b6db` (the commit that added this entry, parent `ebc7fc3c`) reached 35/35 required SUCCESS at 2026-10-02 16:01 UTC with no review decision; the commit that adds this note moves the head again, so that result does not carry over. Independent review: Critical Mass (docs). Timestamp correction: this entry and the one below were first labelled 15:50 and 15:20 UTC; the commit times are 15:39 and 15:12 UTC.

## Follow-up observation — 2026-10-02T15:12 UTC

- **PASS, landed / BLOCKED, dashboard slice:** #1849 merged 2026-10-01 18:38 UTC as `b5d06488`; #1793 closed at 18:38 UTC as superseded. #1833 is still an open draft at `f296a953` (no activity since 2026-10-01 04:42 UTC), so the dashboard implementation stays BLOCKED. Deploy tip `80176bad`. `git grep` there shows exactly the 11 `dashboard-daily-grow-check-entry` references the spec plans for, including #1849's `e2e/signed-in-performance.spec.ts:35`. The overnight re-lands #1859/#1860 added none. #1837 (`881a64ba`) is still an open draft, with no `Dashboard.tsx` overlap on the deploy branch yet.
- **Correction, routing:** the 2026-10-01 16:15 and 16:58 checkpoints sent decisions D1/D2 and #1793's reassignment to Cheek. Per OWNERSHIP.md, product calls and routing belong to GDP, and Matthew is never a blocker in the review path. Those receipts stay as written. From here: D1/D2 go to GDP, and merge goes to Chemdawg after 35/35 required checks and an independent PASS on the exact head. Raised by Codex automated review on #1844 (comments 4158072653, 4158139339).
- **BLOCKED, decision D1 (GDP):** with a single-entry test that counts buttons as well as links, the page's own desktop `QuickLogV2Fab` ("Quick Log" button) is a second visible Log control next to the home card's `Log`. A link-only count would have missed it (review comment 4158072693). GDP must choose D1-A (drop `QuickLogV2Fab` from Dashboard; recommended, since AppShell's `header-quick-log-trigger` and its `open=quick-log` handling remain) or D1-B (keep it as a named exemption). D2 (no first-fold Log for no-tent or choose-a-tent states) is non-blocking.
- **PASS, #1844 head refresh:** the 16:15 checkpoint's ready head `1139be80` is stale (comment 4158500366). #1844 was ready for review at `bca3bb67` with 35/35 required SUCCESS (2026-10-01 18:16 UTC); this commit moves the head again, so earlier CI and any verdict do not carry over. Independent review: Critical Mass (docs). No merge, auto-merge, Publish or production operation. HOLD #1250 and the named locks remain.

## Follow-up observation — 2026-10-01T16:58 UTC

- **PASS, landed / BLOCKED, stacked successor:** #1792 is closed. Its fixture-proof change re-landed as #1835, which merged into `verdant-grow-diary` as `6ed854cee` at 16:49 UTC. #1793 (open draft, `074f4349`) still targets the closed #1792 branch `codex/chem-production-quicklog-fixture-001`. GitHub refused a retarget to `verdant-grow-diary` ("part of a stack"). A non-pushing `git merge-tree` trial against the deploy branch conflicts in 5 files: `e2e/lib/fixtureSafety.ts`, `e2e/lib/productionQuickLogFixtureProof.ts`, `e2e/lib/productionQuickLogFixtureRules.ts`, `e2e/quicklog-smoke.spec.ts` and `src/test/production-quicklog-fixture.test.ts`. The cause is #1835's review fixes, which #1792 never had. Source: status note on #1793 (issuecomment-5936177952, posted by another Claude session). This session has not reproduced the merge-tree trial. Proposed path: re-land #1793's signed-in performance and read-only proof work on a fresh branch from the deploy branch, keeping #1835's fixture files, with a normal merge and no force-push. It needs Codex as owner, or a reassignment from Cheek. #1799 and #1800 stack on #1793 and inherit the same block. No push to #1793 from either Claude session.
- **NOT_MEASURED, Codex reply / PASS, coordination carried forward:** no Codex reply to the `dashboard-ready` handoff (issuecomment-5935387971) as of 16:53 UTC. If #1793 closes in favour of a re-land, our slice's "#1793 merged or closed" precondition is satisfied on paper. However, the successor will likely carry `e2e/signed-in-performance.spec.ts` with `control: "dashboard-daily-grow-check-entry"` (inference), so the handoff must move to the successor PR. Auto-fix for #1793 was unbound from the dashboard spec session at the user's request; #1793's own Copilot and Codex-connector findings, including a P1 workflow_dispatch credential-exposure finding, remain Codex's.
- **PASS, base movement:** #1844 is now ready for review at `1139be80`. #1835 changes neither `CURRENT_STATE.md` nor `docs/specs/`, so #1844 was not updated with the new base. #1833 remains open (draft, `f296a953`); dashboard implementation stays BLOCKED. Same-file overlap, not a feature collision: #1837 (open draft, `claude/tonight-tent-home-demotion`, `881a64ba`) edits `src/pages/Dashboard.tsx` (+20/-17, KPI wall demotion) but not the header Quick Log button. Its PR body confirms it does not touch `dashboard-daily-grow-check-entry`. The implementation merges around whichever lands first. No merge, auto-merge, Publish or production operation. HOLD #1250 and the named locks remain.

## Follow-up observation — 2026-10-01T16:15 UTC

- **PASS, spec published / BLOCKED, implementation:** new stay-draft #1844 (`claude/dashboard-single-log-entry`) adds one file, `docs/specs/dashboard-single-log-entry-readiness-marker.md`, on deploy `0107d940`. No app or test code changed. After #1833, the Dashboard header `Quick Log` (`dashboard-daily-grow-check-entry`) duplicates the One-Tent Home `Log`. The spec removes the header button and moves every readiness consumer to `data-testid="dashboard-ready"` on the loaded-branch `PageHeader` actions wrapper. That wrapper renders whatever the tent selection, and never while loading or on error. Consumers covered: #1793's signed-in performance control, core-link census, ui-overhaul-responsive, and a fourth found by audit (`dashboard-mobile-overflow`). It also covers four unit-pin renegotiations and a RED-first test. Implementation stays BLOCKED until #1833 (`f296a953`, open draft) merges and #1793 (`074f4349`, open draft) merges or closes. Owner: Claude (user-assigned). Reviewers: Blue Dream for `.tsx`, Critical Mass for everything else.
- **PASS, coordination / NOT_MEASURED, reply:** handoff to Codex posted on #1793 (issuecomment-5935387971). It asks for a one-line `control: "dashboard-ready"` change only if #1793 is still open when #1833 lands. #1793 was not edited, and #1799/#1800 do not use the header ID. No Codex reply yet.
- **PASS, local docs evidence / NOT_MEASURED, CI:** `assert-docs-safety` PASS; two docs-safety test files 77 PASS / 0 FAIL / 0 SKIP; pre-commit hooks PASS. At 16:15 UTC #1844 checks: 1 SUCCESS, 52 queued, 1 pending, 12 skipped, 1 FAIL. Required contexts are not yet terminal.
- **FAIL, external provider / NOT_MEASURED, production impact:** the Vercel status on #1844 and on deploy `0107d940` (15:12:36Z) reads "Account is blocked." The deploy commit later shows "Required and affected projects deploying" (15:35Z). Account cause and production publish impact are not measured; account owner action needed. Open decisions D1 (app-chrome Quick Log triggers and `Start Check`) and D2 (no first-fold Log for no-tent or choose-a-tent states) await Cheek. No merge, ready, auto-merge, Publish or production operation. HOLD #1250 and the named locks remain.

## Follow-up observation — 2026-09-29T08:38 UTC

- **PASS, two normal merge-from-base repairs pushed:** #1651 now7f31a8d4eaaf217bab6897fbaacdb7bf0edf48c6 from0ca4487f016877b8db872fa9eeba0205e07c433b; #1355 now9eae24dd35c930b33739b16c324fcc7c700d5a60 fromd5c708740c5b8d91e5c5844d1ea92ef6789442ef. Both incorporate deploy61821446ebd7e4fb30a36a5a95b7526a34515df5 cleanly, no history rewrite. Existing draft/auto-merge-off checked before pushes; PR bodies updated. #1651's eleven feature blobs byte-identical to predecessor; #1355 remains sole .coderabbit.yaml feature, one obsolete approval comment replaced with OWNERSHIP independent-review/GDP routing, parsed configuration unchanged.
- **PASS, local evidence / retained FAIL:** #1651 seven files155 PASS / 0 FAIL / 0 SKIP; installed TypeScript zero diagnostics, scoped lint0/0, unchanged bundle SHA256321c69e6b07cec613495f728b0a2ccbc6da823af24023dc09e638b895614514c and whitespace PASS. Original canonical shim and direct-Bun startup attempts FAIL before tests; installed Node-shebang tools pass through Node without installs/dependency/lockfile changes. #1355 one file39 PASS / 0 FAIL / 0 SKIP, canonical typecheck0 diagnostics, YAML parse/effective-config equality/whitespace PASS. These existing regression suites are not new or additive unique tests. Full local suite/build NOT_MEASURED.
- **FAIL, hosted dependency / NOT_MEASURED, terminal acceptance:** predecessor failed logs read before updates: #1651 rootfast-uri HIGH1239943/1239946, nestedundici MODERATEGHSA-3wwx-pv8p-q78v, WebKit initial consent-banner hydration; #1355 rootfast-uri HIGH. New #1651 nested job109325182441 FAILS the same undici advisory; log read, no rerun/waiver. #1751 atf63d46fedcc9edaef034e14fa21bf19cc89460b8 is already current and remains sole analytics repair owner; fresh Chromium/WebKit10 PASS each, no duplicate implementation. Rest of new-head CI and Blue Dream(#1651)/Critical Mass(#1355) verdicts NOT_MEASURED. Advisory repair requires locked dependency authority.
- **PASS, operational guards / FAIL, inherited full-file formatting:** all three strict docs scanners, edge-import guard, HANDOFF_LOG formatting and whitespace pass. New checkpoint formatting passes; whole CURRENT_STATE formatter still reports the unchanged historical heading layout, also failing at HEAD. Historical receipt tail preserved byte-for-byte rather than silently reformatted.
- **PASS, supplemental readback / NOT_MEASURED, full goal:** #1800 all17 check records terminal:15 SUCCESS/2 legitimate SKIP; both public and authenticated census SUCCESS. Stacked35 required Main contexts remain absent, no inherited PASS; actual Actions read/refresh proof remains as prior receipt. #1754 merged unchanged0384753a at02:13:59Z as8b73b25a; the 8:07/8:15 ship-as-is message is historical, not fresh review/live acceptance. Four other active assigned heads remain eight commits behind plus orphan#1618; no gratuitous updates to already-current heads. Archived Quick Log write fixture, full signup/recovery mailbox proof, genuine AI credit-limit denial, independent review/integration, Timeline#1794 and locked DB/Edge/EcoWitt acceptance remain distinct. Installed mail connector belongs to KEEP, so no inbox read/reset/signup attempted. No merge/ready/auto-merge/Publish/production SQL/APPLY/PREFLIGHT/device/AQ/secret/variable/fixture change. HOLD#1250 and named locks retained; full goal ACTIVE.

## Follow-up observation — 2026-09-29T08:12 UTC

- **PASS, actual production Actions read and refresh:** new stay-draft #1800 head `b25e8cfa93b2ba4fd8e1c3c0bf2194afcf00cbfd`, parent #1793 at `35e7def61992753d34fb04c10a99febfcce5e130`. Run36540923804/job109315857747 terminal SUCCESS: hosted safety3 files267 PASS / 0 FAIL / 0 SKIP; browser2 PASS / 0 FAIL / 0 SKIP / zero retries includes existing sign-in plus owned queue readback/refresh. Normal account response and actual active-grow rows prove fixture ownership before the exact scoped read. Four real Actions rows before/after match rendered ids/titles/counts; all six checks including approval-required framing pass. Receipt appSHA expected/observed61821446ebd7e4fb30a36a5a95b7526a34515df5, elapsed1317.959747ms for whole sequence, blockedWrites0, applicationErrors0, existingRoleReads2, photoReads0. Artifact11020881186 downloaded and SHA2562b175b38203a523059f47ba888df09332c82bfd4be7eda5a7058f0fbd0b784e2 verified. No mutations, device action, raw private data, mock live rows or application/auth/barrier edit.
- **PASS, local validation / retained FAIL and SKIP:** four new files +810/-0,97 new cases. Initial86 PASS / 11 FAIL from an incorrect UUID group in the new proof helper; corrected focused3 files267 PASS / 0 FAIL / 0 SKIP. SeparateV026/26; static AQ safety/audit/docs3 files102 PASS / 0 FAIL / 16 SKIP: existing policy-detector gates skipped, not a missing configured runtime harness and not hosted RLS proof. Canonical/E2E typechecks0 diagnostics, scoped lint0/0, format/whitespace/import/three strict docs scanners PASS. Canonical build PASS:77 head snapshots and383 JSON-LD blocks/77 pages; existing chunk/inlineDynamicImports and intentional Quick Log rich-result warnings retained. Build-generated public version/buildInfo restored to HEAD; source tree clean and closed diff unchanged.
- **NOT_MEASURED, independent and full acceptance:** Critical Mass exact-head verdict, fresh standalone35 Main contexts after parent integration, transition/device/security/full-core-loop acceptance. At08:12 UTC17 supplemental records, zero FAIL/two census jobs pending, full unit lane skipped by stacked base. Fresh72 open heads with no other-owner/deploy drift. This moves Actions from no live read evidence to scoped read/refresh PASS, not whole-feature or end-to-end acceptance. Remaining Timeline/#1794 live correction, genuine AI credit denial, archived configured Quick Log write fixture, full auth/reset and locked database/Edge/EcoWitt lanes remain distinct. GDP integrates; no ready, auto-merge, merge, Publish, SQL/APPLY/PREFLIGHT, customer/KEEP write, device or AQ operation. HOLD #1250 and ownership locks remain; full goal ACTIVE.

## Follow-up observation — 2026-09-29T07:51 UTC

- **PASS, current production Settings/account/consent proof:** stay-draft #1799 head3b81addb65fbe17f206193e3cf4643861def3132, parent #1793 head35e7def61992753d34fb04c10a99febfcce5e130; run36538876591/job109309263434 terminal SUCCESS. Hosted safety3 files236 PASS / 0 FAIL / 0 SKIP; browser4 PASS / 0 FAIL / 0 SKIP / zero retries includes existing sign-in and all three real production sequences. Artifact11019502703 downloaded; digest6a908779c67add1612473aa44685c5268ea0003e36126dbacf4a5c2487dd9183 matches. Before/after appSHA61821446ebd7e4fb30a36a5a95b7526a34515df5 on every receipt. Whole tested sequence elapsed: browser preferences2539.6115809999997ms; own account readback780.840784ms; analytics refusal1509.8273239999999ms. Every receipt blockedWrites0, applicationErrors0, analyticsRequests0. Existing source/app/auth/barrier unchanged; browser preferences and refusal only affect disposable browser storage. Initial failed teardown remains recorded at07:48; final fence retained, no waiver.
- **NOT_MEASURED, independent/full acceptance:** Critical Mass exact-head verdict and35 standalone Main contexts still needed after parent integration; parent stack does not inherit required checks. Excluded account mutations/legal re-acceptance, billing portal/cancellation/deletion, positive analytics consent and backend security acceptance remain unmeasured. This advances the composite Settings/account/consent area with scoped live receipts, not a full feature/core-loop PASS or a speed budget. Remaining full-goal gaps: genuine AI Doctor credit-limit denial, archived QuickLog write fixture, original Timeline invalid-legacy acceptance/#1794 integration, locked DB/Edge/EcoWitt lanes, Actions and full auth/reset, independent review/integration/publish packet. Current71 open heads checked; no other-owner/deploy drift. GDP integrates; HOLD #1250, no ready/merge/auto-merge/Publish/production SQL/APPLY/PREFLIGHT.

## Follow-up observation — 2026-09-29T07:48 UTC

- **PASS, new test/proof draft:** #1799 head3b81addb65fbe17f206193e3cf4643861def3132, based on #1793 head35e7def61992753d34fb04c10a99febfcce5e130. Four new files (+706/-0) measure production Settings browser-local preference persistence, own-account marketing/legal-history readback and durable analytics refusal. Existing fixture identity/write barrier and application/auth source unchanged; no profile, agreement, billing, AI, customer or Action Queue writes. Local broad9 files369 PASS / 0 FAIL / 0 SKIP includes66 new cases; current-head focused3 files236 PASS / 0 FAIL / 0 SKIP overlaps that set. Canonical/E2E typechecks zero diagnostics, final scoped lint zero errors/warnings; initial1 unsafe-finally error corrected and retained. Separate V0 26/26 and docs-safety67/67, not unique aggregate tests.
- **FAIL, predecessor production / PASS, narrow observation:** run36538588974/job109308328634 at1df2e35d986bab0811140a516ec73f0150780b7d: hosted safety236/236 PASS; browser2 PASS / 2 FAIL / 0 SKIP / zero retries. Existing sign-in and account-readback passed; preferences and refusal UI sequences completed but final read-only proof stayed BLOCKED due unfinished identity/role reads cancelled by reload/teardown. All receipts blockedWrites0, applicationErrors0, analyticsRequests0. Account-readback801.5922729999998ms at before/after appSHA61821446ebd7e4fb30a36a5a95b7526a34515df5. Artifact11019193698 downloaded, digest07f7e02a712b9bc9156cac7954011bda3b7aec1d22be81aeefb26f8cffcd811c matches. Current +11-line repair settles the existing identity proof before reloads/close, retaining the final closed-context barrier. No waiver or blind rerun.
- **NOT_MEASURED / BLOCKED, wider goal:** current #1799 hosted result and Critical Mass acceptance pending; all35 standalone required contexts absent on the parent stack. Whole Settings/account/security acceptance and account mutation/re-acceptance/deletion/billing/positive-consent behavior are not claimed. AI Doctor hosted credit-limit denial still needs genuine exhausted fixture credit state and usable evidence; no model spend, fake denial or backend credit write. Quick Log archived-fixture write block remains. 70 open heads and15 recent closed PRs refreshed before new draft; other owners/deploy unchanged, now71 open after creation. PR attachment UI hit the100-identity limit; draft itself exists and exact head/base/body/draft/auto-merge-off were read back. HOLD #1250 and owner locks remain; GDP controls integration. No ready, merge, auto-merge, Publish or production SQL/APPLY/PREFLIGHT.

## Follow-up observation — 2026-09-29T07:31 UTC

- **PASS, current production readiness proof:** draft #1793 head35e7def61992753d34fb04c10a99febfcce5e130, run36536846789/job109302743684 completed SUCCESS. Hosted three-file safety tests219 PASS / 0 FAIL / 0 SKIP; browser4 PASS / 0 FAIL / 0 SKIP / zero retries includes existing sign-in plus all three readiness checks. Artifact11019051579 downloaded and digest5934f74e3b19d051867fcc94a6ce5c7c7f1fb0a39712d5eab833364416b3e496 matches. All expected/observed app SHAs61821446ebd7e4fb30a36a5a95b7526a34515df5. Dashboard1447.4758849999998ms, Timeline1912.6403689999997ms and Sensors1355.4961920000005ms control readiness PASS. Each zero blocked requests/two permitted fixture operator reads; Timeline alone completed one owner-validated photo-signing read. The production read is now observed, predecessor FAILs retained, no blanket POST exemption. JSON receipt and full dated report saved in Downloads.
- **NOT_MEASURED, broader acceptance:** these preauthenticated warm navigation-to-enabled-control timings do not establish speed budget/cold-load/full-data/saved-value/core-loop/schema/Edge acceptance or validate #1794's not-yet-integrated Timeline correction. Quick Log save remains BLOCKED by archived configured plant; no save attempted or fixture changed. Current draft still needs Critical Mass review and parent landing/normal retarget for35 required Main contexts. GDP integrates; no self-review/ready/auto-merge/merge/Publish/SQL/APPLY/PREFLIGHT/device/AQ/secret/variable operation.
- **PASS, complete check inventory / FAIL, residual gates:** 70 open heads checked at07:30:45UTC, zero read errors;58 heads have all35 required contexts SUCCESS. Two required-failing heads are held #1369 and untouchable #1735;10 heads lack all35 contexts (orphan/stacked/excluded).43 heads have at least one latest supplemental-or-required failure; one head has pending jobs. Counts overlap, not release acceptance. Assigned13 repair set:12 now35/35 SUCCESS, #1618 still orphan with35 absent and closure proposal. Dependencies and locked owner lanes are not waived. Inventory JSON retained. Full11 named shaky-feature outcomes, three unmeasured composite surfaces, AI credit-limit, full core-loop and independent/pilot/payment acceptance remain open; limited readiness proof does not lower whole-feature scorecard. Goal stays active; HOLD1250 and all named locks retained.

## Follow-up observation — 2026-09-29T07:29 UTC

- **PASS, narrow photo-read correction:** #1793 now35e7def61992753d34fb04c10a99febfcce5e130, normal push from c98a5d9e463887c36bdc944434a0bab6c1bd593b, unchanged #1792 parent34f8beae3334cceb6f914df904a6842c90005eb4. Three test/proof files +268/-4; whole eight-file draft +1728/-6. Read-only source audit found Timeline createSignedUrls(paths,3600); installed storage client transports that as POST /storage/v1/object/sign/diary-photos. Sole added allowance requires positive fixture account, exact endpoint/no query, exactly paths/expiresIn, fixed3600 expiry, 1–100 unique viewer-owned unencoded paths, and complete matching successful response. Pending/failed/invalid/foreign-owner reads invalidate timing. Storage GETs also wait for account proof. Upload/delete, other bucket/owner/RPC/POST remain blocked; tokens and paths never enter receipts. Application/auth/Supabase/SQL unchanged.
- **PASS, local correction / FAIL, predecessor production:** photo-read baseline1 FAIL / 0 PASS / 72 excluded. Final7 files293 PASS / 0 FAIL / 0 SKIP includes112 extension cases and V0/photo-parser coverage; no overlapping sums. Canonical/E2E typechecks zero diagnostics, three-file lint zero errors/warnings, formatting/whitespace PASS. Current synthetic Chromium transport5/5, three writes blocked, receiver writes0 and disposal barrier retained. Origin diagnostic predecessor run36536274509/job109300944087: hosted184 PASS, browser3 PASS / 1 FAIL / 0 SKIP / zero retries. App61821446, Dashboard986.8835049999998ms and Sensors1125.2072190000001ms readiness PASS; Timeline one POST backend-other BLOCKED elapsednull. Artifact11019045851 digest ea52def34c717da3c1e4ba2616d6073780c6d25d7885fba955055391d4a0ccf7 verified. This identifies only origin class; exact photo-read endpoint still NOT_MEASURED in production before this run.
- **NOT_MEASURED, current production / independent acceptance:** new run36536846789/job109302743684 in progress. All35 required Main contexts absent on stacked base, no previous-head inheritance. Readiness observations do not prove speed budget/full-data/saved-value/core-loop/schema/Edge acceptance; Quick Log save still BLOCKED archived plant. All70 open heads/bases refreshed, other owners/deploy unchanged. Critical Mass reviews current test/CI head, Blue Dream retains parent, GDP integrates. Goal active; no merge/ready/auto-merge/Publish/APPLY/PREFLIGHT/device/AQ/secret/variable/fixture operation. HOLD1250 and locks remain.

## Follow-up observation — 2026-09-29T07:23 UTC

- **PASS, limited production readiness / FAIL, overall workflow:** #1793 proof head fa2c673fe6530bccfdd170a59d29c51f13b2e698, run 36535554628 / job 109298652779: hosted safety tests 3 files / 181 PASS / 0 FAIL / 0 SKIP; browser 3 PASS / 1 FAIL / 0 SKIP / zero retries (existing sign-in, Dashboard and Sensors pass; Timeline fails). Expected/observed app SHA both 61821446ebd7e4fb30a36a5a95b7526a34515df5. Dashboard control ready in 1322.2586700000002 ms, Sensors manual-reading control ready in 1316.775901 ms; each zero blocked requests/two permitted fixture-bound role reads. These are warm, preauthenticated control-readiness observations, not a speed budget, cold load, complete-data retrieval or full core-loop acceptance.
- **BLOCKED, Timeline / PASS, no fence waiver:** Timeline receipt has elapsedMs=null, operation_postcondition_failed, one blocked POST classified only as other and two permitted role reads. Its destination and cause remain NOT_MEASURED; no mutation, telemetry or wrong-account diagnosis inferred. Failed log and sanitized artifact 11017559477 read; downloaded ZIP digest 52ae742d1d32df19ff0b0158b054c17aef9be4cfa2b76fbb259a6025cba865d1 matches. Quick Log save remains separately BLOCKED by the archived configured plant; no save attempted.
- **PASS, normal-pushed diagnostic:** stay-draft #1793 now c98a5d9e463887c36bdc944434a0bab6c1bd593b on unchanged #1792 parent 34f8beae3334cceb6f914df904a6842c90005eb4; two files +25/-2, whole PR eight +1464/-6. Finite origin classes distinguish backend-other, application-other and external without exporting URL/path/query/id/payload or allowing another request. Final six focused files 247 PASS / 0 FAIL / 0 SKIP includes V0 26 and 77 extension cases; prior overlapping totals are not summed. Canonical and E2E typechecks zero diagnostics; changed-file lint zero errors/warnings, format/whitespace PASS. New-head production outcome, Critical Mass review and full local suite/build NOT_MEASURED; 35 required Main CI contexts absent on stacked base. All 70 open head/base pairs refreshed, no other-owner drift. Full goal stays active; no merge/ready/auto-merge/Publish/production SQL/APPLY/PREFLIGHT/device/AQ/secret/variable/fixture change. HOLD #1250 and locks retained.

## Follow-up observation — 2026-09-29T07:16 UTC

- **PASS, same-draft harness correction:** #1793 now fa2c673fe6530bccfdd170a59d29c51f13b2e698, parent/base #1792 unchanged at 34f8beae3334cceb6f914df904a6842c90005eb4; eight test/CI files (+1441/-6), normal commits only, draft and auto-merge-off read back. First two production attempts each 1 PASS / 3 FAIL / 0 SKIP / zero retries; artifacts show all route bootstraps blocked on POST has_role, a harness policy incompatibility. Source audit confirms its authored STABLE boolean SELECT and app operator lookup. Sole exact-endpoint exception now requires positively proved fixture id, exact two arguments/operator role and successful boolean response; all other mutations, RPCs and WebSockets still blocked. No auth application, SQL, Supabase, RLS, fixture, secret or variable change; parent write guard/Quick Log integration unchanged. Hosted function definition remains NOT_MEASURED; no schema acceptance inferred.
- **PASS, local proof / NOT_MEASURED, current production outcome:** role baseline 1 FAIL / 46 excluded SKIP; intermediate 217 PASS / 1 FAIL exposed a missed static hook replacement. Corrected six-file run 244 PASS / 0 FAIL / 0 SKIP includes V0 26 and 74 extension cases, not added to overlapping older runs. Canonical and E2E typechecks zero errors, scoped lint zero errors/warnings; format/whitespace/import/docs guards PASS. Current-source local Chromium transport 5/5, zero receiver writes. New job 109298652779 / run 36535554628 is in progress. Critical Mass independent acceptance and production timings NOT_MEASURED; Main CI's 35 required contexts still absent on stacked base. Full goal remains active; no merge/ready/auto-merge/Publish/APPLY/PREFLIGHT/device/AQ operation. HOLD #1250 and named locks preserved.

## Follow-up observation — 2026-09-29T07:04 UTC

- **PASS, pushed proof extension:** existing stay-draft #1793 now 51e632e604a921c3654f443773892171b9e307ed, from c449a0b486d37b3128d3bab18538dda498e111a3; parent/base remains #1792 at 34f8beae3334cceb6f914df904a6842c90005eb4. Seven extension files (+614/-33), whole PR eight (+1182/-6). Read-only routes verify the approved fixture account independently of active plant status. HTTP mutation methods and WebSockets blocked before navigation; row reads wait for account proof. Any failed/changed/pending identity or attempted write invalidates timing, including after browser context closes. Existing Quick Log timing/parent fixture guard/auth bootstrap and CI variables/secrets unchanged; no application change.
- **PASS, scoped evidence:** baseline one file 45 PASS / 4 FAIL / 0 SKIP; final five files 186 PASS / 0 FAIL / 0 SKIP includes 42 new cases. Separate V0 26/26 and local synthetic Chromium transport 5/5, three HTTP writes blocked and receiver writes=0. Overlapping earlier 149-test runs not additional unique tests. Canonical and targeted E2E typechecks zero diagnostics; six-file lint zero errors/warnings; seven-file format, whitespace/import/docs guards PASS. Discovery four cases in two files, zero execution. Initial standalone Bun browser check stalled and was stopped; first bundle failed on optional module resolution; Node-run local exercise passes without installs/lockfile edits. Downloads CHEM-performance-readonly-2026-09-29.md retains commands, failures and handoff.
- **NOT_MEASURED, production performance / independent acceptance:** new job 109294765994 passes approved fixture/host preflight, checkout, current deploy-SHA pin, dependency install, safety regressions and Chromium; three-route step running at 07:03:22 UTC. Main CI still excludes this stacked base: 35 required contexts absent, no previous-head PASS inherited. Full local suite/build NOT_MEASURED. Critical Mass reviews this tests/CI head; Blue Dream retains P1 parent; GDP lands. Archived plant still blocks Quick Log save proof, not read-only account timing. No fake data, self-review, ready, auto-merge, merge, Publish, production DB operation, secrets, device or Action Queue action. Full goal remains active; all named locks retained.

## Follow-up observation — 2026-09-29T06:44:33 UTC

- **PASS, terminal required CI:** stay-draft #1798 at ee352c59ac7abe33db639d700f4e8c0785975fb8 has all 35 required contexts SUCCESS, zero required failure/missing/pending. Main CI 109287680782 completed SUCCESS at 06:44:23 UTC, including typecheck, Build and build summary. Conditional QuickLog RPC runtime harness SKIPPED. Downloads CHEM-move-tent-read-required-CI-terminal-2026-09-29.json retains every required context ID; initial partial snapshot preserved. Root high fast-uri and nested moderate undici FAILs remain with logs read; native save/retrieve, census and JavaScript CodeQL still pending. Blue Dream/live acceptance NOT_MEASURED. No waiver, ready, auto-merge, merge or production operation; full goal stays active.

## Follow-up observation — 2026-09-29T06:39 UTC

- **PASS, Alerts remeasurement at 06:41:59 UTC:** existing #1673 remains 74587f9c7cb9f7357c6fb617b9312243448f9b93 on deploy base 61821446, with 35/35 required SUCCESS, zero required failure/missing/pending, zero pending supplemental jobs. Two extra audit FAILs remain: root 109250092287 high fast-uri 1239943/1239946 and nested 109250092561 moderate undici; both exact-head logs read. No new implementation or test run; prior local counts are historical. Blue Dream/live acceptance NOT_MEASURED. Downloads CHEM-alert-aging-CI-recheck-2026-09-29.json retains every required context ID.
- **PASS, source repair / pushed stay-draft:** #1798 at ee352c59ac7abe33db639d700f4e8c0785975fb8, deploy base 61821446ebd7e4fb30a36a5a95b7526a34515df5. Four closed files (+387/-4) distinguish failed eligible-tent reads from successful emptiness. Cached destinations are hidden after a failed refresh; Retry refetches the existing complete query. Pure rule also guards submit. Existing query filters, owner fallback, explicit hunt untag, same-grow/cross-grow payloads and movement note unchanged. No competing implementation: only overlapping #1618 has a deploy-identical AssignTentDialog blob and unrelated unique feeding-demo tests.
- **PASS, regression evidence:** original dialog 6 FAIL / 3 PASS / 0 SKIP. Intermediate focused 1 FAIL / 20 PASS (test corrected for real QueryClient first-read Retry pending semantics); final related 13 files / 154 PASS / 0 FAIL / 0 SKIP includes 22 new cases. Separate V0 26/26 and docs-safety 67/67, not added as unique counts. Canonical typecheck zero errors; scoped ESLint four files zero errors/warnings; format/whitespace/docs/secret/import PASS; bridge evidence 37/37. Final source checkout clean. Downloads CHEM-move-tent-read-honesty-2026-09-29.md retains exact commands, earlier failures and handoff.
- **NOT_MEASURED, terminal required CI / FAIL, dependency lanes:** initial new-head snapshot 2/35 required SUCCESS, 33 pending, zero required FAIL. Root 109287637525 FAILS high fast-uri 1239943/1239946; nested 109287635022 FAILS moderate undici GHSA-3wwx-pv8p-q78v. Both failed logs read, off-limits dependency/lockfile repair, no rerun/waiver. Blue Dream exact-head acceptance and live Move Plant behavior NOT_MEASURED. Archived smoke fixture remains a separate write-acceptance blocker. No lower whole-feature shaky count inferred from source tests.
- **PASS, historical merge remeasurement / NOT_MEASURED, Timeline acceptance:** #1754 is closed/merged unchanged from reviewed/override head 0384753ae911eca2a989694f8514f116dc903757 at 2026-09-29T02:13:59Z, squash 8b73b25a879e8d1fc526fdd7035ae1d368eab3f6. Its earlier 8:07/8:15 deadline update is historical. This does not turn the owner's Blue Dream FAIL override into PASS or prove live correctness; P1 correction #1794 remains separate. No merge, ready, auto-merge, Publish, production SQL/APPLY/PREFLIGHT/dispatch, secrets, device or Action Queue operation. HOLD #1250 and all named locks remain; full goal stays active.

## Follow-up observation — 2026-09-29T06:22:50 UTC

- **PASS, terminal parent required CI:** #1672 at 9b0053e79e38b9c7585c6e7cf6bdeb48935a53f2 now has all 35 required contexts SUCCESS, zero required failure/missing/pending. Main CI 109282458900 terminal SUCCESS. Context IDs retained in Downloads CHEM-tent-aging-parent-CI-terminal-2026-09-29.json. Earlier partial receipt preserved. Additional root fast-uri and nested undici FAILs remain; supplemental jobs still pending. Child #1694 still needs standalone required CI after parent landing/normal retarget. Blue Dream acceptance and live Tent Detail behavior NOT_MEASURED. No merge, ready, auto-merge, waiver or production operation.

## Follow-up observation — 2026-09-29T06:21:14 UTC

- **PASS, normal integration:** #1672 now 9b0053e79e38b9c7585c6e7cf6bdeb48935a53f2 from 89552fe7330625e4516b0d97d1c3689d46a08a4e, merged with deploy 61821446ebd7e4fb30a36a5a95b7526a34515df5. Child #1694 now 450d998ad5e6759f25964f9a144a9ebdb48767eb from b94a463133f8d5c61f7ab48c90a13fd2a45e4079, normally merged with the refreshed parent. Both stay draft, auto-merge off, heads/base/body read back. Zero conflicts; both parent feature blobs and both child test blobs are byte-identical to their predecessors. Parent diff remains two files (+137/-1); child remains two tests (+31/-0). No new implementation or assertion rewrite.
- **PASS, local evidence:** parent seven files / 136 PASS / 0 FAIL / 0 SKIP; child seven files / 139 PASS / 0 FAIL / 0 SKIP. Overlap is not 275 unique tests. Both Bun canonical typechecks exit 0 with zero diagnostics; scoped ESLint two files each 0 errors/0 warnings; format, whitespace, three docs-safety categories and import guard PASS. Missing command shims initially blocked execution; reusing verified shared dependencies resolved setup without installs/lockfile edits. First format passes failed only on checkout CRLF (897 parent, 419 child warnings); LF normalization changed no Git blobs. Hook autofixes were skipped for inherited base files after explicit checks. Receipts retain these earlier failures.
- **NOT_MEASURED, required completion/review/live:** parent at this time has 33/35 required SUCCESS and two in progress; new root 109282411050 FAILS high fast-uri 1239943/1239946 and nested 109282410911 FAILS moderate undici. Failed logs read, locked dependency repair, no rerun/waiver. Child has 35 required contexts missing because its stacked base is excluded by Main CI; after parent landing it needs normal retarget and new required CI. Blue Dream reviews both exact heads per OWNERSHIP. No parent-first landing, full browser or production acceptance inferred from local checks.
- **PASS, additional Pricing source proof:** #1797 remains a3d5269435bbcdabac65b84536238017a7f66095 with all 35 required SUCCESS and no pending job at 06:21:14 UTC; root/nested FAIL retained. Native local-backend log 109277517082 reports 21 PASS / 0 FAIL / 0 SKIP. Mocked census logs report public 5 PASS and authenticated 6 PASS. These are separate scopes, not extra unique unit cases or live acceptance; census uses synthetic session/reads. No production checkout, credit spend, customer access or live writes.
- **BLOCKED, production acceptance / NOT_MEASURED, wider goal:** archived write-smoke fixture and owner-controlled review/database/publish gates remain. Existing #1793 timing harness has 16 terminal named contexts but zero required contexts on its stacked base; no required or production performance PASS. Shipped 28.2 and proposed ops 28.3 remain distinct. HOLD #1250 and named locks unchanged. No ready, auto-merge, merge, Publish, production APPLY/PREFLIGHT/SQL/dispatch, secret, device or Action Queue operation. CHEM-GOAL-3DAY-001 remains active.

## Follow-up observation — 2026-09-29T06:06 UTC

- **PASS, terminal required CI:** stay-draft #1797 at `a3d5269435bbcdabac65b84536238017a7f66095`, base `61821446`, has all 35 required contexts SUCCESS, zero required failure/missing/pending. Main CI `109277565013` Build and build summary SUCCESS; conditional QuickLog RPC runtime harness SKIPPED. Context IDs saved in Downloads CHEM-pricing-pack-retry-CI-terminal-2026-09-29.json. Earlier partial snapshots remain dated history. Supplemental jobs pending; high fast-uri and moderate undici jobs remain FAIL with logs read. Blue Dream/live acceptance NOT_MEASURED; no waiver, merge or production operation. Goal stays active.

## Follow-up observation — 2026-09-29T06:02 UTC

- **PASS, pricing repair:** stay-draft #1797 at `a3d5269435bbcdabac65b84536238017a7f66095`, base `61821446ebd7e4fb30a36a5a95b7526a34515df5`, four closed files (+306/-28). Exact-base pack-retry reproduction 8 FAIL / 0 PASS / 3 excluded. Pure retry gate reuses canonical SKU/eligibility logic, keeps blocked recovery intact and shows existing honest copy; verified pack/plan retries and success URL preserved. Forty-one new cases; new set 2 files / 41 PASS, related final set 15 files / 168 PASS, each 0 FAIL / 0 SKIP. Canonical typecheck 0 diagnostics, ESLint 4 files 0 errors/0 warnings, format/whitespace/three scanner categories/import guard PASS. No hook/provider, price/entitlement, auth, Supabase, migration, lockfile, device or Action Queue change or actual checkout/charge.
- **NOT_MEASURED, terminal CI/review/live:** #1797 at 06:01:35 UTC has 21 required SUCCESS / 14 in progress; no old result inherited. Root `109277517177` FAIL fast-uri 1239943/1239946 and nested `109277517160` FAIL moderate undici; failed logs read, locked repair, no rerun/waiver. Blue Dream acceptance and actual production pricing/eligibility behavior NOT_MEASURED. Full 68-head collision inventory refreshed; zero pricing target overlap. Alerts #1673 remains untouched. After new draft creation the open count is 69; no new aggregate failure count inferred from the older 68-head snapshot.
- **PASS, current-head required contexts / FAIL, additional checks:** #1796 still 35/35 SUCCESS at `8f874b59`; supplemental work remains. Pre-checkpoint #1777 at `e945d9a6` has 35/35 SUCCESS but governance `109275163130` rejects the proposed ACK coverage until #1779's checker lands; root `109275162934` FAIL fast-uri; old smoke `109275163763` reports 1 PASS / 1 FAIL / 0 SKIP and one automatic retry, refusing the configured production host before the write checklist. Logs read. #1792 already owns the fixture guard; no duplicate implementation or bypass. Later ops push invalidates these current-head CI claims.
- **PASS, anonymous HTTP/SSR only / NOT_MEASURED, product behavior:** fresh public version at 06:01:01.9913132 UTC is HTTP 200, commit `61821446`, dirty:false, buildTime 03:02:39.564Z, cache HIT/Age 7062. Anonymous /pricing and sign-in/reset URLs return HTTP 200; Pricing has its rendered heading, auth responses contain no server-rendered inputs. Web reader could not access those pages; direct HTTP succeeded. This does not prove hydrated forms, sign-in/reset, checkout, schema or the core loop. No form submitted, user created, signed-in account accessed or live write.
- **BLOCKED, full production acceptance:** configured write-smoke fixture remains archived; no automatic unarchive, CI-variable/secret change or KEEP/customer access. Source repairs do not lower all eleven named shaky rows without live evidence. Independent acceptance, credit-limit smoke, performance, schema/Edge/payments and complete core loop remain NOT_MEASURED. HOLD #1250 and named locks remain. No merge, ready, auto-merge, Publish, SQL/APPLY/PREFLIGHT/dispatch, device/AQ or credentials. CHEM-GOAL-3DAY-001 stays active.

## Follow-up observation — 2026-09-29T05:48:34 UTC

- **PASS, reproduced and pushed onboarding repair:** new stay-draft #1796 at `8f874b595709d2b4f0b7d94a8d0e8fb515d4271c`, base `61821446ebd7e4fb30a36a5a95b7526a34515df5`, changes only Onboarding and its focused test file (+126/-2). Same-turn double activations reproduced 3 FAIL / 0 PASS / 9 excluded on the exact base. Shared synchronous presenter guard serializes setup and plan retry; seven new cases preserve sequential retry and CSV handoff. Final 7 files / 66 PASS / 0 FAIL / 0 SKIP; separate V0 1 file / 26 PASS / 0 FAIL / 0 SKIP. Bun typecheck 0 diagnostics, lint 2 files 0 errors/0 warnings, format/whitespace/scanners/import guard PASS. Failed ESLint output-file setup retained; stdout capture correction PASS. Per-mounted-presenter protection only; cross-tab/remount/database concurrency NOT_MEASURED.
- **PASS, complete inventory read / FAIL, additional checks:** 68 open heads completely paginated at 05:42–05:45:45 UTC; follow-up open listing shows no head changes, additions or closures. 55 heads have all 35 required SUCCESS; 40 have at least one latest failed check/status. Two heads have pending jobs; categories overlap. 39 heads fail the root audit and 27 the nested static/audit job. Original 13 repairs: 12 all-35 SUCCESS; orphan #1618 missing all 35. #1651 still has a GA WebKit failure (6 PASS / 1 FAIL / 1 flaky classification), logs read; #1751 already owns the corresponding hydration repair. No causal improvement claim against the different earlier inventory or duplicate fix. Receipt: Downloads CHEM-open-pr-checks-2026-09-29-0547Z.json.
- **PASS, required contexts / NOT_MEASURED, all-job completion:** #1796 had 34/35 required SUCCESS at 05:46:17 UTC; fresh read at 05:48:34 UTC confirms 35/35 SUCCESS, zero required failure/missing/pending. Supplemental browser census/local-backend/CodeQL jobs remain pending. Additional root `109273300041` FAIL fast-uri 1239943/1239946 and nested `109273301682` FAIL moderate undici; logs read, dependency scope locked, no rerun/waiver. #1795 now has its own exact-head 35/35 required SUCCESS and Main CI `109270820218` SUCCESS, conditional runtime harness SKIPPED; root `109270773395` remains FAIL. Independent Blue Dream/Critical Mass acceptance remains NOT_MEASURED.
- **BLOCKED, complete product acceptance:** public frontend identity previously matched deploy `61821446`; this does not measure onboarding, Timeline repair, credits, schema, Edge, payments or full loop. The active-smoke fixture remains archived; no unarchive/configuration bypass. Eleven named shaky rows remain unpromoted by local-only proofs. No merge, ready, auto-merge, Publish/promote, production SQL/APPLY/PREFLIGHT/dispatch, credentials, device or Action Queue operation. HOLD #1250 and ownership locks remain; CHEM-GOAL-3DAY-001 stays active.

## Follow-up observation — 2026-09-29T05:32 UTC

- **PASS, release packet:** new stay-draft #1795 is `69a54f84aef49846847cb5d6f3315f9470c0cc89` on deploy `61821446ebd7e4fb30a36a5a95b7526a34515df5`, one Markdown file +190/-0. Existing local release branch advanced normally; no source/runtime change. Fresh all-66 head/base check shows no drift before push; complete file inventories reused only for unchanged pairs and read fresh for #1777/#1794. #1780 retains its separate runbook. Docs safety 1 file / 67 PASS / 0 FAIL / 0 SKIP; three scanner categories, format and whitespace PASS. New document-head CI and Critical Mass acceptance NOT_MEASURED.
- **PASS, frontend identity / NOT_MEASURED, runtime:** public version at 05:27:31.9666602 UTC reports HTTP 200, deploy `61821446`, dirty:false, buildTime 03:02:39.564Z, cache HIT/Age 5052. Advertised source/live commit gap zero. GitHub Vercel status remains pending alongside a successful deployment-summary status; native checks, traffic allocation and complete product acceptance remain NOT_MEASURED. #1754's owner override of Blue Dream FAIL remains unchanged; #1794 remains unmerged at `7866ad8d`, required 35/35 SUCCESS, independent acceptance/live repair NOT_MEASURED.
- **FAIL, additional target gates / BLOCKED, acceptance:** all 149 deploy check records read over two pages, current required 35/35 SUCCESS. Required audit `109236324585` still FAILS on local-DB proof unfinished at merge; a later green result is not a waiver. Root `109236324433` FAILS fast-uri 1239943/1239946. Provider check `109236481745` reports remote migration versions absent locally; Actions log request returns 404 because it is external-provider evidence, not production schema proof. Archived owned-fixture refusal remains; no unarchive/configuration bypass. Full hosted loop, AI credit-limit smoke, schema, Edge and payments remain NOT_MEASURED. No merge, ready, auto-merge, Publish/promote, SQL/APPLY/PREFLIGHT, credentials, device or Action Queue operation. HOLD #1250 and ownership locks remain; CHEM-GOAL-3DAY-001 stays active.

## Follow-up observation — 2026-09-29T05:20:48 UTC

- **PASS, terminal required CI:** stay-draft #1794 at `7866ad8d3281cadb46efa9ef32222cfe79541c59`, base `61821446`, has all 35 required contexts SUCCESS, including all 32 full-suite shards. Zero required failure/missing/pending. Main CI `109266800261` SUCCESS; Build and Generate build summary steps succeed, overall build summary PASS. Named check receipt saved in Downloads GDP-1794-CI-terminal-2026-09-29.json. Earlier first-head failures and partial snapshots remain history.
- **NOT_MEASURED, runtime proof:** conditional QuickLog RPC runtime harness is SKIPPED. Separate Main CI summaries include 8 files / 167 PASS / 0 FAIL / 16 SKIP, 2 files / 31 PASS / 0 FAIL / 16 SKIP, Deno 248 PASS / 0 FAIL, scanner 20 files / 332 PASS / 0 FAIL, and 1 file / 6 PASS / 0 FAIL. These overlap other executions and are not unique-test sums or production proof.
- **FAIL, additional audits / BLOCKED, locked repair:** exact-head root `109266743481` reports fast-uri 1239943/1239946; nested `109266743639` reports undici GHSA-3wwx-pv8p-q78v. Logs read; no locked dependency edit or waiver. Blue Dream exact-head acceptance and hosted behavior remain NOT_MEASURED. No ready, auto-merge, merge, Publish/promote or production operation. HOLD #1250 and ownership locks remain; CHEM-GOAL-3DAY-001 stays active.

## Follow-up observation — 2026-09-29T05:14 UTC

- **FAIL, first-head CI / PASS, scoped correction:** #1794 predecessor `cb27310a` failed required shards 7/32 and 14/32 on three static page-wiring assertions (failing batches: 2 FAIL / 118 PASS and 1 FAIL / 148 PASS). Logs `109264969705` and `109264969632` read before repair. The original direct sensor-envelope resolver and explicit literal-true validation request are now preserved, with no unrelated test edits. Normal correction push is `7866ad8d3281cadb46efa9ef32222cfe79541c59`, stay-draft on base `61821446`, final five-file diff +387/-57. An intermediate local run 1 FAIL / 186 PASS remains dated evidence; no blind rerun.
- **PASS, final local proof:** 15 related files / 333 PASS / 0 FAIL / 0 SKIP including 44 new cases; final source-matrix mutation 5 FAIL / 0 PASS / 50 excluded, byte-for-byte restore then 5 PASS / 0 FAIL / 50 excluded. Stable final Bun project typecheck 0 diagnostics; five-file ESLint 0 errors/1 base-existing hook warning, format and whitespace PASS. Earlier 304/158 runs are predecessor evidence and overlap the final set, not unique sums. Separate operational docs-safety test 1 file / 67 PASS / 0 FAIL / 0 SKIP; a prior misspelled filename yielded no tests and was corrected. Historical CURRENT_STATE tail retained byte-for-byte.
- **FAIL, additional audits / BLOCKED, locked repair:** predecessor root `109264968745` fails fast-uri advisories 1239943/1239946; nested `109264968992` fails undici GHSA-3wwx-pv8p-q78v after separate 1-file/7 and 10-file/91 passing sets. Those runs overlap other evidence. Locked dependency files unchanged; no audit waiver. Current-head terminal CI/build, Blue Dream acceptance and hosted Timeline repair remain NOT_MEASURED. No merge, ready, auto-merge, Publish/promote, SQL/APPLY/PREFLIGHT, credential, device or Action Queue operation. HOLD #1250 and all named locks remain; CHEM-GOAL-3DAY-001 stays active.

## Follow-up observation — 2026-09-29T05:08 UTC

- **PASS, pushed repair:** new stay-draft #1794 is `cb27310a4d47799d13b2a4f53802f19772d066cb` on deploy `61821446ebd7e4fb30a36a5a95b7526a34515df5`, five closed files (+381/-62). The requested first Sep 29 slice removes raw non-manual Timeline metric rendering and reuses the canonical validator for every persisted source. Invalid readings are withheld with neutral review copy; valid survivors, history, manual behavior, source badges and freshness remain. VPD stage interpretation requires a displayed validated chip. #1754's owner override of Blue Dream FAIL remains historical, not converted to PASS.
- **PASS, local proof:** 13 related files / 304 PASS / 0 FAIL / 0 SKIP, including 42 new cases; restored focused 3-file run / 158 PASS is overlapping verification. Exact-tip baseline 5 FAIL / 0 PASS / 44 excluded, validation-disabled mutation 5 FAIL / 0 PASS / 50 excluded, source restored byte-for-byte. Bun project typecheck 0 diagnostics; ESLint five files 0 errors and one base-existing hook-dependency warning; format, whitespace, three docs-safety categories and import guard PASS. Windows base checkout adds CRLF formatting warnings; the committed base blob matches and its non-format warning is the same. Vite/React act warnings retained.
- **NOT_MEASURED, acceptance:** fresh #1794 CI has 34 required contexts queued/in progress and the combined Main CI context not yet present; zero inherited success. Blue Dream exact-head and hosted behavior remain open. Public version shows deploy `61821446`, dirty:false, confirming frontend identity only. No new fix deployment or live test is claimed. Active production fixture remains blocked by its archived plant; no fixture/configuration change or smoke write.
- **PASS, collision audit / BLOCKED, locked lanes:** all 65 open head/base pairs unchanged immediately before push; complete path audit surfaces #1763's separate freshness extraction and held #1741, never-merge #1740, untouchable #1737, and inherited orphan #1618. None changed. #1763 must preserve this fix when refreshed. Preserved unpushed P2 CO2 receipt work remains outside this closed scope. No merge, ready, auto-merge, Publish/promote, SQL/APPLY/PREFLIGHT, credential, device or Action Queue operation. HOLD #1250; CHEM-GOAL-3DAY-001 remains active.

## Follow-up observation — 2026-09-29T04:52:32 UTC

- **PASS, required CI / FAIL, additional audits:** #1760 remains draft at `074daa6270dd190ef2a214e931d8b9d0a847df66`, base `61821446`, with 35/35 required contexts SUCCESS and zero required failure, missing or pending. Main CI `109259988370` completes successfully; separate logged sets include 248 Deno tests, 20 files / 332 scanner tests and 1 file / 6 tests, with zero failures in each shown summary, followed by a passing build summary. These overlapping executions are not a unique-test sum. Root fast-uri and nested undici audits remain FAIL and locked.
- **PASS, single infrastructure retry / BLOCKED, partial proof:** local DB retry `109260510539` succeeds after the initial axe-core integrity failure. Its logs retain profiles-gamification RPC paths BLOCKED because local exec_sql is unavailable, even though the enclosing Vitest runs pass. Do not describe those paths as verified. Separate harness summaries include support forms 165 PASS / 0 FAIL, restricted-role Phase 1 10 PASS / 0 FAIL / 0 BLOCKED and Quick Log dual-timestamp 67 PASS / 0 FAIL; repeated harness runs are not unique tests. This is disposable local-backend proof only, not production.
- **NOT_MEASURED, acceptance:** Blue Dream exact-head acceptance and live Dashboard/Daily Check remain open. No ready, auto-merge, merge, Publish or production operation. Earlier partial-CI and failed-install receipts remain dated history. HOLD #1250; Timeline successor remains first slice tomorrow; goal remains active.

## Follow-up observation — 2026-09-29T04:46:20 UTC

- **PASS, normal integration:** existing draft #1760 is now `074daa6270dd190ef2a214e931d8b9d0a847df66`, a clean merge of deploy `61821446ebd7e4fb30a36a5a95b7526a34515df5` into predecessor `b2007583d70046519852f29104fb1972a43b0a3e`. Zero conflicts, no history rewrite. Final diff remains 12 client/test files (+255/-26); all twelve feature blobs are byte-identical to the predecessor. Selected-grow links still require the plant's own matching grow; legacy null-grow plants retain unscoped working links. No held or off-limits repair.
- **PASS, exact-head local proof:** six focused test files / 118 PASS / 0 FAIL / 0 SKIP, Vitest 4.1.11. Canonical Bun project typecheck exits 0 with zero diagnostics. Scoped ESLint twelve files 0 errors/0 warnings; format twelve files, whitespace and three docs-safety categories PASS. Earlier checkout line endings yielded 5405 lint warnings and format FAIL; conversion to committed LF changed no blobs. Mounted-run Vite/React act warnings remain recorded. These are existing overlapping tests, not 118 new cases. Full local suite/build, independent review and live acceptance are NOT_MEASURED.
- **NOT_MEASURED, new hosted completion:** at 04:45:44 UTC the new head's required shard/preflight/legal contexts are queued/in progress, and the combined Main CI context is not yet present. Previous-head 35/35 is historical. P1/.tsx acceptance stays with Blue Dream; GDP owns landing. Normal push and PR body readback confirm draft state and exact head/base. Fresh all-pages audit of 65 open PRs identifies distinct #1660 guided-evidence/freshness and #1674 auth-mock test overlap; serialize later while preserving both. #1740 never-merge composition and #1618 orphaned inherited diff remain untouched.
- **FAIL, additional gates / BLOCKED, dependency repair:** fresh #1760 jobs `109259942449` and `109259941580` fail fast-uri advisories 1239943/1239946 and nested undici GHSA-3wwx-pv8p-q78v. Logs read; locked dependency files untouched. The nested lane separately passed 1 file / 7 tests and 10 files / 91 tests before its audit failed; do not add these to the overlapping local 118 as unique tests. Job `109259942043` failed before tests on axe-core tarball integrity. One job-only infrastructure retry was accepted at 04:48:06 UTC, not a blind suite rerun; result is NOT_MEASURED and no further retry is authorized here.
- **PASS, partial current CI / NOT_MEASURED completion:** at 04:48:52 UTC #1760 has 34/35 required contexts SUCCESS, zero required FAIL, zero missing and one in progress (`Lint, typecheck, test, build`, job `109259988370`). The infrastructure retry is in progress; initial failure remains in its receipt. Eighty raw check records resolve to 77 latest named contexts. Required-check records are not test counts, and additional audit FAILs are not waived.
- **PASS, stack state only:** owner merges #1749 at 04:27:34 UTC into `codex/quicklog-manual-lineage-fence-20260927` as `19d767d0c62179b224cabb9c45f2544cf0894645`; #1745 then merges that head at 04:28:28 UTC into `codex/quicklog-active-replay-fence-20260926` as `851239d4170e90f2121129b42ad229bc70f6343f`. Neither merge landed on deploy; locked #1735 remains open at the latter head. No migration APPLY or production acceptance is inferred.
- **PASS, shipped history only:** GitHub confirms #1754 merged unchanged `0384753ae911eca2a989694f8514f116dc903757` at 02:13:59 UTC as `8b73b25a879e8d1fc526fdd7035ae1d368eab3f6`. This is merge evidence, not a fresh Blue Dream receipt or proof of remaining Timeline defects. Timeline successor remains first slice tomorrow; no Timeline source edit tonight. No ready, auto-merge, merge, Publish, production APPLY/PREFLIGHT/dispatch, credential, device or Action Queue action by this continuation. HOLD #1250 and all named locks remain; CHEM-GOAL-3DAY-001 stays active.

## Follow-up observation — 2026-09-29T04:29:55 UTC

- **PASS, pushed test harness:** draft #1793 at `c449a0b486d37b3128d3bab18538dda498e111a3` is stacked on #1792 `34f8beae3334cceb6f914df904a6842c90005eb4`. Five files (+601/-6) add opt-in signed-in Dashboard/Timeline/Sensors readiness timings and instrument the existing first Quick Log save. No product or Timeline code changed, and no additional saves are introduced. The current deploy remains `61821446ebd7e4fb30a36a5a95b7526a34515df5`.
- **PASS, local validation:** four test files / 113 PASS / 0 FAIL / 0 SKIP, including 44 new cases. Removing the exact deployment-match fence causes 2 FAIL / 42 PASS; restoring it returns all 113 to PASS. Project Bun/direct Node and targeted E2E typechecks: 0 diagnostics; scoped ESLint five files 0 errors/0 warnings; format, whitespace, three docs-safety categories and import scan PASS. Discovery lists five cases in three files, not five executed passes. Earlier 111 PASS / 2 FAIL test-setup run and failed describe-local trace/video discovery remain retained. No unique-test sum across repeats.
- **BLOCKED hosted / NOT_MEASURED performance:** the configured parent fixture is archived; no timing or new production write has executed. Main CI filters PR bases to main/verdant-grow-diary and excludes this intentionally stacked parent, so a complete 35-context PASS cannot be inherited. Other checks are queued/in progress at the observation time. After parent acceptance/landing, update normally and retarget to deploy for fresh exact-head required CI. Receipts measure navigation-to-control-ready after fixture preflight or save-click-to-confirmation; they do not establish cold-load speed, complete data loading, retrieved values or a performance budget.
- **PASS, collision read / NOT_MEASURED acceptance:** the earlier full 66-open-PR path audit was refreshed against 64 open heads; changed-head files inspected immediately before creation. Only parent #1792 overlaps the Quick Log smoke path. Critical Mass owns this .ts evidence review; Blue Dream retains the P1 parent. No held branch, auth, supabase, migration, lockfile, workflow, variable, credential, device or Action Queue change. No ready, auto-merge, merge, Publish, production APPLY/PREFLIGHT or dispatch. HOLD #1250; CHEM-GOAL-3DAY-001 remains active. Timeline successor stays first slice tomorrow.
- **PASS historical / NOT_MEASURED latest CI completion:** 04:31:32 UTC re-read confirms all six repair heads unchanged. #1175/#1659/#1671/#1673/#1675 each have 35/35 latest required SUCCESS, with locked fast-uri/undici or provider failures still recorded. #1751 is now non-draft through an external action; Codex did not mark it ready. Its new same-head run has 27/35 required SUCCESS and remaining jobs pending, so the earlier 35/35 packet remains historical. New failed jobs `109255474198` and `109255473859` were read: the old fixture guard refuses the production URL and fast-uri advisories remain. No blind rerun or bypass.

## Follow-up observation — 2026-09-29T04:12 UTC

- **PASS, pushed repairs:** existing drafts #1175 `c2b2e500`, #1659 `6b9d0289`, #1671 `74e19c02`, #1673 `74587f9c`, #1675 `b7a1e8fc` and #1751 `f63d46fe` now normally include deploy `61821446`. Six earlier local-only candidates are pushed without force/history rewrite. Focused file/test counts respectively: 3/71, 6/93, 1/8, 3/64, 1/5 and 2/46, each zero failures/skips. Project compilers 0 diagnostics; scoped lint/format PASS. Four older caches needed explicit Node/TypeScript after Bun launcher startup failures; three memory-contention attempts were stopped and rerun sequentially. Failed launchers and cancelled attempts are not passed runs.
- **PASS, reproduced analytics correction:** #1751 local WebKit baseline 8 PASS / 2 FAIL / 0 SKIP; two remaining suites now use existing bounded hydration setup. Final local and hosted Chromium/WebKit each report the same 10 cases PASS, zero failures/skips; local zero flaky/retries. Required contexts at `f63d46fe`: 35/35 SUCCESS. Native `109247230247`: 21 browser PASS / 0 FAIL / 0 SKIP plus separate 22 static PASS. Root fast-uri and old production-host Quick Log guard still FAIL; Critical Mass acceptance NOT_MEASURED. Assertions, assertion timeouts, consent and retries unchanged.
- **PASS, bounded inventory / NOT_MEASURED completion:** 04:03 UTC read: 66 open heads, 31 failed latest contexts, five pending heads and 48 all-35 required SUCCESS. Categories overlap; fresh pushes reset CI, so no defect trend is established. Original 13: seven all-35 SUCCESS, five newly pushed pending required contexts, orphan #1618 missing all 35. Required success does not waive other audit/provider failures.
- **PASS, frontend identity only:** public `/version.json` at 04:04:25 UTC: HTTP 200, commit `61821446ebd7e4fb30a36a5a95b7526a34515df5`, dirty:false, buildTime 03:02:39.564Z, cache HIT/Age 66. Deploy verified 04:06:21 UTC matches. Earlier differing receipts remain history; no cause/product acceptance inferred. The initial 04:03 receipt read the wrong SHA property and is HTTP evidence only; 04:04 receipt reads actual `commit`.
- **PASS local-backend / BLOCKED production fixture:** #1792 native `109241785670` and pre-checkpoint #1777 `109244115472` each 21 browser PASS / 0 FAIL / 0 SKIP plus separate 22 static PASS. These overlap, not 42 unique browser cases or production proof. #1792 production smoke remains 1 PASS / 1 FAIL / 0 SKIP, one automatic retry; archived fixture refused before writes. Matthew identifies active owned fixture; no auto-unarchive/CI-variable change.
- **BLOCKED locked scope / NOT_MEASURED acceptance:** #1175 provider `109249445526`: SQLSTATE 42P07, `ai_credit_grants` already exists. Root fast-uri/nested undici fixes need locked dependency files. #1777 depends on #1779 checker; legacy grammar FAIL not waived. No merge, ready, auto-merge, Publish, production SQL/APPLY/PREFLIGHT/dispatch, secret, device or Action Queue operation. Blue Dream/Critical Mass acceptance open; HOLD #1250 and owner locks remain. Phase 2 not declared; CHEM-GOAL-3DAY-001 active.

## Follow-up observation — 2026-09-29T03:33:31 UTC

- **PASS, source identity:** owner merge #1773 is now deploy `61821446ebd7e4fb30a36a5a95b7526a34515df5`, preserving the unknown-evidence-freshness correction from `c2fa6e13`. Codex performed no merge; live AI Doctor behavior and independent acceptance receipt remain NOT_MEASURED.
- **PASS, inventory read / FAIL, additional gates:** 66 open heads measured; 33 have at least one failed latest check, 2 have pending checks, and 53 have all 35 source-pinned required contexts SUCCESS. These categories overlap. Root dependency audit is red on 28 heads and nested static/audit job on 18; other failures remain individually recorded. This replaces no dated prior receipt and does not establish a before/after defect trend while jobs were pending. Of the original 13 repair heads, 12 have all 35 required SUCCESS; orphan #1618 is missing all 35. No new push to those 13 in this follow-up.
- **PASS, required CI / FAIL, additional audits:** #1790 (`13499d83`), #1791 (`171cd0a2`) and #1738 (`15e7fb79`) each have all 35 required contexts SUCCESS at the exact head. Their native local-backend jobs each report 21 PASS / 0 FAIL / 0 SKIP / 0 retries. These overlap; they are not 63 unique tests or production proof. #1790/#1791 still fail fast-uri and nested undici audits; #1738 still fails fast-uri and GA WebKit (6 passed / 1 failed / 1 flaky runner classification). The earlier native retraction failure is retained; a later pass does not prove a flake cause.
- **PASS, local fixture repair:** P1 draft #1792 at `34f8beae3334cceb6f914df904a6842c90005eb4`, based on `61821446`, repairs the production-only Quick Log fixture lane with positive server identity, plant/tent/grow ownership, empty/in-flight-read fences and tagged notes. Nine files (+1020/-46), 63 new cases. Related run: 7 files / 257 PASS / 0 FAIL / 0 SKIP; project and targeted E2E typechecks 0 diagnostics; lint 9 files 0 errors/0 warnings; format 9 files and 3 docs-safety scanners PASS. Previous head `6ba962d2` stopped at fixture verification with 1 PASS / 1 FAIL / 0 SKIP and one automatic retry; its checklist was skipped. Logs showed the first guard rejected the existing legitimate `tentId` URL query and optional grow-name setting. The correction binds context to verified owned rows and derives an omitted grow name from the verified owned grow; CI variables remain unchanged. Follow-up red proof: 2 FAIL / 0 PASS / 57 excluded; both now PASS. Playwright discovery lists 3 tests; no browser execution locally or manual production write. Blue Dream acceptance and actual fixture ownership remain NOT_MEASURED.
- **FAIL hosted / BLOCKED active fixture:** #1792 now has all 35 required SUCCESS, but Quick Log job `109241785410` reports 1 PASS / 1 FAIL / 0 SKIP / 0 flaky with one automatic retry. Authentication passed; ownership verification refused; the write-producing checklist was skipped. Artifact `11010864748` shows the configured live plant is archived. Keep the refusal; Matthew must identify an active fixture in the approved account's own grow. No auto-unarchive, CI-variable or credential change. Root fast-uri and nested undici audits FAIL on this head too; local-backend job is still in progress at this sample and cannot establish production acceptance.
- **PASS, scoped docs repair:** #1777 failed two unit pins because this docs slice removed the dormant-workflow marker and three historical npm consumer markers. Logs read, then local reproduction: 89 PASS / 2 FAIL / 0 SKIP. Restoring those markers as explicit history gives 2 files / 91 PASS / 0 FAIL / 0 SKIP without altering workflow semantics or dependency policy. The draft still waits for #1779's grammar checker; its current deployed-checker failure is not waived.
- **FAIL, stable live/deploy match:** source is `61821446`. The earlier endpoint receipt at 02:34:39Z returned `95464496` (cache MISS, Age 0). The fresh 03:10:56Z read returned `5feb5471` (cache MISS, Age 0); the 03:11:43Z repeat returned `5feb5471` (cache HIT, Age 47), HTTP 200 and dirty:false. This proves differing observations, not a rollback cause or stable deployment identity. Preserve both receipts; production acceptance remains NOT_MEASURED and the release decision remains Matthew-owned.
- **BLOCKED, locked repairs:** fast-uri/undici require locked dependency files; no audit waiver, lockfile, production SQL/APPLY/PREFLIGHT, secret/configuration change, Publish, device or Action Queue action. HOLD #1250 and named owner locks remain. Phase 2 is not declared. CHEM-GOAL-3DAY-001 remains active.

## Updated operating observation — 2026-09-29T01:12:45.079Z

- **PASS, source identity:** #1781 merged at 00:48:36 UTC as `0755bfcc0d7ee9d4c88ee716384c28b9beb51cce`. Shipped Sentinel is 2026-09-28.2 with the exact legacy ACK. Its any-.tsx and HOLD-CHEEK-review routing remains intact. The coverage amendment in #1777 now proposes 2026-09-28.3. Earlier observations below are historical.
- **PASS, release identity only:** current live /version.json is `6ca97026437ab556f7fbac752abfbe8085c1f271`, dirty:false, buildTime 2026-09-28T23:05:10.630Z. No production promotion was performed by Codex; product, database and Edge acceptance remain NOT_MEASURED.
- **PASS locally / NOT_MEASURED new CI:** #1779 was returned to draft and removed from the queue before normal-pushing `d35115453371725d788a858d670ce0d8674bafff`. Thirty-one focused tests pass, zero fail, zero skip. The three downgrade cases fail on the pre-repair checker; the shipped-28.2 compatibility case also reproduced failure in an isolated old-script copy. Explicit coverage literals remove the shared-replacement risk. Fresh CI must finish; old-head 35/35 does not cover this push.
- **PASS, required contexts / NOT_MEASURED landing:** #1778 and #1780 were still open and ready at the latest PR read, with their earlier exact-head 35/35 required success. No completed merge is claimed.
- **NOT_MEASURED, publish acceptance:** #1754 remains at `0384753ae911eca2a989694f8514f116dc903757` with 242 focused passing tests and 35/35 required success. No fresh Blue Dream PASS appeared in the current PR discussion read. The 20:15 CT gate and 20:45 CT publish decision remain Matthew-owned.
- **NOT_MEASURED, supplied correction:** Matthew supplied #1773 unknown-evidence-freshness behavior and patch SHA256 `66d2e98e307db02088afb1df7d9605726d3926e7ce4dbf8230f1bf359360dd9b`. Reported 29 new test cases are not treated as current execution, review or hosted acceptance until verified.
- **BLOCKED, owner lanes:** dependency/lockfile repairs, Vercel dashboard selection/authentication, scoped identity creation, and held production database changes remain owner-controlled. Zero permissions were granted. Phase 2 is not declared. HOLD #1250 and named locks remain.

## Operating jobs — 2026-09-29 00:53:48 UTC

- **PASS, source identity:** #1767 merged as `6fb27c5aec715c14213dd79cdb5077351e40dea0`; deploy Sentinel is 2026-09-28.1. The 2026-09-28.2 operating amendment remains pending. The latest user amendment permits own low-risk Phase 1 integration on exact-head required-check success; no Phase 2 declaration.
- **PASS, required contexts / NOT_MEASURED, landing:** #1778 and #1779 have 35/35 required contexts SUCCESS at their exact heads. Both have actual merge-queue refs, with #1779 following #1778. Their queue-head required checks are still pending; neither is claimed merged. #1780 also has 35/35 and was submitted to the queue. Additional dependency FAILs remain visible; no waiver or independent PASS is claimed.
- **PASS locally / NOT_MEASURED, final CI:** concurrency draft #1782 changes 69 PR workflow files and one resolved-YAML regression file. Five focused files: 57 passed / 0 failed / 0 skipped; typecheck 0; lint 0 errors / 0 warnings. Fifty-eight concurrency groups and 69 ready-for-review triggers were checked; overlapping checks are not a unique-test total.
- **PASS, cancellation / NOT_MEASURED, aggregate improvement:** controlled pushes at 00:27:21 and 00:29:46 UTC (2m25s apart) changed queued workflow runs from 130 before to 189 at 00:40:10. The first controlled commit finished with 63 cancelled, 5 success, 3 skipped. Concurrent PRs and queue runs prevent a causal runtime/cost conclusion.
- **FAIL, fixture contract:** #1782 Quick Log job 109199183114 reports fixture check 1 passed / 1 failed / 0 skipped. `e2e/lib/fixtureSafety.ts:224` refuses a production URL before write-producing smoke. The smoke step was skipped. Fix the production-fixture contract separately while keeping positive identity/ownership/tagging fences; do not change the production CI variables or request another host.
- **PASS, proposals / NOT_MEASURED, deployment or access:** #1780 contains the promotion/rollback runbook; #1787 contains scoped-identity setup; #1788 contains a separate suite-consolidation proposal. Zero permissions were granted and no deployment changed. Native Vercel check selection was not exposed by the connector, and the browser redirected to sign-in. Matthew owns dashboard configuration and scoped identity setup.
- **PASS, discovery only:** configured Vitest lists 3,153 files; legacy two-root discovery lists 3,127, missing 26 with no extras. This executed zero tests. #1757 owns discovery; no job was removed in the consolidation proposal.
- **PASS, required CI / NOT_MEASURED, publish acceptance:** #1754 at `0384753ae911eca2a989694f8514f116dc903757` has 35/35 required SUCCESS; full record 87 SUCCESS / 4 SKIPPED / 2 dependency FAIL. Local 11 files / 242 passed / 0 failed / 0 skipped. Fresh Blue Dream acceptance is still needed for the 20:15 CT publish gate.
- **BLOCKED, locked scope:** high fast-uri and moderate nested undici findings remain; no lockfile, exception or audit bypass was edited. Production database, Publish, HOLD #1250, device and Action Queue locks remain.
- **BLOCKED, single governance landing:** #1777 and GDP #1781 overlap thirteen files at the same proposed 2026-09-28.2 version. #1781 lacks the new ACK field and HANDOFF_LOG required by #1779. Keep GDP's held branch untouched and reconcile one amendment before landing. Earlier measurements below remain historical.

## Release and coverage measurement — 2026-09-28 23:46:17 UTC

- **PASS, release identity only:** live `/version.json` reports
  `566315cedd80e8d2a9ba3d312b5c466fdb568fa3`, `dirty:false`; its build time is
  `2026-09-28T18:32:56.291Z`. The response does not prove an RPC, migration,
  deployment platform or signed-in product result.
- **PASS, source history:** deploy tip
  `6ca97026437ab556f7fbac752abfbe8085c1f271` is four merged commits ahead:
  #1752 `13c28a14c28fc27342a4c5d46dbb094642dcacde`,
  #1744 `bed36ab5d447136100fa776882a69af0b5ce2de7`,
  #1684 `3c8113eae50bee83a7f7fe4086ab53879817784a`,
  #1762 `6ca97026437ab556f7fbac752abfbe8085c1f271`.
- **NOT_MEASURED, publisher control plane:** the supplied founder handoff reports
  seven failed Vercel Production gates since September 26 and last success
  `4ddb2322`. Codex has not independently measured that dashboard count,
  Deployment Checks list or production deployment URL. Vercel promotion is the
  owner's release lane; no agent publishes, promotes or rolls back.
- **PASS, bounded inventory read:** at 23:40 UTC, all pages of the current-head
  check results were read for 61 open PRs. Seventeen heads had failures,
  seventeen had pending checks, and thirty-five had all 35 source-pinned required
  contexts successful. Categories overlap. This is not independent review,
  live ruleset inspection or merge readiness. #1778 opened after that snapshot.
- **PASS locally / NOT_MEASURED acceptance:** #1754 is now
  `0384753ae911eca2a989694f8514f116dc903757`, after merging the deploy base and
  repairing invalid VPD/CO2 and legacy manual validation. Eleven focused files:
  242 passed, 0 failed, 0 skipped; actual typecheck: 0 diagnostics. Fresh CI and
  Blue Dream review at that exact head are not replaced by the old 4c40dfcc receipt.
  Blue Dream PASS is needed by 8:15 p.m. America/Chicago for tonight's publish.
- **FAIL / in progress, #1754 hosted checks at 23:58 UTC:** 92 records at that
  exact head: 42 success, 4 skipped, 32 queued, 12 in progress, 2 failed.
  The root job 109183930277 fails on high `fast-uri` advisories; nested job
  109183929756 fails on moderate `undici` GHSA-3wwx-pv8p-q78v. Both logs were
  read. These are check records, not unique tests; no current acceptance review
  is posted. Dependency changes remain locked.
- **PASS locally / NOT_MEASURED acceptance:** #1778 is the separate two-file
  core CI draft at `4e6710b9872e4c75cb478ea342f083796a561c7a`.
  `verify-sandbox` becomes manual-only; `verify-production` is unchanged.
  Two files: 167 passed, 0 failed, 0 skipped; actual typecheck: 0 diagnostics.
  Critical Mass owns the named CI slice's acceptance; GDP owns merge.
- **FAIL, retired core probe; no production verdict:** run 36489973074 at
  `bed36ab5d447136100fa776882a69af0b5ce2de7` failed its exact catalog query
  (psql 1, runner 5). The production job was skipped.
- **PASS, sandbox money probe only:** run 36489972966 at that same source head
  reported 17 expected / 17 applied / 0 missing. Its production job was skipped.
  The conditional same-cause money repair does not apply. Its automatic
  non-production trigger remains a separate policy follow-up; #1778 does not change it.
- **BLOCKED, dependency scope:** fresh repaired-head logs identify high
  `fast-uri` advisories 1239943/1239946 and the nested-static lane's separate
  moderate `undici` advisory GHSA-3wwx-pv8p-q78v. Existing dependency/lockfile
  locks prevent a repair in these slices. No exception, audit bypass or lock edit
  was made. Earlier successful local audits are historical, not current acceptance.
- **PASS locally / NOT_MEASURED acceptance:** #1757 is
  `f2b13c0609bacae468902d1adc9634c2b1ecc6d7`, a two-file discovery diff after
  merging base. Nine focused tests passed; helper checks 29/29 and workflow-safety
  checks 6/6; typecheck: 0 diagnostics. These are separate overlapping checks,
  not a summed unique-test count. Empty #1765 is proposed for GDP closure only.
- **BLOCKED, governance sequencing:** #1767 remains open at
  `54c6c3281aea83c868b83cb25e248f53bd8da2d9`. Existing #1777 carries the
  production-only docs draft; the final 2026-09-28.2 amendment and initial
  `HANDOFF_LOG.md` are prepared locally behind #1767. #1696 is not updated
  until #1767 lands. Historical receipts below are preserved.
- **PASS locally / NOT_MEASURED acceptance, startup-gate compatibility:** separate
  CI draft #1779 is `a8c4b29740dbdec01f0d7b4b281bbe80f9d41130`. The old checker
  failed on the new `open_handoffs_checked` field. The version-aware repair passes
  26 governance tests, 0 failed, 0 skipped, and accepts the prepared 2026-09-28.2
  documents against #1767's exact head. Its candidate validation does not replace
  the checker currently on the deploy branch. #1779 must land before the final
  #1777 amendment; #1767 still lands first. Critical Mass reviews #1779.
- **NOT_MEASURED, production acceptance:** no repaired draft has been declared
  deployed. Signed-in save/readback, hosted schema and Edge acceptance remain
  unmeasured. Smoke and QA writes use a disposable test account only, never Matthew Cheek's own accounts (`cheekhimself@gmail.com`, `matt@verdantgrowdiary.com`) and never the KEEP account. Writes go only to that test account's own fixture grow, tagged `[smoke <timestamp>]`. Never touch customer data. Backdated notes are allowed on archived grows. The proposed plus-alias signup is unconfirmed
  and no fixture user has been created.
- **Locks:** production database (knk), HOLD #1250; do not edit #1625, #1727,
  #1735, #1737 or #1369 (REVIEW ONLY). #1740 NEVER MERGE; #1742/#1658 locked;
  #1741/#1745 retain database-approval holds. No ready, auto-merge, merge, Publish,
  production SQL/APPLY/PREFLIGHT, device or Action Queue operation was performed.

Current coverage blocks: [HANDOFF_LOG.md](HANDOFF_LOG.md).
Owner/reviewer seats: [OWNERSHIP.md](OWNERSHIP.md).
These measured facts do not change the durable rules or any historical review SHA.

## Current verification/review decision — 2026-09-28

Hosted smoke/verification uses **https://verdantgrowdiary.com** only. Keep
E2E_BASE_URL and E2E_GROW_1_PLANT_URL there. Before a smoke write, verify the
disposable test account owns the fixture grow and its selected tent/plant;
tag every saved grow record `[smoke <timestamp>]`. Never write customer data or
use the KEEP account. Stop a write if identity, ownership or tagging cannot
be verified; report that exact safety gap rather than proposing another host.
Local/CI fixtures validate code, not production. Repository integration follows
the explicit merge phases in AGENTS.md; it is not production acceptance. No
Publish, production APPLY, real charge, role/auth change, device control or
Action Queue operation is authorized here. Existing owner locks remain.
See docs/production-only-verification-runbook.md.

Earlier non-production smoke-host requests are superseded, not a current
blocker. Existing CI dependencies require separate reviewed slices.

Independent acceptance routing: **Blue Dream** reviews any .tsx file,
P1s and publish gates; **Critical Mass** reviews everything else. An author cannot
give its own work an independent PASS. Claude may add peer observations but is not
the acceptance reviewer. Matthew's Phase 1 exception permits Codex to integrate
its own low-risk PRs through the PR flow after every required check is SUCCESS
at the exact head SHA. High-risk work remains draft for GDP review and merge;
publish gates remain with Matthew. Phase 2 requires Matthew's explicit confirmation
that CI is proven. Historical receipts keep their original reviewer.

OWNERSHIP.md controls ownership. HOLD #1250; #1369 REVIEW ONLY;
#1735/#1737 untouchable; #1740 NEVER MERGE; #1742/#1658 locked;
#1741/#1745 retain protected database-approval holds. No Publish, production
APPLY, device or Action Queue operation was performed in this docs change.
Live acceptance remains NOT_MEASURED here.

### Historical operating receipts — unchanged below

**Last updated:** 2026-09-24 UTC (~11:25 UTC; tip, live and board measured 11:14–11:17 UTC)
**Updated by:** Claude (2026-09-24 late morning, restamp on **deploy tip
`b0bfdb028600b63ec7b8bff914632a20b06020b7`**, the `#1685` squash. **Four commits** merged since the
`f6b2fb97` stamp: **two docs (`#1681`, `#1685`) and two product (`#1670`, `#1664`)**, and none touches
`supabase/` (§1, §3). **Live is MEASURED by Claude and equals the tip**: the apex `version.json`
reports `b0bfdb02`, `dirty:false`. It is the first successful Claude read after eleven egress
refusals (§2). **`#1684` carries an independent `PASS` from Claude** (§4). **`#1685` merged with
CodeRabbit in the independent-review seat**, on the owner's instruction while Grok was out of tokens
(§4). The session-backed _Restore pending correction_ finding is **still open** (§5). The board was
re-listed: **40 open PRs besides this one**, **no other open PR writes this file**, **all 40 merge
cleanly**, and **`#1683` adds a migration and edits an edge function** (§6). No Publish by Claude. No
APPLY. `HOLD #1250`. Prior header follows.)

## 1. Deploy tip `b0bfdb02` — four commits since `f6b2fb97`, two of them product

`established fact`: `git fetch` then `git rev-parse origin/verdant-grow-diary` at 2026-09-24
11:14:29 UTC.

| Field      | Value                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Tip        | **`b0bfdb028600b63ec7b8bff914632a20b06020b7`**                                                    |
| Subject    | `docs(architecture): re-verify the contract at ef15b2c — counts, Quick Log deferral, …` (`#1685`) |
| Parent     | `ef15b2c1be949d720f34bc33e4b980d18d6114e2` (`#1664`)                                              |
| Committed  | 2026-09-24 **10:33:01 UTC**; merged through the queue at 10:39:14 UTC                             |
| Since      | `f6b2fb97` (`#1668`, the tip the last merged stamp measured): **4 commits**                       |
| Migrations | **0** (`git diff --name-only f6b2fb97 b0bfdb02 -- supabase/` is empty)                            |

**Commits since `f6b2fb97`, oldest first:**

| Commit      | PR      | Kind    | Summary                                                          |
| ----------- | ------- | ------- | ---------------------------------------------------------------- |
| `e154ae3c1` | `#1681` | docs    | CURRENT_STATE restamp on `f6b2fb97`                              |
| `a0c452695` | `#1670` | product | Timeline: inline snapshot guidance ages without interaction      |
| `ef15b2c1b` | `#1664` | product | AI Doctor: readiness evidence ages while Plant Detail stays open |
| `b0bfdb028` | `#1685` | docs    | Architecture contract: §15 re-verification at `ef15b2c`          |

## 2. Live — MEASURED by Claude, equal to the tip

`established fact` for the fields read. One attempt each, apex and `www`, not routed around.

| Field             | Value                                                                              |
| ----------------- | ---------------------------------------------------------------------------------- |
| Claude's own read | **`PASS`** → HTTP `200`, `https://verdantgrowdiary.com/version.json`               |
| When              | 2026-09-24 **11:14:43 UTC**                                                        |
| `commit`          | **`b0bfdb028600b63ec7b8bff914632a20b06020b7`** = the tip                           |
| `dirty`           | `false`                                                                            |
| `commitTime`      | `2026-09-24T10:33:01Z`                                                             |
| `buildTime`       | `2026-09-24T10:39:24.197Z`                                                         |
| `treeHash`        | `c63a5caf9186…`; `ciRunId` `null`; `commitSource` `git`                            |
| `www`             | HTTP `308` → `https://verdantgrowdiary.com/version.json`                           |
| Serving headers   | `server: Vercel`, `x-vercel-cache: HIT` (observation only; not publisher evidence) |
| Live vs tip       | **equal at the instant read**                                                      |

What this read does **not** establish:

- **Who published it.** Serving headers are not publisher evidence (contract §14). The publish
  trigger is still `NOT_MEASURED`.
- **Edge functions and applied schema.** `version.json` describes the frontend build only. Deployed
  edge-function code and applied migrations are `NOT_MEASURED` (contract AC-9.3).
- **Runtime behaviour.** No grower flow was exercised. **The live run of the `"26"` pin
  (`e2e-local/native-manual-correction-recovery.spec.ts:153`) is still `NOT_MEASURED`.**
- **A standing state.** It is one instant. Re-read `version.json` before relying on it later.

The eleven earlier refusals were `connect_rejected` at the session proxy. This session's egress
reached the apex; the reason for the change is `NOT_MEASURED`.

## 3. What changed for growers — two product commits, measured from `git` only

`established fact` for files and subjects. **Runtime behaviour of both is `NOT_MEASURED` by Claude.**
Neither touches `supabase/`, an edge function or a migration.

- **Timeline inline snapshot aging (`#1670`).** `TimelineSnapshotClock.tsx` (new) arms one timeout
  just past a fresh row's staleness boundary, so inline VPD guidance turns historical while the page
  stays idle. Rows already historical arm no timer. 4 files, +524 / −118.
- **AI Doctor readiness aging (`#1664`).** `PlantDetailAiDoctorReadiness.tsx` passes the existing
  minute tick into the freshness classifier, so live and manual evidence age to stale while Plant
  Detail stays open. 2 files, +89 / −4.

**Review state** — `established fact` from the GitHub API, read ~11:17 UTC.

- **`#1670`.** All five bot threads (Codex ×2, Copilot ×2, Vercel ×1) were answered and resolved
  before merge. A Claude session pushed the one-shot clock fix `67d2ac69` into Codex's branch, so
  Claude is not independent for that commit. No approving review is recorded. The finding that
  inline manual snapshots use the 15-minute live window instead of the 24-hour manual window is
  **pre-existing and deferred to issue `#1682`**, which is open.
- **`#1664`.** Automated reviews only: Copilot recommended approval with no findings; CodeRabbit had
  no actionable comments on `48d8f02` and was rate-limited on the final range to `3c12961b`; the
  Codex app's review completed. **No peer review is recorded.** The rule is "no code ships without
  peer review"; this stamp records the gap and does not resolve it.

## 4. AI Doctor cutoff fix and the contract — review outcomes

- **`#1684` (Codex) — independent review `PASS` by Claude**, SHA-locked to head `a9f182df`
  (`7b38cebe` merged with `ef15b2c1`). Its tree `5a007bec` equals the hosted post-fix checkout.
  - **Measured locally:** RED 36 passed / 3 failed with only the component reverted, then 39 / 0;
    31 targeted files 489 / 0 / 0; `tsc` 0 diagnostics; combined with `#1683` (tree `0585e416`)
    52 files 759 / 0 / 0 and `tsc` 0.
  - **Findings:** a non-blocking Prettier nit (line 18 import over 100 columns). The PR body's
    "13 passed" for `plant-detail-ai-doctor-live-review.test.tsx` is **not reproduced**: the file
    has 9 tests at the tested tree, and the cited batch-14 job `107579868796` does not run that
    file at all.
  - **State:** open, no longer draft, `mergeable_state: unstable` (non-required red checks). Its
    body still reads "DRAFT". Merge and readiness belong to Codex and Cheek.
  - It is the fix for the `#1666` CodeRabbit **Major** finding carried in the `f6b2fb97` stamp. That
    thread is still unresolved.
- **`#1685` (Claude) — MERGED** at 10:39:14 UTC through the merge queue. Docs only
  (`docs/architecture-contract.md`). All six bot findings (Copilot ×2, Codex ×2, CodeRabbit ×2) were
  answered and resolved; CodeRabbit withdrew one as invalid. **CodeRabbit filled the
  independent-review seat** on the owner's instruction because Grok was out of tokens. CodeRabbit is
  not one of the peers the constitution names for that seat; whether it satisfies peer review is
  **Cheek's decision**, recorded here, not resolved.
- **Collision to watch.** `#1655` rewrites the `sensorSourceRules.ts:82` line that contract AC-4.1
  cites and `#1643` pins. Whichever merges second must update the other's pin and amend AC-4.1 in
  the same change.

## 5. Session-backed _Restore pending correction_ — still open on the tip

**`inference`, from a static read of `b0bfdb02`. This is not a runtime measurement.**

- `git diff 8fc38407 b0bfdb02` over `ManualSensorReadingCard.tsx`, `sensorsPageSessionRules.ts` and
  the correction e2e spec is **empty**. Restore still calls
  `updateValues(() => recoveredCorrectionDraftValues(…))` at `ManualSensorReadingCard.tsx:1200-1202`.
  **The finding stands.**
- **`#1625`** (Cursor) is still **open**, not draft, head `4a177e5df8`, **10 commits behind the
  tip**, and **merges cleanly**. It is the one fix in flight. **Runtime behaviour: `NOT_MEASURED`.**
  Claude does not choose, push, ready or review it.

## 6. Board — re-listed

`established fact`, listed from the GitHub API at ~11:15 UTC. Every head was fetched by
`refs/pull/N/head`, diffed against its merge-base with `b0bfdb02`, and checked with
`git merge-tree --write-tree` against the tip.

**40 open PRs besides this one.** **37 target `verdant-grow-diary` and 3 are stacked:** `#1680` on
`#1677`, `#1679` on `#1680`, and `#1618` on the branch of `#1151`, which **closed unmerged** at
08:03:53 UTC, so `#1618`'s base PR no longer exists.

- **No other open PR touches `docs/agents/CURRENT_STATE.md`.**
- **One open PR adds a migration: `#1683`** (Claude, draft, 82 files) adds
  `supabase/migrations/20260924120000_plants_health_unassessed_default.sql` as a new file. It also
  edits the `ai-doctor-review` edge function and the `_shared` mirror. Committed is not applied.
- **All 40 merge cleanly into the tip.** The `#1670` conflict in the last stamp ended when `#1670`
  merged.
- **Reconciliation with the last merged stamp:** 42 open besides `#1681`. Since then `#1670` and
  `#1664` merged (−2), `#1151` closed unmerged (−1), `#1481` merged into `#1478`'s branch at
  08:02:42 UTC (−1), and `#1683` and `#1684` opened (+2). `#1685` opened and merged in between.
  42 − 4 + 2 = **40**.

## 7. Soft-park register — carried

`source claim` (GDP), unchanged since the `#1624` stamp; **not re-measured**.

- **`HOLD #1250`.** Do not touch, ready or merge it.
- **No Publish. No APPLY.** `#1460` and `#1545` stay parked. No production SQL.
- **Fixture AUTH Soft-park:** after `cheekhimself` re-banks, re-measure the empty Action Queue and the
  archived Restore XOR. **Never KEEP on fixture walks.** No owner email is recorded in this file.
- **Soft P2 — parked, do not implement:** sensors / Start Check `growId` omit; Quick Log target count;
  `/onboarding` preference gate; Assign true-empty needs a zero-tent fixture.

## 8. CI lanes

`established fact` from the GitHub Actions API for push runs on `verdant-grow-diary`.

- **The tip's own push build on `b0bfdb02`:** `CI` (which supplies every required context) and
  `Full Vitest Suite` **success**; so are `ESLint`, `TypeScript typecheck`, `Typecheck (tsgo) +
build`, `Security regression` and `Security DB Local`.
- **Red on the tip and on `ef15b2c1` / `a0c45269` before it** (none is a required context):
  - `Dependency & Security CI`: `hono` moderate ×3, `js-yaml` **high**.
    `config/dependency-security-exceptions.json` stays empty. `#1343` is the open dependency PR,
    and it also moves Vitest 3 → 4; **no owner is recorded.**
  - `Required core schema present` and `Required money-critical migrations present`. They are
    consistent with the sandbox gaps carried in §9; the target they probed is not re-measured.
- **On PR heads:** the `Cursor SDK local orchestration spike` fails `bun audit` on the Vitest
  advisory GHSA-82fw-gwwq-j7x9 (seen on `#1684`'s head).

## 9. Carried, not re-measured

- **Sandbox schema and money-migration gaps.** Last measured on `aabbd2b3` (`TARGET_ENV: sandbox`):
  core schema 14 of 51 columns missing; money-critical migrations 2 of 17. **Sandbox-scoped only;
  production applied state is `NOT_MEASURED`. No APPLY.** No migration has merged since.
- **Golden Toad:** AUTH_NEEDED; the one-tent Next step is `NOT_MEASURED`. This is **not**
  `AUTH_CHOOSER_READY`. Passkey, 2FA and chooser decisions stay **Cheek's**.
- **AC-4.1 prototype-key defect** still reaches the `#1088` display canon; `#1655` is the open fix.
- **Release Topology Specification stays deferred:** `#1175` and `#1221` are both still open.
- **`#1665` Copilot Medium and `#1663` Copilot Low** findings from the `f6b2fb97` stamp: not
  re-checked here.
- **Stale restamp branches** still on the remote (`git ls-remote` at 11:14 UTC; the owner deletes
  them): `claude/current-state-restamp-98fdd446` → `7a034f8e`, `…-8b73c140` → `cb031eac`,
  `…-1231` → `7762b0e9`.

## 10. The `f6b2fb97` / ~08:11 UTC stamp below is SUPERSEDED

`established fact`. Its rows that are now stale:

- It cites the tip as `f6b2fb97`; the tip is `b0bfdb02` (§1).
- Its §2 says live is `NOT_MEASURED` and 18 commits behind; live was read at the tip (§2).
- Its §6 counted 42 open PRs and said `#1670` conflicts; the count is 40 and none conflicts (§6).
- Its §3 recorded the `#1666` CodeRabbit Major finding as unanswered; its fix `#1684` now carries an
  independent `PASS`, though the thread is still unresolved (§4).
- Its §11 says the slice is `#1681`, unmerged; `#1681` merged as `e154ae3c` (commit time 09:04:40
  UTC).

Carried rows keep their original labels.

## 11. Current locks

- **No Publish. No History-restore. No APPLY. No production SQL.** No device control, no automatic
  Action Queue writes, no invented credentials. **Never KEEP. No owner email.** Claude merges only on
  the owner's explicit instruction.
- **`HOLD #1250`.**
- **The tip this stamp measured is `b0bfdb028600b63ec7b8bff914632a20b06020b7`.** Once this PR merges,
  the tip is its squash commit; cite `git rev-parse` at the time, not this line.
- **Live equalled the tip at 11:14:43 UTC.** That is one read, not a standing state. Do not
  green-lane the live `"26"` pin on it; its live run is still `NOT_MEASURED`.
- **§5: `#1625` is the one session-restore fix in flight.** Claude does not choose, push, ready or
  close.
- **Quick Log remembered-target and only-plant auto-selection stay banned and test-pinned.**
- This slice is **N=1** on branch `claude/new-session-ed1j4n`, cut from `b0bfdb02`. Its only file is
  `docs/agents/CURRENT_STATE.md`. It contains no `src/`, `supabase/`, `package.json`, lockfile, test,
  workflow or governance-file changes.
- **Slice owner: Claude. Independent reviewer: Codex** (the peer who reviewed the last restamp), with
  a CodeRabbit review requested per the owner's 2026-09-24 instruction while Grok is out of tokens.
  Claude does not self-merge without instruction and does not assign its own next slice.

---

**Superseded restamp chain (2026-09-24 ~08:11 UTC back to 2026-08-18, `f6b2fb97` → `87ae05e`): archived — see `docs/agents/CURRENT_STATE_ARCHIVE.md`, "Archived 2026-09-29".** Moved verbatim on 2026-09-29 (503,873 bytes, 7,258 lines, every block already marked SUPERSEDED by the stamp above it). Standing fences that appeared only in the moved chain, kept here so nothing operative is lost: **Do not ping Tolu.** **Stay on Paddle; live checkout off.** **Do not revoke the existing `live_` token.** `#1221` merged on 2026-09-25; `#1174` is open and non-draft. Current holds and routing defer to `docs/agents/OWNERSHIP.md`; this pointer does not lift any hold. All other locks (`HOLD #1250`, No Publish, No History-restore, No APPLY, No production SQL, Never KEEP, No owner email, `knk`) are carried in §11 above and in `docs/agents/OWNERSHIP.md` §3.

**Prior same-day update:** 2026-08-18 UTC
**Updated by:** Claude (2026-08-18, later edit: executes the Cheek-approved
Tranche 1 of `docs/specs/current-state-archival-slice.md`. Moves, verbatim, to
the new `docs/agents/CURRENT_STATE_ARCHIVE.md`: the superseded
update-attribution chain (2026-08-13 → 2026-08-15), the deploy-head validation
body pinned to `5611b130e81a`, the five "Completed, out of slice" records
(2026-08-07 → 2026-08-18), and resolved blocker 6; relocates the
release-provenance runbook to `docs/release-provenance-runbook.md`. Each move
leaves a pointer with its still-live takeaways. Nothing under a ⚠️ heading and
no open item moved. The archive is never imported by `CLAUDE.md`;
`check-sentinel-version-parity.mjs` verified PASS with 0 governance files
changed. No production, GA4, GSC, sitemap, or release-identity row was
re-measured in this edit. Does **not** apply migrations or set Day 0.)

Older update-attribution entries (2026-08-13 → 2026-08-18) are archived
verbatim — see `docs/agents/CURRENT_STATE_ARCHIVE.md`.

This is the changing shift report. Permanent rules live in `/AGENTS.md`; do not edit
that constitution to record branch, deployment, blocker, or assignment changes.

Every agent reads this file before acting. If a current owner instruction or verified
repository state is newer than this snapshot, report the difference and update this file
inside the active governance handoff.

---

## 🎯 STANDING DIRECTIVE — production is the target, not sandbox (recorded 2026-08-25)

**`source claim`, Cheek, 2026-08-25 in session:** _"from now on we are working towards
production and not sandboxing."_ Scope confirmed in the same exchange as **full production
posture** — it sets the direction of all work: targets, data, and payments.

**This is a direction, not a blanket authorization.** Recorded that way deliberately,
because this file's own history is a catalogue of standing notes later read as licence.
Every gated action listed below still needs its own explicit release from Cheek. "We are
working towards production" releases none of them by itself.

### What it does change

| Axis               | From                                    | To                                                     |
| ------------------ | --------------------------------------- | ------------------------------------------------------ |
| Reference database | sandbox project `bzatgtgjvuojpoxcknaa`  | production `knkwiiywfkbqznbxwqfh`                      |
| Reference build    | spikes, previews, local replay          | the deploy branch, and what production actually serves |
| Payments intent    | sandbox-only checkout as settled policy | live checkout is the goal                              |

Sandbox keeps every use it is actually for — local replay, e2e fixtures, the
`chromium-mocked` project, the restricted-role harness. What ends is **reasoning about
production from a sandbox observation**. This file already records why that was never
safe: sandbox is far behind production on Quick Log, and the 2026-08-19 measurement had
to say so in as many words.

### What it does NOT change — each needs its own explicit lift

1. **Publishing is still stopped by owner order** (2026-08-22). Not lifted by this row.
2. **Do NOT GitHub-APPLY `20260813030000_signup_acquisition_forward_repair.sql`.**
   Unchanged and unconditional — that file re-issues an unguarded `handle_new_user` and
   would overwrite the live `RAISE LOG` guard from `20260821150000`. That is a production
   incident before this directive and after it.
3. **No migration reaches production by merging.** The second-drift section still governs.
4. **The Hard Safety Rules are not a sandbox artifact.** Approval-required Action Queue,
   no device control, no fake live data, cautious AI, source-labelled telemetry — none of
   these were sandbox-only caution, and "production posture" relaxes none of them. If
   anything they bind harder now, because the blast radius is real growers.

### Payments — measured status at deploy tip `823f4c8f0`, 2026-08-25 17:11 UTC

**Half of the move has landed. The half that decides whether checkout actually works has
not.** `established fact`, read at that tip:

- **#1124 (`d4b344d3e`, merged 2026-08-25 16:54:25 UTC) changed the BUILD gate only.**
  `scripts/assert-paddle-production-sandbox.mjs` now accepts a single `test_` **or**
  `live_` `VITE_PAYMENTS_CLIENT_TOKEN` through `resolveCanonicalPaddleProductionToken`,
  failing closed only on missing, multiple, malformed, or non-Paddle values.
- **The RUNTIME still fails closed on `live_`.** `resolvePaddleCheckoutEnvironment`
  (`src/lib/paddleEnvironment.ts:87`) returns `"sandbox"` only for a `test_` token and
  `"unavailable"` for every other class **on every host**; the module header still states
  the sandbox-only policy.

**So a publish today would still disable checkout.** The build would pass and the grower
would still meet _"Checkout disabled: Verdant currently supports Paddle sandbox testing
only."_ **Do not read #1124 as having enabled live payments** — it removed a build-time
blocker, not the runtime one.

**Corrected 2026-08-25 on PR #1125, after Copilot review — an earlier draft of this row
called the remaining work "small and contained: one function, one message constant and the
module header ... plus the single call site". That was measured too narrowly and is
withdrawn.** The resolver is one of **six** independent sandbox-only runtime gates, and the
five others each fail closed on their own, so changing the resolver alone would leave
checkout still unable to open:

| Gate                        | Location                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| resolver                    | `src/lib/paddleEnvironment.ts:87`                                                                                        |
| Paddle.js load              | `src/lib/paddle.ts` `initializePaddle()` — throws unless `env === "sandbox"`                                             |
| hardcoded SDK env           | `src/lib/paddle.ts` — `Paddle.Environment.set("sandbox")`                                                                |
| price lookup                | `src/lib/paddle.ts` `getPaddlePriceId()` — throws unless sandbox, and sends `environment: "sandbox"` in its request body |
| checkout hook, presentation | `src/hooks/usePaddleCheckout.ts:124`                                                                                     |
| checkout hook, open path    | `src/hooks/usePaddleCheckout.ts:137`                                                                                     |

A seventh fence sits outside the client: the production bundle attestation in
`.github/workflows/quicklog-smoke.yml` fetches the hardcoded production origin and rejects a
live token in the shipped bundle, so it fails the moment a live build ships.

None of this is approved by this row. It is a billing-surface change needing an
owner-approved slice with a named independent reviewer, per `AGENTS.md`. The full audit,
the sequencing argument, and the prerequisites are specified in
`docs/specs/paddle-live-checkout-runtime-slice.md`, which must be read together with the
pre-existing `docs/paddle-paid-launch-runbook.md` — that runbook already states the live
transition must be **one** independently reviewed release changing client, token, server
environment, secrets, price IDs, monitoring and rollback **together**, and that flipping any
single setting is insufficient and must fail closed.

### The build-time token question is NOT answered — corrected 2026-08-25 (Codex review, PR #1125)

**Renamed from "...is now ANSWERED — by #1124, not by measurement here."** That heading
overclaimed. Raised by Codex review on this PR, verified against the guard's own source
before accepting: `scripts/assert-paddle-production-sandbox.mjs`, at the head this PR
carries, widened which token **class** passes (`test_` or `live_`, via
`resolveCanonicalPaddleProductionToken`, per #1124) but did **not** remove the exact-match
requirement between the effective (Vite-resolved) token and the canonical token read from
the committed `.env.production` file —
`if (effective.token !== canonical.token) return fixedFailure("effective_paddle_token_mismatch")`
still governs, unchanged by #1124.

**That contradicts candidate 1 as originally stated here.** Candidate 1 is a platform value
injecting `live_` via the ambient Vite environment while the committed `.env.production`
stays `test_` — which the file is deliberately kept at, per policy. Effective and canonical
would then differ by construction, and this guard would **fail the build**, not pass it.
Read literally, candidate 1 is inconsistent with a successful build under the guard as it
exists today — the opposite of "answered."

**What this reopens, not closes.** Two explanations are consistent with what's measured and
neither is confirmed: (a) whatever publish path produced the historically-observed `live_`
bundle did not run this guard at all — consistent with the still-open `NOT_MEASURED`
question, recorded in the payments-token section below, of whether the publisher invokes the
package lifecycle (`prebuild` → this guard) in the first place; or (b) the committed
`.env.production` itself briefly carried a `live_` value at build time and was restored
afterwards — candidate 2, which this file has said from the start not to discard. This
correction does not choose between them.

The body below is left as originally written — it correctly hedged the injection claim as
`source claim` from #1124's own PR body, not a re-measurement — only the heading's "ANSWERED"
framing is withdrawn.

This file has carried two live candidates for how a `live_` token reached production JS
while both `.env.production` files read `test_`. **#1124's own body names the mechanism:
"Production publish must accept `live_` because Lovable injects it at publish."** That
is candidate 1 — a platform-injected value overriding the file — and it is `source claim`
from that PR body, not something re-measured here.

Two consequences, both worth stating precisely:

- The standing instruction to **re-read the Lovable `.env.production` before anyone opens
  the publish button** loses its point _as a token check_: the file was never going to
  show an injected value. Reading it was correct while the mechanism was unknown. It was
  never a clearance, and it is not one now — and per the correction above, it is now the
  ONLY check that can still distinguish the two candidates ahead of a publish.
- **This does not settle the `treeHash` / `dirty: true` provenance question.** Under
  candidate 1 the workspace `.env.production` never differed, so it contributed nothing to
  the tree-hash mismatch — which stays `NOT_MEASURED` and attributable to some other file.
  #1108 (`3345fbfa5`) ships a candidate remedy in `scripts/stamp-version.mjs`; its own
  release note is correctly cautious, requiring production to _demonstrate_ `dirty: false`,
  a non-orphan ref, and the merged tip SHA before anyone calls it fixed. That demonstration
  requires a publish, which remains stopped.

### #1127 landed while this PR was open — new evidence for candidate 2, not candidate 1

**Recorded 2026-08-25, merged to base as `75c01e6f8` after this PR's revision 6.**
`fix(publish): restore .env.production from HEAD before prebuild stamp (#1127)`'s own body
states the mechanism directly: **"Lovable Payments Live injects a `live_`
`VITE_PAYMENTS_CLIENT_TOKEN` into tracked `.env.production`"** — into the committed **file**
on disk, not an ambient environment variable left the file untouched. `source claim` from
that PR's own account, not independently re-verified in this correction. That is candidate 2
as this file has named it from the start, not candidate 1 as the "now ANSWERED" heading
(withdrawn above) had credited.

**This also resolves the contradiction the correction above raised, if #1127's account is
right.** `assert-paddle-production-sandbox.mjs` reads the canonical token from the
`.env.production` file on disk, and Vite's `loadEnv` also resolves `.env.production` from
disk (not only ambient `process.env`). If Lovable rewrites that file in place before the
guard runs, both reads see the identical rewritten value and the exact-match check passes
cleanly — no contradiction. Candidate 1 (a pure env-var override that leaves the file
untouched) would still fail the guard for the reason given above; it is candidate 2 that is
consistent with a passing build.

**It also gives a first-party account of the `treeHash` / `dirty: true` mechanism this file
has tracked since 2026-08-21.** `.env.production` sits in `TREE_HASH_ROOTS` precisely because
`VITE_*` values reach shipped JS (`scripts/lib/tree-hash.mjs`'s own comment says so); a file
rewritten on disk immediately before the stamp runs goes dirty by the same mechanism any
other hashed-root file would. #1127 prepends a from-HEAD restore to `prebuild` specifically
to make that rewrite a no-op for `treeHash`/`dirty` going forward. Its own safety verdict is
explicit that this does **not** by itself authorize live checkout or claim production
`dirty: false` — that still requires a fresh publish that actually demonstrates it, and
publishing remains stopped.

**Status: `source claim` from #1127, carried here because it directly narrows the
candidate-1-vs-2 question, not independently measured in this correction.** Whether Lovable's
publish behavior actually matches #1127's account, and whether its fix in fact produces
`dirty: false` on the next publish, are both open until that publish happens and is read.

### A dated gate that expires tomorrow

`config/dependency-lockfile-transition.json` carries `reviewBy` **2026-08-25** and
`check-bun-lockfile-policy.mjs` compares strictly greater. Verified at this tip: the script
returns **OK today** (exit 0) and first **fails 2026-08-26 UTC**. Whether a ruleset-required
context invokes it against the real clock is `NOT_MEASURED` — the policy test is largely
fixture-driven, and the standing invocation found is `dependency-security-ci.yml`, which is
not one of the 35 required contexts. Owner-gated decision either way, unchanged by this
directive; recorded so it is not met as a surprise.

---

## 🔁 2026-08-25 19:48 UTC re-measure — production republished, and the served commit IS NOT IN GITHUB

**This block supersedes every release-identity, publish-lag and payments-bundle row below
it.** Those rows keep their own older dates and are stale; read this first.

`established fact`, measured first-hand 2026-08-25 19:48 UTC.

| Axis                       | Value                                                                      |
| -------------------------- | -------------------------------------------------------------------------- |
| Deploy tip                 | `2e7002b69` (#1094)                                                        |
| Production serves          | `e8f4e7c2fe059e5f6c9089dbb3829418bf82f7d8` / `e8f4e7c2fe05`                |
| `buildTime` / `commitTime` | `2026-08-25T18:05:30.499Z` / `2026-08-25T18:02:53Z`                        |
| Provenance flags           | `dirty: true`, `ref: "__orphan__"`, `ciRunId: null`, `commitSource: "git"` |
| `treeHash`                 | `bcb08cd3ae1a…`                                                            |
| Ancestry                   | **NOT AN ANCESTOR — the commit does not exist in the GitHub repository**   |
| Publish lag                | **NOT COMPUTABLE** — see below                                             |

**Production republished today**, superseding `faea6e9c59ad` (2026-08-21), which this file
had recorded as live since 2026-08-22.

### The finding that matters: the served commit is not a GitHub commit

`git fetch origin e8f4e7c2fe05…` returns **`fatal: remote error: upload-pack: not our ref`**.
The object is unknown to the remote; no remote branch contains it.

Two consequences, both correcting long-standing framing in this file:

1. **"Publish lag = N first-parent commits" is not a measurement that can be taken.** It
   presumes the served commit is an ancestor of the tip. It is not. Every lag figure this
   file has carried assumed an ancestry that no longer holds. Do **not** compute or quote a
   lag number against this build.
2. **`ref: "__orphan__"` has a candidate explanation, not a proven one — corrected in
   revision 11 (Codex P2) of the companion payments spec (PR #1125).** `git fetch origin
<sha>` returning `not our ref` proves the SHA is absent from `origin`; it does not by
   itself prove _how_ it got that way. "The publisher's workspace commits locally, unmoored
   from GitHub's history" is one mechanism consistent with that absence — it is not the only
   one a rebase, squash, or re-commit of otherwise GitHub-derived content, or a build sourced
   from a different remote, would produce the identical symptom. `stamp-version.mjs:117-122`
   does stamp whatever `git rev-parse HEAD` reports locally, faithfully — that much is
   confirmed by source — but "faithfully" describes the _stamping_, not the _cause_ of what
   HEAD happened to be. Held at `NOT_MEASURED`: the causal mechanism. Unaffected, and still
   measured: the observation itself — this SHA is unrecognized by GitHub.

### The build-time token question — see the candidate-2 block above, not here

**Deliberately not restated.** A parallel session recorded the candidate-1-vs-2 resolution
at "#1127 landed while this PR was open" above, in more depth than this block did — it also
explains why candidate 1 would have failed `assert-paddle-production-sandbox.mjs` while
candidate 2 is consistent with a passing build. That account governs. An earlier draft of
this block duplicated it and was trimmed on merge rather than left to contradict it.

### #1127's effect is PROSPECTIVE, and one question about it is open

Verified at the merged tip: `prebuild` now runs
`restore-env-production-from-head.mjs` **first**, ahead of `assert-paddle-production-sandbox.mjs`
and `stamp-version.mjs`.

**It is not in the live build.** #1127 merged 19:16 UTC; the served build was stamped
18:05 UTC. Re-measured the same window: the entry bundle is now
`/assets/index-ED0o2atf.js` (833,786 bytes) and still carries **1 `live_`-class token and
zero `test_`-class tokens**. Counts only — no token value was printed, logged, or stored.

**Open question, flagged not answered.** The restore reads `git show HEAD:.env.production`.
**Corrected in revision 11 (Codex P2) of the companion spec:** the sentence originally here
said "the served SHA being an orphan commit unknown to GitHub shows the publisher does
commit locally" — restating, as settled, the exact causal claim point 2 above now holds at
`NOT_MEASURED`. It is not settled. What the fetch failure actually supports is narrower: it
says nothing about whether the publisher's workspace commits the injected file at all, let
alone in what order relative to injection. _If_ it does, `HEAD` may already carry the
injected `live_` value, and restoring from it would restore the injection rather than the
committed sandbox class, making the fix a no-op — but that "if" is exactly what is not
established. Whether Lovable injects before or after any such commit is **`NOT_MEASURED`**,
on narrower grounds than this paragraph originally claimed. Do not record #1127 as proven
until a publish demonstrates `dirty: false` and a `test_`-class bundle — which is exactly the
demonstration #1127's own release note asks for.

**Nothing here authorizes a publish.** The stop-order stands; this is measurement only, and
no agent published — production republished on its own account at 18:05 UTC.

---

## 🔒 Supabase Preview — the 42P07 replay failure has NO PR-side workaround (recorded 2026-08-26)

**Why this is here:** the `Supabase Preview` check fails on every PR branch with the same
error, and the fixes that look obvious are each wrong in a way that is not obvious. Recorded
so the next agent does not re-derive a dashboard workaround that cannot work, or reach for a
published migration.

### What is observed — `established fact`

`Supabase Preview` fails on preview-branch creation with:

```text
ERROR: relation "ai_credit_grants" already exists (SQLSTATE 42P07)
At statement: 0
CREATE TABLE public.ai_credit_grants (…)
```

Seen on PR #1135 at 02:04:28 UTC and again at 03:10:49 UTC on a later head, and on PR #1131.
It is not branch-specific and not diff-specific: neither PR contains a migration.

**Cause.** Two committed migrations create the same table:

| File                                                      | Role                                        |
| --------------------------------------------------------- | ------------------------------------------- |
| `supabase/migrations/20260721103000_ai_credit_grants.sql` | canonical — the one production records      |
| `supabase/migrations/20260721182752_4fc51714-…sql`        | a later Lovable export repeating the ledger |

**The repository already declares this.** `config/local-supabase-replay-compatibility.json`
carries a `compatibility_noops` entry naming both files by path and SHA-256, whose `reason`
field names this exact SQLSTATE. A sibling entry covers `20260721105000` vs `20260721194154`.

**The gap.** That mechanism rewrites a _disposable copy_ in a local workdir. Supabase's
hosted preview pipeline replays the committed files directly and never reads that config, so
the declaration cannot help it. The sanctioned mechanism is working exactly as designed and
still does not cover this surface.

### What does NOT work — `source claim`, Cheek, 2026-08-26 in session

Recorded as the owner relaying vendor behaviour. Not independently verified from inside this
repository, and not verifiable from here — no agent should re-test it by trial against a live
project.

1. **The dashboard 3-step path (create → Pull → Migrate) is `NO`.** Dashboard create still
   "replays the migration history from your main branch against a fresh database." Pull
   initialises the table, then Migrate runs the same files. Same `ai_credit_grants` 42P07.
2. **`PATCH /v1/branches/{id}` can set `git_branch` later**, but the docs do **not** say that
   writes the `Supabase Preview` check on a PR, and do **not** say it skips first-create
   replay. Do not assume either.
3. **The supported GitHub Preview flow is: open or reopen the PR → empty DB → full file
   replay.** Incremental "new files only" begins **only after that first create succeeds** —
   which is the step that fails here.
4. **Next leverage is Supabase Support**, for an undocumented ledger-inherit. Not a dashboard
   workaround, and not editing published migrations.

**Corollary — the bot's own advice is the trap.** The `supabase[bot]` comment on every PR
reads _"Close and reopen this PR if you want to apply changes from existing seed or migration
files."_ That is precisely the path in (3): it re-runs the full replay and fails again.
Closing and reopening a PR is not a remedy here.

### What this does not license

**Do not edit, gut, or no-op either migration.** Merged migrations are permanent history
(`AGENTS.md`, Migration Immutability). The `Published migration integrity` gate compares
SHA-256 against the base branch and will fail the PR. "This migration is broken and could
never have succeeded anywhere" is named in the constitution as the specific reasoning that is
seductive and wrong.

`20260813030000_signup_acquisition_forward_repair.sql` is **unrelated** to `ai_credit_grants`
and its hard stop is untouched by anything in this section.

### Merge impact — `established fact`

`Supabase Preview` is **not** a required context. It appears in neither `required` (35
contexts) nor `mustBeGreen` (1) in `config/required-status-checks.json`. A red
`Supabase Preview` does not block the merge queue and is not grounds for holding a PR.

| Axis                                    | Status         |
| --------------------------------------- | -------------- |
| Preview-branch creation on any PR       | `FAIL`         |
| Cause identified                        | `PASS`         |
| Repo-side remedy available              | `BLOCKED`      |
| Vendor behaviour independently verified | `NOT_MEASURED` |
| Support request raised                  | `NO_DATA`      |

---

## ✅ RESOLVED 2026-08-21 — attributed signups hard-fail

**Status 2026-08-21: RESOLVED. The forward repair is applied to production
and the outage is closed.** The block immediately below is preserved verbatim
for its diagnosis and evidence — it is still an accurate description of the
bug that was fixed — and the original 2026-08-13 status line is superseded.
See the dated resolution subsection at the end of this section for what
changed and what was verified.

**Status 2026-08-13 (superseded): OPEN. Fix merged, NOT applied. Production is still broken.**

Account creation aborts for any signup carrying an allowlisted acquisition source —
including the front-door CTA on `/` and `/welcome`. The live `handle_new_user`
INSERTs into `public.signup_acquisition_attributions`, which does not exist, and that
INSERT sits outside the function's EXCEPTION block. Result: `42P01` → the AFTER INSERT
trigger on `auth.users` aborts → the row rolls back → GoTrue returns HTTP 500
"Database error saving new user". **The account is never created.**

Not every signup: Google OAuth, magic link, and a bare `/auth?mode=signup` resolve to NULL
and still succeed. **Do NOT extend that to "traffic carrying its own utm params is fine".**
`Landing.tsx:60` falls back to `landing_page` for an absent, partial, or unrecognized inbound
tuple and then rebuilds the signup URL with the exact allowlisted triple, so any visitor who
lands on `/` or `/welcome` first — the normal path for an ad click or a search result — is
re-attributed and fails. Only a non-exact tuple supplied **directly to `/auth`** is unaffected.

Fix is `supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql`, merged
in #969. **Merging did not fix it** — only a Lovable apply does, and the frontend half was
already deployed ahead of the repo.

**Full detail, evidence, apply steps and post-apply verification:**
`docs/signup-attribution-outage-operator-runbook.md`

### 2026-08-21 resolution — the forward repair is APPLIED, the live outage is CLOSED

`established fact`, applied 2026-08-21 by Claude through the same Lovable SQL
channel used for the Action Queue repairs above, at Cheek's authorization in
session to act on the three items left open at the end of that prior work.

`supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql` was
applied to production **verbatim** — transcription verified before any
statement executed, by wrapping the exact file bytes in an md5 guard and
checking them against the runbook's pinned identity (SHA-256 `6c002ab6…`,
17297 bytes) rather than trusting a copy-paste. The first attempt caught a
real one-character transcription slip (a stray leading newline from this
session's own dollar-quote formatting) and aborted with **zero writes** before
it could apply anything wrong; the corrected retry succeeded.
`public.signup_acquisition_attributions` and all four functions
(`handle_new_user`, `record_signup_acquisition_first_touch`,
`signup_acquisition_operator_snapshot`, `signup_to_paid_operator_snapshot`)
now exist in production.

**A rolled-back, zero-committed-write functional probe exercised the exact
failure path this section describes** — an allowlisted acquisition source
through `handle_new_user` — and passed all 8 assertions checked (BEGIN …
ROLLBACK throughout; the first attempt hit a permission-denied error writing
probe results while impersonating `authenticated` against an ungranted temp
table, was restructured so the role switch wraps only the privileged calls,
and then passed clean).

**The merged migration never revokes `service_role`** — zero occurrences of
the string anywhere in the 456-line file, confirmed by grep before relying on
it. On this hosted project's legacy default privileges (the same posture
`supabase/seed.sql`'s header documents for tables, now confirmed by direct
probe to extend to functions too), a freshly created table or function grants
`service_role` full access automatically with no explicit `GRANT` — the
identical class of gap this file already records for the Action Queue guard.
An ad-hoc supplemental `REVOKE ALL ... FROM service_role` on all five objects
was issued through the same channel immediately after the forward repair, so
production is not just fixed but hardened.

**That ad-hoc supplement is now captured in version control**, so it is not
left to silently drop out of a future replay the way the Action Queue's
initial state very nearly was:
`supabase/migrations/20260821064300_signup_acquisition_service_role_hardening.sql`
is a new additive migration (`20260813030000` itself is untouched, per
Migration Immutability Rules) that revokes `service_role` on the table and
all four functions, with a preflight that fails closed if the prerequisite
objects are absent and a postflight that asserts `service_role` holds nothing
while `authenticated`'s intended grants survive unchanged. Validated against a
local PostgreSQL 16 replay under a simulated permissive-default-privilege
regime reproducing this project's posture: applies cleanly after
`20260813030000`, hardens all five objects, is idempotent on re-run, and
fails closed with zero writes when the prerequisite objects are missing.
Static contract tests:
`src/test/signup-acquisition-service-role-hardening-migration.test.ts`
(7 tests), adversarially verified — a real injected
`GRANT ... TO service_role` statement was caught before the test was trusted.

**This new migration has not itself been re-applied to production**, and does
not need to be: production already carries the ad-hoc supplement's effect.
The migration exists so a fresh replay, CI reset, or disaster-recovery restore
reaches the same hardened end state instead of silently reopening the gap —
not to change production's current state, which is already correct. Applying
it to production anyway would be safe (`REVOKE` is idempotent and its
preflight would simply confirm the prerequisites it expects), but that is
deliberately left for a normal migration-apply pass rather than a second
ad-hoc production SQL session, in keeping with "fix things ... rather than
widening scope."

**Ledger name-rows (supersedes the same-day "no ledger row" claim above).**
At apply time #1080 recorded that no agent session wrote
`supabase_migrations.schema_migrations` for either signup version. A later
same-day **founder ledger backfill** (2026-08-21, marker
`ledger-only;objects-already-applied;no-rerun`, `created_by`
`founder-ledger-backfill`) inserted name-rows without re-running the files:
`20260813030000` / `signup_acquisition_forward_repair` and
`20260821150000` / `signup_acquisition_failure_safe_attribution`, plus seven
legacy name-rows (`20260515204616`, `20260515204637`, `20260515211702`,
`20260714231627`, `20260715002000`, `20260716215516`, `20260721107000`).
`20260721194325` was already present. **`20260821064300` is still not in the
ledger** — leave it unrecorded; ACLs on the objects it names already match
except the new readiness RPC (see next paragraph). Object presence remains
ground truth; the drift probe remains blocked for the two reasons already
recorded in the next section.

### 2026-08-21 ~15:23 UTC — failure-safe guard live; HARD STOP on GitHub APPLY

`practical observation` / point-in-time, measured 2026-08-21 ~15:23 UTC by
Grok via Lovable `query_database` on production project
`66255e7b-892c-4be5-8686-ab1cfc3666db` (not the sandbox):

- `public.signup_acquisition_attributions` exists
- three helper functions exist
- `handle_new_user` md5 `34405b3ee446340a55ad4f25e2193c9a` with **`RAISE LOG`
  guard text present** — applied from existing file
  `20260821150000_signup_acquisition_failure_safe_attribution.sql` via
  Lovable SQL; **not** via the GitHub apply-signup workflow
- `signup_acquisition_readiness_operator_snapshot` exists
- `handle_new_user` EXECUTE denied to `anon` / `authenticated`
- table has no `service_role` ACL; the original four functions have no
  `service_role`. Readiness RPC **does** have `service_role=X` (default
  privileges leftover)
- **Do not call the 42P01 table-missing outage still OPEN** — it is CLOSED

**Hard stop — do not GitHub-APPLY `20260813030000`.** That migration body
would re-issue an **unguarded** `handle_new_user` and overwrite the live
`RAISE LOG` guard. The GitHub apply-signup workflow still shows only the
failed PREFLIGHT; objects are already live through Lovable. Treating
"ledger name-row present" or leftover "still unapplied" prose as license to
APPLY that file is a production incident.

**What this does not change.** GA4/GSC baselines, Day 0, and the four-week
measurement clock are untouched. No schema beyond the table and functions
this migration and its predecessor define. No RLS, auth, or edge-function
change. The frontend attribution code (`Landing.tsx` and the signup URL
builder) was already deployed ahead of the repo per the original diagnosis
above, and was not touched by this repair.

---

## 🔶 Function default-privilege exposure — measured, not yet actioned (2026-08-21)

`practical observation`, measured 2026-08-21 by Claude via the same Lovable
`query_database` read-only channel used elsewhere in this file, against
Lovable project `66255e7b-892c-4be5-8686-ab1cfc3666db` — the same id two of
Grok's own same-day entries above label "production, not sandbox," and the
same id `docs/LOCAL_SUPABASE_SETUP.md` and
`docs/signup-attribution-outage-operator-runbook.md:61-64` independently map
to production Supabase ref `knkwiiywfkbqznbxwqfh`. **That identification was
disputed by a 2026-08-22 review comment and briefly downgraded here; the
2026-08-23 correction below restores it against the sourced mapping — read
that correction, not the 2026-08-22 one, before citing any count in this
section.** This is a coordination note, not a fix. Nothing here was changed,
drafted, or applied — see "What this does and does not license" at the end.

### Correction (2026-08-22) — the project-identity claim is disputed, not resolved

Grok (GDP)'s independent review of this section, posted on
[PR #1093](https://github.com/Verdant-OS/verdant-grow-diary/pull/1093), states
that Lovable project `66255e7b-892c-4be5-8686-ab1cfc3666db` is **not** the
production host — it names `knkwiiywfkbqznbxwqfh` as production instead (the
same ref this file's "Second production drift" section and
`scripts/lib/supabaseDatabaseTargetIdentity.mjs` use) — and says that id was
previously "a sandbox / yield-analytics Lovable project."

That contradicts, without reconciling, two of Grok's own entries earlier in
this file dated the same day: the ~15:23 UTC block above ("production project
`66255e7b-892c-4be5-8686-ab1cfc3666db` (not the sandbox)") and the "failure-safe
guard live" block a few lines below it ("via Lovable `query_database` on
production project `66255e7b-892c-4be5-8686-ab1cfc3666db` (production, not
sandbox)"). This note followed that same, already-established convention
rather than introducing a new claim.

Neither side is verified here. **This file has never recorded a checked
mapping between the Lovable _project_ id and the Supabase _database_ ref**
`knkwiiywfkbqznbxwqfh` — every "production, not sandbox" label to date,
including this note's, is a Lovable-UI-level assertion (which project the tool
was pointed at), never cross-checked against the codebase's own
identity source. Two attempts to resolve it via a metadata-only Lovable call
(`get_project`, not `query_database` — chosen specifically to avoid the
access question below) both timed out; not retried further.

**Separately, the same review asserts a standing owner lock: "production
`query_database` / enable_database on `knkwiiywfkbqznbxwqfh` is forbidden
(Cheek / GDP 2026-08-21)."** That restriction does not otherwise appear
recorded anywhere in this file. It is not disputed here, and no further
Lovable production query was attempted while writing this correction — but it
is also not yet independently corroborated in-repo. Whoever can confirm it
(Cheek, or Grok citing where it was set) should record it directly in this
file so it is citable on its own rather than through one review comment.

**Net effect: every count in this section is `established fact` about
whatever database `66255e7b-892c-4be5-8686-ab1cfc3666db` actually is, and
`NOT_MEASURED` — not `established fact` — as a claim about production
specifically**, until the project-id mapping above is actually checked and
recorded. Read every "production" reference below with that downgrade
applied; the text is left otherwise unchanged rather than silently rewritten,
per this file's own practice of keeping withdrawn or disputed claims visible.

### Correction (2026-08-23) — the 2026-08-22 correction overcorrected, and two further defects are fixed

Raised by Codex review on this same PR (#1093); verified against primary sources
before accepting rather than taken on the bot's word.

**1. The project-identity `NOT_MEASURED` downgrade above was itself wrong.** It
said "this file has never recorded a checked mapping between the Lovable
project id and the Supabase database ref" — false.
`docs/LOCAL_SUPABASE_SETUP.md`'s "Project identifiers" table (line 14) and
`docs/signup-attribution-outage-operator-runbook.md`'s "Provenance" section
(lines 61–64) both record exactly that mapping: Lovable project id
`66255e7b-892c-4be5-8686-ab1cfc3666db` = Supabase ref
`knkwiiywfkbqznbxwqfh`, because `query_database` "takes the Lovable UUID, not
the host ref." The runbook's record is dated 2026-08-13, attributed ("Run by:
Claude, during the pre-merge audit of #969"), and was the operational basis
for the signup-attribution fix this file's own RESOLVED section later
confirmed worked in production — this mapping has been acted on and its
consequences independently verified, not merely asserted once.

Grok's review comment that prompted the 2026-08-22 downgrade cites neither
document. It rests on "GDP previously used `66255e7b…` as a sandbox /
yield-analytics Lovable project," with no date or source given. Weighed
against a dated, attributed, operationally-confirmed in-repo record, an
uncited recollection does not carry it. **Restoring the 66/76 and 3/76
counts to `established fact` about production**, per the mapping above. If
Grok holds evidence this specific project was repointed or repurposed after
2026-08-13 — the one theory that would reconcile both claims — that needs its
own dated citation in this file, not a second uncited assertion; until then
this is the governing record.

**2. The "two functions... do not show the same exposure" uncertainty
(in the default-privilege-mechanism subsection below, later renamed — see
its own note) was a self-contradiction, not a
discrepancy.** It named both `handle_new_user()` and
`signup_acquisition_readiness_operator_snapshot()` as not showing
`service_role` EXECUTE. But this file's own ~15:23 UTC measurement, recorded
earlier in this same section, already says the opposite for the second
function: "Readiness RPC **does** have `service_role=X` (default privileges
leftover)" — which is not a discrepancy at all, it is exactly what the
default-ACL theory predicts for a newly created function. Only
`handle_new_user` actually lacks the exposure, and it has a mundane
explanation the original text missed: it is a `CREATE OR REPLACE` of a
function whose `service_role` EXECUTE was already explicitly revoked by the
2026-08-21 ad-hoc supplement (captured afterward as `20260821064300`)
_before_ `20260821150000` replaced its body — and `CREATE OR REPLACE
FUNCTION` does not reset an existing grant back to the default ACL. There is
no unexplained gap in the default-privilege mechanism; there is one
already-hardened function whose hardening survived a later body replacement,
exactly as expected.

**3. The "66... grant `service_role` EXECUTE by default" headline conflates
effective privilege with provenance — and this point's own first pass
overclaimed too, corrected on a second Codex review round on this same PR
before it even merged.** `has_function_privilege(role, function, 'EXECUTE')`
reports only whether a role currently has the privilege, by any path — an
explicit `GRANT`, `PUBLIC`, role inheritance, or an unrevoked default ACL —
never which one. At least 2 of the 66,
`supabase/migrations/20260719044601_4a9e443b-d980-4890-b85e-5ae6549a907f.sql:134`
and
`supabase/migrations/20260719052812_c25ba6a6-dcdb-40c7-9dbf-292b35af9150.sql:43-44`
(`founders_wall_count()` and `founders_seats_consumed()`), have migrations
that **explicitly, intentionally** `GRANT EXECUTE ... TO anon, authenticated,
service_role` — that much is established fact about the migration source,
and it does distinguish these two from a function whose access was never
deliberately authored at all.

**What that does not establish, on the corrected re-read: that the resulting
ACL entry actually originated from the grant rather than already being
present.** Both migrations `CREATE FUNCTION` first and `GRANT` several
statements later (verified: line 125 then 134 in the `founders_wall_count`
file). If the permissive default-ACL regime this section's own self-test
shows is live today was already in effect on 2026-07-19 when these functions
were created, `service_role` (and `anon`) EXECUTE would have landed on them
automatically at `CREATE` time, before the explicit `GRANT` ever ran —
making that `GRANT` a redundant restatement, not the origin. The final ACL
cannot tell the two paths apart once both converge on the same entry, and
whether that regime held as far back as July — three weeks before
`20260807133000` even attempted to harden it — is itself unmeasured. So:
**intentional authorization is established fact for these two; default-vs-
explicit origin for them is `NOT_MEASURED`, same as the other 64.** The
self-test still proves the default-ACL mechanism itself is live today; it
proves nothing about how many of the 66 — these two included — actually got
their `service_role` EXECUTE through it versus a grant that may have been
redundant. That per-function provenance check (`aclexplode`/`pg_default_acl`,
with creation-time evidence this repo does not have) was not done and stays
open for all 66, no exceptions.

**4. The third `anon`-set member does not check out against its own
migration, raised by a separate Copilot review comment on this same PR.**
`founders_guard_immutables()`'s only committed definition
(`supabase/migrations/20260719044601_4a9e443b-d980-4890-b85e-5ae6549a907f.sql:74-78`)
declares `RETURNS trigger LANGUAGE plpgsql` — no `SECURITY DEFINER` — and no
later migration redefines it (grepped, zero other matches). The catalog query
above filters on `p.prosecdef = true`, so this function should not have been
in its result set at all. Two explanations are consistent with what's
recorded and neither is confirmed: the live function differs from its
migration (unrecorded drift, the same class of gap this whole file tracks
elsewhere), or the original 3-function list is simply wrong about which
function is the trigger. Left open rather than guessed at — this also means
the "3 of 76" `anon` count itself, not just the "by default" framing, now
has an unresolved question mark on one of its three members.

**Why this was measured now.** `20260821064300` (this file's RESOLVED
signup-attribution section above) closed one specific instance of a pattern
— a function whose migration revoked PUBLIC/anon/authenticated but not
`service_role`. The Action Queue guard forward repair closed the same class
of gap for one other function. Two individually-found instances raised the
obvious question: how many more are there, and is the pattern actually
still live for newly-created functions, or purely historical?

### Confirmed: the scale of service_role exposure

```sql
SELECT count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) AS service_exec_count,
       count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_exec_count,
       count(*) AS total
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef = true;
```

Returns **66 of 76** SECURITY DEFINER functions in `public` currently have
effective `service_role` EXECUTE, and **3 of 76** have effective `anon`
EXECUTE. The count itself is `established fact` — a direct count, not an
inference — against production, per the 2026-08-23 correction above
(restoring the 2026-08-22 downgrade). Read it in context, not as 66 new
incidents: `service_role` already holds broad direct table access on this
project by design (`supabase/seed.sql`'s own documented legacy-grant
posture), so function-level `service_role` EXECUTE is mostly consistent with
the platform's existing accepted trust model, not a new class of exposure.
**Corrected 2026-08-23, four times now on this one claim. The fourth
correction is not another number — it is the conclusion that counting by
text search does not converge, so this file stops trying.** In order: "two
functions" → "two slices, five functions" (the signup migration alone
revokes a table and four functions, not one —
`20260821064300_signup_acquisition_service_role_hardening.sql:71-75`) → a
Codex round found three more migrations doing the same thing → an
exhaustive-feeling `grep -rl "FROM service_role"` returned 11 files, six of
which turned out to be table revokes, not function revokes, once each was
read directly, leaving 5 verified function-hardening migrations (Action
Queue guard, Action Queue transition, signup's four, quicklog, and AI
credit pack's conditional legacy-signature cleanup) → a further round found
a sixth, `20260728103000_schema_audit_trust_hardening.sql:351-354` —
`REVOKE ALL ON FUNCTION public.admin_schema_audit(...) FROM PUBLIC, anon,
authenticated, service_role;` — a **multi-role REVOKE on one line**, the
exact blind spot the previous correction had already named as unchecked.
Verified directly, and it is real.

**Four passes, four different SQL shapes each missed by the pass before it**
(a bare single-role REVOKE, a table REVOKE misread as a function REVOKE, a
multi-role REVOKE, and — per the previous correction's own still-unchecked
caveat — a schema-wide `ON ALL FUNCTIONS`/`ON ALL ROUTINES IN SCHEMA` form
that remains unchecked now too. This repo's own migrations elsewhere
document that PostgreSQL 11+ accepts `ROUTINE` as an alias for `FUNCTION`
in these grants, which a search for the literal word `FUNCTION` alone would
also miss). That pattern is itself the finding: a grep-based census of
`service_role` REVOKEs across free-form SQL migration text is not a method
that terminates at a trustworthy number, no matter how many more rounds it
runs for.

**So this file drops the enumerated count and states only what is actually
supportable: individual function-level `service_role` hardening is
demonstrated, by direct citation, in at least six migrations spanning
2026-07-28 through 2026-08-21** (`schema_audit_trust_hardening`,
`ai_credit_pack_portability`, `quicklog_manual_delegate_forward_repair`,
both Action Queue forward repairs, and `signup_acquisition_service_role_hardening`),
**using at least three distinct REVOKE forms** (single-role, multi-role, and
conditional/legacy-signature). Whether the true total is 6, 10, or 20 is
`NOT_MEASURED` and this file will not guess at it again by grep; a
trustworthy census would need to query the live catalog (`pg_proc` /
`aclexplode`) or parse SQL properly, not pattern-match migration text. What
six independently-verified instances across three SQL shapes do establish:
this is not "two exceptional cases" and it is not a settled small number
either — it is routine enough, and varied enough in how it is written, that
"case-by-case, judged individually" is well supported without needing an
exact count. It still does not, by itself, license a blanket revoke across
all 66 — that remains a separate decision this note does not make.

**"By default" is this section's own headline word, and it overclaims — see
point 3 of the 2026-08-23 correction above.** `has_function_privilege` proves
current effective access, never its provenance. At least 2 of the 66
(`founders_wall_count`, `founders_seats_consumed`, immediately below) are
confirmed to have **deliberate, explicit grant statements** in their
defining migrations — but per point 3's own correction, whether that grant
is what actually produced their current ACL entry, versus the default-ACL
mechanism already having done so at `CREATE` time, is itself unmeasured, no
different from the other 64. The self-test in "Uncertain," below, proves the
default-ACL mechanism is live; it does not prove how many of the 66 actually
came from it versus a grant. Read "66... grant `service_role` EXECUTE" as
the accurate headline; "by default" is unproven per-function, for all 66.

**The `anon` set is the one worth an owner's eyes** — and, per correction
point 4 below, one of the three is now flagged, not confirmed. All 3 are
recorded as `founders_guard_immutables()` (returns `trigger`, not callable
as an RPC — Postgres refuses to invoke a trigger-typed function outside
trigger context regardless of its grants; **but see correction point 4: its
committed migration doesn't declare `SECURITY DEFINER`, so its presence in
this `prosecdef = true`-filtered list is itself unresolved**),
`founders_seats_consumed()`, and `founders_wall_count()` — the latter two are
`SELECT COUNT(*)::int FROM public.founders [WHERE status = 'confirmed']`, no
PII, and read like a deliberate public "X founders joined" counter, now
confirmed to have **deliberate, explicit grant statements** in their
migrations (correction point 3) — though whether those statements, versus
the default ACL already in effect at creation, are what actually produced
the current grant stays unmeasured, per the same correction. `inference`:
probably intentional either way. Not verified with Cheek.

### The default-privilege mechanism is confirmed live; migration provenance is not

**Renamed 2026-08-23 (Codex review, this PR).** This subsection's own
self-test below (a fresh throwaway function receiving `anon`/`service_role`
EXECUTE, and both `pg_default_acl` entries retaining those grants today)
directly confirms the mechanism is live — that was never actually in doubt
once the self-test ran. The heading previously said otherwise. What genuinely
stays open, narrower than the old heading implied: whether
`20260807133000` applied as committed, and which role executed its
unqualified statements and `20260821150000` — both already carried below,
neither about whether the mechanism itself exists.

`20260807133000_global_default_privilege_hardening.sql` REVOKEs
`EXECUTE ON FUNCTIONS` and `ALL ON TABLES` from `PUBLIC, anon` at the
default-privilege level, in four statements each for functions and tables.
**Corrected 2026-08-23 (Copilot review, this PR) — only two of the four
function statements explicitly say `FOR ROLE postgres`; the other two carry
no `FOR ROLE` clause at all**, so per Postgres semantics they target
whichever role executes the migration — which this same subsection says,
two paragraphs down, is unconfirmed. The original wording ("all of them FOR
ROLE postgres, explicitly or via the executing role") asserted the
executing role equals `postgres`; that is not established. Its own
postflight self-test creates a throwaway function and asserts `anon` gets no
EXECUTE.

Reproducing that exact self-test today, in a rolled-back transaction via
the Lovable SQL channel, **it fails** — a fresh throwaway function gets
`anon` **and** `service_role` EXECUTE. `pg_default_acl` shows two separate
default-ACL entries for functions in `public`: one owned by `postgres`,
which still lists `anon=X` and `service_role=X`, and a second owned by
`supabase_admin`. **Corrected 2026-08-23 — the claims that the `postgres`
entry was "unchanged by that migration" and that `supabase_admin` was
"never targeted at all" both overclaimed.** Whether the migration actually
applied as committed, and which role executed its two unqualified
statements, are exactly the open questions this subsection already carries;
neither can be assumed to answer itself. What's directly observed, and
stands: both default-ACL entries currently grant EXECUTE to
`anon`/`authenticated`/`service_role`. The identical two-bucket split exists
for tables too.

**Corrected 2026-08-23 (see the correction above, point 2) — this was a
self-contradiction, not a discrepancy, for one of the two functions.** This
subsection originally claimed both `handle_new_user()` and the new
`signup_acquisition_readiness_operator_snapshot()`, from Grok's own
`20260821150000`, failed to show `service_role` EXECUTE. This file's own
~15:23 UTC measurement, recorded earlier in this same section, already says
the readiness RPC **does** have `service_role=X` ("default privileges
leftover") — exactly what the default-ACL bucket predicts for a newly
created function, not an exception to it.

Only `handle_new_user()` actually lacks the exposure, and it has a mundane
explanation rather than an open question: it is a `CREATE OR REPLACE` of a
function whose `service_role` EXECUTE was already explicitly revoked by the
2026-08-21 ad-hoc supplement (captured afterward as `20260821064300`)
_before_ `20260821150000` replaced its body. `CREATE OR REPLACE FUNCTION`
does not reset an existing grant back to the default ACL, so a
previously-hardened function stays hardened across a later body replacement.
That is expected behavior, not a gap in the mechanism.

**Corrected 2026-08-23 (Codex review, this PR) — the sentence below
attributed this to the `postgres`-owned bucket specifically, silently
reverting to the assumption already disputed two paragraphs up.** Which
default-ACL entry actually applied to the readiness RPC at creation time
depends on `20260821150000`'s executing role — `postgres` and
`supabase_admin` each own a separate entry, and only the one matching the
object's creator governs it. That executor is unconfirmed, same as before;
`proowner` on the function itself was not checked either. Since both
entries currently show the identical `anon=X`/`service_role=X` pattern
(lines 764–766 above), either would explain what was observed, so the
observation cannot be used to name which one. Corrected: the applicable
default-ACL bucket — `postgres`'s or `supabase_admin`'s, still
`NOT_MEASURED` which — is consistent with both real migrations measured
here once each function's own grant history is accounted for: a brand-new
function (the readiness RPC) inherits whichever default ACL governs its
creator; a replaced function (`handle_new_user`) keeps whatever was already
explicitly granted or revoked on it. No corrective migration is implied by
either case.

### What this does and does not license

Confirmed: the 66/76 and 3/76 counts (effective privilege, not proven
per-function provenance — see correction point 3; and one member of the 3
is itself unresolved, correction point 4), against production
`66255e7b-892c-4be5-8686-ab1cfc3666db` / `knkwiiywfkbqznbxwqfh` (the
2026-08-23 correction above restores this after the 2026-08-22 downgrade),
and the self-test-fails-via-this-probe-channel result. Not confirmed: how
many of the 66 — all of them, no exceptions, including the 2 with deliberate
grant statements in their migrations (correction point 3, itself corrected
on re-review: intentional authorization is established for those 2, but
default-vs-explicit _origin_ is not) — came from the default-ACL mechanism
versus a grant; whether `founders_guard_immutables()` genuinely belongs in a
`prosecdef = true` population given its committed definition says otherwise
(correction point 4); or
whether any corrective migration is actually needed — the "real migrations
don't show the same exposure" question is resolved as of correction point 2,
not open. **No migration was drafted or applied.** No table, function,
grant, or default privilege was changed. This does not authorize anyone to
apply `20260807133000`-style `ALTER DEFAULT PRIVILEGES` changes on the
strength of this note alone — per-function grant provenance across all 66 is
still unchecked. Do not run a further production `query_database` /
`enable_database` call to settle this — Grok's review claims that surface is
owner-locked on `knkwiiywfkbqznbxwqfh` (2026-08-21), a claim this file does
not yet independently corroborate but that this note does not attempt to
test. Grok: if your migration-apply path can confirm which role actually
executes committed migrations against production, that fact is still open
and would resolve it — independent of the identity and exposure questions
above, both now settled.

---

## ⚠️ Second production drift — committed migrations are NOT auto-applied

**Recorded 2026-08-15 from a Lovable read-only investigation of production
`knkwiiywfkbqznbxwqfh`.** `source claim` for the production measurements; the
repository-side facts below were verified directly.

**Publishing does not replay `supabase/migrations/`.** It deploys the frontend
and edge functions only. Migrations reach production solely through the
operator's own apply path. This corrects an assumption stated repeatedly in
`docs/specs/postgres-restricted-role-alternative.md` (now fixed in its §5.4.1)
and it explains why the signup-attribution fix above was once "merged, NOT
applied" (historical as of 2026-08-15; the signup repair was applied
2026-08-21 — see the RESOLVED section. The publishing-vs-migration lesson
still stands).

**At least one further migration is unapplied, and it is not the signup one.**
`supabase/migrations/20260811090000_quicklog_corrections_retractions.sql` is
committed, but in production:

- `to_regclass('public.quicklog_entry_revisions')` → `null` (table absent)
- `public.diary_entries.retracted_at` / `.retraction_reason` → absent

**Shipped code depends on those objects.** Verified in this repo:
`useQuickLogRevisionBadges.ts` and `useRetractedQuickLogEntries.ts` both
`.from("quicklog_entry_revisions")`, and they mount through
`QuickLogHistoryPanels` / `QuickLogGroupedTimelineSection` onto **Timeline**,
**TentDetail** and **PlantDetail** — the One-Tent Loop spine.

**Failure mode is silent, not loud.** `useQuickLogRevisionBadges` does
`if (error) return new Map();`. So Quick Log revision badges and retracted
entries simply never render in production. No crash, no error surface, no
telemetry — the feature looks shipped and is invisible. That is a different and
in some ways worse shape than the signup outage, which at least fails loudly.

Exact drift count is `NOT_MEASURED`: `supabase_migrations.schema_migrations` was
`permission denied` for both roles available to the investigation, so only
"≥ 1 beyond signup" is proven, by object absence. The full migration ledger must
be reconciled against production before assuming anything else in the 265-file
directory is live — **and the tool that does exactly that already exists and has
never worked. Read the next section before building anything.**

---

## ⚠️ The migration-drift alarm has never once completed a measurement

**Recorded 2026-08-15 by Claude, answering Cheek's "migration ledger
reconciliation" ask.** The conclusion is **do not build a second tool — repair
the one that exists.** `scripts/probe-migration-drift.mjs` and
`.github/workflows/migration-drift-probe.yml` were written after the 2026-08-05
six-day outage precisely so six days could never pass unnoticed again, and they
are the right shape for this job. But the probe has **never returned a
measurement**, and — corrected here after a Codex review, see defect 3 — it
would not yet return a _correct_ one even if it connected.

**So the ledger stays `NOT_MEASURED` behind two independent blockers, not one:**
an owner-side secret that points at the wrong database over an unreachable
address (defects 1 and 2), and a repo-side matching defect that would misreport
Lovable-recorded migrations as drift (defect 3). Fixing the secret alone would
produce output, not truth. An earlier version of this section said "no new tool
is needed and none should be built" full stop; the first half stands, the second
half was wrong.

`established fact`, from the Actions API on 2026-08-15: the workflow has four
scheduled runs in its entire history, and all four concluded `failure`.

| Run           | Date (UTC)          | Outcome                                             |
| ------------- | ------------------- | --------------------------------------------------- |
| `31576932687` | 2026-08-12T08:07:36 | `failure` — probe step `skipped`, nothing attempted |
| `31680785295` | 2026-08-13T08:08:58 | `failure` — probe step `skipped`, nothing attempted |
| `31782504195` | 2026-08-14T08:05:40 | `failure` — `could_not_probe`, connection refused   |
| `31871667855` | 2026-08-15T07:19:42 | `failure` — `could_not_probe`, connection refused   |

**Re-run on demand 2026-08-15 at Cheek's instruction: identical.** Run
`31878986411`, `workflow_dispatch` on `verdant-grow-diary`, produced a
byte-for-byte identical `could_not_probe` payload — same sandbox host, same IPv6
address, same `Network is unreachable`. Steps 1–5 (checkout, Node, psql install,
`Require SUPABASE_DB_URL`) all passed; step 6 failed in **zero seconds**, dying
at the socket before its single `SELECT`. It also means there is no partial
result to salvage — the ledger question stays unanswerable from CI until the
secret is repointed.

Be precise about what the re-run rules out. The five runs share an outcome, not
a cause: **three** of them reached the socket and failed there identically
(14 Aug scheduled, 15 Aug scheduled, 15 Aug dispatch), while the 12–13 Aug pair
never reached it at all — the secret guard stopped them first. So the on-demand
re-run rules out a transient **in the connection failure**, on a sample of
three, and says nothing about the earlier pair. The 12–13 Aug failures are
already explained separately below.

**The alarm itself is working correctly. What is missing is remediation.** The
probe exits 2 for "could not check" rather than 0, exactly as its own header
demands ("A probe that cannot reach the database must never be mistaken for a
probe that found nothing wrong — that is exactly how a six-day outage stays
invisible"), and it opened a tracking issue on the first failure. Two issues are
open, with no human comment and no corrective action on either:

- **#912** — "Migration drift: production is not running every committed
  migration", open since 2026-08-12, last updated 2026-08-15T07:20:04Z, three bot
  comments.
- **#916** — "Money migration check (production) requires attention", open since
  2026-08-12.

State the gap precisely, because the two diagnoses lead somewhere different. What
is established is that the alarm went red on 2026-08-12 and the underlying secret
was still wrong on 2026-08-15 — an unremediated fault, four days running. What is
**not** established is that nobody read it: open issues and an uncorrected secret
do not measure readership, and in fact the alert has demonstrably been read, since
Cheek ordered the on-demand re-run recorded above. So the reconciliation question
is not "how do we measure drift", and not "why did nobody see the alert" — it is
"why has a seen, correctly-raised alarm gone four days without the secret edit
that would let it run". Point the next owner at infrastructure remediation, not
at notification plumbing — and note that the secret edit alone is necessary but
not sufficient, per defect 3 below.

### Two stacked defects — observations are `established fact`, remedies are not

Each defect below separates what the run output and the source actually show
from what is reasoned on top of it. The observations are `established fact`; the
proposed fixes are `inference` and are labelled as such.

**1. The workflow named "production" is pointed at the SANDBOX project.** The
verbatim `detail` in #912's last two comments names the host
`db.bzatgtgjvuojpoxcknaa.supabase.co`.
`scripts/lib/supabaseDatabaseTargetIdentity.mjs` pins `bzatgtgjvuojpoxcknaa` as
**`sandbox`** (line 11) and production as `knkwiiywfkbqznbxwqfh` (line 15). The
At the time of this 2026-08-15 snapshot, the `verdant-production` GitHub environment's
`SUPABASE_DB_URL` therefore held a sandbox connection string. **Historical, superseded current
state:** Cheek stated on 2026-08-26 that `verdant-production` has 0 secrets. This toolkit slice did
not re-probe either state. If the historical connection had succeeded, it would have measured the
wrong database and reported the result as production.

The reason nothing caught that: `scripts/probe-migration-drift.mjs` **does not
import `supabaseDatabaseTargetIdentity.mjs` at all** — verified by search, zero
references. It trusts the secret's name, and that module's own header states the
principle it is missing: _"A secret name is not proof of where its connection
string points."_

**Do not read that as "every other gate is protected" — it is not.** An earlier
draft of this section claimed exactly that and it is false, corrected here after
a Codex review challenged it. Measured 2026-08-15: **14** files reference the
identity module — the money/core migration gates
(`required-money-migrations.yml`, `required-core-migrations.yml`,
`prefix-diff-sarif.yml`) and the pinned-apply and candidate-number tooling —
while **25** scripts consume a `SUPABASE_DB_URL`. The binding discipline is
real, but it covers the money/schema gate family, not the repository.

A second unbound remote workflow, surfaced by that same review and verified
here: `.github/workflows/sandbox-credit-packs-smoke.yml` passes
`SUPABASE_DB_URL_SANDBOX` into `scripts/sandbox-credit-packs-smoke.ts`, whose
`psqlJson` pushes `process.env.SUPABASE_DB_URL` straight into the `psql` argv
with no identity check. Recorded so it is not lost — it carries the same
wrong-target class of risk, though its blast radius is smaller (a sandbox
credential, a read-only smoke). It is **not** part of any approved slice, and
nothing here authorizes changing it.

**2. The connection dies at the socket, on an IPv6 address.**

`established fact`, from the run output: the host resolved to
`2600:1f18:6f7d:e800:d9c0:aca3:3925:8f6`, the failure was `Network is
unreachable`, and the step took zero seconds. That is a routing failure before
any authentication or query, and it is all the run output proves.

`inference`, high confidence, but **not measured here**: GitHub-hosted runners
have no IPv6 egress and Supabase direct `db.<ref>.supabase.co` hosts are
IPv6-only, so the connection string needs the IPv4 Supavisor pooler host
(`aws-<n>-<region>.pooler.supabase.com`) — a form the identity module already
recognises and already knows how to bind to a pinned ref. Neither the
runner-egress claim nor the exact replacement host was verified from this repo;
whoever repoints the secret should take the host from the Supabase dashboard's
connection panel rather than from this paragraph.

**Judge the fix by the probe's status, never by the run colour.** The connection
is proven the moment the probe _completes a query_ — `status: "current"` (exit 0)
or `status: "drift"` (exit 1). Only `could_not_probe` (exit 2) means the
connection is still broken. This distinction is not pedantry here: this file
already records at least two unapplied migrations, so the first genuinely
successful run will very likely return `drift` and exit 1, and the workflow will
go **red**. An operator watching the tick rather than the payload would read that
red as "my secret fix did not work" and revert a change that in fact worked.

**The failure mode changed between 13 and 14 August**, which is itself evidence:
on 12–13 Aug the probe step was `skipped`, meaning `Require SUPABASE_DB_URL`
hard-failed on an absent secret; from 14 Aug that guard passes and the connection
fails instead. `inference`: someone added the secret in that window and supplied
the sandbox URL.

**3. Even connected, the probe's matching would misreport Lovable migrations.**

Raised by Codex review 2026-08-15 and verified here against source. This one is
independent of the secret: it is a defect in the probe itself, and it is why
"fix the secret and read the answer" is not the whole story.

`established fact`, from the code: `probe-migration-drift.mjs:106` selects only
`version` (`SELECT version FROM supabase_migrations.schema_migrations`), and
line 166 diffs it by exact string equality against the 14-digit timestamp
parsed off each filename.

`established fact`, from `docs/signup-attribution-outage-operator-runbook.md`
§"Ledger hazard": **Lovable records a migration under a version ~2 seconds later
than its filename timestamp, carrying the filename stem in the `name` column.**
The runbook's worked example is `20260721194325_f96507e6-…`, which sits in the
ledger as version `20260721194327`. Hand-authored migrations use the exact
timestamp with a slug name, so **both conventions coexist in one table**.

`established fact`, measured here: **157 of 268** migration files use the
Lovable UUID-suffixed convention. Whether every one of them is version-shifted
is `NOT_MEASURED` — the runbook proves the mechanism and one instance, not the
population.

The consequence: an exact-version diff reports an applied Lovable migration as
**unapplied**. That is a false DRIFT — noisy rather than dangerous, the opposite
polarity to the failure that caused the 2026-08-05 outage — but it makes the
reconciliation untrustworthy in both directions, because a reader who learns to
discount the false entries will discount a real one too.

The runbook already prescribes the fix and, importantly, forecloses the obvious
wrong one. Match by name, with no window: for a file `<ts>_<slug>.sql`, accept
`m.name = <stem>` (Lovable) **or** `m.name = <slug>` (hand-authored) **or**
`m.version = <ts>`. Do **not** widen the version comparison to a tolerance — the
runbook's Trap 2 shows this repo contains `20260806230020_…` and
`20260806230021_…` one second apart, so a window would report an _unapplied_
migration as applied. That is the worse error, and it is the exact shape of the
2026-08-05 blind spot.

### What this does and does not license

**Defects 1 and 2 are owner-only.** Rotating a GitHub environment secret and
reading a production connection string are outside every agent role in this
repo, and the credential must never enter an agent session. No agent should
attempt them.

**Defect 3 is repo-side and an agent could fix it** — it needs no credential and
is provable on fixtures. Two scoped candidate changes now exist, both **not
approved**, recorded so they are not lost and not mistaken for work in progress:

- **C1 — name-bound matching.** Select `name` alongside `version` and match by
  stem-or-slug-or-version per the runbook, with no tolerance window. Testable
  offline against both conventions, including the `20260806230020` /
  `20260806230021` adjacent pair as the regression that pins Trap 2 shut.
- **C2 — target-identity assertion.** Import `supabaseDatabaseTargetIdentity.mjs`
  in the probe so a sandbox URL supplied to the production environment fails
  loudly as a mismatch instead of being measured and reported as production.

Sequencing matters if both are taken: **C1 before the secret is corrected.** If
the secret is fixed first, the probe's first successful run publishes a large
false-drift list into #912, and the most likely human response to an alarm that
cries wolf on its debut is to stop reading it — which is how this whole section
started. C2 is independent and can land either side.

Until **both** the secret is corrected and the probe's matching is name-bound,
the **applied-migration ledger** is `NOT_MEASURED` — and so is any claim whose
only evidence would have come from this probe, which means every statement of
the form "migration X is/is not live in production" that is not backed by a
direct observation. Note the second condition: a _completed_ probe run from the
current code — whatever colour the workflow tick ends up — would be measuring the
wrong thing, because its unapplied list would be inflated by every
Lovable-recorded migration it failed to match.

That is deliberately narrower than "every production-schema statement in this
file". It does **not** downgrade the independent evidence recorded above: the
Lovable read-only investigation observed `public.quicklog_entry_revisions`
absent and `diary_entries.retracted_at` / `.retraction_reason` absent by direct
object lookup, and those keep their own labels. A blocked ledger check and a
directly-observed missing table are different findings, and flattening both to
`NOT_MEASURED` would erase a verified defect rather than preserve caution.

### 2026-08-19 production re-measure — the Quick Log manual-save drift has CLOSED

`established fact`, measured 2026-08-19 by Claude through the same Lovable
read-only SQL channel as the 2026-08-15 investigation (verdantgrowdiary-com
project; target identity by fingerprint: founder account present, full app
schema — `inference, high confidence` that this is `knkwiiywfkbqznbxwqfh`,
since the channel does not expose the raw ref):

- `public.quicklog_entry_revisions` is now **PRESENT** and
  `diary_entries.retracted_at` is now **PRESENT** — superseding the
  2026-08-15/16 absence findings above for these objects. An operator apply
  (Lovable-side) happened between 2026-08-16 and 2026-08-19.
- The Quick Log manual-save catalog matches the 20260818010000 forward-repair
  **end-state exactly**: wrapper `quicklog_save_manual` (12-arg, src md5
  `0d3098b8…`, EXECUTE authenticated + service_role, not anon/PUBLIC); private
  delegate `quicklog_save_manual_pre_logged_at` repaired body (md5
  `7ec296e4…`); all four parse/stamp helpers exact; **all five private
  helpers EXECUTE = postgres only**; both `logged_at` stamp triggers live.
- A **rolled-back** end-to-end probe of `quicklog_save_manual` as the founder
  (BEGIN…ROLLBACK, zero committed writes) passed every axis: watering child
  row, exact backdated `occurred_at`, independent Captured `logged_at`, diary
  mirror linked via `details.linked_grow_event_id` with column AND
  `details.logged_at` parity, `entry_at = occurred_at`, stage persisted.
  Failure paths also verified: malformed `details.logged_at` →
  `{ok:false, reason:"invalid_logged_at"}`; `quicklog_try_parse_uuid` as
  authenticated → SQLSTATE 42501.
- Manual grow_events rows predating the apply carry backfilled
  `logged_at = created_at` (expected foundation-migration semantics), and no
  post-apply manual save existed yet at measurement time.
- The protected GitHub apply workflow
  (`apply-quicklog-manual-delegate-forward-repair.yml`) ran once —
  2026-08-19T06:17Z, dispatched by Cheek — and **failed at "Require the
  protected production database secret"** before any database access. The
  apply that actually landed was therefore Lovable-side, not workflow-side.
  The workflow secret remains an owner-only gap.
- The ledger remains mixed-convention: of the quicklog-window versions, only
  `20260811090000` (name `2c5c4adb-…`) matched a direct version/name query.
  Object presence stays the ground truth; the drift-probe caveats above are
  unchanged.
- Sandbox `bzatgtgjvuojpoxcknaa` is **far behind**: only a legacy 10-arg
  `quicklog_save_manual` exists there — no delegate, no helpers, no
  `logged_at` columns. Do not use sandbox to reason about production Quick
  Log behavior.

Five red runs — the four scheduled plus the 2026-08-15 dispatch — are five
absent measurements, `NOT_MEASURED` in the literal sense this repo's status
vocabulary requires, since not one of them completed a query. But they are not
**merely** that. They are also four days (12–15 August) in which the mechanism
built to catch an invisible outage was itself unable to see, and was left that
way.

### 2026-08-20 (superseded same day) — the forward repair was BLOCKED by a third unapplied migration

> **Superseded by the resolution block below.** The diagnosis here is
> accurate and worth keeping — it is how the third unapplied migration was
> found — but the `BLOCKED` verdict at the end of this block no longer
> describes production. Both migrations were applied later the same day.

`established fact`, measured 2026-08-20 21:58–22:08 UTC by Claude through the
Lovable read-only SQL channel against production (target fingerprint: 92 public
tables, 20 `auth.users`, 64 `action_queue` rows, 143 `action_queue_events` rows,
`quicklog_entry_revisions` PRESENT). Cheek authorized the apply of
`supabase/migrations/20260819190852_action_queue_transition_forward_repair.sql`
in session with the exact phrase `APPLY ACTION QUEUE TRANSITION FORWARD REPAIR`.

**The apply was attempted and it fail-closed. Zero bytes were written.** The
migration aborted inside its own preflight at
`action_queue_transition_forward_repair_guard_drift`, and the whole transaction
rolled back. Verified _after_ the abort: `action_queue` still carries 4 policies
under the same names, `action_queue_events` still 3, row counts still 64/143,
all four `authenticated` UPDATE/DELETE grants still `true`, the guard body md5
unchanged, and `public.action_queue_transition` still absent. There is nothing
to undo by hand. The migration's guards worked exactly as designed.

**The 20 `v_legacy_state` conjuncts are `PASS` — do not re-derive them.**
Re-measured fresh on 2026-08-20 (not carried forward from the 2026-08-19 read),
each computed exactly as the preflight computes it: transition overloads `0`;
`action_queue` 4 policies (select 1, insert 1 fp `02cf2857…`, update 1 using
`b3c61a20…` / check `02cf2857…`, delete 1); `action_queue_events` 3 policies
(select 1, legacy insert 1 fp `e79ba22f…`, append 0, delete 1); required grants
coherent; all four `authenticated` UPDATE/DELETE grants present. `v_legacy_state
= true`. The preflight's _state_ gate would have accepted the repair.

**The blocker is a different and earlier gate.** The guard-drift `IF` runs
_before_ the legacy/contracted evaluation, and no earlier evidence covered it.
Production's `public.action_queue_guard_decision_fields` is an **older revision**
than the forward repair requires, on five independent axes:

| Axis                        | Forward repair expects                           | Production has                     |
| --------------------------- | ------------------------------------------------ | ---------------------------------- |
| `proconfig`                 | `search_path=public, pg_temp`                    | `search_path=public`               |
| `prosrc` length             | 1101                                             | 1028                               |
| `prosrc` md5                | `88e81c4dfbc6d17260def35d1a619ee1`               | `09459a9cc8532aae905639b3055c680f` |
| trigger `UPDATE OF` columns | `approved_at, completed_at, rejected_at, status` | `approved_at, rejected_at, status` |
| EXECUTE ACL                 | `postgres` only                                  | `postgres` **and** `service_role`  |

**`supabase/migrations/20260725093000_restore_action_queue_owner_decisions.sql`
was never applied to production.** Hash-proven, not inferred: the guard body
committed in `20260721225930_b34caa3e-…` hashes to exactly production's
`09459a9cc8532aae905639b3055c680f` at 1028 bytes, and the body committed in
`20260725093000` hashes to exactly the expected
`88e81c4dfbc6d17260def35d1a619ee1` at 1101 bytes. Production is running the
older file. That is a **third** confirmed instance of this section's parent
finding, alongside the signup forward repair and the (since-applied) Quick Log
pair — and it was found by object comparison, not by the drift probe, which
remains blocked.

**Applying `20260725093000` alone will NOT unblock the forward repair.**
`established fact`: no committed migration anywhere in `supabase/migrations/`
revokes `service_role` EXECUTE on the guard — `20260721225930` and
`20260725093000` revoke only `FROM PUBLIC`, and `20260804091142_da8cef1f-…`
revokes only `FROM anon, authenticated`. `inference, high confidence`: because
`CREATE OR REPLACE FUNCTION` preserves an existing function's ownership and
permissions, replaying `20260725093000` would correct the body, `search_path`
and trigger columns but leave `service_role|EXECUTE|f|postgres` in the ACL, so
the preflight would abort at the same check. A second, additive forward
migration performing that revoke is required. Note the forward repair _does_
explicitly revoke `service_role` on `action_queue_transition` — the omission is
specific to the guard, so this reads as a gap rather than a deliberate posture.

Nothing here licenses an agent to make either change. Both are production
security edits outside any approved slice; the merged migration is immutable
under the Migration Immutability Rules; and the sanctioned path remains the
#1044 protected PREFLIGHT/APPLY lane, which is owner-only by construction
(founder dispatcher identity, branch pin, `verdant-production-solo-founder`
environment approval, and owner-only secrets).

Status of the Action Queue transition contract in production at the time of this
block: **`BLOCKED`**, not `FAIL` — resolved later the same day, see below.

### 2026-08-20 resolution — both migrations APPLIED, the live gap is CLOSED

`established fact`, measured 2026-08-20 23:21–23:30 UTC by Claude through the
Lovable SQL channel against production. Cheek authorized the full sequence in
session. Each migration was transmitted inside an md5 guard that verified the
body at the database **before** executing a byte, so the applied text is
hash-verified rather than assumed.

**Order matters and was followed:** `20260819190000` first, then
`20260819190852`. The first migration's postflight is deliberately the second's
guard-drift predicate.

`supabase/migrations/20260819190000_action_queue_guard_decision_fields_forward_repair.sql`
— applied (body md5 `a635a88a…`, 12,966 chars). It moved the guard from the
`20260721225930` revision to the `20260725093000` one and closed the
`service_role` ACL gap no committed migration had ever closed. All five drift
axes verified after:

| Axis                   | Before                     | After                                            |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| `prosrc`               | 1028 / `09459a9c…`         | 1101 / `88e81c4d…`                               |
| `proconfig`            | `search_path=public`       | `search_path=public, pg_temp`                    |
| trigger `UPDATE OF`    | no `completed_at`          | `approved_at, completed_at, rejected_at, status` |
| EXECUTE ACL            | `{postgres, service_role}` | `{postgres}`                                     |
| `service_role` EXECUTE | true                       | false                                            |

`supabase/migrations/20260819190852_action_queue_transition_forward_repair.sql`
— applied (body md5 `7501f35d…`, 46,252 chars) and passed its own postflight.
Contracted end-state verified independently:

- `public.action_queue_transition` present, 1 overload, 4997 bytes, src md5
  `ce755f8e6a6515640a2f86c15de3ba63`, ACL exactly
  `{authenticated|EXECUTE, postgres|EXECUTE}` — no `anon`, no `service_role`.
- `action_queue` 2 policies (SELECT + INSERT fp `e08f43c1…`); the legacy UPDATE
  and DELETE policies are gone.
- `action_queue_events` 2 policies (SELECT + append fp `420914cd…`).
- **`authenticated` UPDATE and DELETE are now `false` on BOTH tables.** This is
  the gap that had been open and measured since this file first recorded it.
- Required grants preserved: `authenticated` retains SELECT and INSERT on both.
- Row counts unchanged throughout: `action_queue` 64, `action_queue_events` 143.

**A rolled-back end-to-end probe proved the grower path still works** (BEGIN …
ROLLBACK, zero committed writes, confirmed afterwards: the probed row is back to
`pending_approval` with `approved_at` NULL, its event count back to 1, the
probe's `event_id` absent, totals still 64/143):

- a direct `UPDATE public.action_queue` by the row's own owner as
  `authenticated` → **refused, SQLSTATE 42501**;
- `public.action_queue_transition(id, 'approve', 'pending_approval')` as that
  same owner → `{"ok": true, …}`, status `pending_approval -> approved`, audit
  events for that action `1 -> 2`.

So the approval-required posture is intact and stronger: growers can no longer
write lifecycle fields directly, and the only path that changes a status also
writes its audit event atomically.

**What this does NOT change.** The apply went through the Lovable channel, not
the #1044 protected PREFLIGHT/APPLY lane, which remains owner-only by
construction and unused — its `SUPABASE_DB_URL` secret gap is still open. No
`supabase_migrations.schema_migrations` ledger row was inserted for either
version, so the ledger still under-reports what is live; object presence remains
the ground truth here, and the drift probe remains blocked (see the defects
above). **Superseded 2026-08-21:** the signup-attribution forward repair
`20260813030000` is **APPLIED** (see the RESOLVED signup section). This Action
Queue session did not touch it; a later same-day Lovable apply closed the
42P01 outage. **Hard stop:** do **not** GitHub-APPLY
`20260813030000_signup_acquisition_forward_repair.sql` — that file would
re-issue an unguarded `handle_new_user` and overwrite the live `RAISE LOG`
guard from `20260821150000_signup_acquisition_failure_safe_attribution.sql`.

---

## Branch topology

| Branch               | Role                                             | Verified head                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | **READ THE 2026-08-25 19:48 UTC RE-MEASURE BLOCK NEAR THE TOP FIRST — it supersedes this row. Tip is `2e7002b69`; production serves `e8f4e7c2fe05`, which is NOT a GitHub commit, so publish lag is NOT COMPUTABLE and every lag figure in this row is void.** Prior row text follows: **`a3ae36765` (#1105), verified 2026-08-23 02:09 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 2026-08-22 16:16 UTC, so publish lag is now **`12`** and has widened seven times by the tip advancing, never by a republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `8181f5a60` (#1107), verified 2026-08-23 00:02 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 2026-08-22 16:16 UTC, so publish lag is now **`11`** and has widened six times by the tip advancing, never by a republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `70ba566cdb11` (#1092), verified 2026-08-22 18:22 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 16:16 UTC, so publish lag is now **`10`** and has widened five times today by the tip advancing, not by any republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `8e6750e87aff` (#1101), verified 2026-08-22 17:32 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 16:16 UTC, so publish lag is now **`8`** and has widened three times today by the tip advancing, not by any republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `fd2d3e3f7553` (#1100), verified 2026-08-22 17:09 UTC by direct fetch. Live production was re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged from the 16:16 UTC reading, so publish lag widened from `6` to **`7`** purely by the tip advancing, not by a republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `93d8ea23ff58` (#1097), verified 2026-08-22 16:16 UTC by direct fetch. Live production was re-fetched in the same window and now serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `commitTime 2026-08-21T20:43:26Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`), confirmed an ancestor of this tip — publish lag is `6` first-parent commits (#1095, #1096, #1098, #1091, #1099, then #1097). Production has republished since the 2026-08-21 readings; the previously-live `ea31fbdfb934` is historical. Every prior caution stands: this row moved three times inside one hour on 2026-08-21 and has moved again overnight. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `faea6e9c59ad` (#1087), verified 2026-08-21 21:05 UTC by direct fetch. Live production was re-fetched in the same window and still serves `ea31fbdfb934` (`buildTime 2026-08-21T15:53:46.096Z`, `dirty: true`, `ref: "__orphan__"`), confirmed an ancestor of this tip — publish lag is `2` first-parent commits (#1090, then #1087). This row moved three times inside one hour: `ea31fbdfb934`/lag `0` at 16:15Z, `9133a4c45b7f`/lag `1` at 20:43Z, this at 21:05Z. Each was correct when taken. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `ea31fbdfb934` (#1086), verified 2026-08-21 **16:15 UTC** by direct fetch. **Live production was fetched at the same moment and serves `ea31fbdfb934` too — publish lag was `0` first-parent commits at that reading, the first 0 recorded here.** Production republished at least four times on 2026-08-21; treat any lag figure as perishable and re-measure. Superseded, in order: `5a13d0b47cb7` (#1089, live 15:39:34Z), `39935889fe02` (#1080, live 15:23 UTC), `999b6da93` (#1077), `ac973ed9f` (#1074), `9b6445653` (#1042). Prior text for this row follows: `999b6da93` (#1077), verified 2026-08-21 ~15:23 UTC with `git fetch origin verdant-grow-diary && git rev-parse origin/verdant-grow-diary`. Supersedes `39935889f` (#1080) as tip and earlier buffers (`ac973ed9f` / #1074, `9b6445653` / #1042). **Live production WAS re-fetched at this verification** and serves `39935889fe02` (#1080), confirmed an ancestor of this tip (`git merge-base --is-ancestor`) — publish lags git by **1** first-parent commit (the #1077 docs-only CURRENT_STATE refresh). That lag figure is perishable: it read "four" on 2026-08-20, \*\*17\*\* / \*\*2\*\* earlier on 2026-08-21 under #1077's 12:57 UTC pin of live `1400a7e77eff`, and \*\*1\*\* now with live on `39935889fe02`. Re-measure it; never carry it forward. The 2026-08-18 note that a `/version.json` fetch from an agent session is `BLOCKED` (network policy 403) was session-specific and does not hold generally — see `docs/agent-session-network-reachability.md`. Merging is not a publish. PR numbers on this branch do not order by merge time — order commits with `git log`, never by PR number. Do not carry older validation tables forward. Older buffers showing live `1400a7e77eff`, tip `39935889f`, `9b6445653` (#1042), `87ae05e5b` (#1026), `3f2bfe2db` (#1021) or `1c094a2a3` (#970) are earlier snapshots; discard them |
| `main`               | Integration branch. It is not production parity. | `b6d747941948ce68157185a2b0847acea6970d44` (#779), verified 2026-08-07                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

`main` and `verdant-grow-diary` are divergent. Do not infer production behavior from
`main`, and do not backport deploy-only governance or data rules without a scoped branch
integration task.

The deploy-branch governance integration is complete in PR #626, and reconciliation PR
#635 is merged. The bounded Mode A readiness-evidence PR
[PR #679](https://github.com/Verdant-OS/verdant-grow-diary/pull/679)
(`codex/seo-readiness-evidence-20260802`) merged 2026-08-02 as `bff64896679d`. It
changed readiness evidence, artifacts, and tests only; it is **not** deployment evidence.

---

## DIRTY PR conflict reconciliation (recorded 2026-08-13)

Owner-posted `CONFLICT_RECONCILIATION` comments on four then-open DIRTY PRs.
No rebases, merges, or closes happened in that comment pass. [#933](https://github.com/Verdant-OS/verdant-grow-diary/pull/933)
was already closed as superseded. This is an ownership/serialisation
signal (`docs/agents/merge-queue.md`: empty queue + high `DIRTY` count), not
queue latency. Branch-name authorship is not a role assignment. At the time
those comments were posted, the agents table still framed Grok as research-
delivery on `ONE_TENT_LOOP_OPERATING_ORDER`; as of 2026-08-20 (refined) Grok is
**Product Intelligence, Adversarial Audit, and Implementation Lead** — peer with
Claude/Codex, no role rank (see Agents table and
`docs/agents/grok-peer-elevation-map-2026-08-20.md`). The comments handed a
recommended rebase path to whoever next owned each branch.

**Outcomes since recording (verified 2026-08-15 with `gh pr view`):**
#710 merged 2026-08-14 as `1a3a70d1b`. #936 closed 2026-08-13 without merge;
its credit-gate work landed as [#971](https://github.com/Verdant-OS/verdant-grow-diary/pull/971)
(`claude/alert-doctor-credit-gate-v2`, merged 2026-08-13). #913, #817, and #699
were still OPEN at this verification. #933 remains CLOSED (superseded).

Locked rule still in force:

```text
Same complete intent already on base → CLOSE SUPERSEDED
Never hybrid-patch only to become mergeable
Never reuse green checks from pre-resolution SHA
```

| PR                                                                | State  | Disposition      | Head                                    | Unique surviving work (from the comment)                                                                                                                                                                                                                    | Comment                                                                                      |
| ----------------------------------------------------------------- | ------ | ---------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [#913](https://github.com/Verdant-OS/verdant-grow-diary/pull/913) | OPEN   | REBASE           | `grok/seo-public-surface-docs-20260812` | Live-host evidence that `vercel.json` public-alias redirects are not firing in production (HTTP 200 soft shells) plus `docs/seo/vercel-host-redirect-fix-steps.md`. Drop the duplicate Ahrefs / `/` vs `/welcome` material already shipped via #914 / #949  | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/913#issuecomment-5285119408) |
| [#817](https://github.com/Verdant-OS/verdant-grow-diary/pull/817) | OPEN   | REBASE           | `grok/tent-alert-history-pro`           | `TentAlertHistoryPanel` and history helpers. Keep base's `isActive` / `openCount` / `activeCount` and the Doctor / Blueprint CTAs from #816 / #888 / #928                                                                                                   | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/817#issuecomment-5285121690) |
| [#710](https://github.com/Verdant-OS/verdant-grow-diary/pull/710) | MERGED | REBASE completed | `claude/docs-cheek-approval-workflow`   | Landed 2026-08-14 as `1a3a70d1b`. Added `docs/agents/cheek-approval-workflow.md`; Sentinel-Version moved to 2026-08-09.3                                                                                                                                    | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/710#issuecomment-5285129001) |
| [#699](https://github.com/Verdant-OS/verdant-grow-diary/pull/699) | OPEN   | REBASE           | `chore/adopt-biome-lint`                | Tooling swap only (`package.json` / `biome.json` / lint-staged). Drop the 327-commit-stale format commit; regenerate after rebase; hand-reconcile `src/test/helpers/reactRouterCompat.vitest.tsx`; add a Biome ignore for `supabase/functions/mcp/index.ts` | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/699#issuecomment-5285131401) |
| [#933](https://github.com/Verdant-OS/verdant-grow-diary/pull/933) | CLOSED | CLOSE_SUPERSEDED | `claude/strange-keller-036221`          | Complete intent already shipped as #930 (`ai_doctor_cta_clicked`). Closing avoids two competing funnel events on the same click                                                                                                                             | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/933#issuecomment-5285025091) |

Follow-up outcome: [#936](https://github.com/Verdant-OS/verdant-grow-diary/pull/936)
(`claude/alert-doctor-credit-gate`) closed 2026-08-13 without merge. The
credit-gate work landed as [#971](https://github.com/Verdant-OS/verdant-grow-diary/pull/971)
from `claude/alert-doctor-credit-gate-v2`.

Do not unilaterally close the remaining REBASE PRs (#913, #817, #699), and do
not land a hybrid patch on any of them solely to clear `DIRTY`.

---

## Production status

Analytics axes verified directly on 2026-08-02. Release identity and build time
were re-measured **2026-08-21 ~15:23 UTC** over live HTTPS (Grok). Sitemap and
the six previously-unsitemapped indexable routes keep their 2026-08-21T12:57 UTC
(#1077) readings — not re-opened this turn. Public root and robots.txt keep
their 2026-08-20 dates; GA4 lighting / singleton rows keep their 2026-08-02 dates.
**Latest release measurement is 2026-08-23 02:09 UTC** for tip and lag only
(tip `a3ae36765` / #1105; live `faea6e9c59ad` / #1087; lag **`12`**). The served
commit, build time, provenance flags and payments-bundle rows keep their **16:16 UTC**
readings — production has not republished between the two, and only the tip moved. That
16:16 UTC pass superseded the 2026-08-21 21:05 UTC and 16:15 UTC readings. Rows not
named keep their own earlier dates.
Each row carries its own verification date:

| Axis                                        | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200, **re-verified first-hand 2026-08-22 17:09 UTC** (and at 16:16 UTC the same day). This row previously carried a 2026-08-21 date while rows beside it quoted 2026-08-22 readings fetched from this same endpoint — an internal contradiction in a file that promises each row carries its own date. Prior text: re-verified 2026-08-21 **16:15 UTC**, superseding the ~15:23 UTC reading. The 2026-08-18 `BLOCKED` (network policy 403) was a property of that session, not of this endpoint — re-test rather than carrying it forward                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Production commit                           | **SUPERSEDED — see the 2026-08-25 19:48 UTC re-measure block near the top. Production serves `e8f4e7c2fe05` (`buildTime 2026-08-25T18:05:30.499Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash bcb08cd3ae1a`), a commit the GitHub remote refuses as `not our ref`.** Prior row text follows: Identity `PASS`, provenance **not** `PASS` — **re-measured first-hand 2026-08-22 16:16 UTC.** Production serves `faea6e9c59adf42a3028a2f0d9eba2b8ac2ef688` / `faea6e9c59ad` (#1087), `buildTime 2026-08-21T20:51:46.584Z`, `commitTime 2026-08-21T20:43:26Z`, **`dirty: true`**, `ref: "__orphan__"`, `ciRunId: null`, `commitSource: "git"`, `treeHash` short `7d9cc8a12898`, `version: "0.0.0+20260821.faea6e9c59ad-dirty"`. **This is the post-#1090 build the record said to watch for, and the mismatch PERSISTS:** `faea6e9c59ad` contains #1090 (verified by `git merge-base --is-ancestor`), and recomputing its tree with `scripts/lib/tree-hash.mjs` over a clean worktree gives `436eede41e4b` (5,856 files) against the stamped `7d9cc8a12898`. **Per the one-directional rule recorded below, persistence does NOT refute the #1090 candidate** — a workspace already dirtied by an earlier cycle stays dirty until something resets it — and it does not confirm it either. It returns the question to the owner-gated publisher's build log. That makes **five** OBSERVED publishes measured, all five mismatching, all five `dirty: true`. Still not a proven-consecutive run: whether other publishes fell between any two readings is `NOT_MEASURED`. **The `TREE_HASH_ROOTS` bound is UNCHANGED.** An earlier version of this row said it "is now narrower than it was" on the strength of the payments-token finding; that inference was **withdrawn 2026-08-22** after a review P2 — a platform env var overrides `.env.production` without altering the file, so it need not have drifted in the workspace and need not have contributed to this mismatch. Whether the workspace drift behind `treeHash` reached shipped bytes stays `NOT_MEASURED`. See the withdrawal in the payments-token section below. Do not upgrade provenance to `PASS`. Supersedes the 16:15 UTC pin `ea31fbdfb934` and every earlier same-day pin. Prior row text follows: re-measured first-hand 2026-08-21 16:15 UTC. Production serves `ea31fbdfb934b5a4e70b882dc62465b73c4a5f72` / `ea31fbdfb934` (#1086), `buildTime 2026-08-21T15:53:46.096Z`, `commitTime 2026-08-21T15:29:03Z`, **`dirty: true`**, `ref: "__orphan__"`, `ciRunId: null`, `treeHash` short `831bd3b4f230`, `version: "0.0.0+20260821.ea31fbdfb934-dirty"`. **Provenance is now measured, not merely flagged, across four OBSERVED publishes — and all four mismatch.** They are four point-in-time `/version.json` readings, **not** a proven-consecutive run: whether other publishes fell between them is `NOT_MEASURED` without the publisher's history, and production republished repeatedly inside one hour. Recomputing each published commit's tree with `scripts/lib/tree-hash.mjs` against what the build stamped: `4b1c4867e685` stamped `8773f6b2c0ed` vs `1f0eb7b4e6cd`; `39935889fe02` stamped `1fe0606c134a` vs `8e117dc65711`; `5a13d0b47cb7` stamped `1fe0606c134a` vs `8e117dc65711`; `ea31fbdfb934` stamped `831bd3b4f230` vs `2cee190ff72b`. Note the middle pair differ only in `docs/agents/CURRENT_STATE.md` — outside `TREE_HASH_ROOTS` — and recompute identically, which is the mechanism working correctly. **The bound: `TREE_HASH_ROOTS` covers inputs that never ship, so this establishes build-workspace drift at stamp time; whether any shipped byte differs stays `NOT_MEASURED`.** Do not upgrade provenance to `PASS`. Supersedes the ~15:23 UTC pin `39935889fe02` and the earlier `1400a7e77eff` / `92a983b4832e`. Prior row text follows: re-measured 2026-08-21 ~15:23 UTC. Production serves real SHA `39935889fe022efd441dc5ab86bfbf636d284739` / short `39935889fe02` (#1080 merge), with `commitSource: "git"`, `treeHash: 1fe0606c134a0b8aa3887d17b966ef0b95e9876d72ee987ad8a601b42d1ef346`, **`dirty: true`**, `ref: "__orphan__"`, `ciRunId: null`, `version: "0.0.0+20260821.39935889fe02-dirty"`. Record identity and provenance separately: identity is the #1080 SHA; provenance flags stay as measured — do **not** upgrade provenance to `PASS`. Cause of dirty/orphan remains `NOT_MEASURED`. Note for whoever checks this next: `treeHash` is Verdant's SHA-256 over the allowlisted `TREE_HASH_ROOTS` manifest (`scripts/lib/tree-hash.mjs`), **not** a Git tree object ID. Do not "confirm" a mismatch by diffing it against `git rev-parse <commit>^{tree}` — those are different hash functions over different inputs and never match, on healthy builds included (#1077 already removed that false corroboration). Supersedes the earlier same-day #1077 pin `1400a7e77eff` (#1083) and the still-earlier `92a983b4832e` (#1061). Publish lags git — see the branch topology row. Single observations remain point-in-time |
| Production build time                       | **`2026-08-21T20:51:46.584Z`** (fetched first-hand 2026-08-22 16:16 UTC, commit `faea6e9c59ad`). Note the shape: a build stamped 2026-08-21 evening was still the served build ~20 hours later, so the republish cadence that churned this row four times inside 2026-08-21 did **not** continue overnight. Do not read that as stability — re-measure. Prior row text follows: `2026-08-21T15:53:46.096Z` (fetched first-hand 16:15 UTC, commit `ea31fbdfb934`). Prior live stamps `2026-08-21T15:39:34.211Z` (`5a13d0b47cb7`) and `2026-08-21T12:53:03.024Z` (`39935889fe02`) are historical. Prior row text follows: `2026-08-21T12:53:03.024Z` (from the same ~15:23 UTC `/version.json`; the served commit was authored `2026-08-21T07:51:31-05:00`). Prior live stamps `2026-08-21T12:11:38.661Z` (`1400a7e77eff`), `2026-08-21T00:59:52.370Z` (`92a983b4832e`), `2026-08-21T00:27:10.316Z` and `2026-08-20T18:49:50.600Z` are historical. Production republished multiple times inside 2026-08-21 — treat any single reading here as perishable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Public sitemap                              | `PASS` — HTTP 200, **61** `<loc>` entries live (re-count 2026-08-21). **Live and in-repo now agree**: the 2026-08-20 adjudication published, moving live from 56 → 61. The earlier note that a 56 reading was "expected, not a regression" is spent — from 2026-08-21 a 56 reading would be a real regression                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Public root route `/`                       | `PASS` — re-measured 2026-08-20. HTTP 200; `<h1>` “See what changed. Decide what to do next.”; `<link rel="canonical" href="https://verdantgrowdiary.com/"/>`; `<meta name="robots" content="index, follow">`; one JSON-LD block; no loading skeleton. Visible body words measured **845–1034** depending on tokenization — the 2026-08-15 figure of 1141 recorded no method, so the two are **not comparable and this is not evidence of content loss**. `www.` host `302`s to the apex. Slice 2 (`/welcome` → `/` consolidation) remains unapproved — see blocker 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Indexable routes outside the sitemap        | `PASS` — **resolved live**, re-measured 2026-08-21. Was `FAIL` while the fix sat unpublished. Five of the six are now advertised in the live `sitemap.xml` (`/glossary`, `/docs/mcp-api`, `/pheno-expression-showcase`, `/pheno-comparison`, `/creator-beta`), each self-canonical. `/breeder-beta` is correctly absent **by design**: it serves `<link rel="canonical" href="https://verdantgrowdiary.com/creator-beta">` and stays `index, follow`, so advertising it would push a URL that disclaims itself. Verified live, not inferred from the merge — the cross-canonical survived hydration, which was the silent failure mode. Closes blocker 8’s sibling item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| robots.txt                                  | `PASS` — re-measured 2026-08-20: HTTP 200, declares `Sitemap: https://verdantgrowdiary.com/sitemap.xml`, and carries no global `Disallow: /`. Authenticated surfaces (`/dashboard`, `/tents`, `/plants`, `/sensors`, `/timeline`, `/doctor`, `/actions`, `/auth`, …) are disallowed as intended; neither lighting route is disallowed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Lighting route technical SEO                | `PASS` — two HTTP 200 routes; page metadata and route-scoped JSON-LD verified (not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GA4 explicit lighting-page identity         | `PASS` — nine exact intercepted SPA page-view events; no test traffic transmitted (2026-08-02; not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GA4 page-view singleton contract            | `FAIL` — five automatic tag-generated events observed beside explicit application events (2026-08-02; not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GA4 authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GSC authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Measurement Day 0                           | `UNSET`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Four-week measurement clock                 | `NOT_STARTED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline.

### 2026-08-20 — a DNS false negative, and the reachability rule it produced

`established fact`, measured 2026-08-20: an agent reported this domain **offline and
not indexed** on the strength of a single `socket.gethostbyname` failure raised inside
a code-execution sandbox, and recommended repointing production DNS on that basis.
Every axis in the table above was re-measured the same day. The site was live
throughout, serving a build published hours earlier.

The error string is the tell. It was `EAI_AGAIN` (_Temporary failure in name
resolution_) — **the resolver did not answer**. It is not `NXDOMAIN`, which is what an
unregistered or unpointed domain returns. To a caller that only checks whether the call
threw, the two are indistinguishable, and they mean opposite things: one measures the
session, the other measures the domain. Acting on the wrong one would have applied DNS
surgery to working DNS.

Two durable consequences:

- **A resolver or socket error is `BLOCKED`, never `FAIL`.** It licenses no claim about
  deployment, DNS, or indexing. Only an HTTP response that was actually read is a
  measurement of the site.
- **`BLOCKED` is per-session, not a property of the target.** The `/version.json` fetch
  recorded `BLOCKED` (network policy 403) on 2026-08-18 returned `200` on 2026-08-20
  from a different session. Re-test before carrying a `BLOCKED` forward.

Procedure, the control-host pairing that separates the two cases, and the
output-reading traps (the proxy's `127.0.0.1` is not the origin IP; the landing HTML
carries NUL bytes that silence `grep`) are in
`docs/agent-session-network-reachability.md`.

**Indexation itself remains unmeasured.** Two pages surface in a third-party web index
with correct titles — a `practical observation` sufficient to refute "not indexed", and
nothing more. The Ahrefs endpoints that would measure it returned `Insufficient plan`,
and the GA4/GSC authenticated baselines stay `BLOCKED` (blockers 2 and 3). No
impression, click, position, or CTR claim is authorized by this section.

---

## Latest deploy-head validation

Validation evidence for deploy commit `5611b130e81a` (2026-08-05 replay-repair
slice, PRs #724/#726) is archived verbatim — see `CURRENT_STATE_ARCHIVE.md`. By
its own terms that evidence is tied to that commit and must not be carried
forward. Still-live takeaways: the full enabled Security DB Local run
`31021835479` remains the replay-repair proof point, and the two failing
schema/migration guards (`Required core schema present`, `Required
money-critical migrations present`) were `FAIL` there and remain an unresolved,
separately scoped follow-up (see blocker 5 below).

---

## Current approved slices

**Approved slice (Cheek, 2026-08-15, in-session implement instruction):**
`ONE_TENT_LOOP_OPERATING_ORDER`. Plan: walk the existing nine-step loop
without dual write paths, dead next-step CTAs, or fabricated proof.
Grok delivered the repo slices (handoff ids, PlantQuickLog →
`quicklog_save_manual`, smoke-audit alignment). This does **not** pause
the Convex or Postgres spikes below. Owner-only gate remaining `BLOCKED`: a
managed `e2e:one-tent:ui` session. The Lovable-apply of
`20260813030000_signup_acquisition_forward_repair.sql` is **done** (RESOLVED
2026-08-21); **do not** GitHub-APPLY that file — it would clobber the live
`RAISE LOG` guard from `20260821150000`. Slice 5 recorded the honest
`missing_session_json` receipt rather than fabricating a walk. Colliding
PRs **#828**, **#817**, and **#696** all closed unmerged on 2026-08-15 within a
54-minute window (verified 2026-08-21 by direct PR read). The fence they carried
stands on its own: do not start a competing Timeline / Alerts / Action Queue UI
rewrite. Baseline and
post-change receipts: `docs/one-tent-loop-operating-order-baseline.md`.
Persist-path spec: `docs/specs/one-tent-loop-quicklog-single-write-path.md`.

**Tranche A approved (Cheek, 2026-08-19, "approved by all"):** first
implementation slice of the One-Tent Loop Efficiency Program, scoped as an
extension of this operating-order slice (the parked-PR / no-competing-rewrite
instruction above still stands). Scope: five independent wiring PRs — mobile
FAB plant scoping on `/plants/:id`; grow-scope threading in
`oneTentLoopNavigationRules.ts`'s back half plus the tent-step self-link fix;
plant/tent names instead of raw UUIDs on Action Queue rows/drawer and
Alert/Action detail; five trust fixes (incl. Sensors source-summary `staleMs`
and honest Stale/Invalid labels); post-save freshness parity, Alerts URL
filters, and a single `verdant:entry-created` dispatch. No schema, no new
routes, no new Quick Log write paths. The approval also ratifies the spec's §8
copy strings. Authoritative spec (verified at deploy tip `f3b3fc49e`,
adversarially reviewed, zero blockers):
`docs/specs/one-tent-loop-tranche-a-specification.md`. Implementer: **Codex**
(PR-A1 first recommended; the five PRs are independent). The Sensors→Doctor
context carry stays excluded pending owner decision D4. Owner gates on live
verification are unchanged (managed e2e session; signup apply).
2026-08-19 update: PR-A1 merged as `f8d93f57` (#1029). A2–A5 remain
Codex-owned and unopened at that tip; their edit points stay collision
boundaries for Tranche B+ below.

**Tranche B+ approved (Cheek, 2026-08-19, "APPROVED. Execute steps one
through five, each in its own slice."):** second tranche of the One-Tent Loop
Efficiency Program. **Claude is explicitly reassigned as architect and, post-
approval, implementer for Tranche B+ only** — Tranche A stays Codex's; the
Action Queue transition/RLS production repair stays Codex's; no competing
navigation implementation. Approved design:
`docs/superpowers/specs/2026-08-19-one-tent-loop-efficiency-design.md`
(Option A — shared pure rules, progressive convergence); measured baseline:
`docs/one-tent-loop-efficiency-baseline.md`; both pinned at deploy tip
`e012b633`. The approval also resolves owner decisions **D4** (Sensors→Doctor
context carry), **D5** (visible user-namespaced "Continue with <plant>?"
suggestion — silent remembered defaults stay banned), **D7** (plant-scoped
Better/Same/Worse row in the V2 sheet), and ratifies the design's §11 copy.
Slice plan: each approved item ships as its own PR. **Status measured
2026-08-21 at deploy tip `6cf3ffda` — Tranche B+ is substantially
delivered, not pending:**

| Slice                                      | Status                                    |
| ------------------------------------------ | ----------------------------------------- |
| B0a measurement harness (first merge gate) | **MERGED** — #1039 `de8ebad`              |
| B1 target-precedence rules                 | **MERGED** — #1040 `9141be8`              |
| B3a recovery + ratified copy               | **MERGED** — #1042 `9b64456`              |
| B2a shared save-key policy                 | **MERGED** — #1049 `f09febc`              |
| B4a `/doctor` loop card                    | **MERGED** — #1047 `cff3efd`              |
| D7 plant-scoped Better/Same/Worse          | **MERGED** — #1041 `5640d77`              |
| D5 "Continue with `<plant>`?"              | **MERGED** — #1043 `e9e5ec5`              |
| B2b                                        | still deferred to **A5** (unopened)       |
| B4b                                        | **NONE REMAINING** — see note below       |
| B5                                         | waits for **A3** (unopened)               |
| B0b                                        | owner-gated authenticated session/CI path |

**B4b has no remaining scope — do not open a slice for it.** Measured
2026-08-22 at deploy tip `faea6e9c5` (recorded by #1095): A2 **has landed**
(`oneTentLoopNavigationRules.ts` carries 5 `normalizedGrowId` uses, including
the back-half `alertsPath(...)` / `actionsPath(...)` threading that was A2's
scope), and with it in place B4a already satisfies **every** §6 B4 requirement
— the `sensor-snapshot` → `?growId=&tentId=` carry, `doctorStartContextRules.ts`,
the `AiDoctorStart` tent-context line and "In this tent" badge, the carry matrix,
the fail-closed page validation, the no-paid-call pins, and the loop-card mount.
The a/b split recorded here was an artifact of B4a shipping before A2, not two
pieces of work. Building a "B4b" now would produce a second implementation of a
merged slice, which `AGENTS.md` forbids.

The remaining dependency: B2b and B5 block on Tranche A slices that have never
been opened. Both re-verified 2026-08-22 **against each slice's own artifacts**,
after a first attempt measured the wrong things (a raw literal count reported as
dispatch sites, and an `Alerts.tsx` check that belongs to A5(c), not A3):

- **A5** — "single dispatch" has not converged. `verdant:entry-created` still has
  **5 independent emit sites** in non-test code: `PlantQuickLog.tsx:399`,
  `QuickLog.tsx:1454`, `AppShell.tsx:390`, `useSavePhotoDiagnosisReview.ts:91`,
  and the `dispatchQuickLogV2EntryCreated` helper in
  `src/lib/quickLogV2EntryCreatedEvent.ts`. Count **emitters**, not literal
  matches — the string appears 23 times across 13 files, but most of those are
  comments, event-name constants, and `add`/`removeEventListener` in the
  Timeline / DailyCheck / ActionFollowUp listeners.
- **A3** — none of its artifacts exist. `src/lib/tentPlantDisplayLabel.ts` and
  `src/lib/actionContextNameLookup.ts` are both absent,
  `buildActionRowContextLabel` is absent from `actionQueueRowView.ts`, and none
  of the four A3 test ids (`action-queue-row-context-names`,
  `alert-detail-tent-label`, `alert-detail-plant-label`,
  `action-detail-tent-label`) appear anywhere in `src/`.

So Tranche A is no longer only its own tranche — it gates the completion of
Tranche B+. No schema, no migrations,
no new routes, no new Quick Log write paths, no production telemetry.

**Named isolated spike (approved 2026-08-13, not SEO):**
`CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE`. Cheek approved a spec-first,
disposable Convex component spike whose only purpose is to demonstrate
`GAP-CONVEX-001` (physical parent/sibling table sandbox — something
`service_role` Postgres code in this repo cannot refuse at runtime). Contract:
`docs/specs/convex-component-physical-sandbox-spike.md`. Claude delivers the
spec (this update). Codex may implement **Phase 1 only** after that spec
merges, and only under `spikes/convex-component-sandbox/`. Production Convex,
root `package.json` `convex` dependency, `src/` / edge-function imports, AI
credits, sensors, entitlements, Action Queue, and `npx convex deploy` remain
`REJECT` until a later Cheek decision. This does **not** replace or pause the
Mode A SEO parent program below.

**Approved slice (Cheek, 2026-08-14):** `POSTGRES_RESTRICTED_ROLE_SPIKE`.
Contract: `docs/specs/postgres-restricted-role-alternative.md`. This is the
comparison arm the Convex spec defers in its §4.2 and §11. It was specified
before approval existed (the only signal was a designated branch name, and the
spec said so rather than assuming consent); Cheek approved it in session on
2026-08-14.

**Phase 0 is DELIVERED and MEASURED — do not rebuild it.** Claude implemented
it, not Codex, because Codex is occupied with Convex Phase 1 in PR #977 and
Cheek granted full authority in the approving turn. Shipped:
`scripts/check-edge-function-domain-reach.mjs`,
`config/edge-function-domain-reach.json`, and
`scripts/check-edge-function-domain-reach.test.mjs` (16 tests, 16 pass locally),
plus `check:/report:/test:edge-domain-reach` npm scripts.

**The measurement, against deploy tip `e1214d3df`: 22 service-role edge
functions, 8 cross-domain table reaches.** Concentrated in `ai-coach` (5 —
grower diary/grows/plants/tents plus ingest sensor_readings) with one each from
`ecowitt-ingest`, `operator-ggs-real-payload-commit`, and `redeem-referral`.
Two further functions are declared `cross` and exempt by design: `delete-account`
(erasure, 3 tables) and `rls-selftest` (**9 tables across four domains**, the
widest reach of any service-role function). Reproduce with
`node scripts/check-edge-function-domain-reach.mjs --report`.

Read it carefully: most of those 8 reaches are **defensible** — `ai-coach` needs
grower context per the AI Doctor rules, the `tents` reads are routing. The
finding is not misconduct. It is that **nothing in the database distinguishes an
intended cross-domain read from an unintended one**. Three limits are pinned in
the spec's §5.1.1 and in the test suite: the scan is literal-only
(`.from(variable)` is invisible), `pi-ingest-readings` holds a service-role
client with zero measured literal reach (zero measured ≠ zero capability), and a
green run means "no undeclared literal reach", never a runtime fence.

**Phase 1 is APPROVED and DELIVERED (Cheek, 2026-08-14, "execute phase 1").**
One restricted role, one domain, local replay only. Shipped as
`scripts/sql/restricted-role-phase1-ingest.sql` (the role),
`scripts/run-restricted-role-harness.ts` (the §7 proofs), and
`scripts/check-restricted-role-fixture.test.mjs` (16 static safety tests, 16
pass locally), wired into `security-db-local` as a non-required step.

**Read this before touching it: the role is deliberately NOT a migration.**
Anything under `supabase/migrations/` reaches production on the next Lovable
apply, which would have violated the spec's own §8 fence (never create a role in
production) and §9 (`REJECT` for production roles) — silently, with no further
decision from anyone. So the role is created by a fixture applied only against a
loopback database by the harness, and dropped in teardown. The harness refuses a
non-loopback `SUPABASE_DB_URL` and has **no remote opt-in flag**, unlike the
other harnesses in this repo. Three of the static tests exist purely to hold that
line, including one asserting the repository still contains **zero** `CREATE ROLE`
statements in migrations — the §3.1 audit fact the whole spec was built on.

The role's shape: `NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS`, `USAGE` on `public`, `EXECUTE` on exactly one
function (`public.bump_bridge_token_usage(uuid, integer)`), and **zero table
grants**. Partitioning by function grant rather than table grant is what survives
the 2026-08-06 founder decision.

**P3 — whether PostgREST honours a custom `role` JWT claim here — is the one
proof that may not run.** It needs `SUPABASE_JWT_SECRET`; the workflow step
derives it from `supabase status` where available, and the harness reports
`BLOCKED` (never `PASS`) when it is absent. Do not record the PostgREST
role-switching mechanism as available until P3 actually passes.

**Phase 2 (production adoption): APPROVED IN PRINCIPLE by Cheek 2026-08-14, but
now on HOLD after the 2026-08-15 gate answers.** Contract: spec §5.4, §5.4.1,
§5.4.2.

**Gate A came back favourable and is no longer the blocker.** Production
`postgres` holds `rolcreaterole = t` and is not superuser, so a plain
`CREATE ROLE x NOLOGIN NOINHERIT` — exactly the drafted shape — is expected to
succeed. Two different findings stop it instead:

1. **The JWT secret is unobtainable on Lovable Cloud**, so a role-claim JWT
   cannot be minted in production. P3 proved the PostgREST mechanism works
   _locally_; in production the role would be created and then **unreachable**.
   A fence nobody can route through is not a fence.
2. **Role durability across rebuilds is `UNKNOWN`**, and roles sit outside
   migrations and schema dumps entirely. Combined with the confirmed rule that a
   role cannot be hardened after creation, a silent drop-and-recreate would
   restore the principal **without its grants**, with nothing in-database
   signalling it.

Phases 0 and 1 keep their value regardless: the detector runs on every PR and the
10/10 demonstration stands. The original gate text follows.

A production role can only be created by a migration under
`supabase/migrations/`, which is exactly what Phase 1 avoided. Three things must
land first:

- **Gate A — does hosted Supabase permit `CREATE ROLE`?** `unknown`. We measured
  that the Supabase `postgres` role cannot even set `NOSUPERUSER` /
  `NOREPLICATION` / `NOBYPASSRLS` (§5.2.1). If `CREATE ROLE` is likewise refused,
  an unguarded migration **aborts the apply chain** — the same failure that
  disqualified `claude/cultivar-library-p1` today, and the same class as the open
  signup-attribution incident at the top of this file.
- **Gate B — does the _hosted_ PostgREST honour a custom `role` claim?** P3
  passed on the **local** stack only. A move to opaque `sb_secret_…` keys would
  remove role-claim JWTs entirely.
- **Gate C — Security review**, per `HANDOFF_PROTOCOL.md`, before any new
  database principal plus JWT minting exists.

Gates A and B are the subject of a read-only Lovable investigation prompt Cheek
holds. The spec carries the exact guarded migration to write once they return;
it degrades to a no-op rather than aborting if `CREATE ROLE` is refused.

**Still `REJECT` regardless:** re-pointing any edge function at the role (a
separate later decision, after the principal has baked), and default-deny table
grants — the last would reverse the 2026-08-06 founder decision recorded in
migration `20260807003500`.

**Convex-vs-Postgres recommendation (spec §10, 2026-08-14): adopt the Postgres
arm incrementally, hold Convex.** The Postgres arm is DEMONSTRATED (10/10
proofs). The Convex arm is `NOT_MEASURED` — and note carefully that PR #977 is
green across 99 checks while **no lane executes the spike's own P1–P9 isolation
proofs**; green there means the repo still builds with a `spikes/` folder, not
that isolation was shown. Convex is unmeasured, **not refuted** — its isolation
property is genuinely stronger — and neither architecture removes `ai-coach`'s
five cross-domain reaches cheaply. Council Chair advises; Cheek approves.

Two audit results from that spec update facts recorded elsewhere in this file's
orbit: the Convex spec's open `uncertainty` about `supabase/functions/_shared/`
constructing service-role clients resolves to **zero** such helpers, and the
2026-08-06 founder decision (declining default-deny table ACLs because Lovable
ships tables without ACL awareness) is the binding constraint on any role design.

**Abandoned by Cheek, 2026-08-14 — do not revive, do not merge:**

- `claude/breeder-mode-genetics` — superseded. Deploy already carries every
  `src/lib/genetics/*` module it adds, plus many it does not. Conflicts in ~30
  files against a 2026-06-06 base.
- `claude/cultivar-library-p1` — superseded **and unsafe**. Its migration
  `20260724000000_cultivar_library_foundation.sql` uses bare `CREATE TABLE`
  (9 unguarded, zero `IF NOT EXISTS`) for tables that already exist, shipped two
  days earlier by `20260722203000_strain_reference_library_v1.sql`. Merging it
  raises `42P07` and aborts the replay, taking `security-db-local` and the pgTAP
  lanes with it. It is an earlier draft of a feature that already shipped.

Update 2026-08-18: **both branches are now deleted from origin.** Agent
sessions still cannot delete branches (re-confirmed: `git push --delete` →
HTTP 403 from the branch-scoped push credential, and the GitHub MCP toolset
exposes no ref-deletion endpoint), so Cheek deleted them himself during the
2026-08-18 cleanup sweep recorded below, alongside 21 other stale `claude/*`
branches. The dispositions above remain the record of _why_ they died.

**Parent program:** MODE A SEO measurement-readiness work.

**Active SEO-evidence slice:** `P2 LIGHTING_GUIDE_CTA_ATTRIBUTION_CONTRACT` in PR #679,
with status `DOCUMENTED_MISSING_NO_EVENT_ADDED`. It records the guide CTA as
`MISSING`/`NOT_MEASURED`; it does not authorize a new event or runtime instrumentation.

**Mandatory governance handoff (this branch):** Refresh stale operating-state facts, align
the permanent `SKIPPED` status vocabulary, and correct the signed-out root-route runbook
description across the canonical constitution and its mirrors/role prompts. This is
docs/governance reconciliation only; it does not change the approved product or analytics
implementation scope.

Handoff status as of 2026-08-07: the `SKIPPED` vocabulary row is present in `AGENTS.md`
and in every mirror that carries a status table (`GEMINI.md`, `docs/agents/roles/security.md`,
`docs/agents/roles/gemini.md`); the corrected signed-out root-route description is present in
`AGENTS.md`. Both items read as complete. The stale-facts refresh is this edit.

Five **Completed, out of slice** records are archived verbatim in
`CURRENT_STATE_ARCHIVE.md`. One-line dispositions:

- 2026-08-07 — #586/#809/#812 Action Queue atomic-create RPC shipped across
  three merges; production application of its two migrations remains `BLOCKED`
  from agent sessions, and the RPC's expand-step constraints do not bind
  legacy direct-insert writers.
- 2026-08-11 — #885 agent-integrations MCP publication audit (docs only); live
  publication state remains `BLOCKED` from agent sessions.
- 2026-08-13 — Lovable knowledge-pack mechanism first recorded; its
  pre-2026-08-13 backup audited against `e7690396e`. No sync automation
  authorized, no owner assigned, replacement pack unread.
- 2026-08-15 — Lovable project Knowledge rewritten from CURRENT_STATE
  (Version 2026-08-15.1; snapshot
  `docs/lovable/verdant-project-knowledge-2026-08-15.md`); still no sync bot
  authorized.
- 2026-08-18 — Claude PR/branch cleanup sweep: zero open Claude-authored PRs;
  all 23 stale `claude/*` branches deleted by Cheek; branch deletion remains
  impossible from agent sessions (HTTP 403, branch-scoped credential).

**Completed, out of slice (recorded 2026-08-18):** Lovable project Knowledge
re-applied as Version 2026-08-18.1 at Cheek's instruction, sourced from this
file at deploy tip `87ae05e` (#1026) after the archival slice merged. Snapshot:
`docs/lovable/verdant-project-knowledge-2026-08-18.md` (9,979/10,000 chars).
The pre-write read confirmed the live Knowledge field still matched the
committed 2026-08-15 snapshot, so nothing unrecorded was overwritten. Live
`/version.json` could not be re-measured from the agent session (network
policy 403 — `BLOCKED`); the pack carries the 2026-08-15 stamp `5e2fcedd4271`
(#984) explicitly labeled as last measurement. Workspace knowledge unchanged.
Still no Knowledge sync automation authorized and no owner assigned for one.

**Recorded 2026-08-20 (ADVISORY, NOT APPROVED; re-pinned at `cff3efd`):** Claude
triaged an owner-supplied 100-prompt Lovable build roadmap against the shipping branch.
Deliverable: `docs/lovable/verdant-lovable-prompt-triage-2026-08-20.md`, now at
**revision 2**, re-audited from `77d8eec` to `cff3efd` after the deploy branch advanced
(#1035, #1039 B0a, #1047 B4a). It selects and rewrites eight prompts and rejects the
rest with reasons. **It authorizes nothing** — no implementation, no schema, no Lovable
send, no production write.

Findings other agents should not have to rediscover: (1) prompt #96 asks for a **Stripe**
checkout UI, but production runs **Paddle** (233 references vs 20, five live edge
functions) — sending it would put a second payment provider into a live billing system;
(2) prompt #60 asks to visually smooth anomalous sensor spikes such as 0% humidity, which
inverts the Hard Safety Rule on unhealthy telemetry, and is included only in
flag-and-label form; (3) **prompt #4's own wording collides with an existing page** —
`src/pages/GrowRoomMode.tsx` / `src/lib/growRoomModeRules.ts` are a read-only multi-tent
operator view doing no theming, so the pack renames that pick to "Night Mode" and fences
the existing files off; (4) prompt #49 now has a measured target — **S5** in the B0a
baseline (≥5 interactions, 1+ reselections), the most expensive row in that table, though
S5 is a documented estimate and only S1a/S7 are automated.

Seven of the eight picks require zero new tables, chosen deliberately because migrations
do not auto-apply (see the second-drift section above). Collision boundaries were
re-checked at `cff3efd`: Tranche A edit points, PRs #828/#817/#696, the single
`quicklog_save_manual` write path, and now the **live Tranche B+ surface** (B0a harness,
B4a `doctorStartContextRules`/`AiDoctorStart`, the quicklog rules files). Only pick #49
touches an actively-edited family; it is flagged and resequenced behind the others.
Docs-only; no code, schema, or migration changes.

In scope — these bullets scope the **Mode A SEO parent program above**, not the completed
#809 entry:

- reverify the two existing lighting routes and the deployed release identity
- intercept and locally fulfill GA4 collection requests so verification traffic is not sent
- align existing readiness/baseline/measurement artifacts with current production evidence
- preserve the GA4/GSC access blockers, Day 0 `UNSET`, and the four-week clock
  `NOT_STARTED`
- document guide-CTA attribution as `MISSING`/`NOT_MEASURED`; do not implement it
  without a separately approved instrumentation slice

Out of scope:

- application/runtime analytics code
- schema, RLS, authentication, migrations, or Edge Functions
- deployment or Lovable publishing
- GA4/GSC activation or property-setting changes
- a third lighting page or content rewrite
- changing the two failing schema-guard workflows or their secrets
- Convex (the isolated spike is a separate named slice above, not SEO work)

---

## Known blockers and next approved slice

1. In the existing GA4 production stream, the owner must disable Enhanced Measurement page
   views based on browser-history changes while retaining Verdant's explicit SPA page-view
   owner.
2. The owner must provide an approved, read-only authenticated access path to the existing
   GA4 property and Google Search Console property; never commit or paste credentials.
3. After both owner actions, rerun the intercepted navigation matrix and record genuine
   authenticated GA4/GSC baselines or authenticated `NO_DATA`.
4. Record Day 0 only after the singleton analytics contract and both authenticated baselines
   pass.
5. Handle the unrelated deploy-head schema/migration guard failures in a separate scoped
   workstream.
6. Production release-identity resilience — **RESOLVED repo-side and verified
   live 2026-08-05** (shipped via PR #735, hardened in #737; live verification
   matched the 22:06Z publish exactly). Full history and the residual optional
   owner items are archived — see `CURRENT_STATE_ARCHIVE.md`. How to read and
   resolve release stamps: `docs/release-provenance-runbook.md`.
7. **Public root route `/` empty-shell — Slice 1 live-verified 2026-08-15.** Found 2026-08-07 while
   reconciling the Ahrefs site audit (project `10204962`, crawl `2026-08-07T07:14:05Z`).
   Root cause isolated 2026-08-12: the deliberate loading-until-hydrated gate in
   `src/components/RootEntry.tsx` (the fix for a navigation-freezing hydration
   mismatch), not an SSR defect. **Cheek selected Option A on 2026-08-12** (`/` becomes
   the canonical home). Slice 1 shipped as [PR #949](https://github.com/Verdant-OS/verdant-grow-diary/pull/949)
   (`741f99e1b`). Live `/` on 2026-08-15 SSRs the landing (`PASS` — h1, canonical,
   1141 body words). Do not keep citing the 2026-08-07 empty-shell `FAIL` as current.
   Slice 2 (the `/welcome` → `/` consolidation, 35 pinned files) remains
   unapproved. Spec and handoff:
   `docs/seo/root-route-canonical-home-spec.md`. Full audit evidence:
   `docs/seo/ahrefs-site-audit-2026-08-07.md`.
8. **Ahrefs structured-data findings must be triaged, not bulk-fixed.** All 56
   `SoftwareApplication` nodes omit `aggregateRating`/`review` **by design** —
   `scripts/validate-jsonld-rich-results.mjs` records the reason inline ("intentional for
   Verdant — no fake reviews"). Third-party crawlers score this as a rich-results error on
   every page; remediating it would fabricate review data and violate the Hard Safety Rule
   _No fake live data_. Record it as an accepted exception in `config/seo-allowlist.json`.
   The genuinely fixable defect in the same cluster is `Article.image` on all 17 Article
   pages pointing at the 512px brand logo rather than article imagery — the local gate
   cannot see it, because it only checks whether `image` is absent. Sibling note:
   **the unsitemapped indexable routes were adjudicated 2026-08-20 and are now
   RESOLVED LIVE — published and re-measured 2026-08-21.** Cheek's call was SITEMAP, not noindex. The set was
   **six**, not the four this file had recorded: `scripts/public-route-parity.config.mjs`
   also carried `/pheno-expression-showcase` and `/docs/mcp-api` in
   `STATIC_ONLY_ROUTES`, and all six measured HTTP 200, self-canonical,
   `index, follow`, absent from `sitemap.xml`, and disallowed by no robots group.
   Five were added to `public/sitemap.xml` (61 `<loc>` in-repo, up from 56).
   **`/breeder-beta` was held, then resolved the same day.** It renders the same
   `<BetaLanding>` component as `/creator-beta` — whose own source header calls the
   breeder route a "copy-only difference" — and measured 233 of ~237 shared unique
   visible tokens with identical `h1` and every `h2`. Both being self-canonical would
   have set two near-identical URLs competing on the same queries, so it was held for
   an owner call. **Cheek chose canonicalisation:** `/breeder-beta` now points its
   canonical at `/creator-beta` and stays affirmatively `index, follow`, keeping
   breeder-oriented copy for direct and paid traffic while conceding the ranking URL.
   It therefore stays out of `sitemap.xml` **by design** — never advertise a URL whose
   canonical points elsewhere.

   Implementation spans three halves that must agree, because a drift in any one is
   silent: the build-time head (`crossCanonicalDocument` in
   `src/lib/build/staticPublicSeoDocuments.ts`), the hydrated runtime head
   (`canonicalPath` on `usePageSeo`, passed from `src/pages/BreederBeta.tsx` — if this
   drifts back to a self-canonical it overwrites the pre-rendered one for every
   JS-rendering crawler), and the sitemap exclusion in
   `scripts/public-route-parity.config.mjs`. All three are pinned by
   `src/test/breeder-beta-cross-canonical.test.ts`.

   Note the distinction from the older `/strains/*` aliases: those use
   `aliasDocument`, which inherits the target's copy and marks the page
   `noindex, follow`. A cross-canonical must **not** also be `noindex` — that sends
   crawlers two contradictory instructions about one URL — so the two helpers are
   deliberately separate.

---

## Release-provenance runbook (added 2026-08-05)

Relocated 2026-08-18 to `docs/release-provenance-runbook.md` — durable
reference, not a changing operational fact.

No new content family, automation, device control, production schema change, or
direct production write is approved by this state file. The 2026-08-13 Convex
slice is an isolated `spikes/` sandbox specified in
`docs/specs/convex-component-physical-sandbox-spike.md`; it is not a production
schema change and does not authorize production writes.

---

## Architecture-audit adjudication — owner/reviewer pairing (recorded 2026-08-21)

Recorded per `docs/agents/HANDOFF_PROTOCOL.md`, which requires the pairing in
**both** the handoff block and this file. Raised in review of the PR below when
the pairing existed only in the handoff.

| Field                             | Value                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slice                             | Adjudication of an owner-supplied architecture audit against measured deploy-branch state                                                                                                                                                                                                        |
| **Slice owner**                   | **Claude**                                                                                                                                                                                                                                                                                       |
| **Independent reviewer**          | **#1087 — Codex**, performed, not merely nominated. **#1092 — Grok (GDP)**, named by Cheek on the PR 2026-08-22 17:09 UTC; review in progress at that time, no verdict yet. Two PRs on one branch, two separate seats — do not read Codex's completed #1087 review as covering #1092             |
| PR / branch                       | [#1087](https://github.com/Verdant-OS/verdant-grow-diary/pull/1087) **merged** `faea6e9c59ad` · follow-on [#1092](https://github.com/Verdant-OS/verdant-grow-diary/pull/1092) **open** · both on `claude/verdant-architecture-audit-6qe80x`                                                      |
| Deliverable                       | `docs/audits/architecture-audit-adjudication-2026-08-21.md` — documentation only                                                                                                                                                                                                                 |
| Repository measurements pinned at | `28c01a017`. **Repository inventories only.** The deliverable's live HTTP probes and provenance comparisons use other commits — `4b1c4867e685`, `39935889fe02`, `5a13d0b47cb7`, `ea31fbdfb934` — and its §6.1 rows carry their own timestamps. Do not attribute production evidence to this tree |

**Why the reviewer row now names two seats.** #1087 merged on 2026-08-21 while its
branch was queue-locked, so two verified Codex findings could not land in it; #1092
is the follow-on that carries them, on the same branch. It is its own slice under
`AGENTS.md`'s "no code ships without peer review", so it needs its own named
independent reviewer rather than inheriting #1087's. Cheek named **Grok (GDP)** for
it on the PR at 17:09 UTC ("Review in progress. Will post PASS/FAIL/BLOCKED with
P0/P1 on this PR. No merge from this comment."), and marked #1092 ready for review
in the same minute. **No agent performed either transition.** The seat is _named_,
not _discharged_ — recording it here satisfies `HANDOFF_PROTOCOL.md:25`, which is
the requirement this whole section exists to meet, and satisfies nothing else. Do
not read a named seat as a completed review.

**Note the Grok naming that is NOT this one.** The MACAE reference-ingest row lower
in this file also names Grok (GDP) as its protocol peer-review seat (filled by Cheek
the same day, via #1100). Different slice, different seat, same reviewer — do not
collapse the two or treat a verdict on one as a verdict on the other.

**Read the deliverable's own withdrawal record before citing it — and read it
there, not here.** Review produced **nine** substantive corrections as of
`3ba7264f2`: claims withdrawn outright, one conclusion reversed, one retraction
that was itself wrong and withdrawn in turn, one relapse into an
already-withdrawn inference, and — added on `3ba7264f2` — a same-build ordering
claim refuted from `package.json`'s `prebuild`/`build` sequence, plus a
follow-up test wrongly described as able to refute as well as confirm. **This
count is maintained by hand and goes stale on every new review round; the
document's own record is authoritative.** It keeps every correction visible
rather than patching silently, and names three recurring failure modes:
inference presented as conclusion, propagation after change, and bounded reads
presented as complete. Its labelled bounds are the load-bearing part, not its
headlines.

**The provenance finding is now measured across FIVE publishes**, not one — see
the Production commit row above for the full comparison. `4b1c4867e685`,
`39935889fe02` (#1080), `5a13d0b47cb7` (#1089), `ea31fbdfb934` (#1086) and
`faea6e9c59ad` (#1087) all mismatch, all `dirty: true`. **This count is
hand-maintained and has already gone stale once** — it read "four" here while the
Production commit row said five. Treat that row as authoritative and re-derive from
it rather than trusting this sentence. The middle pair differ only in
`docs/agents/CURRENT_STATE.md` — outside `TREE_HASH_ROOTS` — and recompute
identically, which is the mechanism behaving correctly. **Do not
"confirm" any of this against a `git rev-parse` tree id:** `treeHash` is
Verdant's SHA-256 over the allowlisted roots, and the two never match even on
healthy builds. The bound is unchanged — the hashed roots include inputs that
never ship, so this establishes build-workspace drift at stamp time, and whether
any shipped byte differs stays `NOT_MEASURED`.

Two findings other agents should not rediscover:

- **The `vercel.json` directives that were measured are not applied as declared
  in production** — `redirects` (all eight, with a positive control), `rewrites`
  (by response-content comparison), and the **catch-all `/(.*)` header block
  only** (3 of its 5 arrive; HSTS differs from the declared value).
  **Everything else in that file is `NOT_MEASURED`, and the categorical "does
  not govern production" is deliberately not asserted.** Specifically unprobed:
  the `/unsubscribe` header block (`Cache-Control`, `Referrer-Policy`,
  `X-Robots-Tag`), the `/assets/(.*)` block (`Cache-Control`), and the
  `projectSettings` (labelled `inference`), `cleanUrls` and `git` keys. Where
  the three delivered headers originate is also `NOT_MEASURED`. **Do not read
  the catch-all result as covering the path-specific rules.**
- **The Bun/npm lockfile transition is dated.** `reviewBy` is 2026-08-25 and
  `check-bun-lockfile-policy.mjs` compares strictly greater, so the gate first
  fails **2026-08-26 UTC**. Its prerequisite is an **inventory across all five
  declared npm consumers** in `config/dependency-lockfile-transition.json` —
  `vercel.json`, the SEO-monitoring workflow, `README.md`, the agent run skill,
  and the preview-deployment checklist. The gate requires every declared
  consumer while `package-lock.json` remains, so retiring the preview Vercel
  project does not by itself clear the gate. Do **not** drop the compatibility
  lock on the strength of that project alone — one of the others is a workflow
  that actually runs. **Map contracts to deployments before counting what
  remains:** the preview checklist and `vercel.json` describe the _same_
  deployment (the checklist requires the project's settings to match that file,
  and its rollback step removes it), so five files are not five deployments. An
  earlier reading that treated production and preview as the same deployment was
  reversed; a later one that counted the five as independent was too.

Owner-gated, unchanged by this slice: the publisher's build log, the lockfile
decision above, and whether to commission the §7.1 ADR against the merged
`docs/codebase-map.md`.

**A candidate for the provenance question exists, but it is weak — read the
caveats before citing it.** #1090 (`9133a4c45`) merged into this branch on
2026-08-21 at 20:10Z, naming a mechanism: a Vite plugin regenerated
`supabase/functions/mcp/index.ts` — a `TREE_HASH_ROOTS` path — on every
non-Windows `vite dev` / `vite build`. Verified in-repo: that file **is** inside
the hashed roots, and the wiring existed at `ea31fbdfb`. The plugin's regeneration
behaviour and its byte-difference are `source claim` from #1090, not verified.

**The same-build version of this is impossible and was asserted here before being
withdrawn.** `package.json:9-11` runs `stamp-version.mjs` inside `prebuild`, and
only then `build` → `vite build`; the lifecycle orders `pre<script>` first, so one
build's stamp is captured before any Vite hook fires. Codex refuted it in review of
#1087. What survives is a **cross-build** version: a rewrite during an editor
session or a previous build sits in the workspace when the next publish stamps it —
which requires the build workspace to **persist between cycles**, an `inference`
supported by `dirty: true` / `ref: "__orphan__"` and by #1090's own "the workspace
no longer regenerates the file", not a measurement. Under a fresh-workspace-per-build
premise the candidate collapses. The right investigation, per Codex, is mutations
occurring **before** `stamp-version.mjs`.

**The test is one-directional.** Once a post-#1090 build is published, re-fetch
`/version.json` and recompute that commit's tree. Mismatch and `dirty: true`
_stopping_ supports the candidate; _persisting_ does **not** refute it, since a
workspace already dirtied by an earlier cycle stays dirty until something resets it.
**RUN 2026-08-22 16:16 UTC — the result is "no information", exactly as the rule
predicts.** Production now serves `faea6e9c59ad`, which contains #1090 (verified by
`git merge-base --is-ancestor`), so this is a post-#1090 build. Recomputed tree
`436eede41e4b` (5,856 files) vs stamped `7d9cc8a12898`: **mismatch persists**, and
`dirty: true` / `ref: "__orphan__"` persist with it. Under the one-directional rule
stated in the preceding paragraph that **neither confirms nor refutes** the candidate.
Do not report it as a refutation, and do not report it as confirmation of some other
mechanism — the persistence is precisely the outcome the rule says carries no signal.
#1090 puts the stamp / `dirty` / `__orphan__` diagnosis outside its own scope and
explains nothing about `ref: "__orphan__"`, so **the publisher's build log remains the
only route that settles it**, and it stays owner-gated. Prior text follows. **Not yet
available:** at 2026-08-21 20:35Z production still served the pre-#1090
`ea31fbdfb934` (`buildTime 15:53:46.096Z`).

One caution that is independent of all the above — the named path is an
edge-function source that publishing deploys, so the "hashed roots include inputs
that never ship" reassurance does **not** cover it. Whether any shipped byte
differed stays `NOT_MEASURED`.

---

## One-Tent goal — blocked on external gates, not code work (recorded 2026-08-21)

Recorded by Claude 2026-08-21 ~22:00 UTC; **all four gate states were re-checked
2026-08-22 — the first three at 17:12 UTC and #1076 re-queried at 17:24 UTC**, after
review flagged that a blanket "re-checked" claim sat above a row still dated
2026-08-21. At that measurement, **no agent performed any of the external transitions
named below**, and none was authorized by this entry.

**Two of the four have since closed: #1091 merged on 2026-08-22, and #1076 is now
closed unmerged.** The table below now records two active gates and two closed records,
not four open gates. The public attestation and disposable authenticated proof remain
the active blockers.

### Two active gates and two resolved records

| Gate                                | State                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1091 ready-state / reviewer action | **CLOSED 2026-08-22.** #1091 is **merged** — `merged: true`, closed 12:38:29 UTC by `cheekhimself`, final head `c432f9836f74`. It is no longer a draft and no longer waiting on anyone. Superseded row text: "Owner-only. Draft at `74e1ad4`; review automation cannot engage until the transition happens. Not performed by any agent" |
| Public attestation                  | **STILL INVALID** (tip/lag re-measured 2026-08-23 02:09 UTC). Canonical `a3ae36765`, production `faea6e9c59ad` `dirty: true`, lag **`12`** — see below                                                                                                                                                                                  |
| Disposable authenticated proof      | **Must remain UNDISPATCHED** while attestation is invalid                                                                                                                                                                                                                                                                               |
| #1076 CI runner migration proposal  | **CLOSED UNMERGED.** Retained as a resolved record for traceability; it no longer blocks or authorizes a workflow migration.                                                                                                                                                                                                            |

### #1091 — 35/35 required is true; "clean head" is not (superseded head)

> **#1091 MERGED 2026-08-22 12:38:29 UTC** as `72e766314` on the deploy branch,
> from final head `c432f9836f74` — **not** `74e1ad4`. Everything below was measured
> against `74e1ad4` and describes that head only. The branch advanced past it before
> merging (`c432f983`, "fix: withhold paused One-Tent proof reads", 11:59:28 UTC,
> touching five files under `src/`), so **do not read the smoke failure below as a
> statement about the merged code.** Whether that check was re-run, and with what
> result, on `c432f983` is `NOT_MEASURED` here. The finding is kept because the
> _lesson_ survives the merge — "35/35 green" summarised away a red check — while
> the _measurement_ does not.

`established fact`, measured 2026-08-21 ~21:50 UTC against head `74e1ad4`
(branch `codex/one-tent-polish-ea31`, **behind the deploy tip by 1 at that time**):

**All 35 ruleset-required contexts are green** — enumerated, not assumed: the 32
`Full test suite (shard n/32)` jobs, `Lint, typecheck, test, build`,
`Preflight — edge shared-lib mirror in sync`, and `test:legal-seo`. The ruleset is
genuinely satisfied.

**A non-required check is red on that same head, and it is not a test failure.**
`Quick Log Playwright smoke` concluded `failure` (job `96919203284`, run
`32529735698`). Its own step outputs:

- `FIXTURE_STEP_OUTCOME: failure`
- `SMOKE_STEP_OUTCOME: skipped` — the smoke never executed
- `REPORT_JSON_PRESENT: false`, `SMOKE_COUNTS_AVAILABLE: false` — no report produced

It ran **authenticated against the live Lovable host** (`E2E_FIXTURE_MODE: true`)
with three fixture variables empty: expected grow name, second plant name, and
account hint. In the **same run**, `Authenticated One-Tent branch proof` concluded
`skipped`. `Browser census (authenticated)` was still `in_progress` at read time.

**Root cause is `NOT_MEASURED`**, and the distinction matters before anyone
resequences work around it: a failed _fixture/config_ step is not the same finding
as a failed assertion, and only the second would implicate product code. Nobody
should conclude either way from the summary line.

**Why this is recorded rather than acted on.** `codex/one-tent-polish-ea31` is
Codex's owned slice; adopting it would violate the collision fences in this file.
This entry is a handoff, not a claim on the work. But **"35/35 green" is the
summary that hides this**, so a ready-state transition taken on that summary alone
would carry an unexamined red into review.

**That warning is now retrospective, not actionable.** #1091 merged on 2026-08-22
from a later head. The point stands as a reading rule for the next PR summarised as
"all required green"; it is no longer advice about #1091.

### Attestation — re-measured 2026-08-22, still invalid

`established fact`, tip and lag measured 2026-08-23 **02:09 UTC**; the served-commit
rows measured 2026-08-22 **16:16 UTC** and re-confirmed unchanged at 17:09, 17:32,
17:51, 18:22, 00:02 and 02:09:

| Axis                 | Value                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Canonical deploy tip | `a3ae36765` (#1105)                                                                                              |
| Production serves    | `faea6e9c59ad`, `buildTime 2026-08-21T20:51:46.584Z`, `treeHash 7d9cc8a12898`                                    |
| Provenance flags     | `dirty: true`, `ref: "__orphan__"`                                                                               |
| Ancestry             | live **is** an ancestor of the tip                                                                               |
| Publish lag          | **12** first-parent commits (#1095, #1096, #1098, #1091, #1099, #1097, #1100, #1101, #1102, #1092, #1107, #1105) |

**The gap has now widened twice for two different reasons, and the distinction
matters.** Between 2026-08-21 and the 16:16 UTC reading, production republished _and_
the tip moved six commits — both halves changed, and the lag went 2 → 6. Between
2026-08-22 16:16 UTC and 2026-08-23 02:09 UTC, production did **not** republish at
all; only the tip advanced (#1100, #1101, #1102, #1092, #1107, #1105), taking the lag
6 → 7 → 8 → 9 → 10 → 11 → **12** across nearly ten hours. A widening lag is not by itself evidence of a stalled
publish, nor of a fresh one; read which half moved. `dirty: true` and
`ref: "__orphan__"` survived the republish, so the provenance defect is not a
one-build artifact. Prior reading, superseded: 2026-08-21 21:58:32 UTC — tip
`faea6e9c59ad`, live `ea31fbdfb934`, lag `2`, which itself re-confirmed the 21:05 UTC
row 53 minutes later. That pair is exactly why a lag figure is never carried forward:
two readings agreeing 53 minutes apart said nothing about the next 18 hours.

### `20260813030000` — "unapplied" carries two meanings, and one is dangerous

**This is the entry most likely to be misread, so state which sense is meant every
time.**

- **The GitHub apply lane never succeeded** — the apply-signup workflow still shows
  only its failed PREFLIGHT. True.
- **The production objects are live.** Per the measurement already recorded in the
  signup-attribution section above (2026-08-21 ~15:23 UTC, Lovable `query_database`
  against the production project): the table, all four helper functions, the
  readiness RPC, and a `handle_new_user` carrying the `RAISE LOG` guard from
  `20260821150000` all exist. Ledger name-rows for `20260813030000` are present via
  the founder backfill.

**The hard stop is unchanged and this entry does not soften it: do NOT GitHub-APPLY
`20260813030000_signup_acquisition_forward_repair.sql`.** That file re-issues an
**unguarded** `handle_new_user` and would overwrite the live guard — a production
incident. A reader who takes a bare "remains unapplied" as licence to apply it has
inverted the finding.

---

## ⚠️ Production JS ships a LIVE payments token — which FAILS CLOSED, disabling checkout (recorded 2026-08-21, severity corrected 2026-08-22)

Recorded by Claude 2026-08-21 ~23:03 UTC at Cheek's instruction, after Cheek
raised it; **re-measured 2026-08-22 16:16 UTC against a newer production build and
still true.** **Publishing is stopped by owner order while this stands.** Nothing
here authorizes a publish, an env edit, or a token rotation.

> ### ⚠️ SEVERITY CORRECTED 2026-08-22 — read this before quoting anything below
>
> **An earlier revision of this section said "production is running **live** payments."
> That was wrong, and the correction inverts the risk.** Raised by Copilot in review of
> #1092, verified in the served source **and** in the shipped bundle before conceding.
>
> At the served SHA `faea6e9c59ad`, `src/lib/paddleEnvironment.ts` classifies a `live_`
> token as `"live"` and `resolvePaddleCheckoutEnvironment` returns `"sandbox"` **only**
> for a `test_` token — every other class resolves to `"unavailable"`, on every host.
> `src/lib/paddle.ts`'s own header states the policy: _"Live tokens fail closed on every
> host."_ Confirmed empirically in the shipped bundle rather than inferred from source:
> the minified resolver reads
> ``iv(e){return rv(e.token)===`sandbox`?`sandbox`:`unavailable`}``, and the blocking
> copy `Checkout disabled: Verdant currently supports Paddle sandbox testing only.`
> ships alongside it.
>
> **So production is not taking live payments. Production is taking NO payments.** The
> live-class token disables checkout entirely; a grower who tries to upgrade sees the
> blocking message. That is a different defect from the one first recorded — a
> **checkout-blocking configuration and provenance defect**, not an unnoticed live
> billing surface.
>
> **The direction of the publish risk flips with it.** A file-sourced `live → test`
> swap would **restore** the intended sandbox checkout, not "break live payments".
> The corrected outcome list is below.
>
> The measurements in this section are unchanged and still stand — what a `live_`
> token _means_ is what was wrong. This is the "inference presented as conclusion"
> failure mode again: token class was read as billing state without checking the code
> that consumes it.

**Never reproduce a live token body** — in this file, a commit message, a PR, or
chat. Class prefix, length and redacted context are sufficient and are all that
appears below.

### What is measured

`established fact`, **re-measured over live HTTPS 2026-08-22 16:16 UTC** against a
DIFFERENT, newer production build than the one first recorded. The finding survives
the republish unchanged:

| Axis                                         | Value                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Production bundle                            | `/assets/index-C-R0_Bat.js` (820,070 bytes)                                              |
| Inlined key                                  | `VITE_PAYMENTS_CLIENT_TOKEN`                                                             |
| Shipped class                                | **`live_`**, body length 27, one distinct value, two occurrences in that bundle          |
| `test_`-shaped payments token in that bundle | **zero**                                                                                 |
| Repo `.env.production`                       | **`test_`** class (sha256 `1a79e29c…`)                                                   |
| Lovable project `.env.production`            | **`test_`** class, byte-identical to the repo file — **re-read 2026-08-22 16:16 UTC**    |
| `.env.development`                           | byte-identical to both (sha256 `1a79e29c…`)                                              |
| Serving commit at measurement                | `faea6e9c59ad`, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"` |

**Still the live build at 2026-08-23 02:09 UTC.** `/version.json` was re-fetched at
17:09, 17:32, 17:51, 18:22, 00:02 and 02:09, returning the same commit and the same
`buildTime` every time, so the bundle measured at 16:16 is
still what production serves. **The bundle itself was not re-fetched at 17:09** — this
row is a 16:16 UTC measurement carried forward on an unchanged serving commit, which is
the one case where carrying forward is legitimate. If `buildTime` moves, re-fetch the
bundle rather than trusting this row.

**The republish is itself evidence.** The asset filename changed
(`index-aTS7aKMk.js` → `index-C-R0_Bat.js`) across a build that also moved the served
commit `ea31fbdfb934` → `faea6e9c59ad` — so this is a rebuild, not a cached artifact —
and the shipped token is still `live_`, still 27 characters, still one distinct value
appearing twice, while both `.env.production` files still say `test_`. **A build cycle
did not reconcile the two.** The 2026-08-21 23:03:25 UTC reading of
`/assets/index-aTS7aKMk.js` is superseded only in its bundle path; every other row held.

**The shipped value does not match what either `.env.production` says NOW.** State it
that way and no further — an earlier revision said the bundle "came from neither
`.env.production` file", which is a categorical attribution the evidence does not
support, withdrawn 2026-08-22 after a review P2.

**Which source supplied the value at build time is `NOT_MEASURED`**, and two candidates
remain live:

1. **A platform environment variable** overriding the files at resolution time — the
   obvious candidate, and the one the §6.1 withdrawal below leans on.
2. **The workspace `.env.production` itself carrying a `live_` value at build time and
   being restored afterwards.** Both files were read _after_ deployment, so this is not
   excluded by anything measured here. It is the more interesting candidate, because it
   would explain the shipped token **and** the `treeHash` mismatch with one mechanism,
   on a build already stamped `dirty: true`.

**Do not discard candidate 2.** The §6.1 withdrawal argues candidate 1 is _likeliest_;
it does not establish candidate 1 and does not exonerate the file. Only the
owner-gated build log separates them. One bound tightened and one did not:
the earlier scan covered all 20 production bundles for `test_`-shaped tokens and found
none; **this re-measure scanned the main bundle only**, so the other nineteen are
`NOT_MEASURED` at the 2026-08-22 reading rather than re-confirmed.

### Pre-publish read, performed 2026-08-22 16:16 UTC

The owner's standing instruction is to re-read the Lovable `.env.production` before
anyone opens the publish button. **Done, and the answer is unchanged: it still reads
`test_`.**

Read that result correctly — it is the _reason_ the hazard is unresolved, not a
clearance. The file said `test_` on 2026-08-21 while production shipped `live_`, and it
says `test_` today while production still ships `live_`. **Reading the file cannot tell
you what a publish will produce**, because its contents _now_ are not evidence about
what was resolved at the earlier build — whether a platform variable overrode it, or the
file itself briefly differed and was restored. **Note what this does NOT say:** an
earlier revision said "the file demonstrably is not what produced the current bundle",
which contradicts candidate 2 recorded above and is **withdrawn 2026-08-22** after a
sixth review P2. The build-time source stays `NOT_MEASURED`. Only the platform env panel
and the publisher's build log can settle it, and both are owner-gated. A publish taken on the strength of this read alone is exactly the
sloppy publish the owner warned against.

### Why this is not merely an env-file discrepancy

`scripts/lib/tree-hash.mjs` lists the committed `.env` files in
`TREE_HASH_ROOTS`, and its own comment gives the reason: _"Committed Vite env
files: `VITE_\*` values are inlined into shipped JS, so an env-only commit
produces different app bytes and must move the hash."\_

So `.env.production` is a hashed root **precisely because** its values reach
shipped JS — and its shipped value differs from its committed value.

**WITHDRAWN 2026-08-22 — this did NOT close the audit's §6.1 `NOT_MEASURED`, and
saying it did was an error.** Raised as a P2 by `chatgpt-codex-connector` on #1092
and verified before conceding. The withdrawn claim read: "**A shipped byte does
differ**, and it is a hashed root ... The workspace-drift finding is no longer
confined to inputs that never reach users."

**Why it was wrong.** §6.1's open question is whether _the workspace content
responsible for the `treeHash` mismatch_ reached shipped bytes. What is measured
here is different: shipped JS diverges from what the **committed** `.env.production`
prescribes. Those coincide only if the **workspace file on disk** differed at build
time — and there is a mechanism that produces the measurement without any such
difference. Vite's `loadEnv` resolves `VITE_*` from platform environment variables as
well as from `.env` files, and a platform variable overrides the file **without
altering the file**. Under that mechanism the workspace `.env.production` is
byte-identical to the committed one, contributes **nothing** to the tree-hash
mismatch, and the mismatch is caused by some other, still-unidentified file.

**That mechanism is sufficient to break the inference; it is not established as what
happened.** The workspace file may equally have carried a `live_` value at build time
and been restored afterwards — see the two candidates recorded above — in which case it
_would_ have both moved the hash and shipped. Either way the §6.1 bound holds, because
neither candidate is measured. Do not read this withdrawal as clearing the file.

So two separate claims were conflated:

| Claim                                                                    | Status                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Shipped bytes differ from what the committed env file prescribes         | **measured** — that is the finding above, and it stands |
| The workspace drift behind the `treeHash` mismatch reached shipped bytes | **`NOT_MEASURED`** — unchanged; §6.1's bound is intact  |

**The audit's §6.1 bound therefore stands as written and needs no correction** —
which also retires the standing offer to amend that document on this point. This is
the "inference presented as conclusion" failure mode the deliverable itself names,
committed here while writing about it.

What survives, and is worth keeping: `.env.production` **is** in `TREE_HASH_ROOTS`
precisely because `VITE_*` values reach shipped JS, so _if_ that file ever drifts in
the workspace it would both move the hash and change shipped bytes. That is a reason
to keep watching it — not evidence that it happened.

### The publish hazard — THREE outcomes, not two (corrected 2026-08-22)

**The two-outcome model recorded here was incomplete.** Raised as a P2 by
`chatgpt-codex-connector` on #1092 and verified at source. #1091 merged
`scripts/assert-paddle-production-sandbox.mjs` into `package.json`'s **`prebuild`**,
where it now runs _first_, ahead of `stamp-version.mjs`. Read directly: it requires
the committed `.env.production` to resolve as the canonical sandbox token, then calls
Vite's own `loadEnv("production", rootDir, "VITE_PAYMENTS_")` — the **effective**
resolution, platform environment variables included — and fails unless that effective
value is itself a sandbox token _and_ equals the canonical one
(`effective_paddle_token_not_sandbox` / `effective_paddle_token_mismatch`, `exitCode 1`).

So the outcomes are:

1. **The build fails closed** — a live platform value now trips the guard before any
   output is generated. On the current deploy branch, via the repo's own build script,
   this is the expected outcome.
2. **A publish keeps the live token** — only if the publisher bypasses the package
   lifecycle (invoking `vite build` directly rather than `run build`, so `prebuild`
   never fires).
3. **A publish swaps live → test and RESTORES sandbox checkout** — if the file wins
   and the guard passes. Note the direction: because a live token already fails
   closed, this outcome **fixes** checkout rather than breaking it. An earlier
   revision called this "breaks live payments", which was backwards.

**Two bounds, both load-bearing:**

- **Whether the publisher runs the package lifecycle at all is `NOT_MEASURED`.** The
  guard only protects the paths that invoke `prebuild`. This is the same gap the
  bot named, and it is not closed here.
- **The guard does NOT explain the token already in production.** It is absent from
  the live build: `scripts/assert-paddle-production-sandbox.mjs` does not exist at
  `faea6e9c59ad`, whose `prebuild` is only `verify-edge-shared-in-sync` →
  `check-no-src-lib-imports` → `stamp-version`. It was added by `72e766314` (#1091),
  merged 2026-08-22 12:38:29 UTC — **after** the live build was stamped
  (2026-08-21T20:51:46.584Z). It changes what the _next_ publish does; it says nothing
  about how the current one shipped `live_`.

Nobody can predict the outcome from the repository alone. That is still why the env
surface must be read immediately before any publish — and why reading the **file alone
does not answer it**: the file said `test_` while production shipped `live_`.

### Severity, stated precisely

`inference, high confidence`, not verified against Paddle: a Paddle **client-side
token** is designed to be public, ships in the browser by intent, and cannot
authorize server-side operations. On that reading this is **not** an API-key leak.

What it **is**, corrected: a **checkout-blocking** configuration and provenance
defect. Production is running **no** payments — the live-class token fails closed and
disables checkout on every host — while every committed env file in the repository
says test, and the mismatch is invisible to CI. The earlier wording "production is
running **live** payments" is **withdrawn**; see the severity-correction block at the
top of this section.

### What else was checked, and came back clean

All 20 production bundles were scanned for secret-class markers **on 2026-08-21**;
the 2026-08-22 re-measure re-read only the main bundle, so this subsection is a
2026-08-21 result and is `NOT_MEASURED` against the current build. One hit:
`BRIDGE_TOKEN` in `sensorTestbenchIndicatorRules-BYI81Sq2.js`, which is a
PowerShell **variable name** inside a copy-paste snippet template carrying the
literal placeholder `<vbt_… mint a token to reveal>`. No token value.
`VITE_SUPABASE_PUBLISHABLE_KEY` is the anon key — public by design and already
committed in `.env`. No `service_role`, `SECRET`, or `PRIVATE_KEY` marker appears
in any bundle.

### Method note for whoever re-measures

The landing HTML contains NUL bytes, so plain `grep` reports **no matches and no
error** against it — the same trap `docs/agent-session-network-reachability.md`
records. Use `grep -a`. A bundle scan that silently returns nothing is the failure
mode to expect here.

---

## External reference scope — MACAE accelerator (recorded 2026-08-22)

**Status: `REFERENCE_ONLY`. Owner: Claude.** This row records that the scope exists; it
authorises no build, no slice, and no port. Recorded as its own timestamped row rather
than as a new Last-updated block — it supersedes no measurement above.

**Scope (`source claim`):** relayed by Cheek as "Grok has scoped this demo for all agents
to read and ingest for future builds", authorised 2026-08-22 as a docs-only slice.

| Field                              | Value                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository                         | `Verdant-OS/multi-agent-custom-automation-engine-solution-accelerator` (public)                                                                  |
| Read at                            | `b4a4a00` on `main`, `2026-06-26T20:50:10Z` — shallow clone, read 2026-08-22                                                                     |
| Digest                             | [`docs/knowledge-library/macae-reference-ingest.md`](../knowledge-library/macae-reference-ingest.md)                                             |
| Clone path (ephemeral)             | `/home/user/verdant-os/multi-agent-custom-automation-engine-solution-accelerator` — does not survive the container; re-clone from the public URL |
| Runtime behaviour                  | `NOT_MEASURED` — never deployed or executed                                                                                                      |
| Applicability to any Verdant slice | `NOT_MEASURED` — no slice assigned                                                                                                               |
| Slice owner                        | **Claude**                                                                                                                                       |
| Owner-designated reviewer          | **Blue Dream**, in Cursor — not a GitHub handle (Cheek, 2026-08-22)                                                                              |
| Protocol peer-review seat          | **Grok (GDP)** — filled by Cheek 2026-08-22; `HANDOFF_PROTOCOL.md:24` allows Grok, Claude or Codex                                               |
| Owner acknowledgement              | **cheekhimself**, given out-of-band, outside the GitHub review-request mechanism                                                                 |

Pairing recorded here per `docs/agents/HANDOFF_PROTOCOL.md:25`, which requires both names
in this file and not only in the handoff block. **Read the two reviewer rows together —
neither alone is the whole picture.**

Blue Dream remains the owner's designated reviewer and reviews in Cursor, not on GitHub,
so an empty GitHub reviewer list on these PRs is by design and not an oversight. The
protocol peer-review seat is now filled by **Grok (GDP)** as the independent peer
reviewer (Cheek, 2026-08-22). Blue Dream is **not** one of the three peers (Grok,
Claude, Codex) that `HANDOFF_PROTOCOL.md:24` and `AGENTS.md:582-584` permit in that
seat; Grok (GDP) is. Do **not** leave or restate `NOT FILLED` / "cannot infer" as the
live claim for this seat.

**Read the digest before acting on anything in that repository.** Its do-not-port rules
bind, and are repeated here so this row is not safe to quote alone:

1. **The in-memory approval store is an anti-pattern for Verdant.**
   `OrchestrationConfig` (`src/backend/v4/config/settings.py`) owns
   `approvals: Dict[str, bool]` coordinated by `asyncio.Event`, with
   `default_timeout: float = 300.0`; `HumanApprovalMagenticManager`
   (`human_approval_manager.py`) uses that config. A restart, a second replica, or a
   slow human loses the decision, and that path keeps no audit record. Do not
   reproduce that shape.
2. **The Action Queue stays durable** — `reason`, risk level, `status`, and an append-only
   audit trail, enforced with RLS. Approval is a persisted row, never process memory.
3. **Read the approval-gate shape and the tools-as-services separation. Port nothing
   else** — not the Azure runtime, not Cosmos DB, not Container Apps, not the in-memory
   approval store.
4. **Automation last.** Diary first, sensors second, AI third. This accelerator is an
   automation-orchestration engine; it does not move up that order.

---

### PR #1125 — owner and independent reviewer (assigned 2026-08-25 by Cheek)

| Role                      | Agent                                                   |
| ------------------------- | ------------------------------------------------------- |
| Owner                     | **Claude** (`claude/verdant-architecture-audit-6qe80x`) |
| Independent peer reviewer | **Grok**                                                |

Cheek named Grok as the independent reviewer for this slice on 2026-08-25 and authorized
merge once the required checks are green. Recorded here because **there is no Grok GitHub
account on this repository** — `cheekhimself` is its only collaborator, so a GitHub
`requested_reviewers` entry cannot be created and Grok's reviews reach the PR relayed by
Cheek, as they did on #1092. This row, not a GitHub field, is the `AGENTS.md` reviewer seat.

The owner did not review their own slice: the fourteen findings corrected on this branch came
from Copilot and Codex, and are recorded in the spec's §10 correction record.

### Grow Help Toolkit — owner and independent reviewer (recorded 2026-08-26 from Cheek's assignment)

| Role                      | Agent     | Assignment record                                                     |
| ------------------------- | --------- | --------------------------------------------------------------------- |
| Owner                     | **Codex** | Scope confirmation supplied by Cheek; recorded 2026-08-26             |
| Independent peer reviewer | **Grok**  | Selected by Cheek; recorded 2026-08-26; review pending, not performed |

Codex owns the complete client-side Grow Help Toolkit implementation on
`codex/grow-help-toolkit-20260825`. This temporary assignment replaces Codex's standing
`CURRENT_STATE.md` work for the duration of this slice. Grok's independent review is assigned
but **pending**; do not describe it as performed or approved. There is no Grok GitHub account on
this repository, so Cheek must relay the review to the PR.

The slice is limited to the local nutrient, light, and expense calculators, shared cycle state,
browser-only persistence, formula tests, and browser-generated CSV/print exports. It authorizes
no backend, schema, migration, database probe, secret, hosted apply, publish, merge, or deploy.
Per Cheek's current instruction, `verdant-production` remains at **0 secrets**; this user-confirmed
boundary was not independently re-probed in this slice and supersedes the historical 2026-08-15
environment-secret snapshot above. The separate drift probe remains **BLOCKED** by the provider
limit; nobody should hunt for `knk`, request a Lovable connection string, or represent a missing
paste as the blocker. Cloud SQL remains an in-app, **Ask each time** path.

## Agents currently assigned

| Agent             | Assignment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex             | **Grow Help Toolkit owner — temporary assignment replacing the standing work below for this slice.** Implementation is on `codex/grow-help-toolkit-20260825`; Grok review is assigned and pending. Standing SEO measurement readiness and analytics integrity resumes after Grok's independent-review handoff closes and this slice is closed. Option A slice 1 (#949) is live-verified. Convex Phase 1 of `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` remains in review: PR #977, still OPEN 2026-08-15. Scope stays Phase 1 only, under `spikes/convex-component-sandbox/`. **Do NOT rebuild the Postgres domain-reach detector — Phase 0 and Phase 1 of `POSTGRES_RESTRICTED_ROLE_SPIKE` are already delivered by Claude.** Incoming #986 still said Phase 1 was `HOLD`; that row was stale. Phase 2 of that arm is HOLD (JWT secret unobtainable on Lovable Cloud; role durability `UNKNOWN`)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Claude            | **One-Tent Loop Tranche B+ — architect and implementer (Cheek, 2026-08-19). Substantially delivered as of 2026-08-21:** B0a (#1039), B1 (#1040), B3a (#1042), B2a (#1049), B4a (#1047) and D7 (#1041) merged; D5 (#1043) **merged** `e9e5ec5`; B2b/B5 blocked on unopened Tranche A slices A5/A3; **B4b has no remaining scope** — A2 landed and B4a already covers all of it, so do not open a B4b slice (see the Tranche B+ table note). Also delivered #1062, the routed `CURRENT_STATE` refresh specification (`docs/specs/current-state-refresh-2026-08-20.md`). `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` specification — delivered. `POSTGRES_RESTRICTED_ROLE_SPIKE`: spec delivered, **Phase 0 detector measured and Phase 1 role harness delivered (local-only)**, 2026-08-14 under Cheek's approval and full-authority grant. Not the 2026-08-13 “spec-only / not implementation” row. Prior completed out-of-slice work (#586/#809/#812/#885) unchanged. **Pheno Hunt + LAB territory (Cheek, 2026-08-25): delivered 2026-08-26 as one draft PR from `claude/verdant-pheno-hunt-lab-vq6pd9` — audit + dispositions (`docs/pheno-hunt-lab-territory-2026-08-26.md`), implementation, tests; in-branch additive migration NOT applied to production; independent-reviewer seat unassigned, Cheek to name the peer on the PR** |
| Grok              | **Grow Help Toolkit independent reviewer — assigned, review pending and not yet performed.** **Product Intelligence, Adversarial Audit, and Implementation Lead** (Cheek 2026-08-20, refined). Equally empowered to research, audit the live app, implement assigned slices, test, and independently review. Peer with Claude and Codex — **none outranks the others**; explicit task ownership controls. SEO/market/backlink strength retained (not a fence). Map: `docs/agents/grok-peer-elevation-map-2026-08-20.md`. Does **not** take Tranche A remaining edit points (Codex) or Tranche B+ product code (Claude) unless done and unassigned. Prior delivered work unchanged: `ONE_TENT_LOOP_OPERATING_ORDER` repo slices 0/2/3/4; Slices 1 and 5 owner-`BLOCKED`; Cursor SDK spike gates on #985 / `CURSOR_API_KEY`. Reuse of the dispatcher not approved. Convex/Postgres spikes not paused. Production Convex HOLD. Not Unassigned                                                                                                                                                                                                                                                                                                                                                                                             |
| Security reviewer | Unassigned until Convex Phase 1 spike code is ready for review before any Convex cloud credential                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Gemini            | Unassigned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Council Chair     | Convex-vs-Postgres comparison: **recommendation delivered in spec §10 — adopt Postgres incrementally, hold Convex.** Postgres arm has a measured number (8 cross-domain reaches across 22 service-role functions). Convex arm remains `NOT_MEASURED` pending #977 isolation proofs (green CI on #977 is not those proofs). Incoming #986 still said “do not issue a recommendation until both arms carry evidence”; that sentence is stale — the recommendation already shipped. `ai-coach`'s five reaches are the case neither architecture removes cheaply                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
