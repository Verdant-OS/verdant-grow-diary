/**
 * Contract tests for the scorer lock (docs/agents/loop-engineering.md §3).
 *
 * The scorer lock is the repository's version of the "locked checks folder" in the
 * Karpathy-loop workflow: a check that already exists on the branch (tracked at HEAD)
 * may not be edited by an agent session unless that edit was declared first with
 * `node scripts/scorer-lock.mjs --unlock <path> --reason "<why>"`. A declaration is
 * bound to the branch it was made on and expires after 24 hours.
 *
 * Three layers are pinned here:
 *   1. the pure rules module (which paths are scorers, when an edit is refused, when an
 *      unlock is still in force, how a name-status diff becomes scorer rows);
 *   2. the CLI's `--hook`, `--unlock`, `--lock` and `--report` modes, run against
 *      disposable git repositories;
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
  UNLOCK_TTL_MS,
  evaluateScorerEdit,
  hookFilePaths,
  isScorerPath,
  isUnlockEntryValid,
  isUnlocked,
  normalizeRelPath,
  scorerRowsFromNameStatus,
} from "../../scripts/lib/scorerLockRules.mjs";

const REPO_ROOT = process.cwd();
const SCRIPT = resolve(REPO_ROOT, "scripts/scorer-lock.mjs");

// Parsed, not regex-scanned: the assertions below run against the resolved object, so a
// commented-out or mis-nested hook reads as absent rather than as present.
const projectSettings: unknown = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ".claude/settings.json"), "utf8"),
);

// A fixed clock for the pure tests. Nothing here reads Date.now().
const NOW = "2026-10-02T12:00:00.000Z";
const LATER = "2026-10-03T11:00:00.000Z";
const EARLIER = "2026-10-02T11:00:00.000Z";
const BRANCH = "claude/example-task";

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

  it("treats both Playwright lanes, e2e/ and e2e-local/, as scorers including their fixtures", () => {
    expect(isScorerPath("e2e/quicklog-smoke.spec.ts")).toBe(true);
    expect(isScorerPath("e2e/lib/fixtureSafety.ts")).toBe(true);
    expect(isScorerPath("e2e-local/native-save-retrieve.spec.ts")).toBe(true);
    expect(isScorerPath("e2e-local/lib/nativeLocalFixtures.ts")).toBe(true);
  });

  it("treats test and spec files outside src/ as scorers wherever they live", () => {
    expect(isScorerPath("supabase/functions/ai-doctor-review/index.test.ts")).toBe(true);
    expect(isScorerPath("scripts/lib/lighthouse-url-sharding.test.cjs")).toBe(true);
    expect(isScorerPath("spikes/convex-component-sandbox/sandbox.spec.ts")).toBe(true);
    expect(isScorerPath("plugins/verdant-claude-mods/verdant-guard/hooks/rules.test.ts")).toBe(
      true,
    );
  });

  it("treats repository gate scripts and the required-checks pin as scorers", () => {
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
    expect(isScorerPath("src/lib/testimonialsRules.ts")).toBe(false);
    expect(isScorerPath("src/lib/spectrumRules.ts")).toBe(false);
  });

  it("normalises Windows separators and leading ./ before matching", () => {
    expect(normalizeRelPath("src\\test\\a.test.ts")).toBe("src/test/a.test.ts");
    expect(normalizeRelPath("./src/test/a.test.ts")).toBe("src/test/a.test.ts");
    expect(isScorerPath("src\\test\\a.test.ts")).toBe(true);
    expect(isScorerPath("e2e-local\\native-save-retrieve.spec.ts")).toBe(true);
  });

  it("exposes the rule table as frozen data so a test can pin it", () => {
    expect(Object.isFrozen(SCORER_PATH_RULES)).toBe(true);
    expect(SCORER_PATH_RULES.length).toBeGreaterThanOrEqual(6);
    const prefixes = SCORER_PATH_RULES.filter((r) => r.kind === "prefix").map((r) => r.value);
    expect(prefixes).toEqual(expect.arrayContaining(["src/test/", "e2e/", "e2e-local/"]));
  });
});

describe("scorerLockRules — unlock validity", () => {
  const context = { now: NOW, branch: BRANCH };

  it("is valid before its expiry on the branch it was declared on", () => {
    expect(
      isUnlockEntryValid(
        { path: "src/test/a.test.ts", expires_at: LATER, branch: BRANCH },
        context,
      ),
    ).toBe(true);
  });

  it("is invalid once expired", () => {
    expect(
      isUnlockEntryValid(
        { path: "src/test/a.test.ts", expires_at: EARLIER, branch: BRANCH },
        context,
      ),
    ).toBe(false);
    expect(
      isUnlockEntryValid({ path: "src/test/a.test.ts", expires_at: NOW, branch: BRANCH }, context),
    ).toBe(false);
  });

  it("is invalid on a different branch", () => {
    expect(
      isUnlockEntryValid(
        { path: "src/test/a.test.ts", expires_at: LATER, branch: "codex/other-task" },
        context,
      ),
    ).toBe(false);
  });

  it("is never valid without an expiry, and never without a context", () => {
    expect(isUnlockEntryValid({ path: "src/test/a.test.ts", branch: BRANCH }, context)).toBe(false);
    expect(
      isUnlockEntryValid({ path: "src/test/a.test.ts", expires_at: LATER, branch: BRANCH }),
    ).toBe(false);
    expect(isUnlockEntryValid(null, context)).toBe(false);
  });

  it("pins the TTL at 24 hours, the handoff log's claim window", () => {
    expect(UNLOCK_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("scorerLockRules — unlock matching", () => {
  const context = { now: NOW, branch: BRANCH };
  const entries = [
    {
      path: "src/test/a.test.ts",
      reason: "pin renegotiated with the behaviour change",
      expires_at: LATER,
      branch: BRANCH,
    },
    {
      path: "src/test/helpers/",
      reason: "helper refactor approved in the task",
      expires_at: LATER,
      branch: BRANCH,
    },
    {
      path: "src/test/stale.test.ts",
      reason: "left behind by a session that was cut off",
      expires_at: EARLIER,
      branch: BRANCH,
    },
  ];

  it("matches an exact unlocked path", () => {
    expect(isUnlocked("src/test/a.test.ts", entries, context)).toBe(true);
  });

  it("matches a directory unlock only when the entry ends with a slash", () => {
    expect(isUnlocked("src/test/helpers/x.ts", entries, context)).toBe(true);
    expect(isUnlocked("src/test/helpersx.ts", entries, context)).toBe(false);
  });

  it("does not match a sibling or a prefix without a slash", () => {
    expect(isUnlocked("src/test/a.test.tsx", entries, context)).toBe(false);
    expect(isUnlocked("src/test/b.test.ts", entries, context)).toBe(false);
  });

  it("ignores an expired entry even though its path matches", () => {
    expect(isUnlocked("src/test/stale.test.ts", entries, context)).toBe(false);
  });

  it("ignores every entry on another branch", () => {
    expect(isUnlocked("src/test/a.test.ts", entries, { now: NOW, branch: "codex/other" })).toBe(
      false,
    );
  });

  it("treats a missing context as expired, so forgetting the clock is never lenient", () => {
    expect(isUnlocked("src/test/a.test.ts", entries)).toBe(false);
  });

  it("is null-safe for an empty or missing unlock list", () => {
    expect(isUnlocked("src/test/a.test.ts", [], context)).toBe(false);
    expect(isUnlocked("src/test/a.test.ts", undefined, context)).toBe(false);
  });
});

describe("scorerLockRules — evaluateScorerEdit", () => {
  it("allows a new check file (not yet tracked) so write-checks can create it", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/test/new-feature.test.ts",
      trackedAtHead: false,
      unlockedEntries: [],
      now: NOW,
      branch: BRANCH,
    });
    expect(verdict.decision).toBe("allow");
  });

  it("refuses an edit to a tracked scorer that has not been unlocked", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/test/existing.test.ts",
      trackedAtHead: true,
      unlockedEntries: [],
      now: NOW,
      branch: BRANCH,
    });
    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toContain("src/test/existing.test.ts");
    expect(verdict.reason).toContain("--unlock");
    expect(verdict.reason).toContain("loop-engineering.md");
  });

  it("allows an edit to a tracked scorer once it is unlocked, and refuses again once expired", () => {
    const entry = {
      path: "src/test/existing.test.ts",
      reason: "renegotiating the pin",
      expires_at: LATER,
      branch: BRANCH,
    };
    const live = evaluateScorerEdit({
      relPath: "src/test/existing.test.ts",
      trackedAtHead: true,
      unlockedEntries: [entry],
      now: NOW,
      branch: BRANCH,
    });
    expect(live.decision).toBe("allow");
    const expired = evaluateScorerEdit({
      relPath: "src/test/existing.test.ts",
      trackedAtHead: true,
      unlockedEntries: [entry],
      now: "2026-10-04T00:00:00.000Z",
      branch: BRANCH,
    });
    expect(expired.decision).toBe("deny");
  });

  it("allows production code regardless of tracking or unlock state", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/lib/quickLogRules.ts",
      trackedAtHead: true,
      unlockedEntries: [],
      now: NOW,
      branch: BRANCH,
    });
    expect(verdict.decision).toBe("allow");
  });

  it("is deterministic: the same input yields the same verdict", () => {
    const input = {
      relPath: "src/test/x.test.ts",
      trackedAtHead: true,
      unlockedEntries: [],
      now: NOW,
      branch: BRANCH,
    };
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

describe("scorerLockRules — scorerRowsFromNameStatus", () => {
  it("keeps modified, deleted and renamed scorers and drops everything else", () => {
    const rows = scorerRowsFromNameStatus(
      [
        "M\tsrc/test/a.test.ts",
        "M\tsrc/lib/rules.ts",
        "D\te2e/old.spec.ts",
        "D\tdocs/x.md",
        "R100\tsrc/test/b.test.ts\tsrc/test/renamed.test.ts",
        "R087\tsrc/lib/one.ts\tsrc/lib/two.ts",
        "A\tsrc/test/new.test.ts",
      ].join("\n"),
    );
    expect(rows).toEqual([
      { change: "modified", path: "src/test/a.test.ts" },
      { change: "deleted", path: "e2e/old.spec.ts" },
      { change: "renamed", path: "src/test/renamed.test.ts", from: "src/test/b.test.ts" },
    ]);
  });

  it("reports a rename that moves a check out of the scorer set, judged on the old path", () => {
    const rows = scorerRowsFromNameStatus("R095\tsrc/test/c.test.ts\tsrc/lib/c.ts");
    expect(rows).toEqual([{ change: "renamed", path: "src/lib/c.ts", from: "src/test/c.test.ts" }]);
  });

  it("is null-safe", () => {
    expect(scorerRowsFromNameStatus("")).toEqual([]);
    expect(scorerRowsFromNameStatus(undefined as unknown as string)).toEqual([]);
  });
});

function makeRepo(prefix: string): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q", "-b", "task/example", repo]);
  execFileSync("git", ["-C", repo, "config", "user.email", "scorer-lock@test.invalid"]);
  execFileSync("git", ["-C", repo, "config", "user.name", "scorer lock test"]);
  mkdirSync(join(repo, "src/test"), { recursive: true });
  mkdirSync(join(repo, "src/lib"), { recursive: true });
  mkdirSync(join(repo, "e2e-local"), { recursive: true });
  // Distinct contents, so git's rename detection pairs moving -> moved and nothing else.
  writeFileSync(join(repo, "src/test/tracked.test.ts"), "export const tracked = 1;\n");
  writeFileSync(join(repo, "src/test/doomed.test.ts"), "export const doomed = 2;\n");
  writeFileSync(join(repo, "src/test/moving.test.ts"), "export const moving = 3;\n");
  writeFileSync(join(repo, "e2e-local/native.spec.ts"), "export const native = 4;\n");
  writeFileSync(join(repo, "src/lib/rules.ts"), "export const rules = 5;\n");
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "commit", "-q", "-m", "approve checks"]);
  return repo;
}

describe("scripts/scorer-lock.mjs --hook and --unlock against a disposable repository", () => {
  let repo = "";

  const run = (args: string[], stdin = "") =>
    spawnSync("node", [SCRIPT, ...args], { cwd: repo, input: stdin, encoding: "utf8" });

  const hookInput = (relPath: string) =>
    JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(repo, relPath) } });

  beforeAll(() => {
    repo = makeRepo("scorer-lock-hook-");
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

  it("exit 2 for a tracked e2e-local spec, the lane Codex found uncovered", () => {
    const result = run(["--hook"], hookInput("e2e-local/native.spec.ts"));
    expect(result.status).toBe(2);
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

  it("--unlock records path, reason, branch and a 24-hour expiry, after which the hook allows the edit", () => {
    const unlock = run([
      "--unlock",
      "src/test/tracked.test.ts",
      "--reason",
      "pin renegotiated in the same commit as the behaviour change",
    ]);
    expect(unlock.status).toBe(0);
    const stored = JSON.parse(readFileSync(join(repo, UNLOCK_FILE), "utf8"));
    const entry = stored.unlocked[0];
    expect(entry.path).toBe("src/test/tracked.test.ts");
    expect(entry.reason).toContain("renegotiated");
    expect(entry.branch).toBe("task/example");
    expect(Date.parse(entry.expires_at) - Date.parse(entry.at)).toBe(UNLOCK_TTL_MS);

    const result = run(["--hook"], hookInput("src/test/tracked.test.ts"));
    expect(result.status).toBe(0);
  });

  it("--unlock without --reason is refused, so every unlock is explained", () => {
    const result = run(["--unlock", "src/test/tracked.test.ts"]);
    expect(result.status).not.toBe(0);
  });

  it("an expired unlock no longer allows the edit, and --status marks it EXPIRED", () => {
    writeFileSync(
      join(repo, UNLOCK_FILE),
      JSON.stringify({
        unlocked: [
          {
            path: "src/test/tracked.test.ts",
            reason: "left behind by a session that was cut off",
            at: "2026-01-01T00:00:00.000Z",
            expires_at: "2026-01-02T00:00:00.000Z",
            branch: "task/example",
          },
        ],
      }),
    );
    expect(run(["--hook"], hookInput("src/test/tracked.test.ts")).status).toBe(2);
    expect(run(["--status"]).stdout).toContain("EXPIRED");
  });

  it("an unlock declared on another branch does not carry over", () => {
    writeFileSync(
      join(repo, UNLOCK_FILE),
      JSON.stringify({
        unlocked: [
          {
            path: "src/test/tracked.test.ts",
            reason: "declared on a different task branch",
            at: new Date().toISOString(),
            expires_at: new Date(Date.now() + UNLOCK_TTL_MS).toISOString(),
            branch: "codex/other-task",
          },
        ],
      }),
    );
    expect(run(["--hook"], hookInput("src/test/tracked.test.ts")).status).toBe(2);
  });

  it("--lock clears the unlock file and the refusal returns", () => {
    expect(run(["--lock"]).status).toBe(0);
    expect(existsSync(join(repo, UNLOCK_FILE))).toBe(false);
    expect(run(["--hook"], hookInput("src/test/tracked.test.ts")).status).toBe(2);
  });

  it("fails open with a note when the input is not JSON", () => {
    const result = run(["--hook"], "not json");
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("scorer-lock");
  });
});

describe("scripts/scorer-lock.mjs --report against a disposable repository", () => {
  let repo = "";

  const run = (args: string[]) =>
    spawnSync("node", [SCRIPT, ...args], { cwd: repo, encoding: "utf8" });

  beforeAll(() => {
    repo = makeRepo("scorer-lock-report-");
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it("reports nothing when no tracked scorer changed", () => {
    const report = run(["--report", "--strict"]);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain("no tracked scorer");
  });

  it("lists a modified scorer as LOCKED and --strict exits 2", () => {
    writeFileSync(join(repo, "src/test/tracked.test.ts"), "export const changed = 1;\n");
    const report = run(["--report"]);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain("LOCKED   modified src/test/tracked.test.ts");
    expect(run(["--report", "--strict"]).status).toBe(2);
  });

  it("lists a deleted scorer, which --diff-filter=M alone would have hidden", () => {
    rmSync(join(repo, "src/test/doomed.test.ts"));
    const report = run(["--report", "--strict"]);
    expect(report.status).toBe(2);
    expect(report.stdout).toContain("LOCKED   deleted  src/test/doomed.test.ts");
  });

  it("lists a staged rename with both paths, judged on the old one", () => {
    execFileSync("git", ["-C", repo, "mv", "src/test/moving.test.ts", "src/test/moved.test.ts"]);
    const report = run(["--report", "--strict"]);
    expect(report.status).toBe(2);
    expect(report.stdout).toContain(
      "LOCKED   renamed  src/test/moving.test.ts -> src/test/moved.test.ts",
    );
  });

  it("shows UNLOCKED once each changed scorer is declared, and --strict exits 0", () => {
    const unlock = run([
      "--unlock",
      "src/test/tracked.test.ts",
      "src/test/doomed.test.ts",
      "src/test/moving.test.ts",
      "--reason",
      "pins renegotiated, one obsolete check removed, one moved with its module",
    ]);
    expect(unlock.status).toBe(0);
    const report = run(["--report", "--strict"]);
    expect(report.status).toBe(0);
    expect(report.stdout).not.toContain("LOCKED  ");
    expect(report.stdout).toContain("UNLOCKED modified src/test/tracked.test.ts");
    expect(report.stdout).toContain("UNLOCKED deleted  src/test/doomed.test.ts");
    expect(report.stdout).toContain("UNLOCKED renamed  src/test/moving.test.ts");
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
