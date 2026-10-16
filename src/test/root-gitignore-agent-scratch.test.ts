/**
 * Root .gitignore must keep agent-plugin scratch dirs out of version control.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const ROOT_GITIGNORE = resolve(REPO_ROOT, ".gitignore");

describe("root .gitignore agent scratch", () => {
  it("ignores simple-workflow plugin scratch at the checkout root only", () => {
    const lines = readFileSync(ROOT_GITIGNORE, "utf8").split(/\r?\n/);
    expect(lines).toContain("/.simple-workflow");
  });
});
