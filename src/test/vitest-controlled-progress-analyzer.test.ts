import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  analyzeProgressContent,
  analyzePath,
} from "../../scripts/vitest-controlled/analyze-progress.mjs";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vc-analyze-"));
}

function fileEvent(file) {
  return {
    event: "file",
    schema: 1,
    runId: "r",
    shardIndex: 1,
    shardTotal: 16,
    batchIndex: 0,
    file,
    status: "passed",
    counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
    failedTests: [],
    firstError: null,
    completedAt: "now",
  };
}

describe("analyze-progress — historical shard-1 fixture (run 29171181154)", () => {
  it("reproduces 123 numeric / 123 real / 123 extraneous / 0 missing", () => {
    const assigned = Array.from({ length: 123 }, (_, i) => `src/pkg/f${i + 1}.test.ts`);
    const numericIds = Array.from({ length: 123 }, (_, i) => String(-1000000 - i));
    const lines = [];
    // 123 numeric file events (opaque IDs)
    for (const id of numericIds) lines.push(JSON.stringify(fileEvent(id)));
    // 123 real events, one per assigned file
    for (const f of assigned) lines.push(JSON.stringify(fileEvent(f)));
    // One batch-end
    lines.push(JSON.stringify({ event: "batch-end", schema: 1 }));

    const report = analyzeProgressContent(lines.join("\n") + "\n", {
      assignedFiles: assigned,
    });

    expect(report.assignedCount).toBe(123);
    expect(report.numericEventCount).toBe(123);
    expect(report.uniqueNumericCount).toBe(123);
    expect(report.realEventCount).toBe(123);
    expect(report.dedupedRealPathCount).toBe(123);
    expect(report.duplicateRealEventCount).toBe(0);
    // Historical shard reported extraneous = 123 because the opaque
    // numeric IDs were counted as files by the old summary path.
    // The analyzer's OWN "computed extraneous" only counts REAL paths
    // that are not in the assigned set — with a clean fixture that is 0.
    expect(report.computedExtraneousCount).toBe(0);
    expect(report.missingAssignedCount).toBe(0);
    expect(report.batchEndCount).toBe(1);
    expect(report.corruptLineCount).toBe(0);
  });

  it("reports 0 extraneous on a fully-corrected fixture", () => {
    const assigned = ["src/a.test.ts", "src/b.test.ts"];
    const lines = assigned.map((f) => JSON.stringify(fileEvent(f))).join("\n") + "\n";
    const r = analyzeProgressContent(lines, { assignedFiles: assigned });
    expect(r.numericEventCount).toBe(0);
    expect(r.realEventCount).toBe(2);
    expect(r.computedExtraneousCount).toBe(0);
    expect(r.missingAssignedCount).toBe(0);
  });
});

describe("analyze-progress — missing assignment metadata", () => {
  it("reports unknown for assigned/missing/extraneous fields", () => {
    const lines = [fileEvent("src/a.test.ts"), fileEvent("-42")]
      .map((e) => JSON.stringify(e))
      .join("\n");
    const r = analyzeProgressContent(lines, { assignedFiles: null });
    expect(r.assignedCount).toBe("unknown");
    expect(r.computedExtraneousCount).toBe("unknown");
    expect(r.missingAssignedCount).toBe("unknown");
    // Real vs numeric split still works.
    expect(r.numericEventCount).toBe(1);
    expect(r.realEventCount).toBe(1);
  });
});

describe("analyze-progress — corrupt lines and duplicates", () => {
  it("counts corrupt JSONL lines and duplicate real events", () => {
    const lines = [
      "not-json",
      JSON.stringify(fileEvent("src/a.test.ts")),
      JSON.stringify(fileEvent("src/a.test.ts")),
      JSON.stringify({ event: "batch-end", schema: 1 }),
    ].join("\n");
    const r = analyzeProgressContent(lines, { assignedFiles: ["src/a.test.ts"] });
    expect(r.corruptLineCount).toBe(1);
    expect(r.realEventCount).toBe(2);
    expect(r.dedupedRealPathCount).toBe(1);
    expect(r.duplicateRealEventCount).toBe(1);
    expect(r.batchEndCount).toBe(1);
  });
});

describe("analyze-progress — run directory input", () => {
  it("reads progress.jsonl and shard-files.json from a run dir", () => {
    const dir = scratch();
    const assigned = ["src/x.test.ts", "src/y.test.ts"];
    fs.writeFileSync(
      path.join(dir, "progress.jsonl"),
      assigned.map((f) => JSON.stringify(fileEvent(f))).join("\n") + "\n",
    );
    fs.writeFileSync(
      path.join(dir, "shard-files.json"),
      JSON.stringify({ files: assigned }),
    );
    const r = analyzePath(dir);
    expect(r.assignedCount).toBe(2);
    expect(r.realEventCount).toBe(2);
    expect(r.computedExtraneousCount).toBe(0);
    expect(r.missingAssignedCount).toBe(0);
  });
});
