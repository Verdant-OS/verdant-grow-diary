#!/usr/bin/env node
/**
 * EcoWitt V0 validation runner.
 *
 * Safe-by-design:
 *  - Never reads .env contents.
 *  - Never POSTs to the bridge or triggers forwarding.
 *  - Never mutates database state.
 *  - Never prints secret values.
 *
 * Runs the known regression gates in the right order and summarizes
 * pass/fail per step. Stops on failure unless --keep-going is passed.
 *
 * Steps are intentionally identical to the EcoWitt V0 contract's
 * regression_commands list, plus python + edge function tests.
 */
import { spawnSync } from "node:child_process";
import { platform } from "node:os";

const KEEP_GOING = process.argv.includes("--keep-going");

const STEPS = [
  {
    name: "python: forwarding config / source labeling / forwarding contract",
    cmd: "python3",
    args: [
      "-m",
      "unittest",
      "test_forwarding_config",
      "test_source_labeling",
      "test_forwarding_contract",
    ],
    cwd: "tools/ecowitt-testbench",
    skipIfMissing: ["python3"],
  },
  {
    name: "vitest: ecowitt live snapshot + ai doctor live evidence",
    cmd: "bunx",
    args: [
      "vitest",
      "run",
      "src/test/ecowitt-live-source-snapshot-visibility.test.ts",
      "src/test/ai-doctor-context-ecowitt-live-evidence.test.ts",
    ],
  },
  {
    name: "vitest: operator widgets + verified rules + testbench safety",
    cmd: "bunx",
    args: [
      "vitest",
      "run",
      "src/test/ecowitt-local-forwarding-status-widget.test.tsx",
      "src/test/ecowitt-bridge-debug-page.test.tsx",
      "src/test/ecowitt-live-ingest-verified-rules.test.ts",
      "src/test/ecowitt-windows-testbench-static-safety.test.ts",
    ],
  },
  {
    name: "vitest: sensor_readings dedupe index migration",
    cmd: "bunx",
    args: ["vitest", "run", "src/test/sensor-readings-dedupe-index-migration.test.ts"],
  },
  {
    name: "vitest: ecowitt v0 contract doc",
    cmd: "bunx",
    args: ["vitest", "run", "src/test/ecowitt-v0-live-ingest-contract-doc.test.ts"],
  },
  {
    name: "edge: sensor-ingest-webhook",
    cmd: "bun",
    args: ["run", "test:edge:sensor-ingest-webhook"],
  },
  {
    name: "typecheck",
    cmd: "bun",
    args: ["run", "typecheck"],
  },
];

function which(bin) {
  const probe = spawnSync(platform() === "win32" ? "where" : "which", [bin], {
    stdio: "ignore",
  });
  return probe.status === 0;
}

const results = [];
let stopped = false;

for (const step of STEPS) {
  if (stopped) {
    results.push({ name: step.name, status: "skipped" });
    continue;
  }
  const missing = (step.skipIfMissing || []).filter((b) => !which(b));
  if (missing.length > 0) {
    results.push({
      name: step.name,
      status: "skipped",
      note: `missing: ${missing.join(", ")}`,
    });
    continue;
  }
  console.log(`\n=== ${step.name} ===`);
  const r = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    cwd: step.cwd,
  });
  const ok = r.status === 0;
  results.push({ name: step.name, status: ok ? "pass" : "fail" });
  if (!ok && !KEEP_GOING) {
    stopped = true;
  }
}

console.log("\n=== EcoWitt V0 validation summary ===");
for (const r of results) {
  const mark =
    r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP";
  console.log(`[${mark}] ${r.name}${r.note ? ` (${r.note})` : ""}`);
}

const failed = results.some((r) => r.status === "fail");
process.exit(failed ? 1 : 0);
