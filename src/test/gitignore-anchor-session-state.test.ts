/**
 * #2059: local anchor-memory hook session state must stay out of version control.
 * PR #2089 restores the handoff record only; this pins the shipped .gitignore rule.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("root .gitignore — anchor session state", () => {
  it("git check-ignore treats .anchor/session-state.md as ignored", () => {
    const result = spawnSync("git", ["check-ignore", "-q", "--", ".anchor/session-state.md"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // Strip GIT_* so a run from a git hook queries this repo, not the one being committed to.
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))),
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });
});
