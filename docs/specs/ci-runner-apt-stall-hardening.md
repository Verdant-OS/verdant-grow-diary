# CI Runner apt-Stall Hardening — Slice Specification

**Status: PROPOSED — NOT APPROVED. No implementation authorized by this document.**
**Author:** Claude (Knowledge Library and Product Specification Architect)
**Written:** 2026-08-19 UTC, pinned at deploy tip `fc11a560`
**Decision needed from:** Cheek
**Proposed implementer:** Codex (owns release gates and CI per `docs/agents/CURRENT_STATE.md`)

This slice is **not** part of the One-Tent Loop Efficiency Program. It was surfaced by
that program's CI runs but is independent of it, and it must not be folded into any
Tranche B+ PR.

---

## 1. Executive recommendation

Adopt **Option C — bounded, fail-fast, retried install behind one composite action** —
in two phases, measurement first.

The single most valuable property is not "make apt reliable". It is **stop letting an
apt hang consume a whole job's timeout budget in silence.** Today a mirror stall burns
15–75 minutes per job, produces zero artifacts, and reports as `cancelled` — a status
that reads like someone pressed a button rather than like an infrastructure fault. A
three-minute step timeout plus a bounded retry converts that into a loud, fast, usually
self-clearing event.

Do **not** open with "drop `--with-deps`". It is the cheapest-looking fix and the one
with the only genuinely unmeasured risk in this document. Phase 0 measures it; a later
slice may act on the measurement.

---

## 2. The defect, as measured

`established fact`, from GitHub Actions job logs on 2026-08-19 between 20:47Z and 22:12Z.

Twelve jobs across five open PRs (#1039, #1040, #1041, #1042, #1043) concluded
`cancelled` with a byte-identical failure shape:

```
Get:4 https://archive.ubuntu.com/ubuntu noble-backports InRelease [126 kB]
Get:5 https://archive.ubuntu.com/ubuntu noble-security InRelease [126 kB]
<11–37 minutes of nothing>
##[error]The operation was canceled.
...
Cleaning up orphan processes
Terminate orphan process: pid (NNNN) (bunx)
Terminate orphan process: pid (NNNN) (node)
```

Every instance shares all of the following:

- The stall is inside the **`bunx playwright install chromium --with-deps` step**. The
  orphaned `bunx`/`node` processes name it.
- `apt-get update` first `Ign`s every `http://azure.archive.ubuntu.com` line, falls back
  to `https://archive.ubuntu.com`, and hangs after `Get:5 … noble-security InRelease`.
- The job dies at its `timeout-minutes`, never inside a test.
- Artifact upload steps report `No files were found with the provided path:
playwright-report` and `… test-results`. **No test body executed.**

### 2.1 It is not caused by any PR's diff

Three independent proofs:

1. **#1042 touches no e2e, Playwright, or workflow file** and stalled identically.
2. The **same job name passed on a sibling PR inside the same window** — e.g.
   `test:legal-seo` succeeded on #1039 at 20:58:30Z and stalled on #1041 at 21:49:11Z.
3. **Four re-runs cleared on attempt 2** with no code change: #1039 Browser census
   (authenticated), #1040 Symptom Check E2E, #1040 Browser census (public), #1042
   `test:legal-seo`.

### 2.2 It is not reliably cleared by a re-run

`established fact`. Three jobs stalled **twice** on the same commit:

| PR    | Job                                                        | Run           | Attempt 2 outcome              |
| ----- | ---------------------------------------------------------- | ------------- | ------------------------------ |
| #1039 | Auth loading smoke                                         | `32300898389` | `cancelled` 21:49:03Z (15m19s) |
| #1040 | Lockfile policy, dependency audit, typecheck, build, tests | `32300378101` | `cancelled` 21:59:07Z (25m16s) |
| #1041 | test:legal-seo                                             | `32302511464` | `cancelled` 21:49:11Z (15m15s) |

Four cleared, three did not. Treat the per-attempt clearance rate as **roughly even, on
a sample of seven** — not as a reliable retry.

### 2.3 The existing browser cache does not protect against it

`established fact`, and this is the finding that rules out the cheapest mitigation.

`auth-loading-smoke.yml` **already caches** `~/.cache/ms-playwright` (lines 52–58), and
it still stalled — twice. `--with-deps` invokes apt **unconditionally**, independent of
whether the browser binaries were restored from cache. Caching browsers does not cache
the apt transaction.

Consequence: **"add caching" is not a fix, and 14 of the 19 affected workflows already
have it.**

---

## 3. Blast radius, as measured

`established fact`, measured against `fc11a560`.

| Metric                                                | Value                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow files in `.github/workflows/`                | 84                                                                                                                                    |
| **Workflows that reach apt via a Playwright install** | **19**                                                                                                                                |
| Of those, `runs-on:` values                           | all `ubuntu-latest`                                                                                                                   |
| Of those, already caching `~/.cache/ms-playwright`    | 14                                                                                                                                    |
| Of those, with no browser cache                       | 5 (`ci.yml`, `google-analytics-e2e.yml`, `pheno-comparison-v0.yml`, `pheno-disabled-compare-e2e.yml`, `pheno-ephemeral-role-e2e.yml`) |
| Distinct `timeout-minutes` on affected jobs           | 5, 15, 20, 25, 30, 75                                                                                                                 |

`ubuntu-latest` currently resolves to Ubuntu 24.04 "noble" — `established fact` from the
`noble-security` / `noble-backports` lines in the logs above.

### 3.1 The obvious grep is wrong in BOTH directions

`established fact`. `grep -rl -- "--with-deps" .github/workflows/` returns **17** files.
That number is wrong twice over, and an implementer who trusts it will ship a diff that
is simultaneously too broad and too narrow.

**It includes one file that must NOT be edited.** `quicklog-smoke.yml:812` matches, but
the match is an `echo` inside a heredoc that prints reproduction instructions into the
job summary:

```
echo "#    Script: \"e2e:install:ci\": \"playwright install --with-deps chromium\""
```

Rewriting it corrupts the workflow's self-documenting output while changing no behavior.
That file's _executable_ install step is line 240, `run: bun run e2e:install:ci`.

**It misses two files that are genuinely affected.** `core-link-form-census.yml` and
`pheno-journey-smoke.yml` never contain the string `--with-deps` anywhere. They reach
apt through the npm script (§3.2), so a `--with-deps` sweep skips them entirely.

**This miss is not theoretical — it is where most of the damage landed.**
`core-link-form-census.yml:51` declares `name: Browser census (${{ matrix.lane }})`,
i.e. the `Browser census (public)` / `Browser census (authenticated)` jobs, which
produced **five** of the twelve observed cancellations on 2026-08-19. A `--with-deps`-only
fix would have left the single worst-affected workflow untouched and looked successful.

### 3.2 There are TWO seams, not one

`established fact`, measured at `fc11a560`:

| Seam               | Files | Exact form                                           |
| ------------------ | ----- | ---------------------------------------------------- |
| Inline, flag last  | 10    | `run: bunx playwright install chromium --with-deps`  |
| Inline, flag first | 6     | `run: bunx playwright install --with-deps <browser>` |
| npm script         | 3     | `run: bun run e2e:install:ci`                        |

Total **19** files. The npm script resolves via `package.json:265` to
`playwright install --with-deps chromium`, so all three seams end in the same apt call.

One inline site is **not** a literal browser name:
`google-analytics-e2e.yml:66` passes `${{ matrix.browser }}`. A naive find/replace to
`chromium` silently collapses that matrix.

`package.json` therefore already declares a partial abstraction —

```json
"e2e:install": "playwright install chromium",
"e2e:install:ci": "playwright install --with-deps chromium",
```

— which **3 of 19 workflows use and the other 16 bypass.** The convergence this slice
proposes is not a new idea in this repo; it is finishing one that was started and then
abandoned, which is exactly why a one-line apt fix currently costs 19 edits.

### 3.3 Composite actions are an established convention here

`established fact`: `.github/actions/require-ci-secret/action.yml` exists and is a
well-documented composite action with typed inputs. This slice should mirror its shape
and documentation density rather than inventing a new pattern.

---

## 4. Options considered

### Option A — Do nothing; wait out the incident. `HOLD as the fallback`

GitHub runner mirror faults typically self-resolve within hours. Costs nothing, risks
nothing, fixes nothing. **This remains the correct action for the current incident**
(see §9). It is not a correct answer to "this will happen again", because the failure
mode is silent, slow, and misreported as `cancelled`.

### Option B — Drop `--with-deps`. `REJECT for now — unmeasured`

Removes the apt call entirely, which removes the failure at its source. It is the most
attractive-looking option and the only one whose risk is genuinely unknown.

`uncertainty`: whether the `ubuntu-latest` image ships every shared library Chromium
needs is **`NOT_MEASURED` from this session** — verifying it requires running a browser
on a real runner, which cannot be done from here. Playwright's own docs recommend
`--with-deps` on CI precisely because the answer varies by image and by Playwright
version. Getting this wrong replaces an intermittent 50%-clearing stall with a
deterministic 100% failure across 19 workflows.

Do not adopt on reasoning alone. Phase 0 measures it.

### Option C — Bounded, fail-fast, retried install behind one composite action. `RECOMMENDED`

Keep `--with-deps` (so no behavior risk), but change how it fails:

1. **Step-level `timeout-minutes: 3`** on the install step. A stall dies in 3 minutes
   instead of eating 15–75.
2. **apt resilience config** written before the install:
   `Acquire::Retries "3";` and `Acquire::http::Timeout "20";` in
   `/etc/apt/apt.conf.d/`, so apt itself gives up and retries rather than hanging.
3. **Bounded retry** — up to 3 attempts, so the ~50%-per-attempt clearance rate
   compounds to roughly 1-in-8 residual failure instead of 1-in-2.
4. **One composite action** at `.github/actions/install-playwright-browsers/`, so all
   19 call sites — across both seams (§3.2) — converge and the next fix is a one-file
   change.
5. **Honest failure text** — when all attempts fail, print that this is an apt/mirror
   fault, not a test failure, so nobody spends an hour reading a green test suite.

Cost: one new composite action plus 19 mechanical call-site edits.

### Option D — Raise `timeout-minutes`. `REJECT`

Makes the symptom last longer and hides it. Directly contrary to this repo's standing
principle that a check which cannot complete must never be mistaken for one that found
nothing wrong.

---

## 5. Proposed scope

### Phase 0 — Measure, decide, do not change behavior `(first merge gate)`

**Deliverable:** a throwaway workflow, `workflow_dispatch` only, that on `ubuntu-latest`
installs Chromium **without** `--with-deps`, launches it headless, loads `about:blank`,
and reports `PASS` / `FAIL` with the missing-library list if any.

**Answers exactly one question:** is `--with-deps` still load-bearing on this runner
image? Records the result as `established fact` with the image version stamped.

**Stamped how, and why it matters.** The answer is not a property of the repo; it is a
property of a **(runner image, Playwright revision)** pair — §4 says so explicitly:
"the answer varies by image and by Playwright version". So the receipt is not a
`PASS`, it is a `PASS` scoped to a pair, and Phase 0 must write both halves down or
Phase 2 has nothing to bind to. The deliverable therefore commits
`config/playwright-runtime-provenance.json`:

```json
{
  "probe_result": "PASS",
  "runner_image": "<the runner's ImageVersion, e.g. 20260812.1.0>",
  "playwright_version": "<resolved version from the lockfile, not the range>",
  "probed_at": "<UTC>",
  "evidence_run": "<Actions run URL>"
}
```

`runner_image` comes from the `ImageVersion` environment variable the hosted runner
sets, **not** from `ubuntu-latest` — that label is the floating pointer, not the thing
measured. `playwright_version` is the resolved lockfile version for the same reason.

**Does not change any existing workflow.** Deleted or left dispatch-only afterwards.

Without Phase 0, Option B stays permanently `NOT_MEASURED` and the repo keeps paying an
apt tax it may not owe.

### Phase 1 — The composite action and the 19 call sites

**New:** `.github/actions/install-playwright-browsers/action.yml`

Inputs (mirroring `require-ci-secret`'s documentation density):

| Input                     | Required | Default    | Purpose                                                                                                                                                                                                                            |
| ------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browsers`                | no       | `chromium` | Passed through verbatim; **must accept a matrix expression** for `google-analytics-e2e.yml`                                                                                                                                        |
| `with-deps`               | no       | `auto`     | `true` \| `false` \| `auto`. Kept `true` throughout Phase 1. `auto` is what Phase 2 switches to — it resolves to `false` only when the runner's live provenance matches the recorded `PASS`, and to `true` otherwise (see Phase 2) |
| `attempts`                | no       | `3`        | Bounded retry count                                                                                                                                                                                                                |
| `attempt-timeout-minutes` | no       | `3`        | Per-attempt cap                                                                                                                                                                                                                    |

Behavior: write the apt resilience config; loop up to `attempts`, each bounded by
`attempt-timeout-minutes`; on total failure, `::error::` naming this as an apt/mirror
fault with the attempt count and elapsed time; append a short markdown block to
`$GITHUB_STEP_SUMMARY`.

**Changed:** all **19** affected workflows, each executable install step replaced by a
`uses:` of the new action — **including the 3 that currently go through
`bun run e2e:install:ci` and the 2 that a `--with-deps` grep cannot see** (§3.1). No
other line in any workflow is touched — not `timeout-minutes`, not the cache steps, not
the test commands.

**Explicitly NOT changed in Phase 1:**

- `quicklog-smoke.yml:812` (the documentation `echo` — §3.1)
- The 5 workflows lacking a browser cache. Adding cache there is a separate, optional
  improvement and must not ride along.
- `package.json`'s two install scripts. They stay as the **local-developer** path and
  keep working unchanged. Phase 1 moves the 3 workflows that currently call
  `e2e:install:ci` onto the composite action instead, because an npm script cannot
  express a per-attempt timeout. The scripts are deliberately not deleted — deleting
  them would break the reproduction instructions `quicklog-smoke.yml` prints, and
  developers running the smoke locally.

### Phase 2 — Conditional on Phase 0 `(separate approval)`

If Phase 0 returns `FAIL`, `with-deps` stays `true` and Phase 1's retry logic is the
permanent mitigation. Nothing below applies.

If Phase 0 returns `PASS`, a later slice flips the composite action's `with-deps`
default to **`auto`** — a one-line change in one file, versus 19 edits across two seam
styles today. That reduction is the payoff of the convergence in Phase 1.

**`auto`, not `false`. A permanent `false` would be an unsound reading of the
measurement, and this spec's own §4 says why.**

A Phase 0 `PASS` proves one thing: on the stamped runner image, with the stamped
Playwright revision, Chromium launches without the apt-installed libraries. Both halves
of that pair float underneath us:

- every one of the 19 workflows runs on `ubuntu-latest`, which is a moving pointer —
  §3 measured it at Ubuntu 24.04 "noble" **today**, not forever;
- Playwright will be upgraded, and a new bundled browser revision can want a library
  the old one did not.

Either drift silently invalidates the measurement, and the failure mode is not subtle:
Chromium fails to launch and **every browser workflow in the repo blocks at once** —
the same blast radius §7 sequences `ci.yml` last to avoid, arriving without a PR to
blame it on. Writing `false` into the file would encode a measurement's conclusion
while discarding its scope.

**How `auto` resolves, and which way it fails.** At run time the composite action
compares the runner's live `ImageVersion` and the resolved Playwright version against
`config/playwright-runtime-provenance.json`:

| Live provenance vs. recorded                     | `with-deps` resolves to | Cost                                                                               |
| ------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| Both match, `probe_result` is `PASS`             | `false`                 | none — the payoff                                                                  |
| Either differs, or the file is absent/unreadable | `true`                  | the apt tax, plus a `::notice::` naming which half drifted and pointing at Phase 0 |

The unknown case takes the **slow** branch, never the blocking one. An
un-revalidated stack pays the tax it has always paid; it does not break. That is the
whole reason `auto` is worth the extra input over a bare boolean.

**Re-validation is a repo-side gate, not a promise.** Phase 2 also ships
`src/test/playwright-runtime-provenance-fence.test.ts`, which fails when
`playwright_version` in the provenance file disagrees with the resolved version in the
lockfile. A Playwright bump therefore turns the fence red **in the bumping PR**, where
the fix is one dispatch of the Phase 0 probe and one edit to the JSON — rather than
discovering it later from 19 red workflows. Per `AGENTS.md`, this one resolves a value
rather than matching source text: it reads the lockfile and the JSON and compares
parsed values.

The runner image cannot be fenced this way — it changes with no commit at all — which
is exactly why that half is handled at run time by `auto` rather than by a test.

---

## 6. Tests

Per `AGENTS.md`, source-text scanning is the correct tool for "proving a forbidden
construct is absent from a file", which is exactly this fence — it is **not** an
attempt to verify effective configuration, so the
`check-contract-test-resolution.mjs` rule does not apply and no
`@source-scan-justified` marker is needed.

**New:** `src/test/playwright-install-composite-action-fence.test.ts`

**The fence reads a manifest, so every rollout state has a passing placement.**

§7 requires the canary to be its own merge. A fence whose expected set is hardcoded at
19 has nowhere to sit during that merge: land it with the canary and assertions 1 and 5
demand all 19 be wired while 18 still use the old commands; defer it and the composite
action's new logic merges with no regression coverage at all, which the repo's testing
standard does not allow. Neither is acceptable, so the expected set is **data, not a
literal**.

Phase 1 commits `config/playwright-install-migration.json`:

```json
{
  "total_affected": 19,
  "converged": ["irrigation-overflow-smoke.yml"]
}
```

Every workflow is in exactly one of two states, and the fence asserts the correct thing
for each: a **converged** file must use the composite action, a **not-yet-converged**
file must still use one of the three known-good legacy seams (§3.2). Nothing is
unfenced at any point in the rollout, and no state is unrepresentable.

`total_affected` is pinned to the measured 19 separately, so the manifest cannot be
used to shrink the problem — only to record progress through it. `converged` may only
grow: the fence fails if an entry is removed, which is what makes a silently-reverted
call site loud. The rollout ends when `converged.length === total_affected`, and the
final assertion is exactly that equality — the same coverage guarantee the hardcoded 19
was reaching for, now reachable from the first canary onward.

1. **Happy path** — every workflow listed in `converged` installs Playwright browsers
   via `uses: ./.github/actions/install-playwright-browsers`.
2. **Forbidden construct** — no workflow contains an executable
   `playwright install … --with-deps` **run step** outside the composite action.
3. **Second seam closed** — no workflow contains `run: bun run e2e:install:ci`. This is
   the assertion that would have caught `core-link-form-census.yml` and
   `pheno-journey-smoke.yml`, the two files a `--with-deps` sweep cannot see (§3.1).
   Without it the fence certifies a fix that missed the worst-affected workflow.
4. **Decoy regression (pins §3.1's trap shut)** — the fence must **pass** on a fixture
   containing the `quicklog-smoke.yml` documentation `echo`, proving it distinguishes an
   `echo` inside a heredoc from a `run:` step. Without this the fence is a plain grep and
   will either fail spuriously or force a corrupting edit.
5. **Coverage count** — the number of workflows wired to the composite action equals
   `converged.length`, and `total_affected` equals the measured affected set (**19** at
   `fc11a560`), so a silently-dropped call site fails loudly rather than passing by
   absence. A file wired to the composite action but absent from `converged` fails too:
   the manifest must describe the tree, not lag it.
   5b. **Not-yet-converged files are still fenced** — every affected workflow outside
   `converged` must match one of §3.2's three legacy seams. This is what makes a
   partial rollout safe to merge: a file cannot quietly stop installing browsers at
   all, in either direction.
   5c. **Monotonic manifest** — a fixture whose `converged` list has lost an entry
   relative to the committed one fails. Progress is one-way.
   5d. **Completion** — when `converged.length === total_affected`, assertion 5b's set is
   empty and the fence is the original all-19 guarantee, reached incrementally.
6. **Matrix preservation** — `google-analytics-e2e.yml` still passes
   `${{ matrix.browser }}`, not a hardcoded `chromium`.
7. **Null/invalid** — a workflow with no Playwright usage is unaffected.
8. **Determinism** — repeated runs over the same tree yield identical results.

**Validation commands** (report exact counts, per `AGENTS.md`):

```bash
bun run typecheck
bunx vitest run src/test/playwright-install-composite-action-fence.test.ts
bunx vitest run --reporter=dot        # or the shard scripts
```

**Runtime proof, and its limit.** The composite action's retry path cannot be proven
from a unit test. Phase 1's real evidence is that the 19 affected workflows still go
green on the implementation PR. That proves the happy path only — **it does not prove
the retry works**, because the retry needs a live apt stall to exercise. State this as
`NOT_MEASURED` rather than claiming the mitigation is verified. Consider a
`workflow_dispatch` fault-injection variant (unreachable apt host) if Cheek wants the
retry path genuinely proven.

---

## 7. Rollout order

Highest blast radius **last**:

1. One low-traffic canary — `irrigation-overflow-smoke.yml`. Confirm green.
2. The other 17 non-`ci.yml` workflows, **including the 3 npm-script sites and the 2 grep-invisible ones**.
3. `ci.yml:617` last. It is the main gate; a mistake there blocks every PR in the repo.

Steps 2 and 3 may be one PR or two at the implementer's discretion; the canary must be
its own merge.

---

## 8. Risk and rollback

| Risk                                                                                                               | Likelihood                                                   | Mitigation                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composite action misquotes `${{ matrix.browser }}`, collapsing the GA matrix                                       | Medium                                                       | Test 6; canary rollout                                                                                                                                                           |
| A call site is missed, or the decoy `echo` is edited, or a grep-invisible npm-script site is skipped               | **High** — the naive grep is wrong in both directions (§3.1) | Tests 1–4                                                                                                                                                                        |
| Retry masks a genuine install failure                                                                              | Low                                                          | Bounded at 3 attempts; failure text names apt explicitly; total wall-clock capped at ~9 min, still under every current job timeout                                               |
| `ci.yml` breakage blocks all PRs                                                                                   | Low                                                          | Sequenced last, after 15 proven sites                                                                                                                                            |
| Phase 2 flipped without Phase 0 evidence                                                                           | Low                                                          | Phase 2 requires its own approval and cites the Phase 0 measurement                                                                                                              |
| `with-deps: false` outlives the image or Playwright revision it was measured on, blocking all 19 workflows at once | Medium — both float (`ubuntu-latest`, future upgrades)       | Phase 2 ships `auto`, not `false`: unrecognised provenance takes the slow apt branch, never the blocking one. A Playwright bump turns the provenance fence red in the bumping PR |
| The Phase 1 fence has no passing placement during the canary merge                                                 | **Certain** if the expected set is hardcoded at 19           | The expected set is a committed manifest; converged and not-yet-converged files are each fenced for their own state                                                              |

**Rollback:** revert the PR. The composite action is additive and every call site is a
mechanical substitution, so a revert restores the prior inline commands exactly. No
schema, no migration, no runtime, no production surface. Rollback is safe at any point
and needs no data cleanup.

---

## 9. What this slice does NOT do, and what to do about today's incident

- It does **not** fix the currently-red jobs. The incident is a live GitHub-runner mirror
  fault; **Option A (wait, then re-run) remains the correct response to it.** This slice
  changes how the _next_ one is experienced.
- It does not touch application code, `src/`, schema, RLS, migrations, edge functions,
  entitlements, AI credits, Action Queue, or any product surface.
- It does not change any test's assertions, any job's `timeout-minutes`, or any secret.
- It does not add caching to the 5 uncached workflows.
- It does not merge, deploy, or dispatch anything.

---

## 10. Ownership and collision check

`established fact`, checked at `fc11a560`: no open PR touches `.github/actions/` or the
install steps in any of the 19 workflows. Nearest neighbours are #1039–#1043
(Tranche B+ slices — they _consume_ these workflows but change none of them) and #1035
(Quick Log diagnostics — no workflow edits). **No collision.**

`docs/agents/CURRENT_STATE.md` assigns release gates, CI, and production verification to
**Codex**. This is CI infrastructure, so Codex is the natural implementer. Claude is
available if Cheek reassigns it, but should not self-assign: the Tranche B+ reassignment
was explicitly scoped to "Tranche B+ only".

---

## 11. Decision requested

| #          | Decision                                                       | Recommendation                                                        |
| ---------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| **D-CI-1** | Adopt Option C (composite action + fail-fast + bounded retry)? | **Yes**                                                               |
| **D-CI-2** | Run Phase 0 (measure whether `--with-deps` is still needed)?   | **Yes — it is the only way Option B ever stops being `NOT_MEASURED`** |
| **D-CI-3** | Implementer                                                    | **Codex** (CI/release-gate owner)                                     |
| **D-CI-4** | Rollout order — canary, then bulk, then `ci.yml` last          | **Yes**                                                               |
| **D-CI-5** | Fault-injection test to genuinely prove the retry path?        | Optional; without it the retry stays `NOT_MEASURED`                   |

Nothing in this document authorizes an edit. Phase 1 begins only on an explicit approval
naming D-CI-1 and D-CI-3.
