/**
 * Focused toolchain-identity tests for the controlled Vitest runner.
 *
 * Proves the runtime-identity contract:
 *   * Bun version comes from the installed executable (never a null fallback).
 *   * Vitest version comes from installed local metadata.
 *   * Node version is persisted.
 *   * Toolchain drift (any of node/bun/vitest) invalidates resume and
 *     rerun-failed BEFORE any completed-file reuse.
 *   * Aggregate rejects toolchain drift between shards.
 *   * Legacy run-schema versions are refused.
 *   * The workflow pins Bun to 1.3.3 in every job and prints only
 *     node/bun/vitest versions (no env dumps).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- runner stubs use loose types for the child_process contract */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const requireFn = createRequire(import.meta.url);
const resolveVitestPkg = () => requireFn.resolve("vitest/package.json");
import {
  discoverToolVersions,
  toolchainMismatch,
  commandRun,
  commandResume,
  commandRerunFailed,
  RUN_SCHEMA_VERSION,
} from "../../scripts/vitest-controlled/cli.mjs";
import { aggregateShards, summarizeRun } from "../../scripts/vitest-controlled/summarizer.mjs";

const WORKFLOW_PATH = path.resolve(
  __dirname,
  "../../.github/workflows/vitest-controlled-full-suite.yml",
);

const REAL_GIT = process.env.__LOVABLE_REAL_GIT || "git";
function git(root: string, ...args: string[]) {
  const r = spawnSync(REAL_GIT, ["-C", root, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

function initRepo(): { root: string; testFiles: string[] } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-tc-"));
  fs.writeFileSync(path.join(root, ".gitignore"), ".vitest-runs/\n");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/a.test.ts"), "// a\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "tc" }));
  fs.writeFileSync(path.join(root, "vitest.config.ts"), "export default {}\n");
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.invalid");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return { root, testFiles: ["src/a.test.ts"] };
}

function passingSpawnStub() {
  return (_bin: string, args: string[], opts: any) => {
    const progressFile = opts.env.VERDANT_CTRL_PROGRESS_FILE;
    const runId = opts.env.VERDANT_CTRL_RUN_ID;
    const shardIndex = Number(opts.env.VERDANT_CTRL_SHARD_INDEX);
    const shardTotal = Number(opts.env.VERDANT_CTRL_SHARD_TOTAL);
    const batchIndex = Number(opts.env.VERDANT_CTRL_BATCH_INDEX);
    const fileArgs = args.filter((a) => !a.startsWith("-") && a !== "vitest" && a !== "run");
    const em = new EventEmitter() as any;
    em.kill = () => {};
    setImmediate(() => {
      for (const rel of fileArgs) {
        fs.appendFileSync(
          progressFile,
          JSON.stringify({
            event: "file",
            schema: 1,
            runId,
            shardIndex,
            shardTotal,
            batchIndex,
            file: rel.split(path.sep).join("/"),
            status: "passed",
            counts: { passed: 1, failed: 0, skipped: 0, todo: 0 },
            failedTests: [],
            firstError: null,
            completedAt: "now",
          }) + "\n",
        );
      }
      em.emit("exit", 0, null);
    });
    return em;
  };
}

const STUB_TV = { node: "v22.22.0", bun: "1.3.3", vitest: "3.2.4" };

async function runWithTv(root: string, testFiles: string[], tv = STUB_TV) {
  return commandRun({
    repoRoot: root,
    shardSpec: "1/1",
    batchSize: 10,
    runsRoot: path.join(root, ".vitest-runs"),
    files: testFiles,
    spawnImpl: passingSpawnStub() as any,
    toolVersions: tv,
  });
}

describe("discoverToolVersions", () => {
  it("obtains Bun version from the installed executable output", () => {
    const seen: string[][] = [];
    const spawnSyncImpl: any = (bin: string, args: string[]) => {
      seen.push([bin, ...args]);
      return { status: 0, stdout: "1.3.3\n", stderr: "", error: null };
    };
    const tv = discoverToolVersions({
      spawnSyncImpl,
      resolveVitestPkg: () => require.resolve("vitest/package.json"),
    });
    expect(seen[0]).toEqual(["bun", "--version"]);
    expect(tv.bun).toBe("1.3.3");
    expect(tv.node).toBe(process.version);
    expect(typeof tv.vitest).toBe("string");
    expect(tv.vitest.length).toBeGreaterThan(0);
  });

  it("fails closed when the Bun executable is missing", () => {
    const spawnSyncImpl: any = () => ({
      status: null,
      stdout: "",
      stderr: "",
      error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    });
    expect(() =>
      discoverToolVersions({
        spawnSyncImpl,
        resolveVitestPkg: () => require.resolve("vitest/package.json"),
      }),
    ).toThrow(/Cannot discover Bun version/);
  });

  it("reads Vitest version from installed local package metadata", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-tv-"));
    const pkg = path.join(tmp, "package.json");
    fs.writeFileSync(pkg, JSON.stringify({ name: "vitest", version: "9.9.9-test" }));
    const tv = discoverToolVersions({
      spawnSyncImpl: (() => ({ status: 0, stdout: "1.3.3\n" })) as any,
      resolveVitestPkg: () => pkg,
    });
    expect(tv.vitest).toBe("9.9.9-test");
  });

  it("persists Node version verbatim from process.version", () => {
    const tv = discoverToolVersions({
      spawnSyncImpl: (() => ({ status: 0, stdout: "1.3.3\n" })) as any,
      resolveVitestPkg: () => require.resolve("vitest/package.json"),
    });
    expect(tv.node).toBe(process.version);
    expect(tv.node.startsWith("v")).toBe(true);
  });
});

describe("toolchainMismatch", () => {
  it("returns null on exact match", () => {
    expect(toolchainMismatch(STUB_TV, { ...STUB_TV })).toBeNull();
  });
  it("detects node drift", () => {
    expect(toolchainMismatch(STUB_TV, { ...STUB_TV, node: "v20.0.0" })).toMatch(/node:/);
  });
  it("detects bun drift", () => {
    expect(toolchainMismatch(STUB_TV, { ...STUB_TV, bun: "1.2.0" })).toMatch(/bun:/);
  });
  it("detects vitest drift", () => {
    expect(toolchainMismatch(STUB_TV, { ...STUB_TV, vitest: "2.0.0" })).toMatch(/vitest:/);
  });
});

describe("resume + rerun-failed enforcement", () => {
  it("resume refuses when Node version changes", async () => {
    const { root, testFiles } = initRepo();
    const first = await runWithTv(root, testFiles);
    fs.rmSync(path.join(first.runDir, "completed"));
    await expect(
      commandResume({
        repoRoot: root,
        runDir: first.runDir,
        spawnImpl: passingSpawnStub() as any,
        toolVersions: { ...STUB_TV, node: "v20.0.0" },
      }),
    ).rejects.toThrow(/toolchain drift.*node/);
  });

  it("resume refuses when Bun version changes", async () => {
    const { root, testFiles } = initRepo();
    const first = await runWithTv(root, testFiles);
    fs.rmSync(path.join(first.runDir, "completed"));
    await expect(
      commandResume({
        repoRoot: root,
        runDir: first.runDir,
        spawnImpl: passingSpawnStub() as any,
        toolVersions: { ...STUB_TV, bun: "1.2.0" },
      }),
    ).rejects.toThrow(/toolchain drift.*bun/);
  });

  it("resume refuses when Vitest version changes", async () => {
    const { root, testFiles } = initRepo();
    const first = await runWithTv(root, testFiles);
    fs.rmSync(path.join(first.runDir, "completed"));
    await expect(
      commandResume({
        repoRoot: root,
        runDir: first.runDir,
        spawnImpl: passingSpawnStub() as any,
        toolVersions: { ...STUB_TV, vitest: "2.0.0" },
      }),
    ).rejects.toThrow(/toolchain drift.*vitest/);
  });

  it("toolchain mismatch is detected BEFORE progress reuse", async () => {
    const { root, testFiles } = initRepo();
    const first = await runWithTv(root, testFiles);
    fs.rmSync(path.join(first.runDir, "completed"));
    // Poison progress so any reuse would surface as a corruption error;
    // toolchain check must reject BEFORE we get there.
    fs.appendFileSync(path.join(first.runDir, "progress.jsonl"), "{not-json\n");
    await expect(
      commandResume({
        repoRoot: root,
        runDir: first.runDir,
        spawnImpl: passingSpawnStub() as any,
        toolVersions: { ...STUB_TV, bun: "1.2.0" },
      }),
    ).rejects.toThrow(/toolchain drift/);
  });

  it("rerun-failed rejects toolchain drift", async () => {
    const { root, testFiles } = initRepo();
    const first = await runWithTv(root, testFiles);
    // Inject a failed record so rerun-failed has work to consider.
    fs.appendFileSync(
      path.join(first.runDir, "progress.jsonl"),
      JSON.stringify({
        event: "file",
        file: "src/other.test.ts",
        status: "failed",
        counts: { passed: 0, failed: 1, skipped: 0, todo: 0 },
      }) + "\n",
    );
    await expect(
      commandRerunFailed({
        repoRoot: root,
        runDir: first.runDir,
        spawnImpl: passingSpawnStub() as any,
        toolVersions: { ...STUB_TV, vitest: "2.0.0" },
      }),
    ).rejects.toThrow(/toolchain drift.*vitest/);
  });

  it("legacy run schema (< current) is refused", async () => {
    const { root, testFiles } = initRepo();
    const first = await runWithTv(root, testFiles);
    fs.rmSync(path.join(first.runDir, "completed"));
    const runJsonPath = path.join(first.runDir, "run.json");
    const rec = JSON.parse(fs.readFileSync(runJsonPath, "utf8"));
    rec.schema = RUN_SCHEMA_VERSION - 1;
    fs.writeFileSync(runJsonPath, JSON.stringify(rec, null, 2));
    await expect(
      commandResume({
        repoRoot: root,
        runDir: first.runDir,
        spawnImpl: passingSpawnStub() as any,
        toolVersions: STUB_TV,
      }),
    ).rejects.toThrow(/predates toolchain-locked contract/);
  });
});

describe("aggregate toolchain enforcement", () => {
  async function makeShardSummary(tv: typeof STUB_TV) {
    const { root, testFiles } = initRepo();
    const res = await runWithTv(root, testFiles, tv);
    return summarizeRun(res.runDir);
  }
  it("identical toolchains aggregate normally", async () => {
    const a = await makeShardSummary(STUB_TV);
    const b = await makeShardSummary(STUB_TV);
    const agg = aggregateShards([a, b]);
    expect(agg.toolchainMismatches).toEqual([]);
    // status depends on other agreement axes but toolchain must not
    // by itself be the invalidator.
    expect(["complete", "failed", "interrupted", "invalid"]).toContain(agg.status);
  });
  it("one mismatched shard toolchain fails aggregate", async () => {
    const a = await makeShardSummary(STUB_TV);
    const b = await makeShardSummary({ ...STUB_TV, bun: "1.2.0" });
    const agg = aggregateShards([a, b]);
    expect(agg.toolchainMismatches.some((m: any) => m.tool === "bun")).toBe(true);
    expect(agg.status).toBe("invalid");
  });
});

describe("workflow static assertions", () => {
  const yaml = fs.readFileSync(WORKFLOW_PATH, "utf8");
  it("contains no bun-version: latest", () => {
    expect(yaml).not.toMatch(/bun-version:\s*latest/);
  });
  it("pins Bun 1.3.3 in every setup-bun block (exactly 2)", () => {
    const pins = yaml.match(/bun-version:\s*1\.3\.3/g) ?? [];
    expect(pins.length).toBe(2);
  });
  it("has runtime-proof steps and they do not print env or secrets", () => {
    const runtimeStepRegex =
      /Runtime proof \(node\/bun\/vitest\)[\s\S]*?(?=- name:|\Z)/g;
    const blocks = yaml.match(runtimeStepRegex) ?? [];
    expect(blocks.length).toBe(2);
    for (const b of blocks) {
      expect(b).toMatch(/node --version/);
      expect(b).toMatch(/bun --version/);
      expect(b).toMatch(/vitest\/package\.json/);
      // Forbidden noise: env dumps or secret exposure.
      expect(b).not.toMatch(/\benv\b\s*$/m);
      expect(b).not.toMatch(/printenv/);
      expect(b).not.toMatch(/\$\{\{\s*secrets\./);
      expect(b).not.toMatch(/GITHUB_TOKEN/);
    }
  });
});
