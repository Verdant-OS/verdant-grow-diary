# One-Tent Loop Proof — never-healthy safety gate

This document explains how to run and debug the never-healthy safety
gate for the `/one-tent-loop-proof` surface locally, and how the CI
gate is wired.

## What it guards

The `/one-tent-loop-proof` route is a **read-only** operator surface
that renders derived proof about the One-Tent Loop from real app
state. The safety gate proves:

- No unsafe wording (`healthy`, `OK`, `success`, `verified`,
  `all good`, `no issues detected`) is rendered for stale, invalid,
  demo, unknown, or malformed telemetry.
- Untrusted sensor `source` labels are sanitized to a safe allow-list
  (`live | manual | csv | demo | invalid | missing | stale`).
- No write-capable network calls, AI calls, Action Queue writes,
  device control, or presenter write controls exist on this surface.
- No raw payloads, `service_role`, `bridge_token`, or JWTs leak into
  evidence refs, drilldown copy, or the text report.

## Test layers

| Layer | Path | Purpose |
|---|---|---|
| Pure rules | `src/test/one-tent-loop-proof-rules.test.ts` | Every evaluator, every status label. |
| Telemetry fuzz | `src/test/one-tent-loop-proof-telemetry-fuzz.test.ts` | Deterministic table of malformed / hostile snapshots. |
| Evidence-ref safety | `src/test/one-tent-loop-proof-evidence-ref-safety.test.ts` | Hostile source strings never leak into any proof surface. |
| Presenter | `src/test/one-tent-loop-live-proof-presenter.test.tsx` | Rendered React tree for edge inputs. |
| Browser E2E | `e2e/one-tent-loop-proof-never-healthy.spec.ts` | Real browser load of `/one-tent-loop-proof` in the `chromium-mocked` project. |

## Local run — Playwright never-healthy spec

### 1. Install Chromium

```bash
bunx playwright install chromium --with-deps
```

### 2. Normal (headless) run

```bash
bun run test:e2e:one-tent-loop-proof-never-healthy
```

### 3. Headed run (watch the browser)

```bash
bun run test:e2e:one-tent-loop-proof-never-healthy:headed
```

### 4. Debug / UI mode

```bash
bun run test:e2e:one-tent-loop-proof-never-healthy:debug
```

The spec runs in the `chromium-mocked` project — the **same project
used in CI**. It does not require auth credentials, `storageState`,
`service_role`, or tokens. Route-level auth is not bypassed: an
unauthenticated navigation to `/one-tent-loop-proof` is redirected to
`/auth`, and the spec asserts safety invariants along the entire
redirect path. Rendered-proof invariants for hostile telemetry are
proven at the Vitest layer (fuzz + evidence-ref + presenter suites).

### Reports and artifacts

- Playwright HTML report: `playwright-report/`
- Failure screenshots / videos / traces: `test-results/`
- Sanitized text proof (see below): `artifacts/one-tent-loop-proof/never-healthy-proof-report.txt`

### Common failure causes

- **Unsafe wording surfaced in DOM.** A rules or view-model change
  echoed `healthy`, `OK`, `success`, or `verified` for an untrusted
  input. Check `oneTentLoopProofRules.ts` and
  `oneTentLoopLiveProofViewModel.ts`.
- **New source label added without allow-listing.** Extend
  `ALLOWED_SENSOR_SOURCES` and add a fuzz case; do not just add the
  label to the badge map.
- **New top-level key on `SensorSnapshotEvidence`.** Update
  `ALLOWED_SENSOR_KEYS` in `oneTentLoopProofRules.ts`; the strict
  shape guard treats unknown keys as `invalid`.
- **Presenter added a write control** (`button`, `form`, `input`).
  The proof surface is read-only by contract; move the control off
  this route.

## Local run — Vitest rules + fuzz + evidence-ref safety

```bash
bun run test:one-tent-loop-proof-never-healthy
```

Runs pure rules, telemetry fuzz, and evidence-ref hostile-string
regression together. No browser required.

## Sanitized failure artifact

`scripts/write-one-tent-loop-proof-never-healthy-artifact.mjs` renders
a deterministic text file for a fixed table of hostile / malformed
telemetry cases. The script:

- reuses the real evaluators and view-model
- refuses to emit if forbidden substrings (`service_role`,
  `bridge_token`, `raw_payload`, JWT prefix, etc.) appear in the
  rendered proof
- writes only to `artifacts/one-tent-loop-proof/`
- performs no network calls

Run locally:

```bash
bun run artifact:one-tent-loop-proof-never-healthy
cat artifacts/one-tent-loop-proof/never-healthy-proof-report.txt
```

CI runs this on `if: failure()` and uploads the artifact so a
regression can be inspected without re-running the browser.

## Sandbox / non-Playwright environments

If Chromium cannot be installed locally, the Vitest layer covers the
same rendered-proof invariants for malformed telemetry and hostile
source strings. CI installs Chromium and runs the browser spec on
every PR touching the proof surface.
