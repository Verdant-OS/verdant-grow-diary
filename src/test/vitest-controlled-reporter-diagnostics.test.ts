import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Reporter, {
  looksLikeOpaqueId,
  looksLikeTestPath,
  resolveCanonicalFile,
} from "../../scripts/vitest-controlled/reporter.mjs";
import { readProgress } from "../../scripts/vitest-controlled/summarizer.mjs";

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vc-reporter-diag-"));
}

function readJsonl(p) {
  return fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("reporter — opaque ID rejection", () => {
  it("rejects negative-integer strings as file candidates", () => {
    expect(looksLikeOpaqueId("-1718178837")).toBe(true);
    expect(looksLikeOpaqueId("42916516")).toBe(true);
    expect(looksLikeOpaqueId("src/lib/routes.test.ts")).toBe(false);
  });

  it("recognizes test/spec paths", () => {
    expect(looksLikeTestPath("src/lib/routes.test.ts")).toBe(true);
    expect(looksLikeTestPath("/abs/path/foo.spec.tsx")).toBe(true);
    expect(looksLikeTestPath("-1718178837")).toBe(false);
    expect(looksLikeTestPath("src/lib/routes.ts")).toBe(false);
  });

  it("resolver refuses opaque module IDs even when they are the only candidate", () => {
    const shape = {
      children: {},
      id: "-1718178837",
      location: {},
      moduleId: "-1718178837",
      project: {},
      task: {},
      type: "module",
    };
    const { selectedField, canonical } = resolveCanonicalFile(shape);
    // selection is recorded for diagnostics but canonical stays null
    expect(selectedField).toBe("moduleId");
    expect(canonical).toBeNull();
  });

  it("resolver picks filepath when present", () => {
    const shape = {
      filepath: "/repo/src/lib/routes.test.ts",
      id: "-1718178837",
      moduleId: "-1718178837",
    };
    const { selectedField, canonical } = resolveCanonicalFile(shape);
    expect(selectedField).toBe("filepath");
    expect(canonical).toBe("/repo/src/lib/routes.test.ts");
  });
});

describe("reporter — Vitest 3.2.4 callback contract", () => {
  it("onTestModuleEnd with only moduleId does NOT emit a file event", () => {
    const dir = scratch();
    const progress = path.join(dir, "progress.jsonl");
    const r = new Reporter({
      progressFile: progress,
      runId: "r1",
      shardIndex: 1,
      shardTotal: 1,
      batchIndex: 0,
      repoRoot: "/repo",
      debug: true,
      debugFile: path.join(dir, "reporter-debug.jsonl"),
    });
    // Exact observed onTestModuleEnd keys
    r.onTestModuleEnd({
      children: {},
      id: "-1718178837",
      location: {},
      moduleId: "-1718178837",
      project: {},
      task: {},
      type: "module",
    });
    // onFinished supplies the canonical filepath.
    r.onFinished(
      [
        {
          type: "suite",
          filepath: "/repo/src/lib/routes.test.ts",
          result: { state: "pass", duration: 5 },
          tasks: [
            {
              type: "test",
              name: "ok",
              result: { state: "pass", duration: 1, errors: [] },
            },
          ],
        },
      ],
      [],
    );

    const { files, corruptLines } = readProgress(progress);
    expect(corruptLines).toHaveLength(0);
    // Exactly one canonical file event, keyed by real path
    expect([...files.keys()]).toEqual(["src/lib/routes.test.ts"]);
    expect(files.get("src/lib/routes.test.ts").status).toBe("passed");
    // No opaque-ID event was written
    for (const k of files.keys()) {
      expect(/^-?\d+$/.test(k)).toBe(false);
    }
  });

  it("emits exactly one file event when module-end + finished fire for the same file", () => {
    const dir = scratch();
    const progress = path.join(dir, "progress.jsonl");
    const r = new Reporter({
      progressFile: progress,
      runId: "r1",
      shardIndex: 1,
      shardTotal: 1,
      batchIndex: 0,
      repoRoot: "/repo",
      debug: true,
      debugFile: path.join(dir, "reporter-debug.jsonl"),
    });
    const fileTask = {
      type: "suite",
      filepath: "/repo/src/a.test.ts",
      result: { state: "pass", duration: 5 },
      tasks: [
        { type: "test", name: "ok", result: { state: "pass", duration: 1, errors: [] } },
      ],
    };
    r.onTestModuleEnd(fileTask);
    r.onFinished([fileTask], []);
    const events = readJsonl(progress).filter((e) => e.event === "file");
    expect(events).toHaveLength(1);

    const debug = readJsonl(path.join(dir, "reporter-debug.jsonl"));
    const decisions = debug.map((d) => d.decision);
    expect(decisions).toContain("flushed");
    expect(decisions).toContain("deduped");
  });
});

describe("reporter — debug output", () => {
  it("writes structured debug records with field types and no raw opaque IDs", () => {
    const dir = scratch();
    const progress = path.join(dir, "progress.jsonl");
    const debugFile = path.join(dir, "reporter-debug.jsonl");
    const r = new Reporter({
      progressFile: progress,
      runId: "r1",
      shardIndex: 1,
      shardTotal: 1,
      batchIndex: 0,
      repoRoot: "/repo",
      debug: true,
      debugFile,
    });
    r.onTestModuleEnd({
      children: {},
      id: "-1718178837",
      moduleId: "-1718178837",
      type: "module",
    });
    r.onFinished(
      [
        {
          type: "suite",
          filepath: "/repo/src/lib/routes.test.ts",
          result: { state: "pass" },
          tasks: [],
        },
      ],
      [],
    );

    const records = readJsonl(debugFile);
    expect(records.length).toBeGreaterThanOrEqual(2);
    const deferred = records.find((r) => r.decision === "deferred");
    const flushed = records.find((r) => r.decision === "flushed");
    expect(deferred).toBeTruthy();
    expect(flushed).toBeTruthy();

    // Field types present
    expect(deferred.fieldTypes).toMatchObject({
      filepath: "undefined",
      id: "string",
      moduleId: "string",
      children: "object",
    });
    expect(flushed.fieldTypes.filepath).toBe("string");

    // Sorted callback keys are present as an array
    expect(Array.isArray(deferred.callbackKeys)).toBe(true);
    expect(deferred.callbackKeys).toEqual([...deferred.callbackKeys].sort());

    // No raw opaque IDs anywhere in the serialized debug output
    const blob = fs.readFileSync(debugFile, "utf8");
    expect(blob).not.toContain("-1718178837");
  });
});

describe("reporter — path normalization", () => {
  it("normalizes POSIX and Windows-style paths against repoRoot", () => {
    const dir = scratch();
    const progress = path.join(dir, "progress.jsonl");
    const r = new Reporter({
      progressFile: progress,
      runId: "r1",
      shardIndex: 1,
      shardTotal: 1,
      batchIndex: 0,
      repoRoot: process.cwd(),
    });
    // Use paths that are actually descendants of cwd so path.relative
    // produces the same POSIX slug on both platforms.
    const rel = "src/lib/routes.test.ts";
    const abs = path.resolve(process.cwd(), rel);
    r.onFinished(
      [{ type: "suite", filepath: abs, result: { state: "pass" }, tasks: [] }],
      [],
    );
    const { files } = readProgress(progress);
    expect([...files.keys()]).toEqual([rel]);
  });
});
