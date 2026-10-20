/**
 * VER-189 — docs/specs/dashboard-canonical-tent-vpd.md contract.
 *
 * Pins the specification artifact shipped in #2277 so acceptance IDs and the
 * planned test/module names cannot drift silently before the build lands.
 *
 * @source-scan-justified: markdown spec is not importable; IDs are stable product contracts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SPEC_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../docs/specs/dashboard-canonical-tent-vpd.md",
);

function specText(): string {
  return readFileSync(SPEC_PATH, "utf8");
}

describe("dashboard-canonical-tent-vpd spec contract (#2277)", () => {
  it("exists and remains specification-only until implementation", () => {
    const text = specText();
    expect(text).toContain("**Status:** Specification only");
    expect(text).toContain("VER-189");
    expect(text).toContain("canonicalTentVpdRules.ts");
  });

  it("lists every acceptance test id CVP-01 through CVP-44", () => {
    const text = specText();
    for (let n = 1; n <= 44; n += 1) {
      const id = n === 6 ? "CVP-06" : `CVP-${String(n).padStart(2, "0")}`;
      if (n === 6) {
        expect(text).toMatch(/\| CVP-06\s+\|/);
        expect(text).toMatch(/\| CVP-06b\s+\|/);
        continue;
      }
      expect(text).toMatch(new RegExp(`\\| ${id}\\s+\\|`));
    }
  });

  it("names the resolver module and its dedicated unit test file in the file plan", () => {
    const text = specText();
    expect(text).toContain("src/lib/canonicalTentVpdRules.ts");
    expect(text).toContain("src/test/canonical-tent-vpd-rules.test.ts");
    expect(text).toContain("src/test/dashboard-vpd-single-source.test.tsx");
  });
});
