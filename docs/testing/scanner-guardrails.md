# Scanner guardrail harness

Verdant has several repository-wide scanner suites that walk large parts of the repo looking for unsafe patterns: leaked secrets, device-control wording, raw payload exposure, retired integration references, and ownership drift.

Use the shared harness for any new filesystem-scanning Vitest suite. It keeps scanner tests readable without weakening any regex, allowlist, or assertion.

## When to use it

Use `installScannerGuardrail` when a test file:

- recursively walks `src`, `docs`, `scripts`, `supabase`, `.github`, or fixtures
- shells out to a repo-wide scanner script
- scans many files with `readFileSync`
- is safety/ownership/static-regression focused instead of product behavior focused

Do not use it for normal unit, render, hook, or route tests.

## Basic pattern

```ts
import { describe, expect } from "vitest";
import {
  installScannerGuardrail,
  scannerIt,
} from "./support/scannerGuardrailHarness";

installScannerGuardrail({
  file: __filename,
  suite: "my-scanner-name",
});

describe("my scanner", () => {
  scannerIt("current repository is clean", () => {
    // keep existing scanner regexes, allowlists, and assertions unchanged
    expect([]).toEqual([]);
  });
});
```

Existing scanner files may keep importing Vitest's normal `it`. The important part is that the file calls `installScannerGuardrail({ file: __filename })` once near the top. `scannerIt` is only a readability alias for new scanner suites.

## Cached filesystem walks

Prefer the shared cache when a suite needs a reusable file list:

```ts
import { getCachedTsFiles } from "./support/scannerGuardrailHarness";

const sourceFiles = getCachedTsFiles(resolve(process.cwd(), "src"));
```

For non-TypeScript scans, use the generic helper:

```ts
import { getCachedScannerFiles } from "./support/scannerGuardrailHarness";

const files = getCachedScannerFiles({
  root: process.cwd(),
  dirs: ["src", "docs", "scripts", "supabase", ".github"],
  exts: [".ts", ".tsx", ".js", ".mjs", ".md", ".yml", ".yaml"],
});
```

Only cache file lists. Do not cache scanner conclusions unless the same exact scanner command is intentionally reused inside one test file.

## Timeout telemetry report

The harness emits a JSONL row only when an individual scanner test exceeds `SLOW_SCANNER_THRESHOLD_MS`.

Report path:

```txt
test-results/scanner-guardrail-slow-tests.jsonl
```

Each line is one JSON object:

```json
{
  "test": "current repository is clean",
  "suite": "sensor-intelligence-safety",
  "file": "src/test/sensor-intelligence-safety.test.ts",
  "durationMs": 6123,
  "thresholdMs": 5000,
  "recordedAt": "2026-06-16T00:00:00.000Z"
}
```

Field meanings:

| Field | Meaning |
|---|---|
| `test` | The Vitest `it(...)` label that crossed the slow threshold |
| `suite` | Stable scanner label, either passed explicitly or derived from the test filename |
| `file` | Scanner test file that installed the harness |
| `durationMs` | Rounded runtime in milliseconds |
| `thresholdMs` | Threshold that caused the row to be emitted |
| `recordedAt` | ISO timestamp for triage only |

An empty or missing report means no scanner test crossed the slow threshold in that run. That is a good result, not a failure.

## Local validation

Run the sentinel:

```bash
bun run test:scanner-guardrails
```

Then inspect the report if it exists:

```bash
cat test-results/scanner-guardrail-slow-tests.jsonl
```

Validate that every row contains `test`, `suite`, `file`, `durationMs`, and `thresholdMs`. `recordedAt` is expected to change between runs; do not use it for deterministic assertions.

## Guardrails

- Do not change scanner regexes while optimizing filesystem walks.
- Do not broaden allowlists as a performance fix.
- Do not skip scanner tests.
- Do not change global Vitest timeout.
- Do not classify a timeout-only problem as a safety pass.
- Keep scanner output informational unless an existing assertion fails.
