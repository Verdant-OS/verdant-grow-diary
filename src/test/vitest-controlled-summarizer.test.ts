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
}: { files: MkFile[]; completed?: boolean; exitCode?: number }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-sum-"));
  fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
  const manifest = { schema: 1, hash: "h".repeat(64), count: files.length, files: files.map((f) => f.file) };
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
    const shardA = { shardIndex: 1, sourceFingerprint: "f", manifestHash: "m", status: "complete", perFile: [
      { file: "src/a.test.ts", status: "passed", counts: { passed: 1, failed: 0, skipped: 0, todo: 0 } },
    ]};
    const shardB = { shardIndex: 2, sourceFingerprint: "f", manifestHash: "m", status: "complete", perFile: [
      { file: "src/a.test.ts", status: "passed", counts: { passed: 1, failed: 0, skipped: 0, todo: 0 } },
    ]};
    const agg = aggregateShards([shardA, shardB], { manifest: { files: ["src/a.test.ts"] } });
    expect(agg.status).toBe("invalid");
    expect(agg.duplicates).toHaveLength(1);
  });

  it("aggregate detects missing files vs manifest", () => {
    const shardA = { shardIndex: 1, sourceFingerprint: "f", manifestHash: "m", status: "complete", perFile: [
      { file: "src/a.test.ts", status: "passed", counts: { passed: 1, failed: 0, skipped: 0, todo: 0 } },
    ]};
    const agg = aggregateShards([shardA], { manifest: { files: ["src/a.test.ts", "src/b.test.ts"] } });
    expect(agg.status).toBe("invalid");
    expect(agg.missingFiles).toEqual(["src/b.test.ts"]);
  });

  it("aggregate flags shard fingerprint disagreement", () => {
    const base = (fp) => ({
      shardIndex: 1,
      sourceFingerprint: fp,
      manifestHash: "same",
      status: "complete",
      perFile: [{ file: "src/a.test.ts", status: "passed", counts: { passed: 1, failed: 0, skipped: 0, todo: 0 } }],
    });
    const agg = aggregateShards([base("f1"), { ...base("f2"), shardIndex: 2, perFile: [{ file: "src/b.test.ts", status: "passed", counts: { passed: 1, failed: 0, skipped: 0, todo: 0 } }] }], {
      manifest: { files: ["src/a.test.ts", "src/b.test.ts"] },
    });
    expect(agg.status).toBe("invalid");
  });
});
