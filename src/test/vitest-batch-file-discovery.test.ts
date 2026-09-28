import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repo = process.cwd();
const runner = resolve(repo, "scripts/run-vitest-batches.mjs");
const scratch: string[] = [];
const normalize = (file: string) => file.replaceAll("\\", "/");

function temporaryDirectory() {
  const dir = mkdtempSync(join(tmpdir(), "verdant-vitest-discovery-"));
  scratch.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    const target = resolve(dir);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !target.includes("verdant-vitest-discovery-")
    ) {
      throw new Error("Refusing cleanup outside the disposable discovery fixture");
    }
    rmSync(target, { recursive: true, force: true });
  }
});

function fixture() {
  const root = temporaryDirectory();
  const eligible = [
    "src/test/legacy.test.ts",
    "src/lib/__tests__/library.test.ts",
    "src/components/component.test.tsx",
    "src/hooks/hook.test.ts",
    "src/pages/support/__tests__/form.test.tsx",
    "src/lib/rule.spec.ts",
    "src/components/component.spec.tsx",
    ...Array.from({ length: 17 }, (_, index) => `src/test/case-${index}.test.ts`),
  ];
  const excluded = [
    "src/test/setup.ts",
    "src/test/unsupported.test.js",
    "src/test/almost.test.ts.backup",
    "src/node_modules/vendor/vendor.spec.ts",
    "src/components/node_modules/vendor.test.tsx",
    "src/.git/internal.test.ts",
    "e2e/outside.spec.ts",
    "scripts/outside.test.ts",
  ];
  for (const file of [...eligible, ...excluded]) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "// Disposable discovery fixture, never executed.\n");
  }
  return { root, eligible: eligible.sort(), excluded };
}

// Exercise the actual CLI and intercept only its Vitest subprocess. The
// discovery walk, argument parsing, sorting, batching and exit status all run.
// Synthetic files are never executed and no application/DB process is started.
function schedule(root: string, args: string[], exitCode = 0) {
  const work = temporaryDirectory();
  const callsFile = join(work, "calls.jsonl");
  const preloader = join(work, "capture.mjs");
  writeFileSync(
    preloader,
    `import childProcess from "node:child_process";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
childProcess.spawnSync = (command, args) => {
  if (command !== "bunx" || args[0] !== "vitest" || args[1] !== "run") {
    throw new Error("Unexpected subprocess in discovery proof");
  }
  appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(args) + "\\n");
  return { status: ${exitCode}, stdout: "", stderr: "" };
};
syncBuiltinESMExports();
`,
  );
  const result = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(preloader).href, runner, ...args],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  const calls: string[][] = existsSync(callsFile)
    ? readFileSync(callsFile, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[])
    : [];
  const files = calls.flatMap((call) =>
    call
      .slice(2)
      .filter((arg) => !arg.startsWith("--"))
      .map(normalize),
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls, files };
}

describe("canonical Vitest batch file discovery", () => {
  it.each(["contiguous", "round-robin"])(
    "schedules every eligible src test/spec exactly once using %s",
    (strategy) => {
      const input = fixture();
      const result = schedule(input.root, [
        "--batches=16",
        `--strategy=${strategy}`,
        "--chunk-size=2",
      ]);
      expect(result.status, result.stderr).toBe(0);
      expect([...result.files].sort()).toEqual(input.eligible);
      expect(new Set(result.files).size).toBe(input.eligible.length);
      expect(result.files.some((file) => input.excluded.includes(file))).toBe(false);
    },
  );

  it("keeps the schedule deterministic for identical inputs", () => {
    const input = fixture();
    const args = ["--batches=16", "--strategy=round-robin", "--chunk-size=2"];
    const first = schedule(input.root, args);
    const second = schedule(input.root, args);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(second.calls).toEqual(first.calls);
  });

  it.each(["contiguous", "round-robin"])(
    "covers the same file set across the 16 independently selected %s CI batches",
    (strategy) => {
      const input = fixture();
      const selected = Array.from({ length: 16 }, (_, batch) =>
        schedule(input.root, ["--batches=16", `--batch=${batch}`, `--strategy=${strategy}`]),
      );
      expect(selected.every((result) => result.status === 0)).toBe(true);
      const files = selected.flatMap((result) => result.files);
      expect([...files].sort()).toEqual(input.eligible);
      expect(new Set(files).size).toBe(files.length);
    },
    20_000,
  );

  it("fails closed with no matching tests and never launches an unfiltered suite", () => {
    const root = temporaryDirectory();
    const result = schedule(root, ["--batches=16"]);
    expect(result.status).toBe(2);
    expect(result.calls).toEqual([]);
    expect(result.stderr).toContain("No test files discovered");
  });

  it("preserves a failing Vitest subprocess as a failing batch", () => {
    const input = fixture();
    const result = schedule(input.root, ["--batches=16", "--batch=0"], 1);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"status":"fail"');
  });

  it("matches the repository's actual configured Vitest file inventory", () => {
    const work = temporaryDirectory();
    const inventory = join(work, "vitest-files.json");
    const listed = spawnSync(
      process.execPath,
      [
        resolve(repo, "node_modules/vitest/vitest.mjs"),
        "list",
        "--filesOnly",
        `--json=${inventory}`,
      ],
      { cwd: repo, encoding: "utf8", timeout: 20_000, maxBuffer: 1024 * 1024 },
    );
    if (listed.error) throw listed.error;
    expect(listed.status, listed.stderr).toBe(0);
    const configured: { file: string }[] = JSON.parse(readFileSync(inventory, "utf8"));
    const result = schedule(repo, ["--batches=16", "--strategy=round-robin", "--chunk-size=64"]);
    expect(result.status, result.stderr).toBe(0);
    expect([...result.files].sort()).toEqual(
      configured.map((test) => normalize(relative(repo, test.file))).sort(),
    );
    expect(new Set(result.files).size).toBe(configured.length);
  }, 30_000);
});
