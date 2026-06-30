#!/usr/bin/env node
/**
 * scripts/dry-run-release-receipt-workflow.mjs
 *
 * Local-only dry-run emulating the release-receipt-ci.yml workflow:
 *   1. Take a deterministic command-results fixture.
 *   2. Compose a release-receipt-input.json file.
 *   3. Emit release-receipt.v1.json via the pure emitter.
 *   4. Validate the artifact through the trusted v1 contract.
 *   5. Print derived status / outcome / blocker count.
 *
 * No network. No backend. No GitHub API. No DB writes. No secrets read.
 * Writes only under artifacts/release-readiness/ (or --out-dir if provided).
 *
 * Usage:
 *   bun scripts/dry-run-release-receipt-workflow.mjs \
 *     [--fixture=scripts/fixtures/release-receipt-ci-artifact-input.pass.json] \
 *     [--blockers=scripts/fixtures/release-receipt-ci-artifact-input.blocked.blockers.json] \
 *     [--out-dir=artifacts/release-readiness] \
 *     [--receipt-kind=ci_full_suite]
 *
 * Exits nonzero if the simulated workflow would fail (compose, emit,
 * validate, or status printer).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const DEFAULT_FIXTURE = "scripts/fixtures/release-receipt-ci-artifact-input.pass.json";
const DEFAULT_OUT_DIR = "artifacts/release-readiness";

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([a-z0-9-]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? "true" : m[2];
  }
  return out;
}

function fail(msg, code = 1) {
  process.stderr.write(`dry-run-release-receipt-workflow: ${msg}\n`);
  process.exit(code);
}

async function loadEmitter() {
  const mod = await import(
    pathToFileURL(resolve(process.cwd(), "src/lib/releaseReceiptEmitter.ts"))
      .href,
  );
  return mod.emitReleaseReceiptArtifact;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturePath = resolve(args.fixture ?? DEFAULT_FIXTURE);
  const outDir = resolve(args["out-dir"] ?? DEFAULT_OUT_DIR);
  const receiptKind = args["receipt-kind"] ?? "ci_full_suite";

  let commandResultsRaw;
  try {
    commandResultsRaw = readFileSync(fixturePath, "utf8");
  } catch (e) {
    fail(`could not read fixture ${fixturePath}: ${e?.message ?? e}`);
  }
  let commandResults;
  try {
    commandResults = JSON.parse(commandResultsRaw);
  } catch (e) {
    fail(`fixture is not valid JSON: ${e?.message ?? e}`);
  }
  if (!Array.isArray(commandResults)) {
    fail("fixture must be an array of command results");
  }

  let blockers = [];
  if (args.blockers) {
    const bPath = resolve(args.blockers);
    try {
      blockers = JSON.parse(readFileSync(bPath, "utf8"));
    } catch (e) {
      fail(`could not read blockers ${bPath}: ${e?.message ?? e}`);
    }
    if (!Array.isArray(blockers)) {
      fail("blockers fixture must be an array");
    }
  }

  mkdirSync(outDir, { recursive: true });

  // Step 1: compose input (deterministic; no clock for artifact_id beyond fixture path hash).
  const totalFailed = commandResults.reduce(
    (acc, c) => acc + (Number(c?.failed) || 0),
    0,
  );
  const summary =
    totalFailed === 0
      ? `Dry-run: ${commandResults.length} commands green.`
      : `Dry-run: ${totalFailed} failing command(s).`;
  const input = {
    artifactId: `dry-run-${receiptKind}-local`,
    generatedAt: "2026-06-30T00:00:00.000Z",
    source: "local_parser",
    receiptKind,
    summary,
    commands: commandResults,
    blockers,
    metadata: { runner_os: "local-dry-run" },
    sourceRunId: null,
    commitSha: null,
    branch: "local",
    workflowName: "Release Receipt CI Upload (dry-run)",
  };
  const inputPath = resolve(outDir, "release-receipt-input.dry-run.json");
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");

  // Step 2: emit artifact via pure helper.
  const emit = await loadEmitter();
  const result = emit(input);
  if (!result.ok) {
    process.stderr.write(
      "dry-run-release-receipt-workflow: emitter rejected input:\n",
    );
    for (const err of result.errors) process.stderr.write(`  - ${err}\n`);
    process.exit(2);
  }
  const artifactPath = resolve(outDir, "release-receipt.v1.dry-run.json");
  writeFileSync(
    artifactPath,
    `${JSON.stringify(result.artifact, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`dry-run: wrote ${artifactPath}\n`);

  // Step 3: validate through trusted contract.
  const validate = spawnSync(
    process.execPath,
    [resolve("scripts/validate-release-receipt-artifact.mjs"), artifactPath],
    { stdio: "inherit" },
  );
  if (validate.status !== 0) {
    process.exit(validate.status ?? 1);
  }

  // Step 4: print derived status.
  const printer = spawnSync(
    process.execPath,
    [resolve("scripts/print-release-receipt-status.mjs"), artifactPath],
    { stdio: "inherit" },
  );
  if (printer.status !== 0) {
    process.exit(printer.status ?? 1);
  }

  // Step 5: simulate workflow failure-preservation — nonzero exit if any
  // upstream command failed or any active blocker is present.
  const anyFail = commandResults.some(
    (c) => c && (c.status === "fail" || c.status === "blocked"),
  );
  const anyActiveBlocker = blockers.some((b) => b && b.active === true);
  if (anyFail || anyActiveBlocker) {
    process.stderr.write(
      "dry-run-release-receipt-workflow: simulated workflow would fail (commands failed or blockers active).\n",
    );
    process.exit(1);
  }
}

main().catch((e) => fail(`unexpected: ${e?.message ?? e}`));
