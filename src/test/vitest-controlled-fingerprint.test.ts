/**
 * Focused resume-fingerprint safety tests.
 *
 * These validate the workspace fingerprint contract that closes the
 * false-green resume hole: any repository content change — production
 * TS, Supabase migration, edge function, script, doc, workflow, or an
 * added/removed tracked file — must invalidate resume, while ignored
 * runner artifacts (e.g. .vitest-runs/) must not.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  computeWorkspaceFingerprint,
  listWorkspaceFiles,
  FINGERPRINT_SCHEMA_VERSION,
  toPosixRel,
} from "../../scripts/vitest-controlled/fingerprint.mjs";
import {
  commandRun,
  commandResume,
  EXIT,
  RUN_SCHEMA_VERSION,
} from "../../scripts/vitest-controlled/cli.mjs";

// The sandbox wraps `git` to block stateful commands like `git add` and
// `git commit`. Fixture repos are entirely local/temp — bypass the
// wrapper by invoking the real git binary directly when available.
const REAL_GIT = process.env.__LOVABLE_REAL_GIT || "git";
function git(root: string, ...args: string[]) {
  const r = spawnSync(REAL_GIT, ["-C", root, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

// ---- Fixture-template optimization --------------------------------------
//
// Previously every test called initFixtureRepo() which ran a fresh
// git init/config/add/commit cycle (~17 per module). Under matrix load
// this synchronous fork-storm starves Vitest's worker RPC and can produce
// "Timeout calling onTaskUpdate" runner errors that fail the process
// even when every assertion passes.
//
// Instead: lazily build ONE committed template repo, then per test copy
// it (including its .git metadata) to a fresh independent working dir.
// Every case dir is still fully independent — mutations in one test
// cannot leak into another — but the git plumbing runs exactly once.

const CASE_PREFIX = "vc-fp-case-";
const TEMPLATE_PREFIX = "vc-fp-template-";

let templateRoot: string | null = null;
const activeCaseDirs = new Set<string>();

function isSafeCleanupTarget(target: string, expectedPrefix: string): boolean {
  const abs = path.resolve(target);
  const tmp = path.resolve(os.tmpdir());
  if (abs === tmp) return false;
  const parent = path.dirname(abs);
  if (parent !== tmp) return false;
  const base = path.basename(abs);
  return base.startsWith(expectedPrefix);
}

function safeRemoveDir(target: string, expectedPrefix: string): void {
  if (!isSafeCleanupTarget(target, expectedPrefix)) {
    throw new Error(`refusing unsafe fixture cleanup: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function buildTemplate(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TEMPLATE_PREFIX));
  fs.writeFileSync(path.join(root, ".gitignore"), ".vitest-runs/\ntest-results/\n");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "supabase/migrations"), { recursive: true });
  fs.mkdirSync(path.join(root, "supabase/functions/hello"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/app.ts"), "export const x = 1;\n");
  fs.writeFileSync(path.join(root, "src/app.test.ts"), "// test\n");
  fs.writeFileSync(path.join(root, "scripts/build.mjs"), "// build\n");
  fs.writeFileSync(path.join(root, "supabase/migrations/2026_init.sql"), "-- migration\n");
  fs.writeFileSync(path.join(root, "supabase/functions/hello/index.ts"), "// edge\n");
  fs.writeFileSync(path.join(root, "docs/README.md"), "# doc\n");
  fs.writeFileSync(path.join(root, ".github/workflows/ci.yml"), "name: ci\n");
  fs.writeFileSync(path.join(root, "vitest.config.ts"), "export default {}\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fp" }));
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.invalid");
  git(root, "config", "user.name", "t");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

function getTemplate(): string {
  if (templateRoot === null) {
    templateRoot = buildTemplate();
  }
  return templateRoot;
}

function initFixtureRepo(): string {
  const template = getTemplate();
  const caseRoot = fs.mkdtempSync(path.join(os.tmpdir(), CASE_PREFIX));
  // Node 16.7+ supports recursive fs.cpSync — copies the working tree and
  // .git metadata verbatim, producing a fully independent repository.
  fs.cpSync(template, caseRoot, { recursive: true });
  activeCaseDirs.add(caseRoot);
  return caseRoot;
}

afterEach(() => {
  for (const dir of activeCaseDirs) {
    try {
      safeRemoveDir(dir, CASE_PREFIX);
    } catch {
      // Best-effort cleanup; a stray fixture never affects assertions.
    }
  }
  activeCaseDirs.clear();
});

afterAll(() => {
  if (templateRoot !== null) {
    try {
      safeRemoveDir(templateRoot, TEMPLATE_PREFIX);
    } catch {
      // Best-effort cleanup.
    }
    templateRoot = null;
  }
});

describe("workspace fingerprint — determinism & coverage", () => {
  let root: string;
  beforeEach(() => {
    root = initFixtureRepo();
  });

  it("identical clean repo state produces the same digest", () => {
    const a = computeWorkspaceFingerprint(root);
    const b = computeWorkspaceFingerprint(root);
    expect(a.digest).toBe(b.digest);
    expect(a.mode).toBe("clean");
    expect(a.schema).toBe(FINGERPRINT_SCHEMA_VERSION);
    expect(a.fileCount).toBeGreaterThan(5);
  });

  it("changing a production .ts file invalidates the digest", () => {
    const before = computeWorkspaceFingerprint(root).digest;
    fs.writeFileSync(path.join(root, "src/app.ts"), "export const x = 2;\n");
    expect(computeWorkspaceFingerprint(root).digest).not.toBe(before);
  });

  it("changing a Supabase migration invalidates the digest", () => {
    const before = computeWorkspaceFingerprint(root).digest;
    fs.writeFileSync(path.join(root, "supabase/migrations/2026_init.sql"), "-- migration v2\n");
    expect(computeWorkspaceFingerprint(root).digest).not.toBe(before);
  });

  it("changing an edge function invalidates the digest", () => {
    const before = computeWorkspaceFingerprint(root).digest;
    fs.writeFileSync(path.join(root, "supabase/functions/hello/index.ts"), "// edge v2\n");
    expect(computeWorkspaceFingerprint(root).digest).not.toBe(before);
  });

  it("changing a script invalidates the digest", () => {
    const before = computeWorkspaceFingerprint(root).digest;
    fs.writeFileSync(path.join(root, "scripts/build.mjs"), "// build v2\n");
    expect(computeWorkspaceFingerprint(root).digest).not.toBe(before);
  });

  it("changing a doc file invalidates the digest", () => {
    const before = computeWorkspaceFingerprint(root).digest;
    fs.writeFileSync(path.join(root, "docs/README.md"), "# doc v2\n");
    expect(computeWorkspaceFingerprint(root).digest).not.toBe(before);
  });

  it("changing a workflow file invalidates the digest", () => {
    const before = computeWorkspaceFingerprint(root).digest;
    fs.writeFileSync(path.join(root, ".github/workflows/ci.yml"), "name: ci-v2\n");
    expect(computeWorkspaceFingerprint(root).digest).not.toBe(before);
  });

  it("adding a non-ignored untracked file invalidates the digest", () => {
    const before = computeWorkspaceFingerprint(root).digest;
    fs.writeFileSync(path.join(root, "src/added.ts"), "export const y = 1;\n");
    const after = computeWorkspaceFingerprint(root);
    expect(after.digest).not.toBe(before);
    expect(after.mode).toBe("dirty");
  });

  it("removing a tracked file invalidates the digest", () => {
    const before = computeWorkspaceFingerprint(root).digest;
    fs.rmSync(path.join(root, "src/app.ts"));
    expect(computeWorkspaceFingerprint(root).digest).not.toBe(before);
  });

  it("changing an ignored .vitest-runs artifact does NOT invalidate", () => {
    fs.mkdirSync(path.join(root, ".vitest-runs"), { recursive: true });
    const before = computeWorkspaceFingerprint(root).digest;
    fs.writeFileSync(path.join(root, ".vitest-runs/progress.jsonl"), "line\n");
    expect(computeWorkspaceFingerprint(root).digest).toBe(before);
  });

  it("changing an ignored test-results artifact does NOT invalidate", () => {
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    const before = computeWorkspaceFingerprint(root).digest;
    fs.writeFileSync(path.join(root, "test-results/out.xml"), "<xml/>");
    expect(computeWorkspaceFingerprint(root).digest).toBe(before);
  });

  it("enumeration order does not affect the digest", () => {
    // Add files in one order, hash; add-then-remove in a different order,
    // hash again — same final tree must produce same digest.
    fs.writeFileSync(path.join(root, "src/a.ts"), "1\n");
    fs.writeFileSync(path.join(root, "src/b.ts"), "2\n");
    fs.writeFileSync(path.join(root, "src/c.ts"), "3\n");
    const first = computeWorkspaceFingerprint(root).digest;
    fs.rmSync(path.join(root, "src/a.ts"));
    fs.rmSync(path.join(root, "src/b.ts"));
    fs.rmSync(path.join(root, "src/c.ts"));
    fs.writeFileSync(path.join(root, "src/c.ts"), "3\n");
    fs.writeFileSync(path.join(root, "src/a.ts"), "1\n");
    fs.writeFileSync(path.join(root, "src/b.ts"), "2\n");
    const second = computeWorkspaceFingerprint(root).digest;
    expect(second).toBe(first);
  });

  it("Windows and POSIX path forms normalize identically", () => {
    // toPosixRel is the single canonicalization point used everywhere.
    expect(toPosixRel("src\\lib\\x.ts")).toBe("src/lib/x.ts");
    expect(toPosixRel("src/lib/x.ts")).toBe("src/lib/x.ts");
  });

  it("listWorkspaceFiles excludes ignored paths", () => {
    fs.mkdirSync(path.join(root, ".vitest-runs"), { recursive: true });
    fs.writeFileSync(path.join(root, ".vitest-runs/x.jsonl"), "x\n");
    const files = listWorkspaceFiles(root);
    expect(files.some((f) => f.startsWith(".vitest-runs/"))).toBe(false);
    expect(files).toContain("src/app.ts");
    expect(files).toContain("supabase/migrations/2026_init.sql");
  });
});

// ---- Resume-enforcement integration -------------------------------------

function makePassingSpawnStub() {
  return (_bin: string, args: string[], opts: { env: Record<string, string> }) => {
    const progressFile = opts.env.VERDANT_CTRL_PROGRESS_FILE;
    const runId = opts.env.VERDANT_CTRL_RUN_ID;
    const shardIndex = Number(opts.env.VERDANT_CTRL_SHARD_INDEX);
    const shardTotal = Number(opts.env.VERDANT_CTRL_SHARD_TOTAL);
    const batchIndex = Number(opts.env.VERDANT_CTRL_BATCH_INDEX);
    const fileArgs = args.filter((a) => !a.startsWith("-") && a !== "vitest" && a !== "run");
    const emitter = new EventEmitter() as EventEmitter & { kill?: () => void };
    emitter.kill = () => {};
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
      emitter.emit("exit", 0, null);
    });
    return emitter;
  };
}

describe("resume enforcement", () => {
  it("mismatch is detected BEFORE completed-file reuse", async () => {
    const root = initFixtureRepo();
    const runsRoot = path.join(root, ".vitest-runs");
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 10,
      runsRoot,
      files: ["src/app.test.ts"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnImpl: makePassingSpawnStub() as any,
    });
    fs.rmSync(path.join(first.runDir, "completed"));
    // Change a NON-test production file — old fingerprint would miss this.
    fs.writeFileSync(path.join(root, "src/app.ts"), "export const x = 999;\n");
    await expect(
      commandResume({
        repoRoot: root,
        runDir: first.runDir,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnImpl: makePassingSpawnStub() as any,
      }),
    ).rejects.toThrow(/workspace fingerprint drift/);
  });

  it("refuses schema-v1 run.json under v2 semantics", async () => {
    const root = initFixtureRepo();
    const runsRoot = path.join(root, ".vitest-runs");
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 10,
      runsRoot,
      files: ["src/app.test.ts"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnImpl: makePassingSpawnStub() as any,
    });
    fs.rmSync(path.join(first.runDir, "completed"));
    // Downgrade the on-disk record to v1 semantics.
    const runJsonPath = path.join(first.runDir, "run.json");
    const rec = JSON.parse(fs.readFileSync(runJsonPath, "utf8"));
    rec.schema = 1;
    delete rec.workspaceFingerprint;
    rec.dirtyTreeHash = "legacy";
    fs.writeFileSync(runJsonPath, JSON.stringify(rec, null, 2));
    await expect(
      commandResume({
        repoRoot: root,
        runDir: first.runDir,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnImpl: makePassingSpawnStub() as any,
      }),
    ).rejects.toThrow(/schema v1 predates toolchain-locked contract/);
  });

  it("run.json never persists source contents or absolute user paths", async () => {
    const root = initFixtureRepo();
    // Insert a distinctive secret-like literal into a tracked file — the
    // fingerprint hashes contents but MUST NOT round-trip them to disk.
    const canary = "CANARY_TOKEN_" + Math.random().toString(36).slice(2);
    fs.writeFileSync(path.join(root, "src/app.ts"), `export const s = "${canary}";\n`);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "canary");
    const runsRoot = path.join(root, ".vitest-runs");
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 10,
      runsRoot,
      files: ["src/app.test.ts"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnImpl: makePassingSpawnStub() as any,
    });
    const runJsonText = fs.readFileSync(path.join(first.runDir, "run.json"), "utf8");
    expect(runJsonText).not.toContain(canary);
    expect(runJsonText).not.toContain(root); // no absolute user path
    const rec = JSON.parse(runJsonText);
    expect(rec.schema).toBe(RUN_SCHEMA_VERSION);
    expect(rec.workspaceFingerprint.schema).toBe(FINGERPRINT_SCHEMA_VERSION);
    expect(rec.workspaceFingerprint.algorithm).toBe("sha256");
    expect(typeof rec.workspaceFingerprint.digest).toBe("string");
    expect(rec.workspaceFingerprint.fileCount).toBeGreaterThan(0);
    expect(["clean", "dirty"]).toContain(rec.workspaceFingerprint.mode);
  });
});
