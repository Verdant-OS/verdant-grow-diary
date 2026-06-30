#!/usr/bin/env node
/**
 * scripts/ci/compose-release-receipt-inputs.mjs
 *
 * CI-only composer for Release Receipt CI Workflow Upload v1.
 *
 * Reads validation step outcomes from environment variables and writes:
 *   - artifacts/release-readiness/command-results.json
 *   - artifacts/release-readiness/release-receipt-input.json
 *
 * It does NOT invoke the emitter or write the final
 * `release-receipt.v1.json` artifact — that is done by
 * `scripts/emit-release-receipt.mjs` in a subsequent workflow step.
 *
 * SAFETY
 *  - No network, no backend calls, no GitHub API, no fetch.
 *  - Reads only env vars + writes only under artifacts/release-readiness/.
 *  - Receipt kind is hard-coded to `ci_full_suite`.
 *  - This script does NOT unlock Release GO.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("artifacts/release-readiness");
mkdirSync(OUT_DIR, { recursive: true });

function env(name, fallback = "") {
  const v = process.env[name];
  return v === undefined || v === null ? fallback : String(v);
}

function outcomeToStatus(outcome) {
  // GitHub Actions step.outcome values: success | failure | cancelled | skipped
  if (outcome === "success") return "pass";
  if (outcome === "failure") return "fail";
  if (outcome === "skipped") return "skipped";
  return "unknown";
}

function durationMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

const COMMANDS = [
  {
    name: "typecheck",
    command: "bunx tsgo --noEmit",
    outcome: env("TC_OUTCOME", "unknown"),
    duration: env("TC_MS"),
  },
  {
    name: "release-receipt-parser-contract",
    command: "bunx vitest run src/test/release-receipt-parser-contract.test.ts",
    outcome: env("PC_OUTCOME", "unknown"),
    duration: env("PC_MS"),
  },
  {
    name: "release-receipt-emitter",
    command: "bunx vitest run src/test/release-receipt-emitter.test.ts",
    outcome: env("EM_OUTCOME", "unknown"),
    duration: env("EM_MS"),
  },
  {
    name: "release-receipt-ci-artifact",
    command: "bun scripts/test-release-receipt-ci-artifact.mjs",
    outcome: env("CA_OUTCOME", "unknown"),
    duration: env("CA_MS"),
  },
  {
    name: "sensor-safety-check",
    command: "node scripts/sensor-safety-check.mjs",
    outcome: env("SS_OUTCOME", "unknown"),
    duration: env("SS_MS"),
  },
  {
    name: "docs-demo-safety",
    command: "bun run test:docs-demo-safety",
    outcome: env("DS_OUTCOME", "unknown"),
    duration: env("DS_MS"),
  },
];

const commandResults = COMMANDS.map((c) => {
  const status = outcomeToStatus(c.outcome);
  const failed = status === "fail" ? 1 : 0;
  const summary =
    status === "pass"
      ? `${c.name} passed.`
      : status === "fail"
        ? `${c.name} FAILED in CI.`
        : status === "skipped"
          ? `${c.name} skipped.`
          : `${c.name} outcome unknown.`;
  return {
    name: c.name,
    command: c.command,
    status,
    passed: status === "pass" ? 1 : 0,
    failed,
    skipped: status === "skipped" ? 1 : 0,
    duration_ms: durationMs(c.duration),
    summary,
  };
});

const commandResultsPath = resolve(OUT_DIR, "command-results.json");
writeFileSync(
  commandResultsPath,
  `${JSON.stringify(commandResults, null, 2)}\n`,
  "utf8",
);

// Build the EmitReleaseReceiptInput JSON consumed by emit-release-receipt.mjs.
const runId = env("RUN_ID") || null;
const commitSha = env("COMMIT_SHA") || null;
const branch = env("BRANCH") || null;
const workflowName = env("WORKFLOW") || null;
const generatedAt = env("GENERATED_AT") || new Date().toISOString();

const totalFailed = commandResults.reduce((a, c) => a + c.failed, 0);
const overallSummary =
  totalFailed === 0
    ? `Verdant CI full suite green (${commandResults.length} commands).`
    : `Verdant CI full suite has ${totalFailed} failing command(s).`;

const emitterInput = {
  artifactId: `ci-full-suite-${runId ?? "local"}-${Date.now()}`,
  generatedAt,
  source: "github_actions",
  receiptKind: "ci_full_suite",
  summary: overallSummary,
  commands: commandResults,
  blockers: [],
  metadata: {
    runner_os: env("RUNNER_OS", "ubuntu-latest"),
  },
  sourceRunId: runId,
  commitSha,
  branch,
  workflowName,
};

const inputPath = resolve(OUT_DIR, "release-receipt-input.json");
writeFileSync(inputPath, `${JSON.stringify(emitterInput, null, 2)}\n`, "utf8");

process.stdout.write(
  `compose-release-receipt-inputs: wrote ${commandResultsPath} and ${inputPath}\n`,
);
