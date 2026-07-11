import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Reporter from "../../scripts/vitest-controlled/reporter.mjs";
import { readProgress } from "../../scripts/vitest-controlled/summarizer.mjs";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vc-reporter-"));
}

function fileTask({ filepath, state, tests }) {
  return {
    type: "suite",
    filepath,
    result: { state, duration: 12 },
    tasks: tests.map((t) => ({
      type: "test",
      name: t.name,
      result: { state: t.state, duration: 1, errors: t.error ? [{ message: t.error }] : [] },
    })),
  };
}

describe("controlled reporter", () => {
  it("flushes a passing file", () => {
    const dir = scratch();
    const progress = path.join(dir, "progress.jsonl");
    const r = new Reporter({
      progressFile: progress,
      runId: "r1",
      shardIndex: 1,
      shardTotal: 2,
      batchIndex: 0,
      repoRoot: "/repo",
    });
    r.onTestModuleEnd(
      fileTask({
        filepath: "/repo/src/a.test.ts",
        state: "pass",
        tests: [{ name: "ok", state: "pass" }],
      }),
    );
    r.onFinished([], []);
    const { files, batches, conflicts, corruptLines } = readProgress(progress);
    expect(conflicts).toHaveLength(0);
    expect(corruptLines).toHaveLength(0);
    expect(files.get("src/a.test.ts").status).toBe("passed");
    expect(files.get("src/a.test.ts").counts.passed).toBe(1);
    expect(batches).toHaveLength(1);
  });

  it("records failed tests with names and first error", () => {
    const dir = scratch();
    const progress = path.join(dir, "progress.jsonl");
    const r = new Reporter({
      progressFile: progress,
      runId: "r1",
      shardIndex: 1,
      shardTotal: 1,
      batchIndex: 0,
      repoRoot: "/repo",
    });
    r.onTestModuleEnd(
      fileTask({
        filepath: "/repo/src/b.test.ts",
        state: "fail",
        tests: [
          { name: "one", state: "pass" },
          { name: "two", state: "fail", error: "boom" },
          { name: "three", state: "fail", error: "kaboom" },
        ],
      }),
    );
    r.onFinished([], []);
    const { files } = readProgress(progress);
    const ev = files.get("src/b.test.ts");
    expect(ev.status).toBe("failed");
    expect(ev.failedTests).toEqual(["two", "three"]);
    expect(ev.firstError).toBe("boom");
    expect(ev.counts).toEqual({ passed: 1, failed: 2, skipped: 0, todo: 0 });
  });

  it("records a skipped-only file as skipped", () => {
    const dir = scratch();
    const progress = path.join(dir, "progress.jsonl");
    const r = new Reporter({
      progressFile: progress,
      runId: "r1",
      shardIndex: 1,
      shardTotal: 1,
      batchIndex: 0,
      repoRoot: "/repo",
    });
    r.onTestModuleEnd(
      fileTask({
        filepath: "/repo/src/c.test.ts",
        state: "pass",
        tests: [{ name: "x", state: "skip" }],
      }),
    );
    r.onFinished([], []);
    const { files } = readProgress(progress);
    expect(files.get("src/c.test.ts").status).toBe("skipped");
  });

  it("dedupes identical duplicates but flags conflicts", () => {
    const dir = scratch();
    const progress = path.join(dir, "progress.jsonl");
    // hand-write duplicated events
    const base = {
      event: "file",
      schema: 1,
      runId: "r",
      shardIndex: 1,
      shardTotal: 1,
      batchIndex: 0,
      file: "src/x.test.ts",
      status: "passed",
      counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
      failedTests: [],
      firstError: null,
      completedAt: "now",
    };
    fs.writeFileSync(progress, JSON.stringify(base) + "\n" + JSON.stringify(base) + "\n");
    let r = readProgress(progress);
    expect(r.conflicts).toHaveLength(0);
    expect(r.files.size).toBe(1);

    const conflict = {
      ...base,
      status: "failed",
      counts: { passed: 0, failed: 1, skipped: 0, todo: 0 },
    };
    fs.appendFileSync(progress, JSON.stringify(conflict) + "\n");
    r = readProgress(progress);
    expect(r.conflicts).toHaveLength(1);
  });

  it("reports corrupt JSONL lines without crashing", () => {
    const dir = scratch();
    const progress = path.join(dir, "progress.jsonl");
    fs.writeFileSync(
      progress,
      "not-json\n" + JSON.stringify({ event: "batch-end", schema: 1 }) + "\n",
    );
    const r = readProgress(progress);
    expect(r.corruptLines).toHaveLength(1);
    expect(r.batches).toHaveLength(1);
  });
});
