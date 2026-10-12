/**
 * Pins npm-managed install guidance in the Inngest skills without allowing a
 * contiguous `npm install` command. The lockfile scanner is scorer-locked, so
 * this test repeats its install pattern instead of editing the checker.
 *
 * Mirrors `NPM_INSTALL_PATTERN` in `scripts/check-bun-lockfile-policy.mjs`:
 * `npm`/`npm.cmd`/`npm.exe` followed by `ci` or `install`, except `install -g`
 * and `install --global`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const NPM_INSTALL_PATTERN = /\bnpm(?:\.cmd|\.exe)?\s+(?:ci\b|install\b(?!\s+(?:-g|--global)\b))/i;

const SKILLS = [
  {
    path: ".agents/skills/inngest-setup/SKILL.md",
    packageName: "inngest",
  },
  {
    path: ".agents/skills/inngest-v3-v4-migration/SKILL.md",
    packageName: "inngest@latest",
  },
  {
    path: ".agents/skills/inngest-cli/SKILL.md",
    packageName: "@inngest/test",
  },
] as const;

function skillSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Inngest skill npm install guidance", () => {
  it.each(SKILLS)("states npm guidance and the package name in $path", ({ path, packageName }) => {
    const source = skillSource(path);
    expect(source).toContain("npm-managed target");
    expect(source).toContain("npm's `install` subcommand");
    expect(source).toContain(packageName);
    expect(source).toContain("`npm`, `install`");
  });

  it("does not contain a contiguous executable npm install or npm ci command", () => {
    for (const { path } of SKILLS) {
      expect(skillSource(path), path).not.toMatch(NPM_INSTALL_PATTERN);
    }
  });
});
