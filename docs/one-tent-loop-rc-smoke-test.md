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
