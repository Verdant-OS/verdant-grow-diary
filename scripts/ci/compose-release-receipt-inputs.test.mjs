import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const composer = fileURLToPath(new URL("./compose-release-receipt-inputs.mjs", import.meta.url));
const prefixes = ["TC", "PC", "EM", "CA", "SS", "DS"];
const commands = [
  ["typecheck", "bunx tsgo --noEmit"],
  [
    "release-receipt-parser-contract",
    "bunx vitest run src/test/release-receipt-parser-contract.test.ts",
  ],
  ["release-receipt-emitter", "bunx vitest run src/test/release-receipt-emitter.test.ts"],
  ["release-receipt-ci-artifact", "bun scripts/test-release-receipt-ci-artifact.mjs"],
  ["sensor-safety-check", "node scripts/sensor-safety-check.mjs"],
  ["docs-demo-safety", "bun run test:docs-demo-safety"],
];
const metadataEnv = {
  RUN_ID: "4242",
  COMMIT_SHA: "a980489ad5188e36eba89461117c2b60fc10f927",
  BRANCH: "codex/release-receipt-summary-honesty-001",
  WORKFLOW: "Release receipt validation",
  GENERATED_AT: "2026-10-04T00:00:00.000Z",
  RUNNER_OS: "Linux",
};
const durations = ["12.4", "0", "-1", "not-a-number", "1.6", "Infinity"];
const expectedDurations = [12, null, null, null, 2, null];
const scenarios = [
  {
    name: "all-success",
    outcomes: Array(6).fill("success"),
    statuses: Array(6).fill("pass"),
    counts: [0, 0, 0],
  },
  {
    name: "one-failure",
    outcomes: ["failure", ...Array(5).fill("success")],
    statuses: ["fail", ...Array(5).fill("pass")],
    counts: [1, 0, 0],
  },
  {
    name: "mixed failure/incomplete",
    outcomes: ["failure", "success", "skipped", "unknown", "cancelled", undefined],
    statuses: ["fail", "pass", "skipped", "unknown", "unknown", "unknown"],
    counts: [1, 1, 3],
  },
  {
    name: "all-skipped",
    outcomes: Array(6).fill("skipped"),
    statuses: Array(6).fill("skipped"),
    counts: [0, 6, 0],
  },
  {
    name: "mixed success/skipped",
    outcomes: [...Array(5).fill("success"), "skipped"],
    statuses: [...Array(5).fill("pass"), "skipped"],
    counts: [0, 1, 0],
  },
  {
    name: "unknown",
    outcomes: ["unknown", "unexpected", ...Array(4).fill("success")],
    statuses: ["unknown", "unknown", ...Array(4).fill("pass")],
    counts: [0, 0, 2],
  },
  {
    name: "cancelled",
    outcomes: Array(6).fill("cancelled"),
    statuses: Array(6).fill("unknown"),
    counts: [0, 0, 6],
  },
  {
    name: "missing outcomes",
    outcomes: Array(6).fill(undefined),
    statuses: Array(6).fill("unknown"),
    counts: [0, 0, 6],
  },
];

function runComposer(outcomes, metadata = metadataEnv, withDurations = true) {
  const cwd = mkdtempSync(join(tmpdir(), "release-receipt-composer-"));
  const env = { ...metadata };
  prefixes.forEach((prefix, index) => {
    if (outcomes[index] !== undefined) env[`${prefix}_OUTCOME`] = outcomes[index];
    if (withDurations) env[`${prefix}_MS`] = durations[index];
  });
  try {
    const result = spawnSync(process.execPath, [composer], { cwd, env, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, "");
    const outDir = join(cwd, "artifacts/release-readiness");
    const commandPath = join(outDir, "command-results.json");
    const inputPath = join(outDir, "release-receipt-input.json");
    assert.equal(
      result.stdout,
      `compose-release-receipt-inputs: wrote ${commandPath} and ${inputPath}\n`,
    );
    assert.deepEqual(readdirSync(outDir).sort(), [
      "command-results.json",
      "release-receipt-input.json",
    ]);
    const commandJson = readFileSync(commandPath, "utf8");
    const inputJson = readFileSync(inputPath, "utf8");
    const commandResults = JSON.parse(commandJson);
    const input = JSON.parse(inputJson);
    assert.equal(commandJson, `${JSON.stringify(commandResults, null, 2)}\n`);
    assert.equal(inputJson, `${JSON.stringify(input, null, 2)}\n`);
    return { commandResults, input };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

for (const scenario of scenarios) {
  test(`${scenario.name}: preserves statuses, counts, durations and metadata`, () => {
    const { commandResults, input } = runComposer(scenario.outcomes);
    assert.deepEqual(
      commandResults,
      commands.map(([name, command], index) => {
        const status = scenario.statuses[index];
        const suffix = {
          pass: "passed.",
          fail: "FAILED in CI.",
          skipped: "skipped.",
          unknown: "outcome unknown.",
        }[status];
        return {
          name,
          command,
          status,
          passed: status === "pass" ? 1 : 0,
          failed: status === "fail" ? 1 : 0,
          skipped: status === "skipped" ? 1 : 0,
          duration_ms: expectedDurations[index],
          summary: `${name} ${suffix}`,
        };
      }),
    );
    const { summary, artifactId, ...rest } = input;
    assert.equal(typeof summary, "string");
    assert.match(artifactId, /^ci-full-suite-4242-\d+$/);
    assert.deepEqual(rest, {
      generatedAt: metadataEnv.GENERATED_AT,
      source: "github_actions",
      receiptKind: "ci_full_suite",
      commands: commandResults,
      blockers: [],
      metadata: { runner_os: "Linux" },
      sourceRunId: metadataEnv.RUN_ID,
      commitSha: metadataEnv.COMMIT_SHA,
      branch: metadataEnv.BRANCH,
      workflowName: metadataEnv.WORKFLOW,
    });
  });

  test(`${scenario.name}: summary accurately describes receipt validation commands`, () => {
    const { input } = runComposer(scenario.outcomes);
    if (scenario.statuses.every((status) => status === "pass")) {
      assert.equal(
        input.summary,
        "Verdant CI receipt validation commands all passed (6 commands).",
      );
    } else {
      assert.doesNotMatch(input.summary, /\bgreen\b|\ball[ -]passed\b/i);
      const [failed, skipped, unknown] = scenario.counts;
      assert.equal(
        input.summary,
        `Verdant CI receipt validation commands: ${failed} failing, ${skipped} skipped, ${unknown} unknown/incomplete (6 commands).`,
      );
    }
    assert.doesNotMatch(input.summary, /full suite/i);
  });
}

test("missing environment preserves metadata and duration defaults", () => {
  const { commandResults, input } = runComposer([], {}, false);
  assert.deepEqual(
    commandResults.map(({ status, passed, failed, skipped, duration_ms }) => ({
      status,
      passed,
      failed,
      skipped,
      duration_ms,
    })),
    Array(6).fill({ status: "unknown", passed: 0, failed: 0, skipped: 0, duration_ms: null }),
  );
  assert.match(input.artifactId, /^ci-full-suite-local-\d+$/);
  assert.equal(new Date(input.generatedAt).toISOString(), input.generatedAt);
  assert.deepEqual(input.metadata, { runner_os: "ubuntu-latest" });
  assert.equal(input.sourceRunId, null);
  assert.equal(input.commitSha, null);
  assert.equal(input.branch, null);
  assert.equal(input.workflowName, null);
});
