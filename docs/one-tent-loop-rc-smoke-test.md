# One-Tent Loop RC Smoke Test

**Date:** 2026-06-23
**Mode:** Read-only QA + docs-only
**Verdict:** PASS — ready to tag and demo

## Surfaces checked

- Dashboard / Grow entry
- Tent detail
- Plant detail
- Quick Log (`src/lib/quick-log/createQuickLogEvent.ts` — idempotent RPC, snapshot provenance preserved)
- Plant timeline (category sections, evidence indicators, readability + print summary)
- Sensors page (`src/pages/Sensors.tsx`)
- Sensors Operator Mode (`?operator=1`) — EcoWitt live-row proof + ingest-audit proof panels
- One-Tent Live Proof page (`src/pages/OneTentLiveProof.tsx`)
- One-Tent copy/print report (markdown sanitized; no UUIDs / ISO-second timestamps)
- AI Doctor readiness surface (cautious, missing-context disclosed)
- Alerts list
- Action Queue (approval-required throughout)

## Pass / fail table

| Surface | Result | Notes |
| --- | --- | --- |
| Quick Log save | PASS | Idempotent RPC; snapshot source/captured_at preserved |
| Plant timeline | PASS | Category/evidence/readability/print sections render |
| Sensors operator EcoWitt live-row proof | PASS | live/stale/invalid/limited/no-recent states intact |
| Sensors operator ingest-audit proof | PASS | blocked vs error copy now distinguished |
| One-Tent Live Proof checklist | PASS | needs-confirmation when state cannot be inferred |
| One-Tent sensor-proof section | PASS | present / live_only / audit_only / stale / invalid / blocked / missing |
| One-Tent copy/print report | PASS | static-safety asserts no UUID / ISO-second leaks |
| AI Doctor readiness | PASS | no overconfidence, missing-context disclosed |
| Alerts | PASS | stale/invalid telemetry never marked healthy |
| Action Queue | PASS | approval-required; no auto-execution; no device control |
| EcoWitt-only scanner | PASS | no non-EcoWitt vendor regressions |

## Validation counts

- `npx vitest run one-tent-live-proof oneTentSensorProof ecowittLiveProof ecowittIngestAuditProof SensorsEcowittLiveProofWiring relative-timeline-projection timeline` — **130 files / 1580 tests passed**
- `npx vitest run live-sensor-server-gate premium-live-sensor-gate-hardening manual-sensor-fahrenheit-and-refresh` — **3 files / 52 tests passed**
- `npx tsc -p tsconfig.app.json --noEmit` — **clean**

## Known limitations

- Operator Mode (`?operator=1`) is a URL surface gate, not a role/capability check. Data access is still scoped by Supabase RLS; the URL cannot widen access. Documented in `docs/v0-release-checkpoint.md` §15.1.
- Ingest-audit proof depends on the `"Users view own ingest audit"` RLS policy; permission/network failures collapse to `blocked` / `error` states with calm copy and never imply a healthy state.
- Sensor-proof window is the last 24 hours by design; report copy says "current proof window" explicitly.
- AI Doctor remains advisory only — no Action Queue auto-write.

## Demo script (short)

1. Pick a grow, then a tent on the Sensors page.
2. Append `?operator=1` to the Sensors URL — show row-level live proof + ingest-audit proof panels (counts, last-accepted, last-rejected, proof window).
3. Open One-Tent Live Proof — show the 6-step checklist + sensor-proof section + shortcut links.
4. Click **Copy proof summary** — paste into a notes app to show the sanitized markdown report (no IDs, no timestamps below day-level for audit rows).
5. Walk the loop: Quick Log → Timeline category → AI Doctor readiness → Alert → Add to Action Queue (approval required) → Complete → Follow-up diary entry → Timeline back-pointer.
6. Refresh One-Tent Live Proof to show all six checklist steps green.

## Rollback notes

- This is a read-only smoke pass plus a single new docs file.
- To roll back: delete `docs/one-tent-loop-rc-smoke-test.md`. No product code changed.

## Recommended tag

`v0-one-tent-loop-rc1`

## Demo Proof CI verification

This docs-only update intentionally triggers the Demo Proof Walkthrough read-only CI workflow.

Expected CI checks:
- demo proof route guards
- proof report redaction guards
- targeted Demo Proof Walkthrough vitest suites
- TypeScript
- Playwright Demo Proof Walkthrough no-write E2E with Chromium installed

Success condition:
The workflow completes with the Playwright E2E executed in CI, not left pending due to a missing browser runtime.

This file is included in the workflow path filters for `.github/workflows/demo-proof-walkthrough-readonly.yml`.

### Local prerequisites

- Bun installed.
- Repository dependencies installed: `bun install --frozen-lockfile`.
- Playwright Chromium installed: `bunx playwright install chromium`.
  - On Linux CI runners that need system libraries: `bunx playwright install chromium --with-deps`.
- Local Demo Proof Walkthrough E2E command: `bun run test:e2e:demo-proof-readonly`.

### Local reproduction

```
bun run test:demo-proof-guards
bunx vitest run proofReportRedactionRules DemoProofWalkthrough demoProofWalkthrough --reporter=verbose
bunx tsc -p tsconfig.app.json --noEmit
bunx playwright install chromium
bun run test:e2e:demo-proof-readonly
```

### GitHub Actions log checklist

- [ ] Workflow **Demo Proof Walkthrough readonly E2E (mocked)** queues on the PR.
- [ ] Chromium install step runs and passes.
- [ ] `bun run test:demo-proof-guards` runs and passes.
- [ ] Targeted vitest (`proofReportRedactionRules DemoProofWalkthrough demoProofWalkthrough`) runs and passes.
- [ ] TypeScript (`tsc -p tsconfig.app.json --noEmit`) runs and passes.
- [ ] Playwright E2E executes — not skipped, not pending, not browser-missing.
- [ ] Artifacts uploaded:
  - [ ] `demo-proof-guards`
  - [ ] `demo-proof-vitest`
  - [ ] `demo-proof-playwright-report`
  - [ ] `demo-proof-playwright-results`
  - [ ] `demo-proof-playwright-failure-artifacts` — present **only** on failure.

### Rollback if the workflow does not trigger

1. Confirm this PR actually changed `docs/one-tent-loop-rc-smoke-test.md`.
2. Confirm `.github/workflows/demo-proof-walkthrough-readonly.yml` lists that exact path under `pull_request.paths`.
3. If GitHub did not dispatch, push an empty commit:
   ```
   git commit --allow-empty -m "ci: retrigger demo proof workflow"
   ```
4. If still not triggered, revert/remove this "Demo Proof CI verification" section from `docs/one-tent-loop-rc-smoke-test.md`.
5. No product rollback is required — this PR is docs-only.


### Path-filter verification (one-liner)

```bash
grep -n 'docs/one-tent-loop-rc-smoke-test.md' .github/workflows/demo-proof-walkthrough-readonly.yml
```

Expected output (exact, from current workflow):

```
41:      - "docs/one-tent-loop-rc-smoke-test.md"
```

If the line number shifts after future edits, only the line number changes — the trailing `- "docs/one-tent-loop-rc-smoke-test.md"` entry must remain inside `on.pull_request.paths`.

### One-command local validation

```bash
bun run test:demo-proof:full
```

Runs in order, fail-fast (`&&`):

1. `bun run test:demo-proof-guards`
2. `bunx vitest run proofReportRedactionRules DemoProofWalkthrough demoProofWalkthrough --reporter=verbose`
3. `bunx tsc -p tsconfig.app.json --noEmit`
4. `bun run test:e2e:demo-proof-readonly`

Local prerequisite (run once per machine; the script does NOT auto-install):

```bash
bunx playwright install chromium
```

### Playwright CI troubleshooting checklist

- **Chromium missing**
  - Symptom: `Executable doesn't exist` / `chromium_headless_shell` missing.
  - Verify: the `Install Chromium` step ran in the workflow log.
  - Fix: re-run the workflow; if it repeats, inspect `bunx playwright install chromium --with-deps` output.
- **Browser cache miss**
  - Symptom: install step is slower than usual but still passes.
  - Verify: cache restore log lines for `~/.cache/ms-playwright`.
  - Fix: not a product issue — allow the install to complete and cache repopulates.
- **Path filter did not trigger**
  - Verify: run the grep one-liner above.
  - Verify: the PR actually changed a path listed under `on.pull_request.paths`.
  - Fix: push an empty commit or edit a listed docs file (see rerun steps below).
- **Vite / preview failed**
  - Verify: Playwright web-server logs in the run output.
  - Fix: adjust harness/`playwright.config.*` only — do NOT change product routes unless a route genuinely crashes.
- **No-write E2E violation**
  - Symptom: spec reports a forbidden Supabase/RPC request reaching the network.
  - Treat as a product/safety blocker. Do NOT relax intercept rules. Investigate the offending call.

### GitHub Actions rerun steps

1. Open the PR on GitHub.
2. Click the **Checks** tab (or the failing check inline).
3. Open the workflow **Demo Proof Walkthrough readonly E2E (mocked)**.
4. Click **Re-run jobs**.
5. Prefer **Re-run failed jobs** first; fall back to **Re-run all jobs** if needed.
6. If the workflow did not dispatch at all (path filter mismatch), push an empty commit:
   ```bash
   git commit --allow-empty -m "ci: retrigger demo proof workflow"
   git push
   ```
7. If it still does not trigger, re-verify path filters (grep one-liner above) and branch protection / Actions workflow permissions for the repo.

### Artifact download and inspection

From the completed workflow run page, scroll to **Artifacts** and download:

- `demo-proof-guards` — guard-script stdout/stderr.
- `demo-proof-vitest` — targeted vitest reporter output.
- `demo-proof-playwright-report` — Playwright HTML report bundle.
- `demo-proof-playwright-results` — raw results (traces, videos, screenshots when produced).
- `demo-proof-playwright-failure-artifacts` — **only present on failure**; contains `*.png`, `*.webm`, `trace.zip`.

Open the HTML report locally:

```bash
unzip demo-proof-playwright-report.zip -d demo-proof-playwright-report
open demo-proof-playwright-report/index.html   # macOS
# or
xdg-open demo-proof-playwright-report/index.html   # Linux
# If the bundle requires Playwright's viewer:
bunx playwright show-report demo-proof-playwright-report
```

Use `demo-proof-playwright-results` for raw traces/videos when the HTML report points to them. The failure-only artifact will be empty/absent on green runs — that is expected.

### Local helper scripts

```bash
bun run test:demo-proof:e2e            # only the read-only Playwright spec
bun run test:demo-proof:full           # full chain; assumes Chromium installed
bun run test:demo-proof:full:check     # full chain with Chromium precheck (prints install cmd if missing)
bun run test:demo-proof:open-report    # open a downloaded Playwright HTML report
```

Notes:

- `test:demo-proof:e2e` is an alias for `test:e2e:demo-proof-readonly`.
- `test:demo-proof:full:check` runs `node scripts/check-demo-proof-playwright-chromium.mjs` before the E2E step. It NEVER auto-installs Chromium. On miss it prints `bunx playwright install chromium` (and `--with-deps` for Linux CI).
- `test:demo-proof:open-report` defaults to `./demo-proof-playwright-report.zip`. Pass an explicit path to override:
  ```bash
  node scripts/open-demo-proof-playwright-report.mjs ./demo-proof-playwright-report.zip
  node scripts/open-demo-proof-playwright-report.mjs ./demo-proof-playwright-report/
  ```
  Zips are extracted to `.artifacts/demo-proof-playwright-report/`.

### Downloaded artifact file layout

**`demo-proof-playwright-report`** — Playwright HTML report bundle.
- Entry point: `index.html` (may be nested one directory deep after extraction).
- Open with `bun run test:demo-proof:open-report` or `bunx playwright show-report <dir>`.

**`demo-proof-playwright-results`** — raw results from CI's `test-results/`.
- Expected per-test shape:
  - `test-results/<spec-or-test-name>/trace.zip`
  - `test-results/<spec-or-test-name>/*.webm`
  - `test-results/<spec-or-test-name>/*.png`
- If GitHub flattens the artifact root, search recursively:
  ```bash
  find . -name 'trace.zip'
  find . -name '*.webm'
  find . -name '*.png'
  ```

**`demo-proof-playwright-failure-artifacts`** — uploaded only on failure. Contains screenshots / videos / traces only when Playwright generated them. Absent / empty on green runs (expected).

## Demo-Proof artifact tooling — exact names, paths, and helpers

### CI artifact names (exact)

Produced by `.github/workflows/demo-proof-walkthrough-readonly.yml`:

- `demo-proof-guards` — `e2e/results/demo-proof-guards.log`
- `demo-proof-vitest` — `e2e/results/demo-proof-vitest.log`
- `demo-proof-playwright-report` — Playwright HTML report (`playwright-report/`)
- `demo-proof-playwright-results` — Playwright run dir (`test-results/`)
- `demo-proof-playwright-failure-artifacts` — **failure-only** subset of `test-results/`
  (`**/*.png`, `**/*.webm`, `**/trace.zip`)

### Local script expectations

`test:demo-proof:open-report` (`scripts/open-demo-proof-playwright-report.mjs`) accepts, in order:

1. explicit path argument (`.zip` or directory)
2. `./demo-proof-playwright-report.zip`
3. `./demo-proof-playwright-report/`
4. `./.artifacts/demo-proof-playwright-report/`

Report entry point: `index.html`, searched recursively if not at the root.
Zip extraction uses a Node-built-in extractor (no system `unzip` and no
dependencies required); a system `unzip` fallback is attempted only if the
built-in extractor fails.

`test:demo-proof:download-report`
(`scripts/download-latest-demo-proof-playwright-report.mjs`):

- requires `gh` on PATH
- requires `gh auth status` to succeed
- looks up the most recent run of `.github/workflows/demo-proof-walkthrough-readonly.yml`
- downloads artifact `demo-proof-playwright-report` into `.artifacts/demo-proof-playwright-report/`
- opens the report through the shared opener logic

`test:demo-proof:summarize-results`
(`scripts/summarize-demo-proof-playwright-results.mjs`):

- default root: `./test-results/`
- optional explicit path, e.g.
  `node scripts/summarize-demo-proof-playwright-results.mjs ./.artifacts/demo-proof-playwright-results`
- recursively counts and lists `trace.zip`, `*.webm`, `*.png`
- exit 0 even when nothing found (expected on passing runs — Playwright only
  retains traces/videos on failure per `playwright.config.ts`)
- exit non-zero only when the input path is missing/unreadable

### Reproduction commands

```bash
bun run test:demo-proof:open-report
bun run test:demo-proof:download-report
bun run test:demo-proof:summarize-results

# Direct usage:
node scripts/open-demo-proof-playwright-report.mjs ./demo-proof-playwright-report.zip
node scripts/summarize-demo-proof-playwright-results.mjs ./test-results
node scripts/summarize-demo-proof-playwright-results.mjs ./.artifacts/demo-proof-playwright-results
```

## Demo-Proof artifact tooling — verify, inspect, cleanup

### Local commands

```bash
bun run test:demo-proof:verify-report          # confirm index.html exists + print resolved target
bun run test:demo-proof:download-report        # via GitHub CLI
bun run test:demo-proof:open-report            # open extracted/zipped report
bun run test:demo-proof:summarize-results      # count trace/video/screenshot files
bun run test:demo-proof:open-artifacts         # open first trace/video/screenshot under test-results/
bun run test:demo-proof:cleanup                # remove .artifacts/demo-proof-playwright-report/
bun run test:demo-proof:cleanup:all            # also remove demo-proof results + selected test-results/ files
```

- `verify-report` walks the default `.artifacts/demo-proof-playwright-report/`
  (or an explicit path), recursively finds `index.html`, and prints the
  resolved entry point plus suggested open commands. Exit 0 if found.
- `open-artifacts` selects the first `trace.zip`, `*.webm`, and `*.png`
  beneath the default `test-results/` (or an explicit path), prints
  `bunx playwright show-trace <path>` (and best-effort spawns it), and opens
  the video/screenshot through the OS opener.
- `cleanup` is conservative: by default it only removes
  `.artifacts/demo-proof-playwright-report/`. `--all` (or
  `test:demo-proof:cleanup:all`) also removes
  `.artifacts/demo-proof-playwright-results/` and selected
  `trace.zip` / `*.webm` / `*.png` files under `test-results/` (and any
  clearly demo-proof-named top-level folder under `test-results/`). It refuses
  unsafe paths (`/`, repo root, or anything outside the repo) and never
  removes the entire `test-results/` tree.

### `gh` troubleshooting (download helper)

The download helper resolves the workflow by file path:
`.github/workflows/demo-proof-walkthrough-readonly.yml`.

```bash
# Auth
gh --version
gh auth status
gh auth login

# Repo / workflow
gh repo view --json nameWithOwner
gh workflow list
gh workflow view .github/workflows/demo-proof-walkthrough-readonly.yml
gh run list --workflow .github/workflows/demo-proof-walkthrough-readonly.yml --limit 10

# Artifact (manual fallback)
gh run download <run-id> --name demo-proof-playwright-report --dir .artifacts/demo-proof-playwright-report
```

Common failure patterns:

- **`gh` not installed** — install the GitHub CLI locally.
- **`gh auth status` failed** — run `gh auth login`.
- **Wrong repo selected** — run `gh repo view --json nameWithOwner`; confirm
  the current git remote points to the Verdant repo.
- **Workflow not found** — verify the file exists at
  `.github/workflows/demo-proof-walkthrough-readonly.yml` and appears in
  `gh workflow list`.
- **No completed runs found** — open a PR that touches a path-filter entry,
  or push an empty commit (`git commit --allow-empty -m "ci: retrigger demo proof workflow"`).
- **Artifact not found** — verify the run completed and that the artifact name
  is exactly `demo-proof-playwright-report` (case-sensitive).

## Demo-Proof artifact tooling — copy-paste examples

### A. Verify an extracted report

```bash
bun run test:demo-proof:verify-report
node scripts/verify-demo-proof-playwright-report.mjs ./.artifacts/demo-proof-playwright-report
```

### B. Download the latest report (requires `gh`)

```bash
gh auth status
bun run test:demo-proof:download-report
```

### C. Download/open the report for a specific workflow run id

```bash
gh run download <run-id> --name demo-proof-playwright-report --dir .artifacts/demo-proof-playwright-report
bun run test:demo-proof:verify-report
bun run test:demo-proof:open-report
```

### D. Explicit opener paths

```bash
node scripts/open-demo-proof-playwright-report.mjs ./.artifacts/demo-proof-playwright-report
node scripts/open-demo-proof-playwright-report.mjs ./demo-proof-playwright-report.zip
```

### E. Results artifact summary + inspection

```bash
gh run download <run-id> --name demo-proof-playwright-results --dir .artifacts/demo-proof-playwright-results
node scripts/summarize-demo-proof-playwright-results.mjs ./.artifacts/demo-proof-playwright-results
node scripts/open-demo-proof-playwright-artifacts.mjs ./.artifacts/demo-proof-playwright-results
```

### F. Tree, safety checks, and one-command review

```bash
bun run test:demo-proof:tree-report          # bounded file tree, highlights index.html
bun run test:demo-proof:artifact-helpers     # Node-built-in smoke tests for cleanup path guards
bun run test:demo-proof:review-artifacts     # verify-report -> summarize -> open-artifacts
bun run test:demo-proof:review-artifacts:cleanup  # same, then conservative cleanup
```

- `tree-report` walks `.artifacts/demo-proof-playwright-report/` (or an
  explicit path), prints a depth-limited tree, and marks the resolved
  `index.html` with `← index.html`. Exit non-zero if `index.html` is missing.
- `artifact-helpers` exercises `isSafeArtifactDeletePath` /
  `assertSafeArtifactDeletePath` from `scripts/demo-proof-artifact-utils.mjs`
  and proves `/`, the repo root, and empty paths are refused while
  `.artifacts/demo-proof-playwright-report/` and nested `test-results/.../trace.zip`
  are allowed.
- `review-artifacts` aborts early if `verify-report` fails; it always
  continues through `summarize-results` and `open-artifacts` even when no
  traces/videos/screenshots are present. Cleanup runs only with
  `--cleanup` / `--cleanup-all`.
