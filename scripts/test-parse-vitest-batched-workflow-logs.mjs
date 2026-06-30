#!/usr/bin/env node
// Tests for scripts/parse-vitest-batched-workflow-logs.mjs (Node assert).
import { strict as assert } from "node:assert";
import {
  parseJobLog,
  detectOOM,
  computeVerdict,
  buildReceipt,
  summarizeGates,
} from "./parse-vitest-batched-workflow-logs.mjs";

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log("parse-vitest-batched-workflow-logs");

// A passing batch log: docs-demo-safety summary appears BEFORE the batch start
// markers (in the gates step) and must be excluded from batch totals.
const passLog = (b) => `
##[group]Run bun run test:docs-demo-safety
 Test Files  1 passed (1)
      Tests  10 passed (10)
##[endgroup]
26 passed, 0 failed
VERDANT_BATCH_START {"batch":${b},"batches":16,"strategy":"round-robin","chunkSize":1,"fileCount":3,"chunks":3}
  ▶ Batch ${b} chunk 1/3: 1 files
VERDANT_CHUNK_START {"batch":${b},"chunk":1,"chunks":3,"fileCount":1}
 Test Files  1 passed (1)
      Tests  5 passed (5)
VERDANT_CHUNK_END {"batch":${b},"chunk":1,"status":"pass","exitCode":0}
VERDANT_CHUNK_START {"batch":${b},"chunk":2,"chunks":3,"fileCount":1}
 Test Files  1 passed (1)
      Tests  4 passed | 1 skipped (5)
VERDANT_CHUNK_END {"batch":${b},"chunk":2,"status":"pass","exitCode":0}
VERDANT_CHUNK_START {"batch":${b},"chunk":3,"chunks":3,"fileCount":1}
 Test Files  1 passed (1)
      Tests  6 passed (6)
VERDANT_CHUNK_END {"batch":${b},"chunk":3,"status":"pass","exitCode":0}
◀ Batch ${b}: PASS (3 chunk(s))
VERDANT_BATCH_END {"batch":${b},"status":"pass","exitCode":0}
`;

const oomLog = (b) => `
VERDANT_BATCH_START {"batch":${b},"batches":16,"strategy":"round-robin","chunkSize":1,"fileCount":2,"chunks":2}
VERDANT_CHUNK_START {"batch":${b},"chunk":1,"chunks":2,"fileCount":1}
      Tests  3 passed (3)
VERDANT_CHUNK_END {"batch":${b},"chunk":1,"status":"pass","exitCode":0}
VERDANT_CHUNK_START {"batch":${b},"chunk":2,"chunks":2,"fileCount":1}
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
Error: Channel closed
VERDANT_CHUNK_END {"batch":${b},"chunk":2,"status":"fail","exitCode":1}
VERDANT_BATCH_END {"batch":${b},"status":"fail","exitCode":1}
`;

const failLog = (b) => `
VERDANT_BATCH_START {"batch":${b},"batches":16,"strategy":"round-robin","chunkSize":1,"fileCount":1,"chunks":1}
VERDANT_CHUNK_START {"batch":${b},"chunk":1,"chunks":1,"fileCount":1}
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
VERDANT_CHUNK_END {"batch":${b},"chunk":1,"status":"fail","exitCode":1}
VERDANT_BATCH_END {"batch":${b},"status":"fail","exitCode":1}
`;

t("detectOOM matches known patterns", () => {
  assert.equal(detectOOM("FATAL ERROR: Reached heap limit Allocation failed"), true);
  assert.equal(detectOOM("JavaScript heap out of memory"), true);
  assert.equal(detectOOM("code: 'ERR_IPC_CHANNEL_CLOSED'"), true);
  assert.equal(detectOOM("all good"), false);
});

t("parseJobLog sums chunks and EXCLUDES docs-demo-safety 10-test gate", () => {
  const r = parseJobLog(passLog(0));
  assert.equal(r.batch, 0);
  assert.equal(r.passed, 15); // 5+4+6, NOT 25 (docs 10 excluded)
  assert.equal(r.skipped, 1);
  assert.equal(r.failed, 0);
  assert.equal(r.oom, false);
  assert.equal(r.status, "pass");
  assert.equal(r.chunksRun, 3);
});

t("parseJobLog detects OOM with zero assertion failures", () => {
  const r = parseJobLog(oomLog(1));
  assert.equal(r.oom, true);
  assert.equal(r.failed, 0);
  assert.equal(r.status, "oom");
});

t("parseJobLog detects a real assertion failure", () => {
  const r = parseJobLog(failLog(2));
  assert.equal(r.failed, 1);
  assert.equal(r.status, "fail");
  assert.equal(r.oom, false);
});

const okGates = [
  { gate: "bun run typecheck", status: "success" },
  { gate: "batches=16 guard", status: "success" },
];
const mkBatches = (overrides = {}) =>
  [...Array(16).keys()].map((i) => ({ batch: i, status: "pass", passed: 10, failed: 0, skipped: 0, oom: false, ...(overrides[i] || {}) }));

t("computeVerdict: GO when all 16 pass + gates green + success", () => {
  const v = computeVerdict({ conclusion: "success", batches: mkBatches(), gates: okGates });
  assert.equal(v.verdict, "GO");
});

t("computeVerdict: PARTIAL on OOM with zero assertion failures", () => {
  const v = computeVerdict({
    conclusion: "failure",
    batches: mkBatches({ 1: { status: "oom", oom: true, passed: 4 } }),
    gates: okGates,
  });
  assert.equal(v.verdict, "PARTIAL");
});

t("computeVerdict: NO-GO on a failed test assertion", () => {
  const v = computeVerdict({
    conclusion: "failure",
    batches: mkBatches({ 2: { status: "fail", failed: 1 } }),
    gates: okGates,
  });
  assert.equal(v.verdict, "NO-GO");
});

t("computeVerdict: NO-GO when batches are missing (cannot prove all ran)", () => {
  const v = computeVerdict({ conclusion: "success", batches: mkBatches().slice(0, 8), gates: okGates });
  assert.equal(v.verdict, "NO-GO");
});

t("computeVerdict: NO-GO when a safety gate failed", () => {
  const v = computeVerdict({ conclusion: "success", batches: mkBatches(), gates: [{ status: "failure" }] });
  assert.equal(v.verdict, "NO-GO");
});

t("computeVerdict: NO-GO when batch-utils self-test failed", () => {
  const v = computeVerdict({ conclusion: "success", batches: mkBatches(), gates: okGates, selfTest: { status: "failure", passed: 25, failed: 1 } });
  assert.equal(v.verdict, "NO-GO");
});

t("computeVerdict: NO-GO on a failed test FILE with zero failed assertions", () => {
  const v = computeVerdict({
    conclusion: "failure",
    batches: mkBatches({ 5: { status: "fail", failed: 0, filesFailed: 1 } }),
    gates: okGates,
  });
  assert.equal(v.verdict, "NO-GO");
});

t("computeVerdict: NO-GO when a matrix job log is missing", () => {
  const v = computeVerdict({
    conclusion: "success",
    batches: mkBatches({ 7: { status: "incomplete", logMissing: true } }),
    gates: okGates,
  });
  assert.equal(v.verdict, "NO-GO");
});

t("summarizeGates: fails closed when a gate fails on a non-first matrix leg", () => {
  const ok = { name: "Batched Vitest (matrix) (0)", steps: [{ name: "Safety gates (typecheck + sensor + docs)", conclusion: "success" }] };
  const bad = { name: "Batched Vitest (matrix) (1)", steps: [{ name: "Safety gates (typecheck + sensor + docs)", conclusion: "failure" }] };
  const { gates } = summarizeGates([ok, bad]);
  const typecheck = gates.find((g) => /typecheck/.test(g.gate));
  assert.equal(typecheck.status, "failure");
  // and the verdict must be NO-GO, not blessed by the first (passing) leg
  assert.equal(computeVerdict({ conclusion: "failure", batches: mkBatches(), gates }).verdict, "NO-GO");
});

t("parseJobLog: empty log → logMissing true, status incomplete", () => {
  const r = parseJobLog("");
  assert.equal(r.logMissing, true);
  assert.equal(r.status, "incomplete");
});

t("parseJobLog: failed test FILE with 0 failed assertions → status fail, filesFailed>0", () => {
  const log = [
    'VERDANT_BATCH_START {"batch":3,"batches":16,"chunks":1,"fileCount":1}',
    " Test Files  1 failed (1)",
    "      Tests  no tests",
    'VERDANT_BATCH_END {"batch":3,"status":"fail","exitCode":1}',
  ].join("\n");
  const r = parseJobLog(log);
  assert.equal(r.filesFailed, 1);
  assert.equal(r.status, "fail");
});

t("buildReceipt: GO end-to-end across 16 passing matrix jobs", () => {
  const steps = [
    { name: "Safety gates (typecheck + sensor + docs)", conclusion: "success" },
    { name: "Batch utils self-test", conclusion: "success" },
    { name: "Assert batches input matches the 16-job matrix", conclusion: "success" },
  ];
  const jobs = [...Array(16).keys()].map((i) => ({
    databaseId: 1000 + i,
    name: `Batched Vitest (matrix) (${i})`,
    conclusion: "success",
    startedAt: "2026-06-30T00:00:00Z",
    completedAt: "2026-06-30T00:02:30Z",
    steps,
    log: passLog(i),
  }));
  const run = { workflowName: "Vitest Batched Full Suite (optional)", url: "u", headBranch: "claude/batched-runner-interleaving-v1", headSha: "deadbeef", conclusion: "success", createdAt: "a", updatedAt: "b" };
  const receipt = buildReceipt({ run, jobs });
  assert.equal(receipt.verdict, "GO");
  assert.ok(receipt.markdown.includes("# Verdant CI Chunk Size 1 Receipt"));
  assert.equal(receipt.json.aggregate.totalPassed, 15 * 16); // docs excluded, 15/batch
  assert.equal(receipt.json.aggregate.totalFailed, 0);
});

t("buildReceipt: PARTIAL when one matrix job OOMs", () => {
  const steps = [
    { name: "Safety gates (typecheck + sensor + docs)", conclusion: "success" },
    { name: "Batch utils self-test", conclusion: "success" },
    { name: "Assert batches input matches the 16-job matrix", conclusion: "success" },
  ];
  const jobs = [...Array(16).keys()].map((i) => ({
    databaseId: 2000 + i,
    name: `Batched Vitest (matrix) (${i})`,
    conclusion: i === 1 ? "failure" : "success",
    steps,
    log: i === 1 ? oomLog(i) : passLog(i),
  }));
  const run = { conclusion: "failure" };
  const receipt = buildReceipt({ run, jobs });
  assert.equal(receipt.verdict, "PARTIAL");
  assert.deepEqual(receipt.json.aggregate.oomBatches, [1]);
});

t("buildReceipt: receipt reports failed test FILES (not 'none') and verdict NO-GO", () => {
  const steps = [
    { name: "Safety gates (typecheck + sensor + docs)", conclusion: "success" },
    { name: "Batch utils self-test", conclusion: "success" },
    { name: "Assert batches input matches the 16-job matrix", conclusion: "success" },
  ];
  const fileFailLog = (b) =>
    [
      `VERDANT_BATCH_START {"batch":${b},"batches":16,"chunks":1,"fileCount":1}`,
      " Test Files  1 failed (1)",
      "      Tests  no tests",
      `VERDANT_BATCH_END {"batch":${b},"status":"fail","exitCode":1}`,
    ].join("\n");
  const jobs = [...Array(16).keys()].map((i) => ({
    databaseId: 3000 + i,
    name: `Batched Vitest (matrix) (${i})`,
    conclusion: i === 4 ? "failure" : "success",
    steps,
    log: i === 4 ? fileFailLog(i) : passLog(i),
  }));
  const receipt = buildReceipt({ run: { conclusion: "failure" }, jobs });
  assert.equal(receipt.verdict, "NO-GO");
  assert.equal(receipt.json.aggregate.totalFilesFailed, 1);
  assert.deepEqual(receipt.json.aggregate.failedBatches, [4]);
  // The summary line must NOT contradict the verdict by saying "none".
  assert.ok(/failed files\/tests: .*failed test file\(s\)/.test(receipt.markdown));
  assert.ok(!/failed files\/tests: none/.test(receipt.markdown));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
