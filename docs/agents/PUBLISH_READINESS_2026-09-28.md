# Verdant release checkpoint — September 28, 2026

## Current addendum — September 29, 2026, 21:09–21:13 UTC

This addendum supersedes the current-state claims in the earlier packet below.
The earlier observations remain dated history. **BLOCKED, complete production
acceptance:** the Timeline repair is still open, the authenticated fixture smoke
fails its prerequisite, and new proof heads have not completed CI or live
acceptance. The autonomous goal remains active.

### Live-to-tip gap and current gates

**PASS, public frontend identity:** HTTP 200 from
[production version.json](https://verdantgrowdiary.com/version.json) at
`2026-09-29T21:09:49.2134528Z` advertises
`61821446ebd7e4fb30a36a5a95b7526a34515df5`, `dirty:false`, build time
`2026-09-29T03:02:39.564Z`. **PASS, deploy source identity:** `git ls-remote
origin refs/heads/verdant-grow-diary` returns
`0a452d3e14a9f0653aae2db20ce10815672ad602`.

The complete GitHub comparison from that advertised live SHA to that tip is
**one commit and one file**: `0a452d3e14a9f0653aae2db20ce10815672ad602`,
[#1355](https://github.com/Verdant-OS/verdant-grow-diary/pull/1355), adds
`.coderabbit.yaml` (369 added / 0 removed lines). It is review configuration;
there is no application or database delta in this particular gap. The older
eleven-commit comparison below ends at the currently advertised live build.
Native deployment checks, traffic allocation, publisher approval, production
schema and Edge identity remain **NOT_MEASURED** by this addendum.

**PASS, required tip checks:** all pages of the tip's check-runs were read at
`2026-09-29T21:11:03.6822532Z`: 148 records, 85 latest unique check names,
**35/35 required SUCCESS**, zero missing, failed or pending required contexts.
The complete latest-name counts are 75 SUCCESS, 3 FAIL, 1 cancelled, 2 queued
and 4 SKIPPED. These are check contexts, not unique tests. Required names come
from `config/required-status-checks.json` at this source tip.

| Additional tip gate  | Status       | Exact evidence                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency audit     | FAIL         | [Job 109493944077](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/36593959300/job/109493944077) reports high fast-uri advisories 1239943/1239946 and exits 1. Open #1804 proposes a dependency repair in its separate owner lane; this packet grants no waiver or lockfile edit. |
| Required-check audit | FAIL         | [Job 109493944435](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/36593959418/job/109493944435) records that `test:security-db-local` started after the #1355 merge at `2026-09-29T15:56:01Z`; a later SUCCESS does not erase the timing finding.                                |
| Merge-queue snapshot | FAIL         | [Job 109577297605](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/36618419905/job/109577297605) reports GitHub GraphQL HTTP 502 at `2026-09-29T21:02:59Z`, exit 2. This observed failure is infrastructure, not a product verdict.                                               |
| Additional build     | NOT_MEASURED | [Job 109562844285](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/36614176805/job/109562844285) is cancelled. Its cancellation is not a successful build.                                                                                                                        |

The failed logs above were read before classification. No blind rerun, production
dispatch or check bypass was performed.

### Product repairs and proof branches

**FAIL, live Timeline gap:** #1754's remaining non-manual persisted-metric P1
is still in the advertised live build. Its repair
[#1794](https://github.com/Verdant-OS/verdant-grow-diary/pull/1794) is open at
`ea56602857960449ced06d24547352785c62752a`, based on `0a452d3e`. That head has
**35/35 required SUCCESS** at 21:11 UTC, but two supplemental audits FAIL
(dependency and nested static proofs), two census jobs are cancelled, and one
check remains queued. Blue Dream acceptance of that exact head and production
value readback remain **NOT_MEASURED**. A bot security summary or acceptance on
an older head cannot satisfy that gate.

**PASS, stacked-merge classification:** #1745 merged into
`codex/quicklog-active-replay-fence-20260926` as `851239d4170e90f2121129b42ad229bc70f6343f`;
#1749 merged into `codex/quicklog-manual-lineage-fence-20260927` as
`19d767d0c62179b224cabb9c45f2544cf0894645`. Neither merge landed on
`verdant-grow-diary`. Their production behavior remains **NOT_MEASURED**;
their MERGED PR labels do not mean they reached the live build. The production
database lock and serialized Quick Log landing order remain.

The following branch repairs were normal-pushed and remain draft. The counts
are separate local runs already completed at the listed heads; overlapping
cases are not summed as unique tests. New-head hosted CI is **NOT_MEASURED**
until terminal.

| PR / exact head                                                                                                | Repair                                                                                                                                                              | Local validation                                                                                                | CI at 21:11 UTC                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [#1756](https://github.com/Verdant-OS/verdant-grow-diary/pull/1756) `cc66ceaf1aec7dbc43aeb7d879ee4b0d6dd3ac8a` | Resolve protected function signatures through `to_regprocedure` and compare OIDs; regression rejects the old schema-sensitive text comparison. No migration edited. | PASS: 1 focused file / 145 passed / 0 failed / 0 skipped. Earlier typecheck, scoped lint and formatting passed. | NOT_MEASURED: 34 required pending, 1 not yet reported; 13 checks running and 49 queued overall. |
| [#1793](https://github.com/Verdant-OS/verdant-grow-diary/pull/1793) `038583772a7c924eb481480e76222cfd69d5e5a8` | Report a valid preflight deployment-SHA mismatch accurately before timed navigation; add the missing `ready_for_review` trigger. Exact-SHA gate stays enforced.     | PASS: 3 files / 168 passed / 0 failed / 0 skipped; typecheck 0 diagnostics; scoped lint 0 errors / 0 warnings.  | NOT_MEASURED: 34 required queued, 1 not yet reported; no failed check observed.                 |
| [#1799](https://github.com/Verdant-OS/verdant-grow-diary/pull/1799) `a42789a6e9e596ee2318021650a8dd17e6782beb` | Merge updated #1793 parent; add Settings proof's missing `ready_for_review` trigger.                                                                                | PASS: 4 files / 234 passed / 0 failed / 0 skipped; typecheck 0 diagnostics.                                     | NOT_MEASURED: 35 required not yet reported; 11 supplemental checks queued.                      |
| [#1800](https://github.com/Verdant-OS/verdant-grow-diary/pull/1800) `f7e60c3d7bf87000208fc94fdf4deb9237adfa30` | Merge updated #1793 parent; add read-only Actions proof's missing `ready_for_review` trigger. No Action Queue operation.                                            | PASS: 4 files / 265 passed / 0 failed / 0 skipped; typecheck 0 diagnostics.                                     | NOT_MEASURED: 34 required queued, 1 not yet reported; no failed check observed.                 |

### Live smoke, next owners and rollback

**BLOCKED, write smoke:** #1792 is now at
`6df743e4358fa78c9c567a37dd32bf351426a806`.
[Job 109499761284](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/36595650327/job/109499761284)
records **1 passed / 1 failed / 0 skipped** in fixture verification, with one
automatic retry; fixture step FAILURE, write-smoke step SKIPPED. The job's
summary explicitly reports no diary entries written. The earlier archived-plant
artifact remains historical; this current result is a failed fixture
prerequisite, not successful live save/retrieve. Production-only verification
and the disposable fixture ownership/tagging fences remain enforced.

**BLOCKED, interactive live inspection:** the current browser session reaches
the sign-in page when opening the production Timeline. It provides no
authenticated saved-value readback. Signup/sign-in/reset, Actions,
Settings/account/consent and the full core loop therefore remain
**NOT_MEASURED** to their complete requested scope. No user data, fixture state,
credentials, production database or Action Queue state was changed.

Next: Codex finishes the queued repairs and fixture diagnosis; Chemdawg routes
the completed heads; Blue Dream reviews the Timeline/P1 and publish gates;
Critical Mass reviews this document; GDP owns landing reviewed heads. Matthew
owns the production-database and publish decisions. Open #1804 owns dependency
repair and #1806 owns CI-load reduction; this packet does not compete with them.

**NOT_MEASURED, approved rollback target:** the currently observed serving build
`61821446ebd7e4fb30a36a5a95b7526a34515df5` is an identity observation, not an
approved rollback receipt. The older `566315ce` candidate below remains
unapproved. Artifact availability, hosted compatibility and owner approval
must be established before rollback. This one-file documentation update has no
runtime effect and can be reverted independently.

### Addendum validation and collision audit

**PASS, local documentation validation:** `node scripts/assert-docs-safety.mjs`
passes automated-phenotyping, release and sensor categories. `node
node_modules/vitest/vitest.mjs run
src/test/assert-automated-phenotyping-docs-safety.test.ts
src/test/release-docs-safety-scanner.test.ts --reporter=dot` reports **2 files /
73 passed / 0 failed / 0 skipped**, Vitest 4.1.11. One-file Prettier and
`git diff --check` pass. No new test cases were added for this documentation
change. Typecheck, application lint, build and full-suite execution were not
repeated for this Markdown-only addendum; those new-commit outcomes remain
**NOT_MEASURED**. Hosted CI and independent document acceptance on the new
document head are also **NOT_MEASURED** until separately verified.

**PASS, collisions:** all **74** current open PR heads and complete paginated
file lists were read. Only #1795 changes this packet path. #1777 retains the
ongoing operational record; #1780 retains the promotion runbook; #1808's
historical-state archive does not overlap this file. This addendum changes only
`docs/agents/PUBLISH_READINESS_2026-09-28.md` and preserves the earlier packet.

## Historical packet — September 29, 2026, 05:27–05:30 UTC

Measured September 29, 2026, 05:27–05:30 UTC (00:27–00:30 America/Chicago).
This is the September 28 release's follow-up packet, not a new promotion request.

## Summary and authority

**PASS, frontend identity:** one public production response reports the current
deploy tip. **NOT_MEASURED, product acceptance:** the complete signed-in loop,
hosted schema, Edge identity and payment behavior are not established by that
response. **FAIL, release evidence:** additional audit failures remain visible.
No independent PASS or waiver is inferred.

Matthew owns production database changes, spend ceilings, publish gates and the
publish decision. Codex prepared this document only. No ready, auto-merge, merge,
Publish/promote, production dispatch, SQL/APPLY/PREFLIGHT, credential, device or
Action Queue operation was performed. HOLD #1250 and the named owner locks remain.

## Exact serving and source identities

| Axis                                                                 | Status       | Observation                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository/deploy branch                                             | PASS         | `Verdant-OS/verdant-grow-diary`, `verdant-grow-diary`                                                                                                                                                  |
| Deploy tip, GitHub branch read                                       | PASS         | `61821446ebd7e4fb30a36a5a95b7526a34515df5`                                                                                                                                                             |
| Public [version response](https://verdantgrowdiary.com/version.json) | PASS         | HTTP 200 at `2026-09-29T05:27:31.9666602Z`; commit `61821446ebd7e4fb30a36a5a95b7526a34515df5`; `dirty:false`                                                                                           |
| Advertised build time                                                | PASS         | `2026-09-29T03:02:39.564Z`                                                                                                                                                                             |
| Cache observation                                                    | PASS         | `X-Vercel-Cache: HIT`, `Age: 5052`; this is one cached response, not a traffic-allocation measurement                                                                                                  |
| Source-to-advertised-live commit gap                                 | PASS         | Zero at this observation; draft fixes are outside that comparison                                                                                                                                      |
| Vercel commit status                                                 | NOT_MEASURED | GitHub reports `Vercel: pending`, while `Vercel Deployments – Verdant Grow Diary: success`; native Deployment Checks, active traffic allocation and Rolling Release completion have not been inspected |

The commit status links the [target deployment inspector](https://vercel.com/verdantgrowdiary/verdant-grow-diary/FEaaYgDTMJc1KxXHGrzucJZPLkdx).
This is a measured link from GitHub, not confirmation that the inspector's checks
passed or that every production request serves that artifact. No alternate host
was used for smoke verification.

The earlier `2026-09-28T23:46:17Z` production response advertised
`566315cedd80e8d2a9ba3d312b5c466fdb568fa3`, `dirty:false`, build time
`2026-09-28T18:32:56.291Z`. That is historical evidence from the operational
record; it is not a current serving observation or an approved rollback target.

## Commits since the previously observed build

**PASS, source history:** `git log --reverse` lists these eleven commits between
the earlier observed `566315ce` and current deploy `61821446`. Their presence
does not prove each feature's hosted behavior.

| Commit                                     | Change                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `13c28a14c28fc27342a4c5d46dbb094642dcacde` | #1752: canonical Vitest discovery and pending sensor restore coverage                           |
| `bed36ab5d447136100fa776882a69af0b5ce2de7` | #1744: canonical units in imported CSV history                                                  |
| `3c8113eae50bee83a7f7fe4086ab53879817784a` | #1684: accepted AI Doctor review visibility across cutoff                                       |
| `6ca97026437ab556f7fbac752abfbe8085c1f271` | #1762: Quick Log revision receipt/request binding                                               |
| `6fb27c5aec715c14213dd79cdb5077351e40dea0` | #1767: ownership record                                                                         |
| `0755bfcc0d7ee9d4c88ee716384c28b9beb51cce` | #1781: Sentinel 2026-09-28.2 ownership amendment                                                |
| `674eb480e5e5c2b55c18dd7ac823f088c5e0b424` | #1778: stop automatic retired core-schema probes                                                |
| `5feb5471096735558021806b6dc2e90a009dd097` | #1782: superseded PR-job cancellation                                                           |
| `8b73b25a879e8d1fc526fdd7035ae1d368eab3f6` | #1754: manual snapshot retention/validation; remaining non-manual P1 accepted by owner override |
| `95464496a4dcc802710c2c08e303ffee15182a7d` | #1776: classify Quick Log revision receipt mismatches                                           |
| `61821446ebd7e4fb30a36a5a95b7526a34515df5` | #1773: fail closed on unknown/stale AI Doctor retry evidence                                    |

## Gates at the exact deploy SHA

**PASS, current required contexts:** the complete check-runs response was read
over two pages, 149 check records. Latest records by check name show **35/35
required SUCCESS**, zero missing, pending or failed required contexts: all 32
`Full test suite (shard N/32)` contexts, `Lint, typecheck, test, build`,
`Preflight — edge shared-lib mirror in sync`, and `test:legal-seo`.
Names were read from `config/required-status-checks.json` at the deploy tip.
This is current check completion, not proof that all checks completed before merge.

The supplemental `test:security-regression` and `test:security-db-local` contexts
currently report SUCCESS. Five other configured supplemental contexts are absent
and conditional; their runtime proof is **NOT_MEASURED** here, not a successful
execution. These check counts are not a count of unique test cases.

| Additional axis                 | Status       | Exact evidence and consequence                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Post-merge required-check audit | FAIL         | [Job 109236324585](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/36515363536/job/109236324585): `test:security-db-local` had not finished when merge landed; it started later and reported in_progress. A later green result does not erase the timing finding. |
| Root dependency audit           | FAIL         | [Job 109236324433](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/36515363488/job/109236324433): high-severity fast-uri advisories 1239943 and 1239946; `check:deps` exited 1. Locked dependency files were not edited or waived.                                |
| Supabase provider check         | FAIL         | Check 109236481745, `Supabase Preview`, reports `Remote migration versions not found in local migrations directory.` This is provider-check output, not a production schema verdict.                                                                                            |
| Provider job log                | BLOCKED      | The Actions job-log endpoint returned 404 for the external provider check ID. No expired-log rerun or production inspection was attempted.                                                                                                                                      |
| Live schema / Edge / payments   | NOT_MEASURED | No sanctioned hosted receipts read in this slice; repository presence and local DB tests cannot close these axes.                                                                                                                                                               |

Open [#1791](https://github.com/Verdant-OS/verdant-grow-diary/pull/1791)
contains a proposed supplemental-check evidence correction. Its own required CI
does not establish that the deployed audit's reported timing failure is false;
apply its actual rule to the exact merge evidence before any reclassification.

## Timeline release exception and its repair

**PASS, merge identity:** [#1754](https://github.com/Verdant-OS/verdant-grow-diary/pull/1754)
merged at `2026-09-29T02:13:59Z` (September 28, 21:13:59 CT), from
`0384753ae911eca2a989694f8514f116dc903757`, as
`8b73b25a879e8d1fc526fdd7035ae1d368eab3f6`.

**FAIL, independent product review:** the [owner's merge record](https://github.com/Verdant-OS/verdant-grow-diary/pull/1754#issuecomment-5882244703)
states Blue Dream returned FAIL with P1-A remaining: persisted snapshots from
sources other than manual entry bypass range validation on the mounted Timeline
card. The owner chose to ship that head and fix P1-A first on September 29. This
is an explicit owner override of FAIL; it is never a reviewer PASS.

The repair is [#1794](https://github.com/Verdant-OS/verdant-grow-diary/pull/1794),
still draft at `7866ad8d3281cadb46efa9ef32222cfe79541c59`, base
`61821446ebd7e4fb30a36a5a95b7526a34515df5`, five client/test files. It validates
every persisted source, withholds invalid chips with review copy, keeps valid
survivors/history/source labels, and gates VPD interpretation on a displayed
validated VPD chip.

- **PASS, final local proof:** 15 files, 333 passed / 0 failed / 0 skipped,
  including 44 new cases; project typecheck 0 diagnostics; scoped ESLint 0 errors
  and one base-existing hook warning; formatting and whitespace pass.
- **PASS, required CI:** 35/35 SUCCESS at the exact repair head; Main CI
  [109266800261](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/36525248413/job/109266800261)
  succeeds. Its conditional QuickLog RPC runtime harness is SKIPPED, not proof.
- **FAIL, additional audits:** root 109266743481 (fast-uri) and nested
  109266743639 (undici GHSA-3wwx-pv8p-q78v). Both logs were read; repairs require
  locked dependencies.
- **NOT_MEASURED, independent acceptance:** no formal review and no Blue Dream
  acceptance packet was found in the inspected PR review/comment records.
- **NOT_MEASURED, remaining hosted completion:** authenticated census and native
  local-backend jobs are still in progress at this observation; their eventual
  completion cannot establish production behavior.
- **NOT_MEASURED, live repair:** the serving SHA is the base, not this draft head.
  A live probe cannot verify a repair absent from the measured serving build.

## Safe production-smoke prerequisite

Hosted verification uses `https://verdantgrowdiary.com` only. An authorized write
requires the disposable `cheekhimself@gmail.com` account to positively own the
active grow, tent and plant, with every saved record tagged `[smoke <timestamp>]`.
Do not use the KEEP account, customer plants or a privileged seeder.

**BLOCKED, current write smoke:** [#1792](https://github.com/Verdant-OS/verdant-grow-diary/pull/1792)
at `34f8beae3334cceb6f914df904a6842c90005eb4` recorded hosted fixture verification
**1 passed / 1 failed / 0 skipped**, one automatic retry. Artifact 11010864748
shows the configured plant `1d0fac37-1eea-4924-94fa-2e725da288c3` is archived.
The write-producing checklist was skipped before writes. This packet does not
unarchive it, relax the fence or change CI variables/credentials. An active owned
fixture is needed to continue save/retrieve and signed-in timing.

**NOT_MEASURED:** live Timeline value readback, AI Doctor credit-limit smoke,
Dashboard/Daily Check behavior, signed-in performance, the complete One-Tent Loop,
signup/reset, Settings/consent and Action Queue verification. Source/fixture tests
are separate evidence. No Action Queue operation is authorized by this packet.

## Owner next step and rollback boundary

**NOT_APPLICABLE, promotion to close the current advertised commit gap:** this
observation already matches deploy. No new promotion is requested merely to make
the same advertised SHA live again.

The next product release first needs Blue Dream acceptance of #1794's exact head,
GDP landing on its reviewed SHA, and fresh gates at the resulting deploy SHA.
After those prerequisites, Matthew/the Vercel team owner inspects the exact
deployment's checks and current/canary/queued Rolling Release identities before
any owner promotion. Then re-read public version identity and measure the fix on
the approved active fixture. This document neither queues nor performs that step.
The separate [#1780 promotion runbook](https://github.com/Verdant-OS/verdant-grow-diary/pull/1780)
remains a draft; no second operational procedure is introduced here.

**NOT_MEASURED, approved rollback:** `566315cedd80e8d2a9ba3d312b5c466fdb568fa3`
is a previously observed build candidate only. Reverting to it removes later
safety fixes, including #1773; owner approval, artifact availability and runtime
compatibility must be measured first. No database rollback, user-data deletion,
traffic change or rollback action was performed. Reverting this documentation
commit has no runtime effect.

## Collision audit and handoff

**PASS, this documentation delta:** `bun run test
src/test/assert-automated-phenotyping-docs-safety.test.ts --reporter=dot`
reports 1 file / 67 passed / 0 failed / 0 skipped, Vitest 4.1.11.
`node scripts/assert-docs-safety.mjs` passes its automated-phenotyping, release
and sensor categories; one-file Prettier check and `git diff --check` pass.
No new tests or application behavior are introduced. Typecheck, application lint,
build and the full suite were not rerun for this one Markdown file; those outcomes
are **NOT_MEASURED** for the new document commit, not inherited from its base.
New-head hosted CI and independent document acceptance remain **NOT_MEASURED**.

**PASS, scoped audit:** all 66 open PR head/base pairs were read; complete file
lists for 64 unchanged pairs were revalidated, and #1777/#1794 were read fresh.
No PR changes this packet path. #1780 owns the distinct promotion runbook;
#1777 owns the ongoing operational record. Neither is replaced. Historical
receipts, Pheno ownership and named locked branches stay unchanged.

Owner: Codex for this single-file docs packet. Critical Mass reviews the document;
Blue Dream retains the product publish gate. Matthew owns production acceptance.
**Verdict: BLOCKED for a claim of complete production acceptance.** Advertised
frontend identity matches source, but the known Timeline exception, audit
failures, native deployment-check gap and active-fixture gap remain explicit.
