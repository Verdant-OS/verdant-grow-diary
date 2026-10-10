import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const guard = require("../../scripts/claude-slice-path-guard.cjs") as {
  normalizeRepoPath: (raw: unknown) => string | null;
  lockedPath: (raw: unknown) => boolean;
  compareNonBlobReason: (file: unknown) => string | null;
  LOCKED_EXACT_PATHS: string[];
};

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
    expect(guard.compareNonBlobReason({ type: "symlink" })).toBe("symlink-or-submodule");
    expect(guard.compareNonBlobReason({ type: "submodule" })).toBe("symlink-or-submodule");
    expect(guard.compareNonBlobReason({ mode: "120000" })).toBe("symlink-or-submodule");
    expect(guard.compareNonBlobReason({ mode: "160000" })).toBe("symlink-or-submodule");
    expect(guard.compareNonBlobReason({ mode: "100644" })).toBeNull();
    expect(guard.compareNonBlobReason({ filename: "src/lib/libraryRules.ts" })).toBeNull();
    expect(guard.compareNonBlobReason(null)).toBe("unparsable");
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
