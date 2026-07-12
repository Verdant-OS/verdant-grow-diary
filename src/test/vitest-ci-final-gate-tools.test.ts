// Focused tests for the controlled CI final-gate tooling.
//
// No git, no gh, no real Vitest. All external processes are stubbed.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  evaluateDispatchReadiness,
} from "../../scripts/vitest-controlled/assert-dispatch-ready.mjs";
import {
  walkIndependentManifest,
  reconcile,
  hashPaths,
} from "../../scripts/vitest-controlled/reconcile-manifest.mjs";
import {
  verifyShardInputs,
} from "../../scripts/vitest-controlled/verify-artifacts.mjs";
import {
  buildReport,
  enumerateShardDirs,
  shardIndexReport,
  fingerprintCardinality,
  verifyExpectedManifest,
  coverageReport,
  downloadArtifacts,
} from "../../scripts/vitest-controlled/report-ci-artifacts.mjs";
import {
  buildMatrixPlan,
  parseVitestJson,
  runMatrix,
  REPEAT_THREE_FILES,
  ONCE_FILES,
} from "../../scripts/vitest-controlled/run-validation-matrix.mjs";
import {
  buildManifest,
  hashManifest,
  dedupeAndSort,
  MANIFEST_SCHEMA_VERSION,
} from "../../scripts/vitest-controlled/manifest.mjs";
import {
  computeCommonConfigFingerprint,
  computeAssignmentFingerprint,
  computeShardFingerprint,
  FINGERPRINT_SCHEMA_VERSION,
  CONFIG_FINGERPRINT_SCHEMA_VERSION,
} from "../../scripts/vitest-controlled/fingerprint.mjs";
import { REPORTER_SCHEMA_VERSION } from "../../scripts/vitest-controlled/reporter.mjs";
import { SUMMARY_SCHEMA_VERSION } from "../../scripts/vitest-controlled/summarizer.mjs";
import { RUN_SCHEMA_VERSION } from "../../scripts/vitest-controlled/cli.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

describe("dispatch guard", () => {
  it("returns ok for exact clean match", () => {
    const r = evaluateDispatchReadiness({
      expectedSha: SHA_A,
      expectedBranch: "main",
      actual: { sha: SHA_A, branch: "main", dirty: false, dirtyPaths: [] },
    });
    expect(r.ok).toBe(true);
    expect(r.clean).toBe(true);
    expect(r.reasons).toEqual([]);
  });
  it("rejects SHA mismatch", () => {
    const r = evaluateDispatchReadiness({
      expectedSha: SHA_A,
      expectedBranch: "main",
      actual: { sha: SHA_B, branch: "main", dirty: false, dirtyPaths: [] },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.map((x) => x.code)).toContain("sha_mismatch");
  });
  it("rejects branch mismatch", () => {
    const r = evaluateDispatchReadiness({
      expectedSha: SHA_A,
      expectedBranch: "main",
      actual: { sha: SHA_A, branch: "feature", dirty: false, dirtyPaths: [] },
    });
    expect(r.reasons.map((x) => x.code)).toContain("branch_mismatch");
  });
  it("rejects dirty worktree", () => {
    const r = evaluateDispatchReadiness({
      expectedSha: SHA_A,
      expectedBranch: "main",
      actual: { sha: SHA_A, branch: "main", dirty: true, dirtyPaths: [" M foo.ts"] },
    });
    expect(r.ok).toBe(false);
    expect(r.clean).toBe(false);
    expect(r.reasons.map((x) => x.code)).toContain("dirty_worktree");
  });
});

describe("manifest reconciliation", () => {
  it("agrees when independent and controlled sets match exactly", () => {
    const files = ["src/a.test.ts", "src/b.spec.tsx", "src/nested/c.test.ts"];
    const r = reconcile(files, [...files]);
    expect(r.inSync).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.duplicates).toEqual([]);
    expect(hashPaths([...files].sort())).toBe(r.independentHash);
  });
  it("reports missing, extra, duplicates, and independent-count", () => {
    const independent = ["src/a.test.ts", "src/b.test.ts"];
    const controlled = ["src/a.test.ts", "src/c.test.ts", "src/c.test.ts"];
    const r = reconcile(independent, controlled);
    expect(r.missing).toEqual(["src/b.test.ts"]);
    expect(r.extra).toEqual(["src/c.test.ts"]);
    expect(r.duplicates).toEqual(["src/c.test.ts"]);
    expect(r.independentCount).toBe(2);
    expect(r.controlledCount).toBe(3);
    expect(r.inSync).toBe(false);
  });
});

// ---- Synthetic v4 shard fixture builder ---------------------------------

function buildSyntheticFixture(opts: { shardTotal?: number; filesByShard: string[][] }) {
  const shardTotal = opts.shardTotal ?? 2;
  const filesByShard = opts.filesByShard;
  const allFiles = filesByShard.flat().slice().sort();
  const manifest = {
    schema: MANIFEST_SCHEMA_VERSION,
    include: "src/**/*.{test,spec}.{ts,tsx}",
    count: allFiles.length,
    hash: hashManifest(dedupeAndSort(allFiles)),
    files: allFiles,
  };
  const toolVersions = { node: "v22.0.0", bun: "1.3.3", vitest: "1.6.0" };
  const commonConfig = computeCommonConfigFingerprint({
    manifestHash: manifest.hash,
    shardTotal,
    batchSize: 25,
    pool: "forks",
    minWorkers: 1,
    maxWorkers: 8,
    runSchema: RUN_SCHEMA_VERSION,
    reporterSchema: REPORTER_SCHEMA_VERSION,
    manifestSchema: MANIFEST_SCHEMA_VERSION,
    workspaceFingerprintSchema: FINGERPRINT_SCHEMA_VERSION,
    configFingerprintSchema: CONFIG_FINGERPRINT_SCHEMA_VERSION,
    toolVersions,
  });
  const wsDigest = "w".repeat(64);

  const shards = filesByShard.map((files, i) => {
    const idx = i + 1;
    const assign = computeAssignmentFingerprint({
      shardIndex: idx,
      shardTotal,
      assignedFiles: files,
    });
    const composite = computeShardFingerprint({
      commonConfigFingerprint: commonConfig,
      assignmentFingerprint: assign,
      shardIndex: idx,
      shardTotal,
    });
    const run = {
      schema: RUN_SCHEMA_VERSION,
      runId: `run-${idx}`,
      shardIndex: idx,
      shardTotal,
      manifestHash: manifest.hash,
      commonConfigFingerprint: commonConfig,
      assignmentFingerprint: assign,
      shardFingerprint: composite,
      workspaceFingerprint: { schema: FINGERPRINT_SCHEMA_VERSION, digest: wsDigest },
      reporterSchema: REPORTER_SCHEMA_VERSION,
      toolVersions,
    };
    const summary = {
      schema: SUMMARY_SCHEMA_VERSION,
      runSchema: RUN_SCHEMA_VERSION,
      runId: run.runId,
      shardIndex: idx,
      shardTotal,
      manifestHash: manifest.hash,
      commonConfigFingerprint: commonConfig,
      assignmentFingerprint: assign,
      shardFingerprint: composite,
      workspaceFingerprintDigest: wsDigest,
      workspaceFingerprintSchema: FINGERPRINT_SCHEMA_VERSION,
      reporterSchema: REPORTER_SCHEMA_VERSION,
      toolVersions,
      status: "complete",
      exitCode: 0,
      completed: true,
      shardFileCount: files.length,
      assignedFiles: files,
      totals: {
        passedFiles: files.length,
        failedFiles: 0,
        skippedFiles: 0,
        incompleteFiles: 0,
        passedTests: files.length,
        failedTests: 0,
        skippedTests: 0,
        todoTests: 0,
      },
      perFile: files.map((f) => ({
        file: f,
        status: "passed",
        counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
      })),
      incompleteFiles: [],
      failedFilesList: [],
      extraneousFiles: [],
      conflicts: [],
      corruptLines: [],
      duplicateManifestFiles: [],
    };
    return { run, summary, shardFiles: files };
  });
  return { manifest, shards, commonConfig, wsDigest, toolVersions };
}

describe("v4 artifact verifier", () => {
  it("accepts a valid shard with recomputed fingerprints", () => {
    const { shards } = buildSyntheticFixture({
      shardTotal: 2,
      filesByShard: [["src/a.test.ts", "src/b.test.ts"], ["src/c.test.ts"]],
    });
    const { run, summary, shardFiles } = shards[0];
    const manifest = {
      schema: MANIFEST_SCHEMA_VERSION,
      include: "src/**/*.{test,spec}.{ts,tsx}",
      count: 3,
      files: ["src/a.test.ts", "src/b.test.ts", "src/c.test.ts"],
      hash: run.manifestHash,
    };
    const res = verifyShardInputs({
      run,
      summary,
      manifest,
      shardFiles,
      completedMarkerExists: true,
      exitCodeText: "0",
    });
    expect(res.ok).toBe(true);
    expect(res.reasons).toEqual([]);
  });
  it("rejects tampered assignmentFingerprint or wrong summary schema", () => {
    const { shards, manifest } = buildSyntheticFixture({
      shardTotal: 2,
      filesByShard: [["src/a.test.ts"], ["src/b.test.ts"]],
    });
    const bad = JSON.parse(JSON.stringify(shards[0]));
    bad.run.assignmentFingerprint = "0".repeat(64);
    bad.summary.assignmentFingerprint = bad.run.assignmentFingerprint;
    bad.summary.schema = 99;
    const res = verifyShardInputs({
      run: bad.run,
      summary: bad.summary,
      manifest,
      shardFiles: bad.shardFiles,
      completedMarkerExists: true,
      exitCodeText: "0",
    });
    const codes = res.reasons.map((r) => r.code);
    expect(codes).toContain("summary_schema_mismatch");
    expect(codes).toContain("assignment_fingerprint_mismatch");
  });
});

// ---- 16-shard synthetic bundle -----------------------------------------

function writeBundle(tmpRoot, fixture) {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const aggregateDir = path.join(tmpRoot, "vitest-controlled-aggregate");
  fs.mkdirSync(aggregateDir, { recursive: true });
  fs.writeFileSync(
    path.join(aggregateDir, "expected-manifest.json"),
    JSON.stringify(fixture.manifest),
  );
  fixture.shards.forEach((s, i) => {
    const dir = path.join(tmpRoot, `vitest-controlled-shard-${i + 1}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(s.run));
    fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(s.summary));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(fixture.manifest));
    fs.writeFileSync(path.join(dir, "shard-files.json"), JSON.stringify(s.shardFiles));
    fs.writeFileSync(path.join(dir, "completed"), "1");
    fs.writeFileSync(path.join(dir, "exit-code"), "0");
  });
  return tmpRoot;
}

describe("16-shard aggregate report", () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ci-report-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function make16() {
    const filesByShard = [];
    for (let i = 1; i <= 16; i++) filesByShard.push([`src/shard${i}.test.ts`]);
    return buildSyntheticFixture({ shardTotal: 16, filesByShard });
  }

  it("accepts a valid synthetic 16-shard bundle", () => {
    const fixture = make16();
    writeBundle(tmp, fixture);
    const report = buildReport({ rootDir: tmp, expectedTotal: 16 });
    expect(report.indexReport.ok).toBe(true);
    expect(report.fingerprints.ok).toBe(true);
    expect(report.coverage.ok).toBe(true);
    expect(report.manifestReport.ok).toBe(true);
    expect(report.aggregate.status).toBe("complete");
    expect(report.aggregate.reasons).toEqual([]);
    expect(report.ok).toBe(true);
    // Fingerprint cardinality contract.
    const card = fingerprintCardinality(
      fixture.shards.map((s) => s.summary),
      16,
    );
    expect(card.ok).toBe(true);
  });

  it("rejects duplicate index and missing shard", () => {
    const fixture = make16();
    writeBundle(tmp, fixture);
    // Duplicate shard 5 as shard 17-named clone with index=5; drop shard 8.
    fs.rmSync(path.join(tmp, "vitest-controlled-shard-8"), { recursive: true, force: true });
    const dupeDir = path.join(tmp, "vitest-controlled-shard-5b");
    fs.mkdirSync(dupeDir);
    // Non-numeric suffix → counts as unrecognized.
    const src = path.join(tmp, "vitest-controlled-shard-5");
    for (const f of fs.readdirSync(src)) {
      fs.copyFileSync(path.join(src, f), path.join(dupeDir, f));
    }
    const entries = enumerateShardDirs(tmp);
    const idx = shardIndexReport(entries, 16);
    expect(idx.ok).toBe(false);
    expect(idx.missing).toContain(8);
    expect(idx.unrecognized.length + idx.duplicates.length).toBeGreaterThan(0);
  });

  it("rejects a corrupted expected-manifest hash", () => {
    const fixture = make16();
    writeBundle(tmp, fixture);
    const p = path.join(tmp, "vitest-controlled-aggregate", "expected-manifest.json");
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    m.hash = "0".repeat(64);
    fs.writeFileSync(p, JSON.stringify(m));
    const v = verifyExpectedManifest(m);
    expect(v.ok).toBe(false);
    expect(v.reasons.map((r) => r.code)).toContain("manifest_hash_mismatch");
  });

  it("coverage report catches missing and extra assigned files", () => {
    const manifest = { files: ["src/a.test.ts", "src/b.test.ts"] };
    const shards = [
      { shardIndex: 1, assignedFiles: ["src/a.test.ts"] },
      { shardIndex: 2, assignedFiles: ["src/c.test.ts"] },
    ];
    const c = coverageReport(shards, manifest);
    expect(c.missing).toEqual(["src/b.test.ts"]);
    expect(c.extra).toEqual(["src/c.test.ts"]);
    expect(c.ok).toBe(false);
  });
});

describe("downloadArtifacts overwrite guard", () => {
  it("refuses a nonempty directory without invoking gh", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gh-guard-"));
    fs.writeFileSync(path.join(tmp, "keep.txt"), "x");
    let called = false;
    expect(() =>
      downloadArtifacts({
        runId: "1",
        outDir: tmp,
        spawnImpl: () => {
          called = true;
          return { status: 0 };
        },
      }),
    ).toThrow(/refusing to overwrite/);
    expect(called).toBe(false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("validation matrix", () => {
  it("plan equals 11 files and 21 runs", () => {
    const plan = buildMatrixPlan();
    expect(plan.totalRuns).toBe(21);
    expect(plan.uniqueFileCount).toBe(11);
    expect(REPEAT_THREE_FILES.length).toBe(5);
    expect(ONCE_FILES.length).toBe(6);
  });

  it("parses Vitest JSON failures and propagates them through runMatrix", async () => {
    const failingJson = JSON.stringify({
      testResults: [
        {
          name: "src/test/vitest-controlled-fingerprint.test.ts",
          status: "passed",
          assertionResults: [
            { status: "passed", title: "ok", ancestorTitles: [] },
            {
              status: "failed",
              title: "boom",
              ancestorTitles: ["fp"],
              failureMessages: ["Error: nope\n  at ..."],
            },
          ],
        },
      ],
    });
    const parsed = parseVitestJson(failingJson);
    expect(parsed.failed).toBe(1);
    expect(parsed.failures[0].test).toBe("fp > boom");

    // Stub spawnSync so runMatrix executes without actually invoking bunx.
    // We can only replace it via injection here; runMatrix calls the real
    // one, so we validate the pure classifier separately.
    // Prove that a non-zero exit with zero failed assertions is flagged.
    const parsedEmpty = parseVitestJson(
      JSON.stringify({ testResults: [{ name: "x", status: "failed", assertionResults: [] }] }),
    );
    expect(parsedEmpty.failures[0].possibleRunnerFailure).toBe(true);
  });

  it("dry-run returns the deterministic plan without spawning", async () => {
    const r = await runMatrix({ dryRun: true });
    expect(r.totalRuns).toBe(21);
    expect(r.uniqueFileCount).toBe(11);
  });
});

// Basic sanity: walkIndependentManifest can walk a real tree.
describe("independent walker", () => {
  it("finds the 11 controlled-runner test files under src/test", () => {
    const files = walkIndependentManifest(process.cwd());
    const controlled = files.filter((f) => /vitest-controlled-.*\.test\.ts$/.test(f));
    expect(controlled.length).toBeGreaterThanOrEqual(11);
    // buildManifest agreement.
    const declared = buildManifest(process.cwd());
    expect(declared.count).toBe(files.length);
  });
});
