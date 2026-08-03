#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";

const NORMALIZED_SETUP = String.raw`import "@testing-library/jest-dom";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

beforeEach(() => {
  if (typeof window === "undefined") return;
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storageName].clear();
    } catch {
      // The normalized proof harness treats blocked browser storage as unavailable.
    }
  }
});

afterEach(() => {
  cleanup();
  if (typeof document !== "undefined") {
    document.body.replaceChildren();
  }
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
  ResizeObserverMock;
`;

function parseArgs(argv) {
  const [command = "run", ...rest] = argv;
  const args = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq !== -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return { command, args };
}

function required(args, key) {
  const value = args[key];
  if (!value) throw new Error(`Missing required --${key}`);
  return value;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function redact(value) {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/((?:access|refresh)[_-]?token\s*[:=]\s*)[^\s"',]+/gi, "$1[REDACTED]")
    .replace(/((?:service[_-]?role|bridge[_-]?token|client[_-]?secret|api[_-]?key)\s*[:=]\s*)[^\s"',]+/gi, "$1[REDACTED]");
}

function normalizeText(value, root) {
  return redact(stripAnsi(String(value ?? "")))
    .replaceAll(root.replaceAll("\\", "/"), "<ROOT>")
    .replaceAll(root, "<ROOT>")
    .replace(/\b\d+(?:\.\d+)?(?:ms|s)\b/g, "<DURATION>");
}

function signatureFor(run, root) {
  const body = normalizeText(`${run.stdout}\n${run.stderr}`, root);
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const selected = lines.filter((line) =>
    /(?:FAIL|Error|ENOENT|Unable to find|expected|received|Cannot find|Failed to resolve|not implemented|AssertionError|TypeError|SyntaxError|ReferenceError)/i.test(
      line,
    ),
  );
  const text = (selected.length ? selected : lines.slice(-20)).slice(0, 24).join("\n");
  return {
    text,
    sha256: createHash("sha256").update(text).digest("hex"),
  };
}

function parseCount(line, name) {
  const match = line.match(new RegExp(`(\\d+)\\s+${name}`));
  return match ? Number.parseInt(match[1], 10) : 0;
}

function parseVitestCounts(stdout, stderr) {
  const lines = stripAnsi(`${stdout}\n${stderr}`).split(/\r?\n/);
  const fileLine = [...lines].reverse().find((line) => line.includes("Test Files")) ?? "";
  const testLine = [...lines].reverse().find((line) => /^\s*Tests\s/.test(line)) ?? "";
  return {
    test_files: {
      passed: parseCount(fileLine, "passed"),
      failed: parseCount(fileLine, "failed"),
      skipped: parseCount(fileLine, "skipped"),
    },
    tests: {
      passed: parseCount(testLine, "passed"),
      failed: parseCount(testLine, "failed"),
      skipped: parseCount(testLine, "skipped"),
    },
  };
}

function runCommand(command, commandArgs, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: 64 * 1024 * 1024,
    env: options.env ?? process.env,
  });
  const duration_ms = Math.round(performance.now() - started);
  return {
    command: [command, ...commandArgs],
    exit_code: result.status,
    signal: result.signal,
    error: result.error ? String(result.error.message ?? result.error) : null,
    stdout: redact(result.stdout ?? ""),
    stderr: redact(result.stderr ?? ""),
    duration_ms,
    status:
      result.error?.code === "ETIMEDOUT"
        ? "timeout"
        : result.status === 0
          ? "pass"
          : "fail",
  };
}

function writeRunLog(outputDir, mode, testFile, index, run) {
  const safe = testFile.replaceAll("/", "__").replaceAll("\\", "__");
  const logDir = join(outputDir, "isolated-logs", mode);
  ensureDir(logDir);
  const path = join(logDir, `${safe}.run-${index}.log`);
  writeFileSync(
    path,
    [
      `command: ${run.command.join(" ")}`,
      `status: ${run.status}`,
      `exit_code: ${run.exit_code}`,
      `signal: ${run.signal ?? ""}`,
      `duration_ms: ${run.duration_ms}`,
      "",
      "STDOUT",
      run.stdout,
      "",
      "STDERR",
      run.stderr,
      "",
    ].join("\n"),
  );
  return relative(outputDir, path);
}

function runVitest({ targetDir, configPath, testFile, mode, outputDir, attempt }) {
  const args = ["vitest", "run"];
  if (configPath) args.push("--config", configPath);
  args.push("--reporter=dot", "--isolate", "--pool=forks", testFile);
  const run = runCommand("bunx", args, { cwd: targetDir, timeoutMs: 180_000 });
  const signature = signatureFor(run, targetDir);
  return {
    attempt,
    mode,
    test_file: testFile,
    status: run.status,
    exit_code: run.exit_code,
    signal: run.signal,
    error: run.error,
    duration_ms: run.duration_ms,
    counts: parseVitestCounts(run.stdout, run.stderr),
    signature,
    warning_lines: normalizeText(`${run.stdout}\n${run.stderr}`, targetDir)
      .split(/\r?\n/)
      .filter((line) => /warning|not wrapped in act|not implemented/i.test(line))
      .slice(0, 30),
    log_path: writeRunLog(outputDir, mode, testFile, attempt, run),
  };
}

function runRepeated(options, initialRuns = 2) {
  const runs = [];
  for (let attempt = 1; attempt <= initialRuns; attempt += 1) {
    runs.push(runVitest({ ...options, attempt }));
  }
  const statuses = new Set(runs.map((run) => run.status));
  if (statuses.size > 1) {
    for (let attempt = initialRuns + 1; attempt <= 5; attempt += 1) {
      runs.push(runVitest({ ...options, attempt }));
    }
  }
  return summarizeRuns(runs);
}

function summarizeRuns(runs) {
  const statuses = [...new Set(runs.map((run) => run.status))];
  const signatures = [...new Set(runs.filter((run) => run.status !== "pass").map((run) => run.signature.sha256))];
  return {
    runs,
    repeat_count: runs.length,
    all_passed: runs.every((run) => run.status === "pass"),
    all_failed: runs.every((run) => run.status === "fail"),
    mixed: statuses.length > 1,
    statuses,
    failure_signatures: signatures,
    first_failure_signature:
      runs.find((run) => run.status !== "pass")?.signature ?? null,
    warnings_only:
      runs.every((run) => run.status === "pass") &&
      runs.some((run) => run.warning_lines.length > 0),
  };
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function findLockfile(targetDir) {
  for (const name of ["bun.lock", "bun.lockb"]) {
    const path = join(targetDir, name);
    if (existsSync(path)) return { name, path, sha256: hashFile(path) };
  }
  return null;
}

function discoverTestFiles(targetDir) {
  const root = join(targetDir, "src", "test");
  const out = [];
  if (!existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) stack.push(full);
      else if (/\.test\.(ts|tsx)$/.test(entry)) out.push(relative(targetDir, full));
    }
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function selectRoundRobinBatch(files, batch, batches = 16) {
  return files.filter((_, index) => index % batches === batch);
}

function runNormalizedBatch({ targetDir, configPath, batch, outputDir }) {
  const files = selectRoundRobinBatch(discoverTestFiles(targetDir), batch, 16);
  const batchDir = join(outputDir, "batch-results", `batch-${batch}`);
  ensureDir(batchDir);
  const results = [];
  let firstFailure = null;
  for (const testFile of files) {
    const first = runVitest({
      targetDir,
      configPath,
      testFile,
      mode: `normalized-batch-${batch}`,
      outputDir: batchDir,
      attempt: 1,
    });
    let final = first;
    let retried = false;
    if (first.status !== "pass") {
      retried = true;
      final = runVitest({
        targetDir,
        configPath,
        testFile,
        mode: `normalized-batch-${batch}`,
        outputDir: batchDir,
        attempt: 2,
      });
    }
    const item = { test_file: testFile, first, final, retried };
    results.push(item);
    if (final.status !== "pass") {
      firstFailure = item;
      break;
    }
  }
  const summary = {
    batch,
    file_count: files.length,
    executed_files: results.length,
    status: firstFailure ? "fail" : "pass",
    first_failure_file: firstFailure?.test_file ?? null,
    first_failure_signature: firstFailure?.final.signature ?? null,
    results,
  };
  writeFileSync(join(batchDir, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

function getVersion(command, args, cwd) {
  const result = runCommand(command, args, { cwd, timeoutMs: 30_000 });
  return {
    status: result.status,
    value: stripAnsi(result.stdout || result.stderr).trim().split(/\r?\n/).at(-1) ?? "",
  };
}

function buildSummaryMarkdown(summary) {
  const rows = summary.failures.map((item) => {
    const native = item.native?.all_passed
      ? "PASS"
      : item.native?.all_failed
        ? "FAIL"
        : item.native?.mixed
          ? "FLAKE"
          : "SKIPPED";
    const normalized = item.normalized?.all_passed
      ? "PASS"
      : item.normalized?.all_failed
        ? "FAIL"
        : item.normalized?.mixed
          ? "FLAKE"
          : "SKIPPED";
    return `| \`${item.test_file}\` | ${item.batch} | ${native} | ${normalized} | ${item.batch_reproduction?.status ?? "n/a"} |`;
  });
  return [
    `# PR #694 Vitest proof — ${summary.label}`,
    "",
    `- Target SHA: \`${summary.target_sha}\``,
    `- Native smoke: **${summary.native_smoke.status}**`,
    `- Normalized smoke: **${summary.normalized_smoke.status}**`,
    `- Lockfile: \`${summary.environment.lockfile?.name ?? "missing"}\``,
    "",
    "| Test file | Batch | Native | Normalized | Normalized exact batch |",
    "|---|---:|---:|---:|---:|",
    ...rows,
    "",
  ].join("\n");
}

function runProof(args) {
  const targetDir = resolve(required(args, "target-dir"));
  const inventoryPath = resolve(required(args, "inventory"));
  const normalizedSource = resolve(required(args, "normalized-config"));
  const outputDir = resolve(required(args, "output-dir"));
  const label = required(args, "label");
  const expectedSha = required(args, "expected-sha");
  ensureDir(outputDir);

  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  const actualSha = stripAnsi(
    runCommand("git", ["rev-parse", "HEAD"], { cwd: targetDir }).stdout,
  ).trim();
  if (actualSha !== expectedSha) {
    throw new Error(`Target SHA mismatch for ${label}: expected ${expectedSha}, got ${actualSha}`);
  }
  const expectedFromInventory = {
    base: inventory.base_sha,
    head: inventory.pr_head_sha,
    merge: inventory.ci_merge_sha,
  }[label];
  if (expectedFromInventory !== expectedSha) {
    throw new Error(
      `Inventory SHA mismatch for ${label}: expected ${expectedFromInventory}, workflow supplied ${expectedSha}`,
    );
  }

  const proofDir = join(targetDir, ".pr694-proof");
  ensureDir(proofDir);
  const normalizedConfigPath = join(proofDir, "vitest.normalized.config.mjs");
  copyFileSync(normalizedSource, normalizedConfigPath);
  writeFileSync(join(proofDir, "normalized-setup.ts"), NORMALIZED_SETUP);

  const environment = {
    generated_at: new Date().toISOString(),
    label,
    target_sha: actualSha,
    node: getVersion("node", ["--version"], targetDir),
    bun: getVersion("bun", ["--version"], targetDir),
    vitest: getVersion(
      "node",
      ["-e", "process.stdout.write(require('vitest/package.json').version)"],
      targetDir,
    ),
    lockfile: findLockfile(targetDir),
    node_options: process.env.NODE_OPTIONS ?? null,
    platform: process.platform,
    arch: process.arch,
  };
  writeFileSync(join(outputDir, "environment.json"), JSON.stringify(environment, null, 2));

  const nativeSmokeRun = runVitest({
    targetDir,
    configPath: null,
    testFile: inventory.smoke_test,
    mode: "native-smoke",
    outputDir,
    attempt: 1,
  });
  const normalizedSmokeRun = runVitest({
    targetDir,
    configPath: normalizedConfigPath,
    testFile: inventory.smoke_test,
    mode: "normalized-smoke",
    outputDir,
    attempt: 1,
  });

  const nativeAvailable = nativeSmokeRun.status === "pass";
  const normalizedAvailable = normalizedSmokeRun.status === "pass";

  const failures = [];
  for (const failure of inventory.failures) {
    const exists = existsSync(join(targetDir, failure.test_file));
    const item = {
      ...failure,
      exists,
      native: null,
      normalized: null,
      batch_reproduction: null,
    };
    if (!exists) {
      failures.push(item);
      continue;
    }
    if (nativeAvailable) {
      item.native = runRepeated({
        targetDir,
        configPath: null,
        testFile: failure.test_file,
        mode: "native",
        outputDir,
      });
    }
    if (normalizedAvailable) {
      item.normalized = runRepeated({
        targetDir,
        configPath: normalizedConfigPath,
        testFile: failure.test_file,
        mode: "normalized",
        outputDir,
      });
    }
    failures.push(item);
  }

  if (normalizedAvailable) {
    const batchesToRun = new Set(
      failures
        .filter((failure) => failure.normalized?.all_passed)
        .map((failure) => failure.batch),
    );
    const batchResults = new Map();
    for (const batch of [...batchesToRun].sort((a, b) => a - b)) {
      batchResults.set(
        batch,
        runNormalizedBatch({ targetDir, configPath: normalizedConfigPath, batch, outputDir }),
      );
    }
    for (const failure of failures) {
      if (batchResults.has(failure.batch)) {
        failure.batch_reproduction = batchResults.get(failure.batch);
      }
    }
  }

  const summary = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    repository: "Verdant-OS/verdant-grow-diary",
    pr: inventory.pr,
    source_workflow_run: inventory.source_workflow_run,
    label,
    target_sha: actualSha,
    frozen_refs: {
      base_sha: inventory.base_sha,
      pr_head_sha: inventory.pr_head_sha,
      ci_merge_sha: inventory.ci_merge_sha,
    },
    environment,
    native_smoke: nativeSmokeRun,
    normalized_smoke: normalizedSmokeRun,
    failures,
  };
  writeFileSync(join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(outputDir, "summary.md"), buildSummaryMarkdown(summary));
  console.log(JSON.stringify({
    status: "complete",
    label,
    target_sha: actualSha,
    native_available: nativeAvailable,
    normalized_available: normalizedAvailable,
    failure_count: failures.length,
  }));
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

function classify(baseItem, headItem, mergeItem) {
  const norm = [baseItem, headItem, mergeItem].map((item) => item?.normalized);
  if (norm.some((item) => !item)) return { classification: "unproven", confidence: "low" };
  if (norm.some((item) => item.mixed)) return { classification: "flake", confidence: "high" };
  const [basePass, headPass, mergePass] = norm.map((item) => item.all_passed);
  const [baseSig, headSig, mergeSig] = norm.map((item) => item.first_failure_signature?.sha256 ?? null);

  if (basePass && !headPass && !mergePass && headSig && headSig === mergeSig) {
    return { classification: "pr_owned_candidate", confidence: "medium" };
  }
  if (!basePass && !mergePass && baseSig && baseSig === mergeSig) {
    return { classification: "base_branch", confidence: "high" };
  }
  if (basePass && headPass && !mergePass) {
    return { classification: "merge_interaction", confidence: "high" };
  }
  if (basePass && headPass && mergePass) {
    const mergeBatch = mergeItem.batch_reproduction;
    if (mergeBatch?.status === "fail") {
      return { classification: "order_pollution", confidence: "high" };
    }
    const nativeStatuses = [baseItem, headItem, mergeItem].map((item) =>
      item?.native?.all_passed ? "pass" : item?.native?.all_failed ? "fail" : "unavailable",
    );
    if (new Set(nativeStatuses).size > 1) {
      return { classification: "config_only_exposure", confidence: "medium" };
    }
    const warningsOnly = [baseItem, headItem, mergeItem].some(
      (item) => item?.normalized?.warnings_only,
    );
    return {
      classification: warningsOnly ? "warning_only" : "original_ci_not_reproduced",
      confidence: warningsOnly ? "high" : "medium",
    };
  }
  return { classification: "unproven", confidence: "low" };
}

function aggregate(args) {
  const inputDir = resolve(required(args, "input-dir"));
  const outputDir = resolve(required(args, "output-dir"));
  ensureDir(outputDir);
  const summaries = walk(inputDir)
    .filter((path) => basename(path) === "summary.json")
    .map((path) => JSON.parse(readFileSync(path, "utf8")))
    .filter((summary) => ["base", "head", "merge"].includes(summary.label));
  const byLabel = new Map(summaries.map((summary) => [summary.label, summary]));
  const missing = ["base", "head", "merge"].filter((label) => !byLabel.has(label));
  const template = byLabel.get("merge") ?? byLabel.get("head") ?? byLabel.get("base");
  if (!template) throw new Error("No per-ref summary.json artifacts found");

  const rows = template.failures.map((failure) => {
    const items = {};
    for (const label of ["base", "head", "merge"]) {
      items[label] = byLabel
        .get(label)
        ?.failures.find((item) => item.test_file === failure.test_file) ?? null;
    }
    const verdict = classify(items.base, items.head, items.merge);
    return {
      test_file: failure.test_file,
      batch: failure.batch,
      ci_signature: failure.ci_signature,
      base: items.base,
      head: items.head,
      merge: items.merge,
      ...verdict,
    };
  });

  const counts = {};
  for (const row of rows) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  const normalizedBlocked = ["base", "head", "merge"].some(
    (label) => byLabel.get(label)?.normalized_smoke?.status !== "pass",
  );
  const status =
    missing.length || normalizedBlocked
      ? "incomplete"
      : rows.some((row) => row.classification === "unproven")
        ? "incomplete"
        : "complete";

  const combined = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    repository: "Verdant-OS/verdant-grow-diary",
    pr: 694,
    status,
    missing_artifacts: missing,
    frozen_refs: template.frozen_refs,
    source_workflow_run: template.source_workflow_run,
    environment: Object.fromEntries(
      ["base", "head", "merge"].map((label) => [label, byLabel.get(label)?.environment ?? null]),
    ),
    summary: {
      unique_failing_files: rows.length,
      classifications: counts,
    },
    failures: rows,
  };
  writeFileSync(
    join(outputDir, "pr694-vitest-ownership-matrix.json"),
    JSON.stringify(combined, null, 2),
  );

  const statusCell = (item, mode) => {
    const result = item?.[mode];
    if (!result) return "N/A";
    if (result.mixed) return "FLAKE";
    if (result.all_passed) return "PASS";
    if (result.all_failed) return "FAIL";
    return "UNPROVEN";
  };
  const markdown = [
    "# PR #694 Vitest residual ownership matrix",
    "",
    `**Status:** ${status.toUpperCase()}`,
    "",
    `- Base: \`${template.frozen_refs.base_sha}\``,
    `- PR head: \`${template.frozen_refs.pr_head_sha}\``,
    `- CI merge: \`${template.frozen_refs.ci_merge_sha}\``,
    "",
    "| Test file | Batch | Base native | Base normalized | Head native | Head normalized | Merge native | Merge normalized | Merge batch | Classification | Confidence |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|",
    ...rows.map((row) =>
      [
        `| \`${row.test_file}\``,
        row.batch,
        statusCell(row.base, "native"),
        statusCell(row.base, "normalized"),
        statusCell(row.head, "native"),
        statusCell(row.head, "normalized"),
        statusCell(row.merge, "native"),
        statusCell(row.merge, "normalized"),
        row.merge?.batch_reproduction?.status ?? "n/a",
        row.classification,
        row.confidence,
      ].join(" | ") + " |",
    ),
    "",
    "## Classification totals",
    "",
    "```json",
    JSON.stringify(counts, null, 2),
    "```",
    "",
  ].join("\n");
  writeFileSync(join(outputDir, "pr694-vitest-ownership-matrix.md"), markdown);
  console.log(JSON.stringify({ status, rows: rows.length, counts, missing }));
}

function recordInstallFailure(args) {
  const outputDir = resolve(required(args, "output-dir"));
  const label = required(args, "label");
  const expectedSha = required(args, "expected-sha");
  ensureDir(outputDir);
  const summary = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    repository: "Verdant-OS/verdant-grow-diary",
    pr: 694,
    label,
    target_sha: expectedSha,
    status: "blocked_install_failure",
    normalized_smoke: { status: "blocked" },
    native_smoke: { status: "blocked" },
    failures: [],
  };
  writeFileSync(join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(
    join(outputDir, "summary.md"),
    `# PR #694 Vitest proof — ${label}\n\n**BLOCKED:** frozen dependency install failed.\n`,
  );
}

const { command, args } = parseArgs(process.argv.slice(2));
try {
  if (command === "run") runProof(args);
  else if (command === "aggregate") aggregate(args);
  else if (command === "record-install-failure") recordInstallFailure(args);
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`pr694-vitest-proof: ${error?.stack ?? error}`);
  process.exit(1);
}
