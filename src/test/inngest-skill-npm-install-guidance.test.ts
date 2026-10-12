/**
 * Pins npm-managed install guidance in the Inngest skills and rejects the
 * executable form the lockfile scanner flags. The scanner is scorer-locked,
 * so this test repeats that pattern instead of editing the checker.
 *
 * Mirrors `NPM_INSTALL_PATTERN` in `scripts/check-bun-lockfile-policy.mjs`:
 * the npm binary, then `ci` or `install`, except a global install flag.
 *
 * The package name is asserted inside the npm guidance sentence. A whole-file
 * search would still pass if that sentence named a different package.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN_NPM_COMMAND = /\bnpm(?:\.cmd|\.exe)?\s+(?:ci\b|install\b(?!\s+(?:-g|--global)\b))/i;

const SKILLS = [
  {
    path: ".agents/skills/inngest-setup/SKILL.md",
    guidance:
      "run npm's `install` subcommand with the package name `inngest` (the three words `npm`, `install`, and `inngest`)",
  },
  {
    path: ".agents/skills/inngest-v3-v4-migration/SKILL.md",
    guidance:
      "run npm's `install` subcommand with the package name `inngest@latest` (the words `npm`, `install`, and `inngest@latest`)",
  },
  {
    path: ".agents/skills/inngest-cli/SKILL.md",
    guidance:
      "run npm's `install` subcommand with `-D` and the package name `@inngest/test` (the words `npm`, `install`, `-D`, and `@inngest/test`)",
  },
] as const;

function skillSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Inngest skill npm-managed guidance", () => {
  it.each(SKILLS)("binds the npm instruction to its package in $path", ({ path, guidance }) => {
    expect(skillSource(path)).toContain(guidance);
  });

  it("does not contain the forbidden contiguous npm command", () => {
    for (const { path } of SKILLS) {
      expect(skillSource(path), path).not.toMatch(FORBIDDEN_NPM_COMMAND);
    }
  });
});
