# Test Coverage Audit — 2026-08-29

**Audited by:** Claude (Knowledge Library and Product Specification Architect), audit-only capacity
**Subject:** the whole test estate — Vitest, Playwright, Deno edge tests, pgTAP suites, runtime RLS harnesses
**Measured against:** `verdant-grow-diary` deploy lineage at **`5d6efc9`** (`fix(sensors): fail-closed Authorization NTLM redaction (#1216)`)
**Measurements taken:** 2026-08-29, by execution in a Claude Code remote session (Linux, `node_modules` bootstrapped via the npm public-registry override documented in `.claude/skills/run-verdant-grow-diary/SKILL.md`)

This document is **read-only audit**. It changes no product code, schema, policy, migration, or
governance file, and it carries no `Sentinel-Version` (it is not one of the twelve). It proposes
work; it does not perform it.

Every count below was re-derived at `5d6efc9`. Where a number here disagrees with `CLAUDE.md`'s
orientation section, that is expected — those counts were measured at `f25f9ed` (#1020), which is
not present in this clone's history, so the exact commit distance is `NOT_MEASURED`. The tip here is
#1216. Those numbers are stale, not wrong for their commit.

---

## 0. Executive recommendation

**The repository has a large, disciplined test estate and no idea what it covers.**

Two things are true at once, and the second is the one that needs work:

- **Breadth is genuinely good.** **3,008 test files across four lanes** — 2,908 Vitest, 60
  Playwright, 31 Deno, 9 pgTAP. The Vitest lane discovers **39,407** cases and **executes 39,217**
  (190 skipped, §9). 97.8% of product modules are reached by some Vitest test. Zero `.only`
  anywhere. That is better than most repositories this size.
  Every per-case and per-assertion figure in this document is **Vitest-only** unless it says
  otherwise; the other three lanes are counted by file, because nothing aggregates their cases.
- **Depth is unmeasured, and four separate lanes of already-written tests never execute.**
  There is no coverage instrumentation of any kind, so the fraction of _branches_ the suite
  exercises is `NOT_MEASURED`. **16.1% of all Vitest assertions** are `toContain`/`toMatch` checks
  against source **text** inside scan-only files (14,054 of 87,333) — a class proven by execution
  in §3 to go red on behaviour-preserving refactors and stay green through real behaviour breaks.
  And 21 of 31 Deno edge tests, 18 of 33 runtime RLS/billing harnesses, 7 of 9 pgTAP suites, and
  25 of 60 Playwright specs are never run by any workflow.

The single highest-value action is not writing new tests. It is **running the tests that already
exist** (§7, P2) and **measuring what they touch** (§7, P1). Both are small, both are cheap, and
neither requires a product decision.

The calibrated verdict is at §10.

---

## 1. Method, and what it cannot tell you

`established fact` unless labelled otherwise. **Every _static_ count below is reproduced by
`scripts/measure-test-estate.mjs`**, committed with this audit — run
`node scripts/measure-test-estate.mjs --rev 5d6efc9` (add `--json` for the full report) to re-derive
them. **Every figure below is pinned to `5d6efc9`**, and the script reads that revision from the git
object store rather than the working tree, so a different checkout, a modified file or an untracked
one cannot move a published number. A measurement nobody can re-run is not evidence, which is the same
defect this document is about.

**The script launches no test runner, so three classes of figure are deliberately outside it** and
have to be reproduced the slower way:

- **Executed-case results** — the 39,407 discovered / 39,217 executed / 190 skipped in §9, and every
  pass/fail count — come from an actual `vitest run` and from CI, not from the script. Its
  `it()`/`test()` call-site total (31,941) counts registration calls in source and is **not** the
  same measurement; limit 4 below says why they differ.
- **The two mutation experiments in §3** are described step by step because they deliberately mutate
  and restore a product file.
- **Anything attributed to a workflow run or a check name** is read from CI, which the script cannot
  see.

**What the script does derive is exactly this list**, and nothing outside it should be read as
covered by the claim above:

`testFiles` · `productModules` · `itTestCallSites` · `expectCallSites` · `skipCallSites` ·
`onlyCallSites` · `scanOnlyFiles` · `scanOnlyExpects` · `scanOnlyCases` ·
`scanOnlySubstringAssertions` · `hybridFiles` · `hybridExpects` · `hybridCases` ·
`behaviouralFiles` · `behaviouralExpects` · `filesDoingFileIo` · `filesReadingSrcPaths` ·
reachability (`direct` / `transitiveOnly` / `unreached`, with the unreached files named) · the four
lanes' `total` / `executed` / `never` with every never-executed file named · and
`testFilesAcrossAllLanes`.

Every other number in this document was measured by hand — the 7 `@source-scan-justified`
declarations (§3), the Quick Log counts in §6, the keyword and required-check figures in §5 and §9 —
and each names the file or command it came from where it appears. They are `established fact` where
so labelled, but they are **not** reproduced by one command, and a reader checking them has to
follow the source named beside them.

| Axis                        | How it was measured                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File and case counts        | `git ls-tree` at the pinned revision; `it` / `test` / `expect` **call sites parsed from the syntax tree**, never matched as text — `/re/.test(x)` is not a case and `"expect("` inside a string is not an assertion                                                                                                                                                                                                                                                                         |
| Module reachability         | **Runtime** import graph from `@/…` and relative specifiers, BFS-seeded from test files. Imports are read from the **TypeScript compiler's own AST**, not regex-matched, so commented-out and template-literal specifiers are not edges. `import type` / `export type`, fully type-only clauses and `import()` in a **type** position are erased by the transpiler and excluded; `vi.importActual` and a bare `vi.mock` load the real module and count, a `vi.mock` with a factory does not |
| Test _kind_ (scan vs value) | A **call** to `readFileSync`/`readFile`/`readdirSync`/`globSync` — a type member or an injected fake of that name is a declaration, not a read — vs product imports (alias **and relative**) vs `render()`                                                                                                                                                                                                                                                                                  |
| CI execution                | The **command lines** of every workflow `run:` step, plus expansion of `package.json` script chains and one hop into repo runners. A path named only in a trigger filter, a `paths-filter` allowlist, a shell array or a job summary is a mention, not an invocation                                                                                                                                                                                                                        |
| Behavioural strength        | Two mutation experiments run by execution against `src/pages/Timeline.tsx` (§3)                                                                                                                                                                                                                                                                                                                                                                                                             |
| Executed suite result       | One unsharded `npx vitest run` at `5d6efc9`, plus CI's 32 shards on the PR head (§9)                                                                                                                                                                                                                                                                                                                                                                                                        |

**Five limits, stated up front so nothing below is over-read:**

1. **Module reachability is not coverage.** "A test imports this module" says nothing about which
   branches ran. Only instrumentation answers that, and there is none (§2).
2. **Barrel re-exports defeat path-based counting.** `src/lib/entitlements/capabilityAccess.ts` has
   zero tests importing it _by path_, yet `canUseCapability` is behaviourally exercised through
   `@/lib/entitlements` in `entitlement-capability-matrix.test.ts`. Every per-module claim in this
   document was re-checked against the barrel before being made; treat any future path-grep
   coverage claim as unreliable for the same reason.
3. **The reachability graph is Vitest-only.** Playwright drives the built app in a browser and is
   not in that graph — the three `src/pages/legal/*.tsx` pages are "unreached" by Vitest and are
   covered by the `test:legal-seo:e2e` lane.
4. **Static call-site counts are not executed-case counts.** The per-bucket tables in §3 count
   `it` / `test` / `expect` **calls, parsed from the syntax tree**, because that is the only way to
   attribute a case to a _kind_ of test without instrumentation. The runner **discovers 39,407**
   cases and **executes 39,217** of them (190 skipped), against **31,941** such call sites — the
   discovery gap being `it.each`/`test.each` expansion and generated cases. Discovered, executed and
   call-site counts are three different numbers; §3's ratios compare call sites with call sites, so
   they hold, but do not mix a number from §3 with one from §9. The same gap applies to skips:
   **11** `.skip` call sites in source, **190** skipped cases at runtime. All of these are
   Vitest-only.
5. **`NOT_MEASURED`, not zero:** line coverage, branch coverage, and mutation score. See §8.

---

## 2. Finding F1 — there is no coverage instrumentation at all

`established fact`, verified by execution.

| Probe                                                       | Result     |
| ----------------------------------------------------------- | ---------- |
| `@vitest/coverage-v8` / `@vitest/coverage-istanbul` in deps | **absent** |
| `c8`, `nyc`, `istanbul` in deps                             | **absent** |
| `coverage` key in `vitest.config.ts`                        | **absent** |
| Any `package.json` script mentioning coverage               | **absent** |
| Any workflow running a coverage reporter                    | **absent** |

The six workflow files matching `coverage` all use the word in prose ("browser compatibility
coverage", "outside compiler coverage"). There is no coverage artifact, no baseline, and no
history.

Consequences, in order of severity:

- The repository cannot answer "is this module tested?" except by the weak proxies used in this
  document, whose failure mode is documented in §1 limit 2.
- A new test cannot be shown to increase coverage, so PR bodies argue coverage from file counts.
- `AGENTS.md`'s status vocabulary is explicit that an unmeasured metric is `NOT_MEASURED` and
  "never a perfect score". Repo-wide statement-, branch- and function-coverage are therefore all
  **`NOT_MEASURED`** as of `5d6efc9`, and no document should say otherwise until P1 lands.

---

## 3. Finding F2 — a fifth of the Vitest suite asserts on source text, not behaviour

`established fact` for the counts. **`established fact`, proven by execution**, for the two
experiments — which demonstrate the failure mode on **one** pin, in both directions. That the whole
bucket shares the mechanism is `inference`, not measurement: what is measured is that these files
import no product module and render nothing, so nothing in them observes runtime behaviour.

### 3.1 The measurement

| Bucket                                                                      | Files             | Assertions         | Cases             |
| --------------------------------------------------------------------------- | ----------------- | ------------------ | ----------------- |
| **Scan-only** (reads files; imports no product module; never renders)       | **622** (21.4%)   | **18,525** (21.2%) | **5,912** (18.5%) |
| Hybrid (scans files _and_ imports/renders)                                  | 771               | 29,923             | 11,396            |
| Pure behavioural (no file I/O at all)                                       | 1,515 (52.1%)     | 38,885             | —                 |
| **Any file I/O** (calls `readFileSync`/`readFile`/`readdirSync`/`globSync`) | **1,393** (47.9%) | —                  | —                 |

Within the scan-only bucket, **75.9% of assertions are `toContain(...)` or `toMatch(...)`** —
14,054 substring and regex checks over file text, which is **16.1% of all 87,333 Vitest
assertions**, not 21.2%. (21.2% is the bucket's total share of assertions; the two figures were
conflated in an earlier draft of §0.) Precisely, that count is **`toContain`/`toMatch` calls inside
scan-only files**; it does not trace each matcher's receiver back to file content. Measured, **4 of
the 14,054** assert membership in a literal array rather than matching text — `expect(["live",
"manual", …]).toContain(p.source)` and three like it. 0.03%, so the 16.1% headline is unchanged
either way, but the metric is named for what it counts rather than what it mostly means. The hybrid bucket contributes further source-text assertions
that are `NOT_MEASURED` — its files mix scanning with real imports, and the two were not separated.
428 test files read a path under `src/` — counting only reads whose own path argument resolves
to one, which is a floor: a path this cannot resolve statically is not counted.

Every figure in that table is a **static count of source occurrences**, per §1 limit 4 — the ratios
are static-against-static and hold, but they are not the runner's executed-case numbers in §9.

Names in that bucket read like behaviour tests, not like lint rules:
`action-queue-row-evidence-badge.test.ts`, `timeline-grow-filter.test.ts`,
`quick-log-maturity-evidence-sheet-wiring.test.ts`, `dashboard-plants-kpi-source-label.test.ts`.

`AGENTS.md` already forbids exactly this for contract tests, citing the
`playwright-action-timeout-fence` precedent where commenting a setting out left the guard green.
The enforcement script `scripts/check-contract-test-resolution.mjs` implements that rule — but its
`CONFIG_FILES` constant is `["playwright.config", "vitest.config"]`. **Two files.** Nothing checks
the 428 tests that scan `src/`. Repo-wide there are **7** `@source-scan-justified` declarations.

### 3.2 Experiment A — a behaviour-preserving refactor turns the gate red (false positive)

`src/test/timeline-grow-filter.test.ts` pins `src/pages/Timeline.tsx:413` with
`expect(TIMELINE).toMatch(/urlGrowId\s*\?\?\s*storeGrowId/)`.

Baseline: 10/10 pass. Then, changing only that line to the semantically identical

```ts
const preferredGrowId = urlGrowId != null ? urlGrowId : storeGrowId;
```

→ **1 failed | 9 passed**, at `Timeline — grow filter > falls back to store grow id when URL param absent`.

Nothing about the product changed. `??` and `!= null ?` are equivalent for null and undefined.
The gate is pinned to the _spelling_.

### 3.3 Experiment B — a real behaviour break stays green (false negative)

Reversing the scope precedence — a genuine product bug, in which `?growId=` in the URL stops
overriding the grower's stored active grow — while leaving the pinned text present in a comment:

```ts
// fallback order: urlGrowId ?? storeGrowId
const preferredGrowId = storeGrowId ?? urlGrowId;
```

→ `timeline-grow-filter.test.ts`: **10 passed (10)**.

Widened to **every** test file whose name matches `timeline` or `scoped-grow` — 156 files —
against the same injected bug:

> **Test Files 156 passed (156) · Tests 1925 passed (1925)**

1,925 test cases across the Timeline surface do not detect a reversal of Timeline's grow-scope
precedence. The working tree was restored with `git checkout --` and verified byte-identical
before any commit, per `AGENTS.md`'s "never commit while an automated review is mutating the
working tree".

### 3.4 Why this matters beyond Timeline

Source-scan pins are not merely weak; they are **actively expensive**, because they charge a
refactoring tax on changes that are behaviour-neutral. `CLAUDE.md` already records the symptom —
"Many tests read source files and pin exact expressions, copy strings, and occurrence counts.
Renegotiate pins in the same commit as the behavior change; never whole-file-format a legacy
file." That guidance manages the cost. It does not recover the lost signal.

Scanning is still correct for what it is good at: proving a string or construct is **absent**
(secret scans, "no `continue-on-error`", generated-artifact shape). The problem is scanning used
as a proxy for behaviour.

---

## 4. Finding F3 — tests that exist and never run

`established fact`, measured by expanding every workflow plus transitive `package.json` script
chains, then matching file paths.

| Lane                             | Total | Executed by some workflow | **Never executed** |
| -------------------------------- | ----: | ------------------------: | -----------------: |
| Deno edge-function tests         |    31 |                        10 |             **21** |
| Playwright e2e specs             |    60 |                        35 |             **25** |
| Runtime RLS / billing harnesses  |    33 |                        15 |             **18** |
| pgTAP suites (`supabase/tests/`) |     9 |                         2 |              **7** |

### 4.1 Edge functions — 21 dead test files

Vitest's `include` is `src/**/*.{test,spec}.{ts,tsx}`, so colocated `supabase/functions/**` tests
are invisible to it. Only four workflows run `deno test`, each naming files explicitly. Never run:

- **the entire `pi-ingest-readings` unit suite** — `bridgeCredentialLookup`,
  `bridgeCredentialLookupContract`, `bridgeCredentialRow`, `secretResolver`, `idempotencyLookup`,
  `tentOwnerLookup`, `commitBatch`, `index` (8 files). This is the bridge credential and tent
  **ownership** boundary. `smoke.test.ts` _is_ wired — but only into `pi-ingest-smoke.yml`, which
  hits a **deployed** function URL behind repo secrets, so it proves nothing pre-merge.
- `paddle-webhook/security.test.ts` — signature verification on the billing webhook. A
  `test:paddle-webhook-edge-security` script exists in `package.json` and **no workflow calls it**.
- `rls-selftest/index.test.ts`, `save-founder-prefs/validate_test.ts`,
  `handle-email-unsubscribe/contract.test.ts`, `send-transactional-email/contract.test.ts`,
  `edge-metrics-alert-check/index.test.ts`, `ai-cultivar-qa/grounding.test.ts`, and all six
  `founder-slots-remaining` tests.

Nothing warns about this. The files look like coverage in review and are inert.

### 4.2 Playwright — 25 specs never run, and several are credential-free

> **Corrected 32 → 29 → 25.** The number moved twice, and the movement is the point: each
> refinement of the resolver found another way a workflow reaches a spec. It is now cross-checked
> against a second, independently written resolver, and the two agree file-for-file. The first
> version of this section, and the first version of
> `scripts/measure-test-estate.mjs`, resolved "does a workflow run this spec?" by substring-matching
> raw workflow YAML. That model was wrong in both directions and is now fixed in the script:
>
> - A spec named only inside a workflow's `on: … paths:` filter was counted as **executed**. A
>   trigger filter decides _when_ a workflow runs, never _what_ it runs.
>   `e2e/pheno-workspace-missing-evidence-anchors.spec.ts` was miscounted this way.
> - `bun --env-file=.env run e2e:one-tent:ui` did not match a script-expansion regex that required
>   `run` to follow the runner immediately, so `quicklog-smoke.yml`'s execution of
>   **`e2e/one-tent-loop-golden-path-ui.spec.ts`** was invisible. That spec **does** run.
> - A workflow that runs `bun run scripts/e2e/<runner>.mjs` hides its spec list inside that runner.
>   The three `pheno-disabled-compare-*` specs are executed that way, and
>   `e2e/pheno-tracker-paid-user-smoke.spec.ts` runs through
>   `pheno-ephemeral-role-e2e.yml:90` → `test:pheno-paid-smoke:local` →
>   `scripts/e2e/run-pheno-paid-smoke-local.mjs:253`.
>
> The corrected resolver matches on **exact repo-relative path equality**. That exactness is not
> fussiness: a prototype that accepted directory and glob tokens reported all 100 lane files as
> reached, because a bare `**` token appears somewhere in the corpus — a guard that can never fail.
>
> **The 29 → 25 step**, found by cross-checking against a second resolver: `google-analytics-e2e.yml`
> runs `bun run e2e:ga:${{ matrix.browser }}` over `browser: [chromium, webkit]`, which resolves to
> `e2e:ga:chromium` / `e2e:ga:webkit` → `e2e:ga` → **all four** `google-analytics-*.spec.ts`. A
> matrix-interpolated script name is not a literal, so the script now takes the literal prefix and
> counts every package script extending it. Conservative here means "counts as executed", which is
> the safe direction for a guard that must never call a file dead while something runs it.
>
> The two resolvers disagreed on exactly one file, and the disagreement was settled by exhaustive
> search rather than by preferring a number: `e2e/pheno-workspace-missing-evidence-anchors.spec.ts`
> occurs **once** in the whole repository outside itself, at
> `.github/workflows/pheno-disabled-compare-e2e.yml:13`, inside `on: pull_request: paths:`. It is
> never executed, so it stays in the 25.
>
> **Naming is still not running.** That same workflow is marked `# dormant: deliberately main-only
(#581)` with `branches: [main]`, so the three `pheno-disabled-compare-*` specs it runs are counted
> as executed here and never execute on the deploy branch. This lane measures whether a workflow
> _names_ a file. Whether that workflow is live is a different axis, owned by
> `src/test/workflow-branch-filter-liveness.test.ts`.

Authenticated specs legitimately report `blocked` without owner credentials; that is documented and
expected. But specs that stub **all** Supabase traffic with `page.route()` could run on every PR
and do not. Verified credential-free and unrun:

- **`e2e/quick-log-activation-handoff.spec.ts`** — the anonymous `/quick-log` draft → mocked signup
  → resume card → **exactly one `quicklog_save_manual` RPC** → draft cleared only after confirmed
  success → entry visible in Timeline. That is a browser-level proof of the single write path
  `docs/specs/one-tent-loop-quicklog-single-write-path.md` freezes, and of the failure path. It
  never runs.
- **`e2e/sensors-truth-closure.spec.ts`** — sensor source/quality labelling in the browser, fully
  intercepted (4 `page.route` blocks).
- `plant-detail-quicklog-watering-readpath` (4 `page.route` blocks), `timeline-local-day-date-filter`
  (8), `ui-overhaul-responsive` (7), `tents-mobile-overflow` (4), `dashboard-mobile-overflow` (4),
  `post-claude-route-access` (4), `analytics-consent-gate` (1).
- `public-quick-log-starter` installs **no** route mocks and needs none: `/quick-log` is a public
  route that saves a draft locally, and `AGENTS.md` lists it as a credential-free smoke surface.
  It is credential-free for a different reason from the others, not because it stubs traffic.

**Correction — three specs are NOT credential-free**, raised by Codex on #1218 and confirmed here by
reading them. `manual-sensor-snapshot-edit-smoke`, `quick-log-target-panel-smoke` and
`evidence-tile-mismatch-smoke` install **zero** `page.route` mocks and open with a `test.skip` gated
on a fixture URL — `E2E_MANUAL_SNAPSHOT_STRIP_URL`, `E2E_GROW_1_PLANT_URL`,
`E2E_EVIDENCE_TILE_PLANT_URL` — then `page.goto` that real URL unmocked. Wiring them into
`chromium-mocked` would record vacuous skips that read as coverage, or reach an external
authenticated fixture. They need an authenticated fixture lane or an explicit exemption, and an
earlier draft of this section listed them under "verified credential-free" when only their unrun
status had been verified. The word `verified` was doing work an inference had done: the per-spec
`page.route` count was in hand and not consulted. **10 of the 13 candidates are credential-free;
3 are fixture-gated.**

### 4.3 Runtime harnesses — including the two the constitution names

`AGENTS.md` §Validation Commands lists exactly two harnesses as common commands:

```bash
bun run scripts/run-billing-rls-harness.ts
bun run scripts/run-ai-credits-rls-harness.ts
```

**Neither is reachable from any workflow.** Also unreachable: `run-action-queue-rls-harness`,
`run-create-feeding-event-rls-harness`, `run-quicklog-typed-payloads-harness`,
`run-ai-credit-grow-scope-integrity-harness`, `run-ai-credit-pack-portability-harness`,
`run-ai-doctor-review-completion-rls-harness`, `run-ai-doctor-review-evidence-receipt-rls-harness`,
`run-free-creation-caps-rls-harness`, `run-genetics-propagation-rls-harness`,
`run-paid-launch-proof-harness`, `run-pheno-candidate-number-rls-harness`,
`run-quicklog-revisions-rls-harness`, `run-sensor-history-read-cap-rls-harness`,
`run-staff-grant-trigger-harness`, `run-staff-role-rls-harness`, `run-verdant-storage-rls-harness`.

`AGENTS.md` requires runtime harnesses for money/security paths precisely because "static scan
tests are useful but not enough". The harnesses were written. The lane that runs them was not.

### 4.4 pgTAP — the billing RLS suite is one of the seven that never run

`supabase/tests/` holds 9 suites. Exactly **two** are executed by a workflow —
`create_feeding_event.sql` and `create_watering_event.sql`, both via
`irrigation-pgtap-rls-gate.yml`. Never run: **`billing_subscriptions_rls.sql`**,
**`permissions.sql`**, `paddle_subscription_update_rpc_harness.sql`,
`pheno_candidate_number_maintenance_paths.sql`, `vpd_targets.sql`,
`vpd_targets_global_defaults.sql`, and `pheno_candidate_number_contract.sql` — the last of which
_is_ referenced, but only by `scripts/p3-preservation/contract.mjs`, which no workflow invokes.

---

## 5. Finding F4 — the required-gate mirror under-declares the gates the repo relies on

`established fact`, read from `config/required-status-checks.json` and the workflow headers.

The ruleset requires **35** contexts: 32 `Full test suite (shard n/32)`, `Lint, typecheck, test,
build`, `Preflight — edge shared-lib mirror in sync`, `test:legal-seo`.

Five workflows describe themselves as a required gate or stop-ship check. **Only `ci.yml` has a
job name in that list.** `irrigation-pgtap-rls-gate.yml` — whose own header opens _"Required PR
gate for RLS/ACL regressions on irrigation-evidence trust boundary"_ — is not in it, and
`grep -c 'pgTAP' config/required-status-checks.json` returns **0**.

The repo already knows this failure mode: `mustBeGreen` exists for exactly this, and
`required-check-audit.yml` post-merge-audits it. But `mustBeGreen` carries **one** entry
(`test:security-regression`), added after PR #769 merged red. The same silent-gate class now
applies to the pgTAP gate, `security-db-local.yml`, and `sensor-ingest-webhook-edge-tests.yml`
(which runs six Deno edge tests and gates nothing).

---

## 6. Finding F5 — depth is thinnest where consequence is highest

`practical observation`, from test-file counts by filename keyword at `5d6efc9`. Filename keywords
are a crude proxy; the ordering is the point, not the digits.

| Domain (filename keyword) | Test files |
| ------------------------- | ---------: |
| sensor                    |        289 |
| ai-doctor                 |        274 |
| pheno                     |        174 |
| ecowitt                   |        164 |
| quick-log / quicklog      |  155 / 105 |
| timeline                  |        154 |
| action-queue              |         96 |
| migration                 |         67 |
| alert                     |         61 |
| paddle                    |         41 |
| credit                    |         37 |
| **entitlement**           |     **27** |
| **billing**               |     **21** |
| **rls**                   |     **19** |

The money surface — entitlements, billing, credits, Paddle — carries roughly 126 test files, the
smallest mass of any major domain, while `AGENTS.md` singles it out as the one that needs runtime
proof. It is also the surface whose runtime harnesses do not run (§4.3), whose pgTAP RLS suite does
not run (§4.4), and whose webhook signature test does not run (§4.1). Those four facts compound:
the money path's static tests are the thinnest **and** its non-static lanes are all dark.

Second, the Quick Log write path — the product's frozen core:

- 59 test files reference `quicklog_save_manual`; **36 of them scan source text.**
- 8 test files reference `applyQuickLogV2Refresh`; **7 of them scan source text.**
- The one browser proof of the whole loop, `quick-log-activation-handoff.spec.ts`, never runs (§4.2).

---

## 7. Proposed improvements

Ordered by value per unit of risk. Each is a slice: one owner, one _different_ peer as independent
reviewer, per `AGENTS.md`. **None of these is assigned here** — assignment is Cheek's call.

### P1 — Instrument coverage, report-only, off the merge gate `smallest credible next tranche`

Add `@vitest/coverage-v8`; add a `coverage` block to `vitest.config.ts` with
`include: ["src/**"]`, `json-summary` + `text` reporters, and **no thresholds**.
The `include` scoping is the load-bearing part: `coverage.include` defaults to `["**"]` in the
installed Vitest 3.2.7, so an unscoped baseline sweeps `scripts/`, `e2e/` and `supabase/` as well and
the resulting percentage means nothing. Do **not** bother setting `all: true` — Copilot raised this
on #1218 as "the removed `coverage.all` option", and that premise is wrong for this repo:
`all` is present in 3.2.7's `BaseCoverageOptions` with `@default true` and carries no `@deprecated`
tag (the only one in that declaration file is `server.deps.fallbackCJS`). It is redundant, not
unavailable. The reviewer's conclusion — that explicit `include` patterns are required — holds for
the different reason given above. Add `test:coverage`. Run it in a **new, non-required, scheduled** workflow, not in
the 32-shard required lane — coverage instrumentation on ~2,900 files will slow the merge path, and
sharded coverage needs a merge step that is not worth building in tranche 1.

- **Acceptance:** one committed baseline `coverage-summary.json` artifact; a `docs/` note recording
  statement/branch/function coverage at a named SHA; zero change to required contexts.
- **Explicitly not in scope:** any coverage threshold. Setting a number before a baseline exists is
  how a repo gets tests written for the metric. Thresholds are a later tranche, per-directory, and
  should start at the measured baseline minus a small margin (a ratchet, not a target).
- **Risk:** low. Additive dev dependency, additive config, additive workflow. Rollback is a revert.

### P2 — Run the tests that already exist `highest value per hour`

No new tests. Three wiring changes:

1. **Edge Deno tests.** Add `test:edge:all` running every colocated `supabase/functions/**/*{.test.ts,_test.ts}`
   **except** `pi-ingest-readings/smoke.test.ts` (it targets a deployed URL and needs secrets), and
   call it from the required `Lint, typecheck, test, build` job — the same place the two existing
   Deno steps already run. Prove each of the 21 currently-dead files green before wiring, and report
   any that are already red as findings rather than deleting them.
2. **Credential-free Playwright specs.** Extend the mocked-e2e lane to the specs listed in §4.2,
   starting with `quick-log-activation-handoff` and `sensors-truth-closure`. Keep an explicit spec
   filter — `chromium-mocked` installs no global route mocks, so an unfiltered run can reach real
   Supabase.
3. **pgTAP.** Add `billing_subscriptions_rls.sql` and `permissions.sql` to a suite that runs.

- **Acceptance:** a manifest test asserting that every file under `supabase/functions/**` matching
  the test-file pattern, every `supabase/tests/*.sql`, and every `e2e/*.spec.ts` is either named by
  a workflow or carries a documented exemption reason. _This_ is a legitimate source-scan test — it
  proves absence of an unexecuted file, which is what scanning is good at (§3.4).
- **Risk:** medium-low. Newly-executed tests may be red. That is the finding, not a reason to skip;
  never skip, disable, or quarantine one to get green.

### P3 — Stop source-scanning behaviour, with a ratchet rather than a big bang

1. **Extend `scripts/check-contract-test-resolution.mjs`** from its two `CONFIG_FILES` to any test
   that `readFileSync`s a `src/**` path it never imports — keeping the existing
   `@source-scan-justified: <reason>` escape hatch, which already prints on every run.
2. **Baseline the existing 622** into an allowlist so only _new_ violations fail. Shrink the
   allowlist per slice; never whole-file-format a legacy test file while doing it.
3. **Convert by consequence, not alphabetically.** First: the Quick Log write path (36 files), the
   Timeline scope pins, Action Queue evidence rendering. A converted test renders the component or
   calls the rules module and asserts on **values**.

- **Acceptance, per converted file, stated as the two experiments in §3:** the behaviour-preserving
  refactor of Experiment A leaves it **green**, and the precedence reversal of Experiment B turns it
  **red**. Put the RED-before-fix count in the PR body, as the repo already requires.
- **Risk:** medium. Converting a pin can lose a real constraint. Convert in small slices, and keep
  genuine absence-proofs as scans.

### P4 — Declare the gates the repo actually relies on

Add to `mustBeGreen` in `config/required-status-checks.json`: the irrigation pgTAP gate,
`security-db-local`, and `sensor-ingest-webhook-edge-tests` (with `alwaysRuns` set honestly —
`false` for path-filtered lanes, so a legitimate no-run cannot produce a false red). That file's own
notes invite this: _"Add money/core schema gates here as they stabilise."_

- **Acceptance:** `required-check-audit.yml` fails when replayed against a merge where one of those
  contexts was present-and-red. **Do not** add them to the ruleset itself without Cheek — that
  changes the merge queue.
- **Risk:** low, and it is the cheapest of the five.

### P5 — A money/security runtime lane that reports `BLOCKED`, never `PASS`

Give the 18 unreachable harnesses (§4.3) a home: a disposable-stack workflow modelled on
`irrigation-pgtap-rls-gate.yml`, starting with `run-billing-rls-harness.ts` and
`run-ai-credits-rls-harness.ts` — the two `AGENTS.md` names. Where credentials are absent the lane
must report `BLOCKED`, never a vacuous pass; a harness that skips silently is worse than one that
does not exist, because it reads as coverage.

- **Acceptance:** both named harnesses execute against a disposable local stack on a schedule, with
  their skip path emitting `BLOCKED`.
- **Risk:** medium — it needs a stack boot, and it must never touch the hosted project ref.

### Later, not now

**Mutation testing** (e.g. Stryker) scoped to the 488 `*Rules.ts` modules would replace this
document's two hand-run experiments with a continuous number, and it fits this repo's evidence
culture better than a coverage percentage does. It is not tranche 1: it needs P1's baseline and
P3's converted tests first, or it will simply report that source-scan tests kill no mutants.

---

## 8. `NOT_MEASURED` / `BLOCKED`

Not to be rounded up by anyone quoting this document.

- **Statement, branch and function coverage** — `NOT_MEASURED`. No instrumentation exists (§2).
  There is also **`NO_BASELINE`**: no prior coverage measurement exists to compare against.
- **Mutation score** — `NOT_MEASURED`. Two mutants were run by hand (§3); that is an existence
  proof, not a score.
- **Per-shard balance in CI** — `NOT_MEASURED`. Individual shard durations were not collected.
  Suite wall time on one unsharded container **is** now measured: 1,078.77s (§9). That does not
  predict the 32-shard CI lane.
- **Whether the 21 dead edge tests and 7 dead pgTAP suites pass today** — `NOT_MEASURED`. They were
  found unexecuted; they were not run. Some may be red. P2 must establish this before wiring.
- **Playwright suite state** — `NOT_MEASURED` as a suite. No spec was executed **locally** for this
  audit. CI is not silent, though: the required `test:legal-seo` job runs `test:legal-seo:e2e`
  (`.github/workflows/ci.yml`), so one Playwright spec did execute and go green on the audited head —
  §9 records that context. An earlier draft said flatly that no spec was executed, which was wrong
  about CI; the claim only ever held locally. `CLAUDE.md` records some mocked specs as known-flaky.
- **Production, deployment, indexing** — untouched and out of scope. A merge is not a deployment.
- **Whether any of these gaps has ever admitted a defect to production** — `NOT_MEASURED`, and
  deliberately not inferred. §3's experiments prove the _class_ is undetectable, not that it has
  occurred.

---

## 9. Validation

### 9.0 Seventeen measurement defects found in review, and corrected

The first published version of `measure-test-estate.mjs` was reviewed on PR #1219 by **Codex,
GitHub Copilot and Cursor Bugbot independently**, and all three found defects in it. Six were real.
Codex then reviewed **the correction itself** and found two more, one of them inside the fix for
defect 4 — and Cursor Bugbot then found a ninth inside the fix for _that_. A further pass by Codex
found three more, in the assertion and file-I/O counters nobody had looked at while the import
graph was being argued over — and both then found a fourteenth and a thirteenth in the fixes for
defects 8 and 9, then three more in the fixes for 11 and 12. All seventeen are recorded here rather
than quietly patched, because this document's subject is measurement discipline and the reproducer
was the part that failed it.

| #   | Defect                                                                                                                                        | Effect on a published figure                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Measured the checked-out tree, not the revision named                                                                                         | The reproducer could not reproduce a pinned figure at all. Now `--rev`, read from the git object store                         |
| 2   | `IMPORTS_PRODUCT` matched only `@/…`, so tests reaching product code by relative path were bucketed scan-only                                 | scan-only **634 → 624**; substring share **16.3% → 16.1%**                                                                     |
| 3   | Any path token in a workflow body counted as execution                                                                                        | runtime harnesses **17/16 → 15/18**; two harnesses no workflow invokes had been published as executed                          |
| 4   | `import type` counted as a runtime edge, though the transpiler erases it                                                                      | reachability **98.2% → 97.8%**                                                                                                 |
| 5   | Workflow and harness inventories used `readdirSync`, breaking the stated tracked-files-only guarantee                                         | no figure moved, but the guarantee was false as written                                                                        |
| 6   | Nothing tested the parser that produces these numbers                                                                                         | now `src/test/measure-test-estate-rules.test.ts`, 61 cases                                                                     |
| 7   | The fix for 4 matched imports with a **regex**, which both invented edges and missed real ones                                                | reachability **97.7% → 97.8%**; imports are now read from the TypeScript compiler's own AST                                    |
| 8   | §1 claimed the script reproduces _every_ headline count, but it launches no test runner                                                       | no figure moved; the claim is narrowed to the static counts it does derive                                                     |
| 9   | The reachability walk regex-subtracted every `vi.mock` path, contradicting the rule defect 7 had just established                             | no module moved on the pinned tree, but the code and the published method disagreed; the rule now lives in one tested function |
| 10  | `it` / `test` / `expect` / `toContain` counted as **text**, so `/re/.test(x)` read as a case and `"expect("` in a string read as an assertion | case sites **32,080 → 31,941**; assertions **87,351 → 87,333**; `.skip` **13 → 11**; substring assertions **14,057 → 14,054**  |
| 11  | The file-I/O predicate matched the reader **names** anywhere, including a type member and an injected fake                                    | scan-only **624 → 622**; any-file-I/O **1,397 → 1,393**                                                                        |
| 12  | "806 test files read a path under `src/`" was text-matched and the script never emitted it                                                    | **806 → 813** (then → 428, see 16); now derived by the reproducer like every other static figure                               |
| 13  | The fix for 9 recognised only `vi.importActual`, so `vi.mock(spec, async (importOriginal) => …)` — 19 files — lost a real edge                | direct/transitive **1,636/425 → 1,637/424**; total reached unchanged at 2,061 of 2,108                                         |
| 14  | The fix for 8 still over-claimed: `--json` derives none of the `@source-scan-justified`, Quick Log, keyword or required-check figures         | no figure moved; §1 now enumerates the exact fields the script emits, and says the rest are hand-measured                      |
| 15  | The `render()` predicate matched text, so `it("…on render (no top-level saveAlert call)")` read as a render                                   | 3 files classified on a string, but **no published figure moved** — all three are hybrid for a real product import anyway      |
| 16  | `readsSrcPath` combined two independent predicates: reads _a_ file, and mentions `src/` _somewhere_                                           | **813 → 428**. The path must now come from the reader call's own argument                                                      |
| 17  | The substring metric counts `toContain`/`toMatch` calls, not matches against file content                                                     | no figure moved; **4 of 14,054** have a literal-array receiver, and §3.1 now says so and names the metric for what it counts   |

Fixing 3 initially introduced two **false-DEAD** readings in the opposite direction — a YAML folded
scalar (`run: >-`) splits one command across lines, and a `psql … \` continuation does too, so real
invocations lost their runner token. Both are fixed and both directions are now pinned by tests. The
lane figures for Deno (10/21), Playwright (35/25) and pgTAP (2/7) are unchanged from the previous
publication; only the harness lane moved.

Defect 7 is the same shape one level down: the regex written to _exclude_ `import type` was wrong in
both directions at once. Run against a real test file it returned `["./in-a-comment"]` — a specifier
sitting inside a comment — while missing the multi-line `import CoachAiDoctorContextPanel, { … } from
"@/components/…"` that was the file's only genuine edge. Measured across the whole pinned tree, it
missed a local specifier in **41** files and invented one in **37** others. The replacement asks
`typescript` itself, so a comment, a template-literal specifier, a mixed default-plus-type clause,
`import =`, a dynamic `import()` and a `require()` are each classified by the compiler that will
actually transpile the file.

Two edge classes are library calls rather than syntax, so the parser has to be told about them. The
rule in both directions is that an edge means **the real module loads**:

- `typeof import("x")` and `import("x").Member` sit in a **type** position and are erased with the
  rest of the types. Not edges — the old regex counted them.
- `vi.importActual("x")` and `vi.importMock("x")` load the real module, and a bare `vi.mock("x")`
  auto-mocks by loading it to derive its shape. Edges. `vi.mock("x", () => …)` supplies the module
  wholesale and never loads the real one, so it is **not** — crediting it would award reachability
  from the single construct that guarantees the module never ran.

Handling those moved no published figure: every module affected was already reached by another path,
so reachability held at 2,061 of 2,108. Eight parser cases pin the two directions.

**Defect 9 is the same rule, contradicted one layer up.** Having established when a mock is an edge,
the reachability walk still regex-subtracted _every_ `vi.mock` path from the seed set after the
parser had classified it — so a bare `vi.mock("x")` was dropped despite auto-mocking by loading the
module, and the repo's commonest shape, `vi.mock(spec, async () => ({ ...await vi.importActual(spec) }))`,
was dropped even though `importActual` bypasses the registry and loads the real module. Cursor Bugbot
caught it. The composition now lives in one tested function alongside the parser, so the figure the
script emits cannot drift from the method this section publishes:

- a `vi.mock(spec, factory)` is hoisted and replaces the module for the whole file, so even a static
  import of it resolves to the factory — dropped, unless
- the same file calls `vi.importActual` / `vi.importMock` on it, which bypasses the registry — kept;
- `vi.doMock` is not hoisted and so cannot retroactively replace a module a static import already
  loaded — kept.

That first correction was still incomplete, which is **defect 13**: it recognised only
`vi.importActual`, and Vitest's other way of loading the original is the factory's own callback —
`vi.mock(spec, async (importOriginal) => ({ ...(await importOriginal()) }))`. **19 test files** at
the pinned revision use that shape, `alert-doctor-credit-gate.test.tsx` among them, and every one of
them lost a real edge. The callback is matched by **binding** — the factory's first parameter,
invoked inside the factory body — not by the name `importOriginal`, which is the test author's
choice; a parameter declared and never called loads nothing and is not a bypass.

With 13 fixed, the direct/transitive split moves **1,636/425 → 1,637/424**. Total reached is
unchanged at 2,061 of 2,108, so the published 97.8% holds either way — the correction moves a module
from transitively-reached to directly-imported, which is what it should do. Eight cases pin the rule
now; the `vi.doMock` and declared-but-uncalled cases are fences, green either way, and say so.

**Defects 10, 11 and 12 are the same mistake in the counters**, which nobody had looked at while the
import graph was being argued over:

- `\bit\(|\btest\(` matches the `.test(` of `/pattern/.test(text)`, because `.` is not a word
  character. That invented **870** case sites across **304** files. The same pattern cannot see
  `it.skip(…)`, `it.each([…])(…)` or `test.concurrent(…)` — **731** real case sites. Net, the
  published call-site total was wrong by 139, for two compounding reasons pulling opposite ways.
- `\bexpect\(` matched inside string literals, e.g. `SPEC.indexOf("expect(seedOutput)")` — 18
  phantom assertions across four files, which also made 87,351 the wrong denominator for every
  percentage derived from it.
- The file-I/O predicate matched the reader **names** anywhere in the source, so
  `type FsLike = { readdirSync: (p: string) => string[] }` and an injected
  `{ readFileSync: (file: string) => … }` both read as filesystem access.
  `run-skill-driver-probe.test.ts` and `subscriber-growth-backend-remote-verification.test.ts` call
  no reader at all and were counted in the scan-only bucket regardless.

All three now count **calls**, parsed. Six cases pin them, each proven RED against the rule it
replaces.

The pattern across defects 2, 4, 7, 9, 10, 11 and 12 is one thing: **each came from matching text
where a parser was needed** — which is the failure mode §3 reports about the test estate, found seven
times over in the tool written to measure it. Defects 13 and 14 are a second pattern, and a quieter
one: **each was a fix that stopped one case short of the rule it was written to enforce.** Both were
found by a reviewer re-reading the correction, not the original.

Defects 15, 16 and 17 close the set, and 16 is the largest single correction in it: `readsSrcPath`
combined "reads _a_ file" with "mentions `src/` _somewhere_", counting `architecture-docs.test.ts`,
which reads `docs/architecture.md` and then asserts that the document mentions two `src/test/…`
paths. Requiring the path to come from the reader call's own argument takes the figure from **813 to
428**. Defect 15 is the same text-vs-parse mistake in the `render()` predicate; it changes how three
files are classified and moves **no** published figure, because all three are hybrid for a real
product import regardless — the reviewer's cited example, `alerts-foundation.test.ts`, imports
`src/lib/alerts.ts`, so the claim that it "imports no product module" is wrong even though the
defect is real.

Neither pattern was caught by the author. Six review rounds by three independent reviewers found
every one of the seventeen. That is the strongest evidence in this document for its own central
claim, and it is evidence about the author as much as about the tool: **a measurement is not
trustworthy because the person who made it checked it.** Anyone quoting a figure from this document
should note that it took six adversarial rounds to get these numbers right, and that the last round
still moved one of them by 47%.

**One security defect, separate from the eight above.** CodeQL alert 255 flagged the `--rev` argument
reaching a shell: it was interpolated into an `execSync` string, and double quotes do not neutralise
`$(…)`, backticks or `\`. Demonstrated rather than assumed —
`--rev '$(touch /tmp/probe)HEAD'` created the probe file under the old form. The script now spawns
git through `execFileSync` with an argv array, so no shell parses the value, and a leading-dash
revision is refused before it can be read as a git flag. The same command creates nothing now, and
`--rev 5d6efc9 --json` hashes identically before and after, so no published figure moved. Both
directions are pinned by two CLI cases in the parser test file.

```text
Targeted tests:      src/test/timeline-grow-filter.test.ts, src/test/action-queue-row-evidence-badge.test.ts
                     → 2 files, 18 cases, all passing at baseline
                     src/test/measure-test-estate-rules.test.ts (the reproducer's own parser)
                     → 1 file, 61 cases, 61 passed | 0 failed
                     RED-before-GREEN, proven by execution: with the vulnerable
                     `execSync` form restored in place, the command-substitution
                     case failed (1 failed | 37 passed); the file was restored and
                     verified byte-identical by sha256 before any commit. The
                     leading-dash case is a fence, not a regression — it is green
                     either way, and says so in the source.
Experiment A:        1 failed | 9 passed  (behaviour-preserving refactor → false positive)
Experiment B:        156 files, 1,925 cases, ALL PASSING with the injected precedence bug
                     (real behaviour break → false negative)
Full suite:          PASS on the CI lane that actually gates. Recorded on two heads of PR #1218,
                     because the branch moved while the audit was being corrected:
                       `7a5b48a` — 32/32 shards green, workflow run 33278919894, 22:34-22:37 UTC
                       `74e6da2` — ALL 35 REQUIRED CONTEXTS green, run 33279295744, 22:43-22:49 UTC
                     `74e6da2` is the fuller result and the later head: the 32 shards plus
                     `Lint, typecheck, test, build`, `Preflight — edge shared-lib mirror in sync`
                     and `test:legal-seo`. Also green there: `test:security-regression` (the single
                     `mustBeGreen` entry), `test:security-db-local`, `eslint`, `tsc --noEmit`,
                     `tsgo --noEmit + vite build`, `docs-safety`, `One-Tent Loop smoke audit`.
                     The commit carrying these review corrections moves the head again; re-read the
                     PR's checks rather than treating either SHA above as current.
                     Local confirmation, same tip, completed after the above was recorded:
                     `npx vitest run` (unsharded) → Test Files 2903 passed | 5 skipped (2908);
                     Tests 39217 passed | 190 skipped (39407); Duration 1078.77s; exit 0.
                     ZERO failures. 39,407 is the DISCOVERED total; 39,217 executed and passed.
Type-check:          PASS locally on the corrected head — `bun run typecheck`
                     (`tsc -p tsconfig.json --noEmit`) exit 0. Also PASS in CI on the audited head:
                     `tsc --noEmit`, `tsgo --noEmit + vite build`, and the `typecheck` step inside
                     the required `test:legal-seo` job all reported success. The audit itself adds
                     no product TypeScript; the only `.ts` it adds is the parser test above.
Gates:               `node scripts/check-contract-test-resolution.mjs` OK,
                     `node scripts/assert-docs-safety.mjs` PASS, `bunx eslint` on the three changed
                     script/test files → 0 problems, `bunx prettier --check` clean.
Reproducer:          `node scripts/measure-test-estate.mjs --rev 5d6efc9` re-derives every static
                     figure published above; two consecutive `--json` runs hash identically.
Runtime harness:     NOT RUN — no Supabase access in this session, so BLOCKED here. Note the
                     precise claim: §4.3 establishes that NO WORKFLOW INVOKES the billing and
                     AI-credit harnesses, not that CI is incapable of running them. CI could run
                     them against a disposable stack today; that is what P5 proposes.
Playwright:          NOT RUN LOCALLY. CI executed `test:legal-seo:e2e` in the required lane.
Skipped:             everything requiring credentials, network to Supabase, or production
Introduced failures: 0 — the working tree was restored and verified byte-identical after each
                     experiment, before any commit
Pre-existing failures: none in the required lane on `7a5b48a`. One NON-required check is red:
                     `Supabase Preview`, with `ERROR: relation "ai_credit_grants" already exists
                     (SQLSTATE 42P07)` — the failure `CURRENT_STATE.md` documents as repo-wide with
                     no PR-side workaround. This PR contains no migration (`git diff --name-only
                     origin/verdant-grow-diary...HEAD -- supabase/` is empty), the check is in
                     neither `required` nor `mustBeGreen`, and it is recorded on the PR rather than
                     worked around.
```

**Safety verdict:** this audit adds no product code, no schema, no migration, no policy, no
governance-file edit, no automation and no device control. It adds this document, the reproducer
under `scripts/`, and that reproducer's own test. The only writes to a **product** file were two
deliberate, reverted mutation experiments on `src/pages/Timeline.tsx`, both restored and verified
before commit.

---

## 10. Calibrated verdict

The test estate is **broad, disciplined, and under-instrumented**, and its weakest points are not
where tests are missing — they are where tests exist and do not run, or run and cannot fail for the
reason their name implies. Nothing here is an emergency. But the repository currently cannot make an
evidence-backed claim about its own coverage, and §3 shows that a green Timeline suite of 1,925
cases is compatible with a reversed grow-scope precedence. P2 and P4 are close to free and should go
first; P1 makes every later argument measurable; P3 is the real work and should be ratcheted, not
attempted in one pass.

**Handoff:** this document is the audit stage only. Per `docs/agents/HANDOFF_PROTOCOL.md` each of P1
through P5 needs a named owner and a **different** peer as independent reviewer before any of it is
implemented. Claude did not assign any of them.
