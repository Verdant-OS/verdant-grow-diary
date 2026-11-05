#!/usr/bin/env node
// Fail a required test shard that ran zero tests (audit 2026-11-05, F-04).
//
//   node scripts/assert-vitest-shard-ran-tests.mjs <vitest-json-report> [...more]
//
// Reads each Vitest JSON reporter file (`--reporter=json --outputFile=<path>`)
// and exits 1 when any report is missing, malformed, or shows zero test files
// or zero tests. Pure rule: scripts/lib/vitestShardFloorRules.mjs.
import { readFileSync } from "node:fs";
import { evaluateVitestShardFloor } from "./lib/vitestShardFloorRules.mjs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("assert-vitest-shard-ran-tests: no report path given");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  let report = null;
  try {
    report = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    report = null;
  }
  const verdict = evaluateVitestShardFloor(report);
  if (verdict.ok) {
    console.log(
      `assert-vitest-shard-ran-tests: ${file}: ${verdict.suites} test file(s), ${verdict.tests} test(s)`,
    );
  } else {
    failed = true;
    console.error(`::error title=Vitest shard ran no tests::${file}: ${verdict.reason}`);
  }
}
process.exit(failed ? 1 : 0);
