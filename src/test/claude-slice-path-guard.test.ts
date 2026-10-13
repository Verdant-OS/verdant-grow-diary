import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const guard = require("../../scripts/claude-slice-path-guard.cjs") as {
  normalizeRepoPath: (raw: unknown) => string | null;
  lockedPath: (raw: unknown) => boolean;
  compareNonBlobReason: (file: unknown, trees?: unknown) => string | null;
  assertCompareComplete: (compare: unknown) => void;
  parseRawDiff: (raw: Buffer | string) => Array<{
    oldMode: string;
    newMode: string;
    status: string;
    path: string;
    oldPath?: string;
  }>;
  recordModeReason: (record: { oldMode: string; newMode: string; status: string }) => string | null;
  LOCKED_EXACT_PATHS: string[];
  LOCKED_PREFIXES: string[];
};

const BLOB = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function trees(head: Array<Record<string, string>>, base: Array<Record<string, string>> = []) {
  return {
    head: { truncated: false, tree: head },
    base: { truncated: false, tree: base },
  };
}

const WORKFLOW = ".github/workflows/claude-slices.yml";

function markerBody(source: string): string {
  const start = source.indexOf("// path-guard-source:begin\n");
  const end = source.indexOf("// path-guard-source:end");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end).replace(/\r\n/g, "\n");
}

describe("claude slice path guard", () => {
  it("workflow embeds the same path guard as the script", () => {
    const script = markerBody(readFileSync("scripts/claude-slice-path-guard.cjs", "utf8"));
    const workflow = readFileSync(WORKFLOW, "utf8");
    const embedded = markerBody(workflow)
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n");
    expect(embedded).toBe(script);
  });

  it("exact locked paths and case variants are blocked", () => {
    for (const path of [
      "src/pages/ResetPassword.tsx",
      "SRC/Pages/resetpassword.tsx",
      "src/lib/pendingOutcomeReviewRules.ts",
      "SRC/LIB/PENDINGOUTCOMEREVIEWRULES.TS",
    ]) {
      expect(guard.lockedPath(path), path).toBe(true);
    }
    expect(guard.LOCKED_EXACT_PATHS).toContain("src/pages/resetpassword.tsx");
    expect(guard.LOCKED_EXACT_PATHS).toContain("src/lib/pendingoutcomereviewrules.ts");
  });

  it("dot segments collapse and repo-root escapes fail closed", () => {
    expect(guard.lockedPath("src/./pages/ResetPassword.tsx")).toBe(true);
    expect(guard.lockedPath("./src/pages/../pages/ResetPassword.tsx")).toBe(true);
    expect(guard.lockedPath("src/lib/./pendingOutcomeReviewRules.ts")).toBe(true);
    expect(guard.lockedPath("src/foo/../../src/lib/pendingOutcomeReviewRules.ts")).toBe(true);
    expect(guard.lockedPath("../src/lib/libraryRules.ts")).toBe(true);
    expect(guard.lockedPath("src/../../outside.ts")).toBe(true);
    expect(guard.lockedPath("/src/lib/libraryRules.ts")).toBe(true);
    expect(guard.lockedPath("")).toBe(true);
    expect(guard.lockedPath(null)).toBe(true);
    expect(guard.lockedPath(undefined)).toBe(true);
    expect(guard.normalizeRepoPath("../src/lib/libraryRules.ts")).toBeNull();
    expect(guard.normalizeRepoPath("./src/lib/libraryRules.ts")).toBe("src/lib/libraryRules.ts");
  });

  it("an allowed path passes, including dot and case variants", () => {
    for (const path of [
      "./src/lib/libraryRules.ts",
      "src/lib/./libraryRules.ts",
      "SRC/LIB/LIBRARYRULES.TS",
    ]) {
      expect(guard.lockedPath(path), path).toBe(false);
    }
  });

  it("symlink and submodule compare entries are rejected without a text scan", () => {
    const symlink = {
      filename: "src/lib/escapeLink.ts",
      status: "added",
      sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    expect(
      guard.compareNonBlobReason(
        symlink,
        trees([
          {
            path: "src/lib/escapeLink.ts",
            mode: "120000",
            type: "blob",
            sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
        ]),
      ),
    ).toBe("symlink-or-submodule");
    const submodule = {
      filename: "vendor/mod",
      status: "added",
      sha: "cccccccccccccccccccccccccccccccccccccccc",
    };
    expect(
      guard.compareNonBlobReason(
        submodule,
        trees([
          {
            path: "vendor/mod",
            mode: "160000",
            type: "commit",
            sha: "cccccccccccccccccccccccccccccccccccccccc",
          },
        ]),
      ),
    ).toBe("symlink-or-submodule");
    expect(
      guard.compareNonBlobReason(
        { filename: "src/lib/libraryRules.ts", status: "modified", sha: BLOB },
        trees(
          [{ path: "src/lib/libraryRules.ts", mode: "100644", type: "blob", sha: BLOB }],
          [{ path: "src/lib/libraryRules.ts", mode: "100644", type: "blob", sha: BLOB }],
        ),
      ),
    ).toBeNull();
    expect(
      guard.compareNonBlobReason(
        {
          filename: "src/lib/libraryRules.ts",
          status: "added",
          sha: BLOB,
          type: "symlink",
          mode: "120000",
        },
        trees([{ path: "src/lib/libraryRules.ts", mode: "100644", type: "blob", sha: BLOB }]),
      ),
    ).toBeNull();
    expect(
      guard.compareNonBlobReason(
        { filename: "src/lib/escapeLink.ts", status: "added", sha: BLOB },
        trees([{ path: "src/lib/escapeLink.ts", type: "symlink" }]),
      ),
    ).toBe("symlink-or-submodule");
    expect(
      guard.compareNonBlobReason(
        { filename: "src/lib/libraryRules.ts", status: "added", sha: BLOB },
        trees([{ path: "src/lib/libraryRules.ts", type: "file" }]),
      ),
    ).toBe("mode-unknown");
    expect(
      guard.compareNonBlobReason(
        { filename: "src/lib/libraryRules.ts", status: "added", sha: BLOB },
        trees([]),
      ),
    ).toBe("mode-unknown");
    expect(
      guard.compareNonBlobReason(
        { filename: "src/lib/libraryRules.ts", status: "added", sha: BLOB },
        {
          head: {
            truncated: true,
            tree: [{ path: "src/lib/libraryRules.ts", mode: "100644", type: "blob" }],
          },
          base: { truncated: false, tree: [] },
        },
      ),
    ).toBe("mode-unknown");
    expect(
      guard.compareNonBlobReason({ filename: "src/lib/libraryRules.ts", status: "added" }),
    ).toBe("mode-unknown");
    expect(guard.compareNonBlobReason(null)).toBe("unparsable");
    const raw = Buffer.from(
      ":000000 120000 0000000 f864791 A\0src/lib/escapeLink.ts\0" +
        ":000000 160000 0000000 02e356b A\0vendor/mod\0" +
        ":100644 100644 aaaaaaa bbbbbbb R100\0src/lib/old.ts\0src/pages/ResetPassword.tsx\0",
    );
    const records = guard.parseRawDiff(raw);
    expect(records.map((record) => [record.status, record.path, record.oldPath])).toEqual([
      ["A", "src/lib/escapeLink.ts", undefined],
      ["A", "vendor/mod", undefined],
      ["R", "src/pages/ResetPassword.tsx", "src/lib/old.ts"],
    ]);
    expect(guard.recordModeReason(records[0])).toBe("symlink-or-submodule");
    expect(guard.recordModeReason(records[1])).toBe("symlink-or-submodule");
    expect(guard.recordModeReason(records[2])).toBeNull();
    expect(() => guard.parseRawDiff(Buffer.from("not a diff\0path\0"))).toThrow(/Unparsable/);
  });

  it("normalizes compatibility characters and trailing dots before locking", () => {
    expect(guard.normalizeRepoPath("src\uFF0Fpages\uFF0FResetPassword.tsx")).toBe(
      "src/pages/ResetPassword.tsx",
    );
    expect(guard.normalizeRepoPath("src/pages/ResetPassword.tsx.")).toBe(
      "src/pages/ResetPassword.tsx",
    );
    expect(guard.normalizeRepoPath("src/pages/ResetPassword.tsx ")).toBe(
      "src/pages/ResetPassword.tsx",
    );
    expect(guard.normalizeRepoPath("src/lib/foo..bar.ts")).toBe("src/lib/foo..bar.ts");
    expect(guard.lockedPath("src\uFF0Fpages\uFF0FResetPassword.tsx")).toBe(true);
    expect(guard.lockedPath("src/pages/ResetPassword.tsx.")).toBe(true);
    expect(guard.lockedPath("src/pages/ResetPassword.tsx ")).toBe(true);
    expect(guard.lockedPath("src/lib/libraryRules.ts.")).toBe(false);
    expect(guard.lockedPath("src/lib/foo..bar.ts")).toBe(false);
  });

  it("locks required-check config and husky hooks", () => {
    expect(guard.LOCKED_EXACT_PATHS).toContain("config/required-status-checks.json");
    expect(guard.LOCKED_EXACT_PATHS).toContain("config/dependency-lockfile-transition.json");
    expect(guard.LOCKED_PREFIXES).toContain(".husky/");
    for (const path of [
      "config/required-status-checks.json",
      "CONFIG/Required-Status-Checks.json",
      "config/dependency-lockfile-transition.json",
      "config/dependency-lockfile-transition.json.",
      ".husky/pre-commit",
      ".husky",
    ]) {
      expect(guard.lockedPath(path), path).toBe(true);
    }
  });

  it("fails closed when the compare file list is empty or capped", () => {
    expect(() => guard.assertCompareComplete({ files: [], ahead_by: 0 })).not.toThrow();
    expect(() => guard.assertCompareComplete({ files: [], ahead_by: 2 })).toThrow(/no files/);
    expect(() => guard.assertCompareComplete({ files: [{ filename: "a.ts" }] })).toThrow(
      /ahead_by/,
    );
    expect(() =>
      guard.assertCompareComplete({
        files: Array.from({ length: 300 }, () => ({ filename: "a.ts" })),
        ahead_by: 1,
      }),
    ).toThrow(/300/);
  });

  it("publishes and filters claude-slice branches and does not fetch a PR head", () => {
    const workflow = readFileSync(WORKFLOW, "utf8");
    expect(workflow).toContain("branch_prefix: claude-slice/");
    expect(workflow).toContain("Bash(git switch -c claude-slice/*)");
    expect(workflow).toContain("startsWith(github.head_ref, 'claude-slice/')");
    expect(workflow.match(/\^claude-slice\/\[A-Za-z0-9\._-\]\+\$/g)).toHaveLength(2);
    expect(workflow).not.toContain("branch_prefix: claude/");
    expect(workflow).not.toContain("startsWith(github.head_ref, 'claude/')");
    expect(workflow.match(/\bgit\s+fetch\b/g) ?? []).toHaveLength(0);
    expect(workflow.match(/\bgit\s+pull\b/g) ?? []).toHaveLength(0);
    expect(workflow.match(/refs\/pull\//g) ?? []).toHaveLength(0);
  });
});
