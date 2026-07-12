// Controlled validation matrix — sequential Vitest processes with JSON.
//
// The plan is deterministic: 11 unique files, 21 sequential runs. No
// retries. A nonzero process with passing assertions is still a failure.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const REPEAT_THREE_FILES = Object.freeze([
  "src/test/vitest-controlled-reporter-diagnostics.test.ts",
  "src/test/vitest-controlled-progress-analyzer.test.ts",
  "src/test/vitest-controlled-fingerprint.test.ts",
  "src/test/vitest-controlled-summarizer.test.ts",
  "src/test/vitest-controlled-shard-aware-fingerprint.test.ts",
]);

export const ONCE_FILES = Object.freeze([
  "src/test/vitest-controlled-cli-integration.test.ts",
  "src/test/vitest-controlled-toolchain.test.ts",
  "src/test/vitest-controlled-reporter.test.ts",
  "src/test/vitest-controlled-integration-gating.test.ts",
  "src/test/vitest-controlled-manifest.test.ts",
  "src/test/vitest-controlled-sharding.test.ts",
]);

/** Return the deterministic 21-run plan. */
export function buildMatrixPlan() {
  const runs = [];
  for (const f of REPEAT_THREE_FILES) {
    for (let i = 1; i <= 3; i++) runs.push({ file: f, repetition: i });
  }
  for (const f of ONCE_FILES) runs.push({ file: f, repetition: 1 });
  const uniqueFiles = new Set(runs.map((r) => r.file));
  return { runs, totalRuns: runs.length, uniqueFileCount: uniqueFiles.size };
}

/** Parse a Vitest JSON reporter result into pass/fail/skip counts. */
export function parseVitestJson(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { parsed: false, passed: 0, failed: 0, skipped: 0, failures: [] };
  }
  const results = Array.isArray(json.testResults) ? json.testResults : [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];
  for (const suite of results) {
    for (const t of suite.assertionResults || []) {
      if (t.status === "passed") passed++;
      else if (t.status === "failed") {
        failed++;
        failures.push({
          file: suite.name,
          test: (t.ancestorTitles || []).concat(t.title).join(" > "),
          message: (t.failureMessages || [])[0]?.split("\n")[0] || null,
        });
      } else skipped++;
    }
    if ((suite.assertionResults || []).length === 0 && suite.status === "failed") {
      failures.push({
        file: suite.name,
        test: null,
        message: suite.message || "file-level failure",
        possibleRunnerFailure: true,
      });
    }
  }
  return { parsed: true, passed, failed, skipped, failures };
}

/** Interpret a single run: pass iff exit 0 and no failed assertions. */
export function classifyRun({ exitCode, parsed }) {
  const suspiciousRunnerFailure =
    exitCode !== 0 && parsed.parsed && parsed.failed === 0 && parsed.failures.length === 0;
  return {
    ok: exitCode === 0 && parsed.failed === 0,
    exitCode,
    passed: parsed.passed,
    failed: parsed.failed,
    skipped: parsed.skipped,
    failures: parsed.failures,
    suspiciousRunnerFailure,
  };
}

function runOne(file, { spawnImpl = spawnSync } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-matrix-"));
  const outPath = path.join(tmp, "result.json");
  const started = Date.now();
  const res = spawnImpl(
    "bunx",
    [
      "vitest",
      "run",
      file,
      "--reporter=json",
      `--outputFile=${outPath}`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const durationMs = Date.now() - started;
  let text = "";
  try {
    text = fs.readFileSync(outPath, "utf8");
  } catch {
    text = res.stdout || "";
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const parsed = parseVitestJson(text);
  return { ...classifyRun({ exitCode: res.status ?? 1, parsed }), durationMs };
}

export async function runMatrix({ dryRun = false, outputPath = null, spawnImpl } = {}) {
  const plan = buildMatrixPlan();
  if (dryRun) {
    const summary = {
      dryRun: true,
      totalRuns: plan.totalRuns,
      uniqueFileCount: plan.uniqueFileCount,
      runs: plan.runs,
    };
    if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    return { ok: true, ...summary };
  }
  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalMs = 0;
  for (const item of plan.runs) {
    const r = runOne(item.file, { spawnImpl });
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalSkipped += r.skipped;
    totalMs += r.durationMs;
    results.push({ ...item, ...r });
  }
  const failedRuns = results.filter((r) => !r.ok);
  const summary = {
    ok: failedRuns.length === 0,
    totalRuns: plan.totalRuns,
    uniqueFileCount: plan.uniqueFileCount,
    totalPassed,
    totalFailed,
    totalSkipped,
    totalDurationMs: totalMs,
    failedRuns,
    results,
  };
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  return summary;
}

function parseArgv(argv) {
  const out = { dryRun: false, outputPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--output") out.outputPath = argv[++i];
  }
  return out;
}

export async function main(argv) {
  const args = parseArgv(argv);
  const result = await runMatrix({ dryRun: args.dryRun, outputPath: args.outputPath });
  if (args.dryRun) {
    process.stdout.write(
      `PLAN: ${result.totalRuns} runs across ${result.uniqueFileCount} files\n`,
    );
    return 0;
  }
  process.stdout.write(
    `RESULT: ${result.ok ? "OK" : "FAIL"} ${result.totalPassed}/${result.totalFailed}/${result.totalSkipped} in ${result.totalDurationMs}ms\n`,
  );
  for (const f of result.failedRuns) {
    process.stdout.write(`  FAIL ${f.file} (rep ${f.repetition}) exit=${f.exitCode}\n`);
  }
  return result.ok ? 0 : 2;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(String(err?.stack || err) + "\n");
      process.exit(1);
    },
  );
}
