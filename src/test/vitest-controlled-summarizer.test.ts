import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  summarizeRun,
  renderMarkdown,
  aggregateShards,
} from "../../scripts/vitest-controlled/summarizer.mjs";

type MkFile = {
  file: string;
  status: "passed" | "failed" | "skipped" | "incomplete";
  counts?: { passed: number; failed: number; skipped: number; todo: number };
  failedTests?: string[];
};
function mkRun({
  files,
  completed = true,
  exitCode = 0,
}: {
  files: MkFile[];
  completed?: boolean;
  exitCode?: number;
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sum-"));
  fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
  const manifest = {
    schema: 1,
    hash: "h".repeat(64),
    count: files.length,
    files: files.map((f) => f.file),
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  fs.writeFileSync(
    path.join(dir, "run.json"),
    JSON.stringify({ runId: "r1", shardIndex: 1, shardTotal: 1, sourceFingerprint: "f1" }),
  );
  const lines = files
    .filter((f) => f.status !== "incomplete")
    .map((f) =>
      JSON.stringify({
        event: "file",
        schema: 1,
        runId: "r1",
        shardIndex: 1,
        shardTotal: 1,
        batchIndex: 0,
        file: f.file,
        status: f.status,
        counts: f.counts ?? { passed: 1, failed: 0, skipped: 0, todo: 0 },
        failedTests: f.failedTests ?? [],
        completedAt: "now",
      }),
    )
    .concat([JSON.stringify({ event: "batch-end", schema: 1 })]);
  fs.writeFileSync(path.join(dir, "progress.jsonl"), lines.join("\n") + "\n");
  if (completed) fs.writeFileSync(path.join(dir, "completed"), "now");
  fs.writeFileSync(path.join(dir, "exit-code"), String(exitCode));
  return dir;
}

describe("summarizer", () => {
  it("marks a fully-green run as complete", () => {
    const dir = mkRun({
      files: [
        { file: "src/a.test.ts", status: "passed" },
        { file: "src/b.test.ts", status: "passed" },
      ],
    });
    const s = summarizeRun(dir);
    expect(s.status).toBe("complete");
    expect(s.totals.passedFiles).toBe(2);
    expect(s.totals.failedFiles).toBe(0);
  });

  it("marks a run with a failed file as failed and lists it", () => {
    const dir = mkRun({
      files: [
        { file: "src/a.test.ts", status: "passed" },
        {
          file: "src/b.test.ts",
          status: "failed",
          counts: { passed: 0, failed: 1, skipped: 0, todo: 0 },
          failedTests: ["broken"],
        },
      ],
    });
    const s = summarizeRun(dir);
    expect(s.status).toBe("failed");
    expect(s.failedFilesList).toEqual(["src/b.test.ts"]);
  });

  it("marks a run without a completed marker as interrupted", () => {
    const dir = mkRun({
      files: [{ file: "src/a.test.ts", status: "passed" }],
      completed: false,
    });
    const s = summarizeRun(dir);
    expect(s.status).toBe("interrupted");
  });

  it("marks missing files as incomplete rather than passed", () => {
    const dir = mkRun({
      files: [
        { file: "src/a.test.ts", status: "passed" },
        { file: "src/never-ran.test.ts", status: "incomplete" },
      ],
    });
    const s = summarizeRun(dir);
    expect(s.status).toBe("failed");
    expect(s.incompleteFiles).toEqual(["src/never-ran.test.ts"]);
  });

  it("renderMarkdown is deterministic for identical inputs", () => {
    const dir = mkRun({ files: [{ file: "src/a.test.ts", status: "passed" }] });
    const a = renderMarkdown(summarizeRun(dir));
    const b = renderMarkdown(summarizeRun(dir));
    expect(a).toBe(b);
  });

  it("aggregate detects duplicate file across shards", () => {
    const shardA = {
      shardIndex: 1,
      sourceFingerprint: "f",
      manifestHash: "m",
      status: "complete",
      perFile: [
        {
          file: "src/a.test.ts",
          status: "passed",
          counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
        },
      ],
    };
    const shardB = {
      shardIndex: 2,
      sourceFingerprint: "f",
      manifestHash: "m",
      status: "complete",
      perFile: [
        {
          file: "src/a.test.ts",
          status: "passed",
          counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
        },
      ],
    };
    const agg = aggregateShards([shardA, shardB], { manifest: { files: ["src/a.test.ts"] } });
    expect(agg.status).toBe("invalid");
    expect(agg.duplicates).toHaveLength(1);
  });

  it("aggregate detects missing files vs manifest", () => {
    const shardA = {
      shardIndex: 1,
      sourceFingerprint: "f",
      manifestHash: "m",
      status: "complete",
      perFile: [
        {
          file: "src/a.test.ts",
          status: "passed",
          counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
        },
      ],
    };
    const agg = aggregateShards([shardA], {
      manifest: { files: ["src/a.test.ts", "src/b.test.ts"] },
    });
    expect(agg.status).toBe("invalid");
    expect(agg.missingFiles).toEqual(["src/b.test.ts"]);
  });

  it("aggregate flags commonConfigFingerprint disagreement (v4)", () => {
    // Distinct assignment/shard fingerprints across shards are EXPECTED
    // under v4 and must not invalidate. Only commonConfigFingerprint
    // must be identical run-wide.
    const base = (common: string) => ({
      schema: 2,
      shardIndex: 1,
      shardTotal: 2,
      commonConfigFingerprint: common,
      assignmentFingerprint: "a1",
      shardFingerprint: "s1",
      manifestHash: "same",
      status: "complete",
      perFile: [
        {
          file: "src/a.test.ts",
          status: "passed",
          counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
        },
      ],
    });
    const agg = aggregateShards(
      [
        base("common-A"),
        {
          ...base("common-B"),
          shardIndex: 2,
          assignmentFingerprint: "a2",
          shardFingerprint: "s2",
          perFile: [
            {
              file: "src/b.test.ts",
              status: "passed",
              counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
            },
          ],
        },
      ],
      {
        manifest: { files: ["src/a.test.ts", "src/b.test.ts"] },
      },
    );
    expect(agg.status).toBe("invalid");
    expect(agg.reasons.some((r) => r.code === "common_config_mismatch")).toBe(true);
  });
});

// Shard-local completeness contract regressions — repairs the first CI
// run's finding that shard summaries compared their progress against the
// full 1,974-file manifest, marking every other shard's assignments as
// "incomplete" for this shard and flipping otherwise-clean shards to a
// spurious exit code 1.
function mkShardRun({
  shardFiles,
  manifestFiles,
  progress,
  completed = true,
  exitCode = 0,
}: {
  shardFiles: string[] | null;
  manifestFiles: string[];
  progress: Array<{
    file: string;
    status: "passed" | "failed" | "skipped";
    counts?: { passed: number; failed: number; skipped: number; todo: number };
  }>;
  completed?: boolean;
  exitCode?: number;
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-shard-"));
  fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      schema: 1,
      hash: "m".repeat(64),
      count: manifestFiles.length,
      files: manifestFiles,
    }),
  );
  if (shardFiles) {
    fs.writeFileSync(path.join(dir, "shard-files.json"), JSON.stringify(shardFiles));
  }
  fs.writeFileSync(
    path.join(dir, "run.json"),
    JSON.stringify({ runId: "r1", shardIndex: 1, shardTotal: 2, sourceFingerprint: "f1" }),
  );
  const lines = progress
    .map((p) =>
      JSON.stringify({
        event: "file",
        schema: 1,
        file: p.file,
        status: p.status,
        counts: p.counts ?? { passed: 1, failed: 0, skipped: 0, todo: 0 },
        failedTests: [],
      }),
    )
    .concat([JSON.stringify({ event: "batch-end", schema: 1 })]);
  fs.writeFileSync(path.join(dir, "progress.jsonl"), lines.join("\n") + "\n");
  if (completed) fs.writeFileSync(path.join(dir, "completed"), "now");
  fs.writeFileSync(path.join(dir, "exit-code"), String(exitCode));
  return dir;
}

describe("summarizer — shard-local completeness contract", () => {
  it("a shard passing exactly its two assigned files is complete, ignoring other-shard files", () => {
    const dir = mkShardRun({
      shardFiles: ["src/a.test.ts", "src/b.test.ts"],
      manifestFiles: ["src/a.test.ts", "src/b.test.ts", "src/c.test.ts", "src/d.test.ts"],
      progress: [
        { file: "src/a.test.ts", status: "passed" },
        { file: "src/b.test.ts", status: "passed" },
      ],
    });
    const s = summarizeRun(dir);
    expect(s.status).toBe("complete");
    expect(s.shardFileCount).toBe(2);
    expect(s.totals.passedFiles).toBe(2);
    expect(s.totals.incompleteFiles).toBe(0);
    expect(s.incompleteFiles).toEqual([]);
    expect(s.perFile.map((r) => r.file)).toEqual(["src/a.test.ts", "src/b.test.ts"]);
  });

  it("other-shard files never appear in shard-local perFile output", () => {
    const dir = mkShardRun({
      shardFiles: ["src/a.test.ts"],
      manifestFiles: ["src/a.test.ts", "src/other.test.ts"],
      progress: [{ file: "src/a.test.ts", status: "passed" }],
    });
    const s = summarizeRun(dir);
    expect(s.perFile.map((r) => r.file)).not.toContain("src/other.test.ts");
  });

  it("a missing assigned file remains incomplete and fails the shard", () => {
    const dir = mkShardRun({
      shardFiles: ["src/a.test.ts", "src/b.test.ts"],
      manifestFiles: ["src/a.test.ts", "src/b.test.ts"],
      progress: [{ file: "src/a.test.ts", status: "passed" }],
    });
    const s = summarizeRun(dir);
    expect(s.status).toBe("failed");
    expect(s.incompleteFiles).toEqual(["src/b.test.ts"]);
  });

  it("a failed assigned file produces a failing shard", () => {
    const dir = mkShardRun({
      shardFiles: ["src/a.test.ts"],
      manifestFiles: ["src/a.test.ts", "src/other.test.ts"],
      progress: [
        {
          file: "src/a.test.ts",
          status: "failed",
          counts: { passed: 0, failed: 1, skipped: 0, todo: 0 },
        },
      ],
    });
    const s = summarizeRun(dir);
    expect(s.status).toBe("failed");
    expect(s.failedFilesList).toEqual(["src/a.test.ts"]);
  });

  it("progress that references a non-assigned file is treated as invalid (extraneous)", () => {
    const dir = mkShardRun({
      shardFiles: ["src/a.test.ts"],
      manifestFiles: ["src/a.test.ts", "src/other.test.ts"],
      progress: [
        { file: "src/a.test.ts", status: "passed" },
        { file: "src/other.test.ts", status: "passed" },
      ],
    });
    const s = summarizeRun(dir);
    expect(s.status).toBe("invalid");
    expect(s.extraneousFiles).toEqual(["src/other.test.ts"]);
  });

  it("aggregate across shards still enforces exact full-manifest union", () => {
    const shardA = {
      shardIndex: 1,
      sourceFingerprint: "f",
      manifestHash: "m",
      status: "complete",
      perFile: [
        {
          file: "src/a.test.ts",
          status: "passed",
          counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
        },
      ],
    };
    const shardB = {
      shardIndex: 2,
      sourceFingerprint: "f",
      manifestHash: "m",
      status: "complete",
      perFile: [
        {
          file: "src/b.test.ts",
          status: "passed",
          counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
        },
      ],
    };
    const agg = aggregateShards([shardA, shardB], {
      manifest: { files: ["src/a.test.ts", "src/b.test.ts"] },
    });
    expect(agg.status).toBe("complete");
    expect(agg.missingFiles).toEqual([]);
    expect(agg.duplicates).toEqual([]);
  });
});
