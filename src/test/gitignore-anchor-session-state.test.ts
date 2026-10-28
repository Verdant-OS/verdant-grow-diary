/**
 * #2059: local anchor-memory hook session state must stay out of version control.
 * PR #2089 restores the handoff record only; this pins the shipped .gitignore rule.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const GITIGNORE = resolve(REPO_ROOT, ".gitignore");
const ANCHOR_IGNORE_LINE = ".anchor/";

describe("root .gitignore — anchor session state", () => {
  it("lists .anchor/ after the scorer-unlock entry with an explanatory comment", () => {
    const lines = readFileSync(GITIGNORE, "utf8").split(/\r?\n/);
    const unlockIndex = lines.indexOf(".claude/scorer-unlock.json");
    const anchorIndex = lines.indexOf(ANCHOR_IGNORE_LINE);
    expect(unlockIndex).toBeGreaterThanOrEqual(0);
    expect(anchorIndex).toBeGreaterThan(unlockIndex);
    expect(lines.slice(Math.max(0, anchorIndex - 2), anchorIndex).join("\n")).toMatch(
      /anchor-memory hook/i,
    );
  });

  it("git check-ignore treats .anchor/session-state.md as ignored", () => {
    const result = spawnSync("git", ["check-ignore", "-q", "--", ".anchor/session-state.md"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // Strip GIT_* so a run from a git hook queries this repo, not the one being committed to.
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))),
    });
    expect(result.status).toBe(0);
    expect(result.error).toBeUndefined();
  });
});
