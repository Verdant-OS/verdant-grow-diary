#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  auditSubscriberGrowthLiveParity,
  DEFAULT_SUBSCRIBER_GROWTH_ORIGIN,
} from "../audit-subscriber-growth-live-parity.mjs";
import {
  buildSubscriberGrowthReleaseReceipt,
  formatSubscriberGrowthLaunchGate,
} from "./subscriber-growth-launch-gate-rules.mjs";
import { auditSubscriberGrowthMigrationContract } from "./subscriber-growth-migration-contract.mjs";

const EXPECTED_REMOTE = "https://github.com/Verdant-OS/verdant-grow-diary.git";
const DEFAULT_BASE_REF = "origin/verdant-grow-diary";
const DEFAULT_OUT = path.resolve(
  "artifacts/release-readiness/subscriber-growth/launch-gate.v1.json",
);
const DEFAULT_PORT = 4187;
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const AUTO_MANAGED_OUT_OF_SCOPE_PATHS = new Set(["supabase/functions/mcp/index.ts"]);

export function parseSubscriberGrowthGateArgs(argv) {
  const args = {
    baseRef: DEFAULT_BASE_REF,
    expectedRemote: EXPECTED_REMOTE,
    liveOrigin: DEFAULT_SUBSCRIBER_GROWTH_ORIGIN,
    localOnly: false,
    out: DEFAULT_OUT,
    port: DEFAULT_PORT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--local-only") args.localOnly = true;
    else if (arg.startsWith("--base-ref=")) args.baseRef = arg.slice("--base-ref=".length);
    else if (arg.startsWith("--expected-remote=")) {
      args.expectedRemote = arg.slice("--expected-remote=".length);
    } else if (arg.startsWith("--origin=")) args.liveOrigin = arg.slice("--origin=".length);
    else if (arg.startsWith("--out=")) args.out = path.resolve(arg.slice("--out=".length));
    else if (arg.startsWith("--port=")) args.port = Number(arg.slice("--port=".length));
    else throw new Error(`unknown_argument:${arg}`);
  }
  if (!Number.isInteger(args.port) || args.port < 1024 || args.port > 65535) {
    throw new Error("invalid_preview_port");
  }
  return args;
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function gitRaw(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function parseGitPorcelainPaths(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3));
}

function normalizeRemote(value) {
  return String(value ?? "")
    .trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "")
    .toLowerCase();
}

function changedFiles(baseRef) {
  const output = git(["diff", "--name-only", `${baseRef}...HEAD`]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function runnableChangedTests(files) {
  return files.filter(
    (file) => /^src\/test\/.*\.test\.[cm]?[jt]sx?$/.test(file) && !file.includes("/helpers/"),
  );
}

export function runnableChangedE2e(files) {
  return files.filter((file) => /^e2e\/.*\.spec\.[cm]?[jt]s$/.test(file));
}

function lintableChangedFiles(files) {
  return files.filter(
    (file) => /\.(?:[cm]?[jt]s|tsx)$/.test(file) && !file.startsWith("supabase/migrations/"),
  );
}

export function formattableChangedFiles(files) {
  return files.filter((file) => /\.(?:[cm]?[jt]s|tsx|json|md|yml|yaml)$/.test(file));
}

export function buildTargetedTestCommandArgs(tests) {
  return ["vitest", "run", ...tests, "--reporter=dot", "--maxWorkers=2"];
}

export function buildChangedE2eCommandArgs(specs) {
  return [
    "playwright",
    "test",
    ...specs,
    "--project=chromium-mocked",
    "--reporter=line",
    "--workers=2",
  ];
}

function stripAnsi(value) {
  return String(value ?? "").replace(ANSI_PATTERN, "");
}

export function parseVitestTotals(output) {
  const clean = stripAnsi(output);
  const match = clean.match(
    /Tests\s+(?:(\d+) failed\s*\|\s*)?(\d+) passed(?:\s*\|\s*(\d+) skipped)?\s*\((\d+)\)/,
  );
  if (!match) return { testsPassed: 0, testsFailed: 0, testsSkipped: 0, testsTotal: 0 };
  return {
    testsFailed: Number(match[1] ?? 0),
    testsPassed: Number(match[2] ?? 0),
    testsSkipped: Number(match[3] ?? 0),
    testsTotal: Number(match[4] ?? 0),
  };
}

function runCommand(id, file, args) {
  const started = Date.now();
  const result = spawnSync(file, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const record = {
    id,
    status: exitCode === 0 ? "PASS" : "FAIL",
    exitCode,
    durationMs: Date.now() - started,
  };
  if (id === "targeted_tests") Object.assign(record, parseVitestTotals(output));
  if (exitCode !== 0) {
    const tail = stripAnsi(output).trim().split(/\r?\n/).slice(-30).join("\n");
    process.stderr.write(`\n${id} failed:\n${tail}\n`);
  }
  return record;
}

function runChangedE2e(specs) {
  if (specs.length === 0) {
    return {
      id: "changed_e2e",
      status: "PASS",
      exitCode: 0,
      durationMs: 0,
      specFiles: 0,
    };
  }
  return {
    ...runCommand("changed_e2e", "bunx", buildChangedE2eCommandArgs(specs)),
    specFiles: specs.length,
  };
}

function runSubscriberInterestRls() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const hasAnonKey = Boolean(
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY,
  );
  if (!required.every((name) => Boolean(process.env[name])) || !hasAnonKey) {
    return {
      id: "subscriber_interest_rls",
      status: "SKIP",
      exitCode: null,
      durationMs: 0,
      reason: "missing_local_supabase_env",
    };
  }
  return runCommand("subscriber_interest_rls", "bun", [
    "run",
    "test:subscriber-interest-db-security",
  ]);
}

function inspectMigrationContract() {
  const started = Date.now();
  const audit = auditSubscriberGrowthMigrationContract((file) =>
    fs.readFileSync(path.resolve(file), "utf8"),
  );
  if (!audit.ok) {
    process.stderr.write(`\nmigration_contract failed:\n${audit.issues.join("\n")}\n`);
  }
  return {
    id: "migration_contract",
    status: audit.ok ? "PASS" : "FAIL",
    exitCode: audit.ok ? 0 : 1,
    durationMs: Date.now() - started,
    migrationsPassed: audit.migrationsPassed,
    migrationsTotal: audit.migrationsTotal,
  };
}

function inspectSource(args, files, tests, e2eSpecs, formattable) {
  const remote = git(["remote", "get-url", "origin"]);
  let baseAncestor = false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", args.baseRef, "HEAD"], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    baseAncestor = true;
  } catch {
    baseAncestor = false;
  }
  const dirtyPaths = parseGitPorcelainPaths(gitRaw(["status", "--porcelain"]));
  const branchFiles = new Set(files);
  const ignoredDirtyPaths = dirtyPaths.filter(
    (file) => AUTO_MANAGED_OUT_OF_SCOPE_PATHS.has(file) && !branchFiles.has(file),
  );
  const releaseDirtyPaths = dirtyPaths.filter((file) => !ignoredDirtyPaths.includes(file));
  return {
    repositoryVerified:
      normalizeRemote(remote) === normalizeRemote(args.expectedRemote) &&
      path.resolve(git(["rev-parse", "--show-toplevel"])) === path.resolve(process.cwd()),
    remote,
    branch: git(["branch", "--show-current"]) || "detached",
    head: git(["rev-parse", "HEAD"]),
    baseRef: args.baseRef,
    baseCommit: git(["rev-parse", args.baseRef]),
    baseAncestor,
    worktreeClean: dirtyPaths.length === 0,
    releaseScopeClean: releaseDirtyPaths.length === 0,
    dirtyPaths,
    ignoredDirtyPaths,
    releaseDirtyPaths,
    changedFiles: files.length,
    changedTestFiles: tests.length,
    changedE2eFiles: e2eSpecs.length,
    changedFormattableFiles: formattable.length,
  };
}

async function auditLocalPreview(port) {
  const { preview } = await import("vite");
  const server = await preview({
    preview: { host: "127.0.0.1", port, strictPort: true },
    logLevel: "silent",
  });
  try {
    return await auditSubscriberGrowthLiveParity({ origin: `http://127.0.0.1:${port}` });
  } finally {
    await new Promise((resolve, reject) => {
      server.httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function writeReceipt(out, receipt) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

export async function runSubscriberGrowthLaunchGate(args) {
  const files = changedFiles(args.baseRef);
  const tests = runnableChangedTests(files);
  const e2eSpecs = runnableChangedE2e(files);
  const lintable = lintableChangedFiles(files);
  const formattable = formattableChangedFiles(files);
  const source = inspectSource(args, files, tests, e2eSpecs, formattable);

  const commands = [
    runCommand("targeted_tests", "bunx", buildTargetedTestCommandArgs(tests)),
    runChangedE2e(e2eSpecs),
    runSubscriberInterestRls(),
    inspectMigrationContract(),
    runCommand("typecheck", "bun", ["run", "typecheck"]),
    runCommand("build", "bun", ["run", "build"]),
    runCommand("lint", "bunx", ["eslint", ...lintable]),
    runCommand("format", "bunx", ["prettier", "--check", "--end-of-line", "auto", ...formattable]),
    runCommand("diff_integrity", "git", ["diff", "--check", `${args.baseRef}...HEAD`]),
  ];

  let localParity = null;
  if (commands.find((command) => command.id === "build")?.status === "PASS") {
    try {
      localParity = await auditLocalPreview(args.port);
    } catch (error) {
      localParity = {
        ok: false,
        deploymentId: null,
        routesPassed: 0,
        routesTotal: 4,
        capabilitiesPassed: 0,
        capabilitiesTotal: 5,
        error: error instanceof Error ? error.message : "local_preview_failed",
      };
    }
  }

  let liveParity = null;
  if (!args.localOnly) {
    try {
      liveParity = await auditSubscriberGrowthLiveParity({ origin: args.liveOrigin });
    } catch (error) {
      liveParity = {
        ok: false,
        deploymentId: null,
        routesPassed: 0,
        routesTotal: 4,
        capabilitiesPassed: 0,
        capabilitiesTotal: 5,
        error: error instanceof Error ? error.message : "live_parity_failed",
      };
    }
  }

  const receipt = buildSubscriberGrowthReleaseReceipt({
    generatedAt: new Date().toISOString(),
    liveRequired: !args.localOnly,
    source,
    commands,
    localParity,
    liveParity,
  });
  writeReceipt(args.out, receipt);
  return receipt;
}

async function main() {
  const args = parseSubscriberGrowthGateArgs(process.argv.slice(2));
  const receipt = await runSubscriberGrowthLaunchGate(args);
  console.log(formatSubscriberGrowthLaunchGate(receipt));
  console.log(`Receipt: ${path.relative(process.cwd(), args.out)}`);
  process.exitCode = receipt.status === "HOLD" ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `Subscriber growth launch gate: ERROR\n${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  });
}
