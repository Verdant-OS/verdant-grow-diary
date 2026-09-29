# Verdant release checkpoint — September 28, 2026

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
