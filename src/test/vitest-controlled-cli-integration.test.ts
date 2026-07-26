/* eslint-disable @typescript-eslint/no-explicit-any -- controlled-runner spawn stubs use loose types for the child_process contract */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { commandRun, commandResume, DEFAULTS, EXIT } from "../../scripts/vitest-controlled/cli.mjs";
import { readProgress } from "../../scripts/vitest-controlled/summarizer.mjs";

vi.setConfig({ testTimeout: 20_000 });

// Build a fake repo containing test files that will never actually be
// executed — we stub the vitest spawn instead. This isolates the
// orchestrator's resume + fingerprint semantics from vitest itself.
function fakeRepo(fileCount: number) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-cli-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  // Ignore the runner artifact directory (mirrors real repo .gitignore) so
  // writing progress/summary files does not invalidate the workspace
  // fingerprint that resume enforces.
  fs.writeFileSync(path.join(root, ".gitignore"), ".vitest-runs/\n");
  const files: string[] = [];
  for (let i = 0; i < fileCount; i++) {
    const rel = `src/f${String(i).padStart(2, "0")}.test.ts`;
    fs.writeFileSync(path.join(root, rel), `// ${i}\n`);
    files.push(rel);
  }
  fs.writeFileSync(path.join(root, "vitest.config.ts"), "export default {}\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fake" }));
  // Initialize as a git repo so the workspace fingerprint can enumerate
  // tracked + non-ignored untracked files (mirrors real Verdant layout).
  const realGit = process.env.__LOVABLE_REAL_GIT || "git";
  const git = (...args: string[]) => {
    const r = spawnSync(realGit, ["-C", root, ...args]);
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { root, files };
}

/** Simulate vitest by directly writing progress lines for the requested files. */
function makeSpawnStub({
  writeStatus,
  crashAfter,
  childExitCode = 0,
  shouldWriteFile = () => true,
}: {
  writeStatus: (file: string) => "passed" | "failed" | "skipped";
  crashAfter?: number;
  childExitCode?: number;
  shouldWriteFile?: (file: string) => boolean;
}) {
  let batchesSpawned = 0;
  const stub = (_bin: string, args: string[], opts: any) => {
    const progressFile = opts.env.VERDANT_CTRL_PROGRESS_FILE;
    const repoRoot = opts.env.VERDANT_CTRL_REPO_ROOT;
    const runId = opts.env.VERDANT_CTRL_RUN_ID;
    const shardIndex = Number(opts.env.VERDANT_CTRL_SHARD_INDEX);
    const shardTotal = Number(opts.env.VERDANT_CTRL_SHARD_TOTAL);
    const batchIndex = Number(opts.env.VERDANT_CTRL_BATCH_INDEX);
    const attempt = Number(opts.env.VERDANT_CTRL_ATTEMPT ?? 0);
    // Extract file args (everything after the last flag).
    const fileArgs = args.filter((a) => !a.startsWith("-") && a !== "vitest" && a !== "run");
    const emitter = new EventEmitter() as any;
    emitter.kill = () => {};
    const thisBatch = batchesSpawned++;
    setImmediate(() => {
      try {
        for (const rel of fileArgs) {
          const relFromRoot = path
            .relative(repoRoot, path.resolve(repoRoot, rel))
            .split(path.sep)
            .join("/");
          if (!shouldWriteFile(relFromRoot)) continue;
          const status = writeStatus(relFromRoot);
          fs.appendFileSync(
            progressFile,
            JSON.stringify({
              event: "file",
              schema: 1,
              runId,
              shardIndex,
              shardTotal,
              batchIndex,
              attempt,
              file: relFromRoot,
              status,
              counts: {
                passed: status === "passed" ? 1 : 0,
                failed: status === "failed" ? 1 : 0,
                skipped: status === "skipped" ? 1 : 0,
                todo: 0,
              },
              failedTests: status === "failed" ? ["broken"] : [],
              firstError: status === "failed" ? "boom" : null,
              completedAt: new Date().toISOString(),
            }) + "\n",
          );
        }
        fs.appendFileSync(
          progressFile,
          JSON.stringify({
            event: "batch-end",
            schema: 1,
            runId,
            shardIndex,
            shardTotal,
            batchIndex,
            attempt,
            errorCount: 0,
            completedAt: "now",
          }) + "\n",
        );
        // Simulate crash by never emitting exit if crashAfter reached
        if (crashAfter !== undefined && thisBatch >= crashAfter) {
          emitter.emit("exit", 1, "SIGKILL");
        } else {
          emitter.emit("exit", childExitCode, null);
        }
      } catch (err) {
        emitter.emit("error", err);
      }
    });
    return emitter;
  };
  return { stub, spawned: () => batchesSpawned };
}

describe("controlled runner CLI (stubbed vitest)", () => {
  it("multi-batch run: writes summary, marks complete, exit 0", async () => {
    const { root, files } = fakeRepo(7);
    const runsRoot = path.join(root, ".vitest-runs");
    const { stub } = makeSpawnStub({ writeStatus: () => "passed" });
    const res = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 3,
      runsRoot,
      files,
      spawnImpl: stub as any,
    });
    expect(res.exit).toBe(EXIT.GREEN);
    expect(fs.existsSync(path.join(res.runDir, "completed"))).toBe(true);
    const summary = JSON.parse(fs.readFileSync(path.join(res.runDir, "summary.json"), "utf8"));
    expect(summary.status).toBe("complete");
    expect(summary.totals.passedFiles).toBe(7);
  });

  it("failed file: exit 1 and summary.status=failed", async () => {
    const { root, files } = fakeRepo(4);
    const runsRoot = path.join(root, ".vitest-runs");
    const { stub } = makeSpawnStub({
      writeStatus: (f) => (f.endsWith("f02.test.ts") ? "failed" : "passed"),
    });
    const res = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 2,
      runsRoot,
      files,
      spawnImpl: stub as any,
    });
    expect(res.exit).toBe(EXIT.TEST_FAILURES);
    expect(res.summary.failedFilesList).toContain("src/f02.test.ts");
  });

  it("fails closed when a child exits nonzero despite green reporter events", async () => {
    const { root, files } = fakeRepo(2);
    const runsRoot = path.join(root, ".vitest-runs");
    const { stub } = makeSpawnStub({
      writeStatus: () => "passed",
      childExitCode: 1,
    });
    const res = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 2,
      runsRoot,
      files,
      spawnImpl: stub as any,
    });

    expect(res.exit).toBe(EXIT.TEST_FAILURES);
    expect(res.summary.status).toBe("failed");
    expect(fs.existsSync(path.join(res.runDir, "completed"))).toBe(false);

    const askedFor: string[] = [];
    const resumed = await commandResume({
      repoRoot: root,
      runDir: res.runDir,
      spawnImpl: makeSpawnStub({
        writeStatus: (file) => {
          askedFor.push(file);
          return "passed";
        },
      }).stub as any,
    });

    expect(askedFor.sort()).toEqual(files.sort());
    expect(resumed.exit).toBe(EXIT.GREEN);
    expect(resumed.summary.status).toBe("complete");
  });

  it("revalidates every assigned file when failed final metadata is missing", async () => {
    const { root, files } = fakeRepo(2);
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 2,
      runsRoot: path.join(root, ".vitest-runs"),
      files,
      spawnImpl: makeSpawnStub({
        writeStatus: () => "passed",
        childExitCode: 1,
      }).stub as any,
    });
    fs.rmSync(path.join(first.runDir, "run-meta"));

    const askedFor: string[] = [];
    const resumed = await commandResume({
      repoRoot: root,
      runDir: first.runDir,
      spawnImpl: makeSpawnStub({
        writeStatus: (file) => {
          askedFor.push(file);
          return "passed";
        },
      }).stub as any,
    });

    expect(askedFor.sort()).toEqual(files.sort());
    expect(resumed.exit).toBe(EXIT.GREEN);
    expect(resumed.summary.status).toBe("complete");
  });

  it("lets a newer resume attempt supersede an earlier terminal failure", async () => {
    const { root, files } = fakeRepo(1);
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 1,
      runsRoot: path.join(root, ".vitest-runs"),
      files,
      spawnImpl: makeSpawnStub({
        writeStatus: () => "failed",
        childExitCode: 1,
      }).stub as any,
    });

    const resumed = await commandResume({
      repoRoot: root,
      runDir: first.runDir,
      spawnImpl: makeSpawnStub({ writeStatus: () => "passed" }).stub as any,
    });
    const progress = readProgress(path.join(first.runDir, "progress.jsonl"));

    expect(resumed.exit).toBe(EXIT.GREEN);
    expect(resumed.summary.status).toBe("complete");
    expect(progress.conflicts).toEqual([]);
    expect(progress.files.get(files[0])?.status).toBe("passed");
    expect(progress.files.get(files[0])?.attempt).toBe(1);
  });

  it("stays non-green when a retry omits a selected file result", async () => {
    const { root, files } = fakeRepo(2);
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 2,
      runsRoot: path.join(root, ".vitest-runs"),
      files,
      spawnImpl: makeSpawnStub({
        writeStatus: () => "skipped",
        childExitCode: 1,
      }).stub as any,
    });
    const omittedFile = files[1];

    const resumed = await commandResume({
      repoRoot: root,
      runDir: first.runDir,
      spawnImpl: makeSpawnStub({
        writeStatus: () => "passed",
        shouldWriteFile: (file) => file !== omittedFile,
      }).stub as any,
    });

    expect(resumed.exit).toBe(EXIT.TEST_FAILURES);
    expect(resumed.summary.status).toBe("failed");
    expect(resumed.summary.incompleteFiles).toEqual([omittedFile]);
    expect(fs.existsSync(path.join(first.runDir, "completed"))).toBe(false);
  });

  it("resume skips already-completed files", async () => {
    const { root, files } = fakeRepo(5);
    const runsRoot = path.join(root, ".vitest-runs");
    // First run: only mark first 2 as done by making the stub only emit for the first batch.
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 2,
      runsRoot,
      files,
      spawnImpl: makeSpawnStub({ writeStatus: () => "passed" }).stub as any,
    });
    // Truncate progress to simulate interruption after 2 files.
    const progressFile = path.join(first.runDir, "progress.jsonl");
    const lines = fs.readFileSync(progressFile, "utf8").split("\n").filter(Boolean);
    // Keep only the first 2 terminal file events; preflight incomplete
    // markers represent selected work, not completed work.
    const fileLines = lines
      .filter((line) => {
        const event = JSON.parse(line);
        return event.event === "file" && ["passed", "failed", "skipped"].includes(event.status);
      })
      .slice(0, 2);
    fs.writeFileSync(progressFile, fileLines.join("\n") + "\n");
    fs.rmSync(path.join(first.runDir, "completed"));

    // Track which files the resumed spawn is asked to run.
    const askedFor: string[] = [];
    const trackingStub = makeSpawnStub({
      writeStatus: (f) => {
        askedFor.push(f);
        return "passed";
      },
    });
    const res = await commandResume({
      repoRoot: root,
      runDir: first.runDir,
      spawnImpl: trackingStub.stub as any,
    });
    // Should have re-run only the 3 remaining files.
    expect(askedFor.sort()).toEqual(["src/f02.test.ts", "src/f03.test.ts", "src/f04.test.ts"]);
    expect(res.exit).toBe(EXIT.GREEN);
  });

  it("resume reruns an explicitly incomplete file event", async () => {
    const { root, files } = fakeRepo(2);
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 2,
      runsRoot: path.join(root, ".vitest-runs"),
      files,
      spawnImpl: makeSpawnStub({ writeStatus: () => "passed" }).stub as any,
    });
    fs.rmSync(path.join(first.runDir, "completed"));

    const progressFile = path.join(first.runDir, "progress.jsonl");
    const incompleteFile = files[0];
    const events = fs
      .readFileSync(progressFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter(
        (event) =>
          !(
            event.event === "file" &&
            event.file === incompleteFile &&
            event.status !== "incomplete"
          ),
      );
    fs.writeFileSync(progressFile, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

    const askedFor: string[] = [];
    const resumed = await commandResume({
      repoRoot: root,
      runDir: first.runDir,
      spawnImpl: makeSpawnStub({
        writeStatus: (file) => {
          askedFor.push(file);
          return "passed";
        },
      }).stub as any,
    });

    expect(askedFor).toEqual([incompleteFile]);
    expect(resumed.exit).toBe(EXIT.GREEN);
    expect(resumed.summary.status).toBe("complete");
  });

  it("removes a stale completion marker when a resumed retry fails", async () => {
    const { root, files } = fakeRepo(1);
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 1,
      runsRoot: path.join(root, ".vitest-runs"),
      files,
      spawnImpl: makeSpawnStub({ writeStatus: () => "passed" }).stub as any,
    });
    const progressFile = path.join(first.runDir, "progress.jsonl");
    const events = fs
      .readFileSync(progressFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((event) => event.event !== "file" || event.status === "incomplete");
    fs.writeFileSync(progressFile, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

    const resumed = await commandResume({
      repoRoot: root,
      runDir: first.runDir,
      spawnImpl: makeSpawnStub({
        writeStatus: () => "passed",
        childExitCode: 1,
      }).stub as any,
    });

    expect(resumed.exit).toBe(EXIT.TEST_FAILURES);
    expect(resumed.summary.status).toBe("failed");
    expect(fs.existsSync(path.join(first.runDir, "completed"))).toBe(false);
  });

  it("resume refuses when source fingerprint drifts", async () => {
    const { root, files } = fakeRepo(3);
    const runsRoot = path.join(root, ".vitest-runs");
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 3,
      runsRoot,
      files,
      spawnImpl: makeSpawnStub({ writeStatus: () => "passed" }).stub as any,
    });
    fs.rmSync(path.join(first.runDir, "completed"));
    // Mutate a test source file so the dirty-tree hash changes.
    fs.writeFileSync(path.join(root, files[0]), "// changed contents\n");
    await expect(
      commandResume({
        repoRoot: root,
        runDir: first.runDir,
        spawnImpl: makeSpawnStub({ writeStatus: () => "passed" }).stub as any,
      }),
    ).rejects.toThrow(/dirty-tree|fingerprint/);
  });

  it("resume refuses when progress contains a conflict", async () => {
    const { root, files } = fakeRepo(3);
    const runsRoot = path.join(root, ".vitest-runs");
    const first = await commandRun({
      repoRoot: root,
      shardSpec: "1/1",
      batchSize: 3,
      runsRoot,
      files,
      spawnImpl: makeSpawnStub({ writeStatus: () => "passed" }).stub as any,
    });
    fs.rmSync(path.join(first.runDir, "completed"));
    const progressFile = path.join(first.runDir, "progress.jsonl");
    fs.appendFileSync(
      progressFile,
      JSON.stringify({
        event: "file",
        schema: 1,
        runId: "r",
        shardIndex: 1,
        shardTotal: 1,
        batchIndex: 99,
        file: "src/f00.test.ts",
        status: "failed",
        counts: { passed: 0, failed: 1, skipped: 0, todo: 0 },
        failedTests: ["different"],
        completedAt: "now",
      }) + "\n",
    );
    await expect(
      commandResume({
        repoRoot: root,
        runDir: first.runDir,
        spawnImpl: makeSpawnStub({ writeStatus: () => "passed" }).stub as any,
      }),
    ).rejects.toThrow(/conflicts|corrupt/);
  });
});

describe("defaults", () => {
  it("defaults match Slice G.1j controlled command", () => {
    expect(DEFAULTS.pool).toBe("forks");
    expect(DEFAULTS.maxWorkers).toBe(8);
    expect(DEFAULTS.minWorkers).toBe(2);
    expect(DEFAULTS.batchDeadlineMs).toBeLessThan(600_000);
  });
});
