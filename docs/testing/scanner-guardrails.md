# Scanner guardrail test harness

Static safety scanners (Shelly H&T retirement, EcoWitt-only sensor direction,
Pi-Ingest secret strategy, VPD stage ownership, typed-watering flag, etc.)
walk the repo filesystem from inside Vitest. Under full-suite parallel load
the default 5s `it` timeout can be exceeded purely from I/O contention,
producing **environmental** failures that have nothing to do with the
scanner's safety pattern.

The shared harness in `src/test/support/scannerGuardrailHarness.ts`
standardises three things so every scanner suite behaves the same way:

1. **Per-file timeout** — `SCANNER_GUARDRAIL_TIMEOUT_MS = 30_000`, applied
   via `vi.setConfig({ testTimeout, hookTimeout })`. The **global** Vitest
   timeout is unchanged.
2. **Slow-test telemetry** — every `it` is timed in a `beforeEach`/
   `afterEach` pair. Tests slower than `SLOW_SCANNER_THRESHOLD_MS = 5_000`
   append one JSONL row to `test-results/scanner-guardrail-slow-tests.jsonl`.
   This is **informational only** and never fails a test.
3. **Cached repo walks** — `getCachedTsFiles(root)` memoises recursive
   `.ts`/`.tsx` walks per Vitest worker so multiple scanner `it`s in the
   same file (or future shared scanner) don't re-walk `src/` repeatedly.

## Usage

```ts
import { describe, expect } from "vitest";
import {
  installScannerGuardrail,
  scannerIt,
  getCachedTsFiles,
} from "./support/scannerGuardrailHarness";

installScannerGuardrail({ file: __filename });

describe("my safety scanner", () => {
  scannerIt("does not leak X anywhere in src/", () => {
    const files = getCachedTsFiles("src");
    // ...assert...
  });
});
```

### `installScannerGuardrail({ file, timeoutMs? })`

Call **once** at module scope, before any `describe`. `file` should be
`__filename` so slow-test rows are traceable back to the source. Pass
`timeoutMs` only if a single scanner genuinely needs more than 30s — do
not raise this casually.

### `scannerIt(name, fn, timeout?)`

A thin wrapper around `it` that defaults `timeout` to
`SCANNER_GUARDRAIL_TIMEOUT_MS`. Prefer it for **new** scanner tests so
the standardised per-test timeout cannot quietly be lost by future
refactors. Existing scanner suites already get the same timeout via
`installScannerGuardrail` — migrating them to `scannerIt` is optional.

### `getCachedTsFiles(root, exts?)`

Returns a memoised list of `.ts`/`.tsx` paths under `root`. Identical
calls return the **same array reference** within a Vitest worker. Treat
the array as read-only.

### `buildScannerSlowTestReportRow(input)`

Pure builder for the JSONL row contract. Exported so the harness
self-test can validate row shape without relying on real test timing.
Throws on empty `test`/`suite`/`file` or non-finite `durationMs`.

## Slow-test JSONL report

Path: `test-results/scanner-guardrail-slow-tests.jsonl`

Each line is one row of:

| field         | type    | notes                                     |
| ------------- | ------- | ----------------------------------------- |
| `test`        | string  | `it` label, non-empty                     |
| `suite`       | string  | enclosing `describe` label, non-empty     |
| `file`        | string  | absolute path to the test file            |
| `durationMs`  | number  | integer milliseconds                      |
| `thresholdMs` | number  | always `5000` (current threshold)         |
| `recordedAt`  | string  | ISO-8601 timestamp                        |

The report is **append-only** within a run, regenerated across runs,
and consumed by the CI "Scanner guardrail timeout sentinel" step which
uploads it as an artifact. The report **must never gate CI** — it
exists to surface scanners that are creeping toward the 5s threshold
before they become flaky.

## Hard rules

- Never raise `testTimeout` globally to mask a slow scanner — fix the
  scanner (cache walks, narrow scan dirs, hoist out of `it`).
- Never weaken a scanner regex, allowlist, or assertion to make a slow
  test fit under the threshold.
- Never `it.skip` a scanner. If a scanner is wrong, fix it or delete
  it deliberately with a documented rationale.
- Never add an intentionally slow test just to force the report to be
  written; the empty-report case is the healthy state.
