/**
 * Contract tests for the scorer lock (docs/agents/loop-engineering.md §3).
 *
 * The scorer lock is the repository's version of the "locked checks folder" in the
 * Karpathy-loop workflow: a check that already exists on the branch (tracked at HEAD)
 * may not be edited by an agent session unless that edit was declared first with
 * `node scripts/scorer-lock.mjs --unlock <path> --reason "<why>"`.
 *
 * Three layers are pinned here:
 *   1. the pure rules module (which paths are scorers, when an edit is refused);
 *   2. the CLI's `--hook` mode, run against a disposable git repository;
 *   3. the project hook wiring in `.claude/settings.json`, asserted on the resolved
 *      JSON object rather than on source text (AGENTS.md › Contract tests).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  SCORER_PATH_RULES,
  UNLOCK_FILE,
  evaluateScorerEdit,
  hookFilePaths,
  isScorerPath,
  isUnlocked,
  normalizeRelPath,
} from "../../scripts/lib/scorerLockRules.mjs";

const REPO_ROOT = process.cwd();
const SCRIPT = resolve(REPO_ROOT, "scripts/scorer-lock.mjs");

// Parsed, not regex-scanned: the assertions below run against the resolved object, so a
// commented-out or mis-nested hook reads as absent rather than as present.
const projectSettings: unknown = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ".claude/settings.json"), "utf8"),
);

describe("scorerLockRules — which paths are scorers", () => {
  it("treats every file under src/test/ as a scorer, helpers and setup included", () => {
    expect(isScorerPath("src/test/quick-log-save.test.tsx")).toBe(true);
    expect(isScorerPath("src/test/setup.ts")).toBe(true);
    expect(isScorerPath("src/test/helpers/reactRouterCompat.vitest.tsx")).toBe(true);
  });

  it("treats co-located *.test.* and *.spec.* files under src/ as scorers", () => {
    expect(isScorerPath("src/components/QuickLog.test.tsx")).toBe(true);
    expect(isScorerPath("src/pages/support/__tests__/support-forms.test.tsx")).toBe(true);
    expect(isScorerPath("src/lib/quickLogRules.spec.ts")).toBe(true);
  });

  it("treats Playwright specs, repository gate scripts and the required-checks pin as scorers", () => {
    expect(isScorerPath("e2e/quicklog-smoke.spec.ts")).toBe(true);
    expect(isScorerPath("e2e/lib/fixtureSafety.ts")).toBe(true);
    expect(isScorerPath("scripts/check-contract-test-resolution.mjs")).toBe(true);
    expect(isScorerPath("scripts/verify-edge-shared-in-sync.mjs")).toBe(true);
    expect(isScorerPath("scripts/assert-docs-safety.mjs")).toBe(true);
    expect(isScorerPath("config/required-status-checks.json")).toBe(true);
  });

  it("does not treat production code, docs, or other scripts as scorers", () => {
    expect(isScorerPath("src/lib/quickLogRules.ts")).toBe(false);
    expect(isScorerPath("src/components/QuickLog.tsx")).toBe(false);
    expect(isScorerPath("docs/agents/loop-engineering.md")).toBe(false);
    expect(isScorerPath("scripts/scorer-lock.mjs")).toBe(false);
    expect(isScorerPath("scripts/lib/scorerLockRules.mjs")).toBe(false);
    expect(isScorerPath("supabase/functions/_shared/lib/x.ts")).toBe(false);
  });

  it("normalises Windows separators and leading ./ before matching", () => {
    expect(normalizeRelPath("src\\test\\a.test.ts")).toBe("src/test/a.test.ts");
    expect(normalizeRelPath("./src/test/a.test.ts")).toBe("src/test/a.test.ts");
    expect(isScorerPath("src\\test\\a.test.ts")).toBe(true);
  });

  it("exposes the rule table as frozen data so a test can pin it", () => {
    expect(Object.isFrozen(SCORER_PATH_RULES)).toBe(true);
    expect(SCORER_PATH_RULES.length).toBeGreaterThanOrEqual(5);
  });
});

describe("scorerLockRules — unlock matching", () => {
  const entries = [
    { path: "src/test/a.test.ts", reason: "pin renegotiated with the behaviour change" },
    { path: "src/test/helpers/", reason: "helper refactor approved in the task" },
  ];

  it("matches an exact unlocked path", () => {
    expect(isUnlocked("src/test/a.test.ts", entries)).toBe(true);
  });

  it("matches a directory unlock only when the entry ends with a slash", () => {
    expect(isUnlocked("src/test/helpers/x.ts", entries)).toBe(true);
    expect(isUnlocked("src/test/helpersx.ts", entries)).toBe(false);
  });

  it("does not match a sibling or a prefix without a slash", () => {
    expect(isUnlocked("src/test/a.test.tsx", entries)).toBe(false);
    expect(isUnlocked("src/test/b.test.ts", entries)).toBe(false);
  });

  it("is null-safe for an empty or missing unlock list", () => {
    expect(isUnlocked("src/test/a.test.ts", [])).toBe(false);
    expect(isUnlocked("src/test/a.test.ts", undefined)).toBe(false);
  });
});

describe("scorerLockRules — evaluateScorerEdit", () => {
  it("allows a new check file (not yet tracked) so write-checks can create it", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/test/new-feature.test.ts",
      trackedAtHead: false,
      unlockedEntries: [],
    });
    expect(verdict.decision).toBe("allow");
  });

  it("refuses an edit to a tracked scorer that has not been unlocked", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/test/existing.test.ts",
      trackedAtHead: true,
      unlockedEntries: [],
    });
    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toContain("src/test/existing.test.ts");
    expect(verdict.reason).toContain("--unlock");
    expect(verdict.reason).toContain("loop-engineering.md");
  });

  it("allows an edit to a tracked scorer once it is unlocked", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/test/existing.test.ts",
      trackedAtHead: true,
      unlockedEntries: [{ path: "src/test/existing.test.ts", reason: "renegotiating the pin" }],
    });
    expect(verdict.decision).toBe("allow");
  });

  it("allows production code regardless of tracking or unlock state", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/lib/quickLogRules.ts",
      trackedAtHead: true,
      unlockedEntries: [],
    });
    expect(verdict.decision).toBe("allow");
  });

  it("is deterministic: the same input yields the same verdict", () => {
    const input = { relPath: "src/test/x.test.ts", trackedAtHead: true, unlockedEntries: [] };
    expect(evaluateScorerEdit(input)).toEqual(evaluateScorerEdit(input));
  });
});

describe("scorerLockRules — hookFilePaths", () => {
  it("reads file_path for Edit and Write, notebook_path for NotebookEdit", () => {
    expect(hookFilePaths({ tool_name: "Edit", tool_input: { file_path: "/r/a.ts" } })).toEqual([
      "/r/a.ts",
    ]);
    expect(
      hookFilePaths({ tool_name: "NotebookEdit", tool_input: { notebook_path: "/r/n.ipynb" } }),
    ).toEqual(["/r/n.ipynb"]);
  });

  it("returns an empty list for malformed or unrelated input", () => {
    expect(hookFilePaths(null)).toEqual([]);
    expect(hookFilePaths({})).toEqual([]);
    expect(hookFilePaths({ tool_name: "Bash", tool_input: { command: "ls" } })).toEqual([]);
  });
});

describe("scripts/scorer-lock.mjs --hook against a disposable repository", () => {
  let repo = "";

  const run = (args: string[], stdin = "") =>
    spawnSync("node", [SCRIPT, ...args], { cwd: repo, input: stdin, encoding: "utf8" });

  const hookInput = (relPath: string) =>
    JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(repo, relPath) } });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "scorer-lock-"));
    execFileSync("git", ["init", "-q", repo]);
    execFileSync("git", ["-C", repo, "config", "user.email", "scorer-lock@test.invalid"]);
    execFileSync("git", ["-C", repo, "config", "user.name", "scorer lock test"]);
    mkdirSync(join(repo, "src/test"), { recursive: true });
    mkdirSync(join(repo, "src/lib"), { recursive: true });
    writeFileSync(join(repo, "src/test/tracked.test.ts"), "export {};\n");
    writeFileSync(join(repo, "src/lib/rules.ts"), "export {};\n");
    execFileSync("git", ["-C", repo, "add", "."]);
    execFileSync("git", ["-C", repo, "commit", "-q", "-m", "approve checks"]);
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it("exit 2 with the refusal on stderr for a tracked, locked check", () => {
    const result = run(["--hook"], hookInput("src/test/tracked.test.ts"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("src/test/tracked.test.ts");
    expect(result.stderr).toContain("--unlock");
  });

  it("exit 0 for a new check file that is not tracked yet", () => {
    const result = run(["--hook"], hookInput("src/test/brand-new.test.ts"));
    expect(result.status).toBe(0);
  });

  it("exit 0 for production code", () => {
    const result = run(["--hook"], hookInput("src/lib/rules.ts"));
    expect(result.status).toBe(0);
  });

  it("exit 0 for a path outside the repository", () => {
    const outside = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: join(tmpdir(), "elsewhere", "src/test/x.test.ts") },
    });
    const result = run(["--hook"], outside);
    expect(result.status).toBe(0);
  });

  it("--unlock records the path and reason, after which the hook allows the edit", () => {
    const unlock = run([
      "--unlock",
      "src/test/tracked.test.ts",
      "--reason",
      "pin renegotiated in the same commit as the behaviour change",
    ]);
    expect(unlock.status).toBe(0);
    const stored = JSON.parse(readFileSync(join(repo, UNLOCK_FILE), "utf8"));
    expect(stored.unlocked[0].path).toBe("src/test/tracked.test.ts");
    expect(stored.unlocked[0].reason).toContain("renegotiated");

    const result = run(["--hook"], hookInput("src/test/tracked.test.ts"));
    expect(result.status).toBe(0);
  });

  it("--unlock without --reason is refused, so every unlock is explained", () => {
    const result = run(["--unlock", "src/test/tracked.test.ts"]);
    expect(result.status).not.toBe(0);
  });

  it("--lock clears the unlock file and the refusal returns", () => {
    expect(run(["--lock"]).status).toBe(0);
    expect(existsSync(join(repo, UNLOCK_FILE))).toBe(false);
    expect(run(["--hook"], hookInput("src/test/tracked.test.ts")).status).toBe(2);
  });

  it("--report lists modified tracked scorers and whether each is unlocked", () => {
    writeFileSync(join(repo, "src/test/tracked.test.ts"), "export const changed = 1;\n");
    const report = run(["--report"]);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain("src/test/tracked.test.ts");
    expect(report.stdout).toContain("LOCKED");
    const strict = run(["--report", "--strict"]);
    expect(strict.status).toBe(2);
  });

  it("fails open with a note when the input is not JSON", () => {
    const result = run(["--hook"], "not json");
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("scorer-lock");
  });
});

describe(".claude/settings.json — the hook is wired on the resolved object", () => {
  const preToolUse = (projectSettings as { hooks?: { PreToolUse?: unknown[] } }).hooks?.PreToolUse;

  it("declares a PreToolUse group for the file-writing tools", () => {
    expect(Array.isArray(preToolUse)).toBe(true);
    const group = (preToolUse as Array<{ matcher?: string; hooks?: unknown[] }>).find((g) =>
      (g.matcher ?? "").split("|").includes("Edit"),
    );
    expect(group).toBeDefined();
    const matcher = (group?.matcher ?? "").split("|");
    for (const tool of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) {
      expect(matcher).toContain(tool);
    }
  });

  it("runs scripts/scorer-lock.mjs --hook as a command hook", () => {
    const commands = (preToolUse as Array<{ hooks?: Array<{ type?: string; command?: string }> }>)
      .flatMap((g) => g.hooks ?? [])
      .filter((h) => h.type === "command")
      .map((h) => h.command ?? "");
    expect(
      commands.some((c) => c.includes("scripts/scorer-lock.mjs") && c.includes("--hook")),
    ).toBe(true);
  });

  it("the unlock file is ignored by git so an unlock never ships", () => {
    const gitignore = readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf8");
    expect(gitignore.split(/\r?\n/)).toContain(UNLOCK_FILE);
  });
});
