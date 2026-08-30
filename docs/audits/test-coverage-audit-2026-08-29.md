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
  (190 skipped, §9). 98.2% of product modules are reached by some Vitest test. Zero `.only`
  anywhere. That is better than most repositories this size.
  Every per-case and per-assertion figure in this document is **Vitest-only** unless it says
  otherwise; the other three lanes are counted by file, because nothing aggregates their cases.
- **Depth is unmeasured, and four separate lanes of already-written tests never execute.**
  There is no coverage instrumentation of any kind, so the fraction of _branches_ the suite
  exercises is `NOT_MEASURED`. **16.3% of all Vitest assertions** are `toContain`/`toMatch` checks
  against source **text** inside scan-only files (14,251 of 87,351) — a class proven by execution
  in §3 to go red on behaviour-preserving refactors and stay green through real behaviour breaks.
  And 21 of 31 Deno edge tests, 16 of 33 runtime RLS/billing harnesses, 7 of 9 pgTAP suites, and
  25 of 60 Playwright specs are never run by any workflow.

The single highest-value action is not writing new tests. It is **running the tests that already
exist** (§7, P2) and **measuring what they touch** (§7, P1). Both are small, both are cheap, and
neither requires a product decision.

The calibrated verdict is at §10.

---

## 1. Method, and what it cannot tell you

`established fact` unless labelled otherwise. **Every headline count below is reproduced by
`scripts/measure-test-estate.mjs`**, committed with this audit — run `node scripts/measure-test-estate.mjs`
(or `--json`) to re-derive them. A measurement nobody can re-run is not evidence, which is the same
defect this document is about. The two mutation experiments in §3 are the exception: they are
described step by step because they deliberately mutate and restore a product file.

| Axis                        | How it was measured                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| File and case counts        | `git ls-files` + regex over test sources                                                  |
| Module reachability         | Import graph built from `@/…` and relative specifiers, BFS-seeded from test files         |
| Test _kind_ (scan vs value) | Presence of `readFileSync`/`readdirSync` vs product imports vs `render()`                 |
| CI execution                | Every `.github/workflows/*.yml` plus transitive expansion of `package.json` script chains |
| Behavioural strength        | Two mutation experiments run by execution against `src/pages/Timeline.tsx` (§3)           |
| Executed suite result       | One unsharded `npx vitest run` at `5d6efc9`, plus CI's 32 shards on the PR head (§9)      |

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
   occurrences in source — `it(` / `test(` / `expect(` — because that is the only way to attribute
   a case to a _kind_ of test without instrumentation. The runner **discovers 39,407** cases and
   **executes 39,217** of them (190 skipped), against **32,080** such call sites — the discovery gap
   being `it.each`/`test.each` expansion and generated cases. Discovered, executed and call-site
   counts are three different numbers; §3's ratios compare call sites with call sites, so they hold,
   but do not mix a number from §3 with one from §9. The same gap applies to skips: **13** `.skip(`
   call sites in source, **190** skipped cases at runtime. All of these are Vitest-only.
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

| Bucket                                                                 | Files             | Assertions         | Cases             |
| ---------------------------------------------------------------------- | ----------------- | ------------------ | ----------------- |
| **Scan-only** (reads files; imports no product module; never renders)  | **634** (21.8%)   | **19,049** (21.8%) | **6,330** (19.7%) |
| Hybrid (scans files _and_ imports/renders)                             | 763               | 29,488             | —                 |
| Pure behavioural (no file I/O at all)                                  | 1,511 (52.0%)     | 38,814             | —                 |
| **Any file I/O** (`readFileSync`/`readFile(`/`readdirSync`/`globSync`) | **1,397** (48.0%) | —                  | —                 |

Within the scan-only bucket, **74.8% of assertions are `toContain(...)` or `toMatch(...)`** —
14,251 substring and regex checks over file text, which is **16.3% of all 87,351 Vitest
assertions**, not 21.8%. (21.8% is the bucket's total share of assertions; the two figures were
conflated in an earlier draft of §0.) The hybrid bucket contributes further source-text assertions
that are `NOT_MEASURED` — its files mix scanning with real imports, and the two were not separated.
806 test files read a path under `src/`.

Every figure in that table is a **static count of source occurrences**, per §1 limit 4 — the ratios
are static-against-static and hold, but they are not the runner's executed-case numbers in §9.

Names in that bucket read like behaviour tests, not like lint rules:
`action-queue-row-evidence-badge.test.ts`, `timeline-grow-filter.test.ts`,
`quick-log-maturity-evidence-sheet-wiring.test.ts`, `dashboard-plants-kpi-source-label.test.ts`.

`AGENTS.md` already forbids exactly this for contract tests, citing the
`playwright-action-timeout-fence` precedent where commenting a setting out left the guard green.
The enforcement script `scripts/check-contract-test-resolution.mjs` implements that rule — but its
`CONFIG_FILES` constant is `["playwright.config", "vitest.config"]`. **Two files.** Nothing checks
the 806 tests that scan `src/`. Repo-wide there are **7** `@source-scan-justified` declarations.

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
| Runtime RLS / billing harnesses  |    33 |                        17 |             **16** |
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
2. **Baseline the existing 634** into an allowlist so only _new_ violations fail. Shrink the
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

Give the 16 unreachable harnesses (§4.3) a home: a disposable-stack workflow modelled on
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

```text
Targeted tests:      src/test/timeline-grow-filter.test.ts, src/test/action-queue-row-evidence-badge.test.ts
                     → 2 files, 18 cases, all passing at baseline
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
Type-check:          NOT RUN LOCALLY (this audit changes no TypeScript) — but PASS in CI on the
                     audited head: `tsc --noEmit`, `tsgo --noEmit + vite build`, and the `typecheck`
                     step inside the required `test:legal-seo` job all reported success.
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
governance-file edit, no automation and no device control. The only writes to the working tree were
two deliberate, reverted mutation experiments on `src/pages/Timeline.tsx`, both restored and
verified before commit.

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
