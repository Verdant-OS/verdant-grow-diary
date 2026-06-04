/**
 * EcoWitt ingest deployability guard.
 *
 * The Supabase edge bundler packages ONLY files under
 * `supabase/functions/<name>/`. Sibling-function imports and `src/`
 * imports break deployment. This test pins the import contract so the
 * function stays deployable.
 *
 * Rules:
 *  - Only imports from `../_shared/`, `npm:` specifiers, or relative
 *    files inside the function's own directory are allowed.
 *  - Imports from sibling functions (`../<other-fn>/`) are forbidden.
 *  - Imports from the React app (`../../../src/`, `@/`) are forbidden.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/ecowitt-ingest/index.ts"),
  "utf8",
);

function imports(src: string): string[] {
  const out: string[] = [];
  const re = /from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

describe("ecowitt-ingest deployability — import boundaries", () => {
  const specs = imports(SRC);

  it("has at least one import (sanity)", () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it("never imports from sibling supabase function folders", () => {
    const bad = specs.filter((s) =>
      /^\.\.\/(?!_shared\/)[a-z0-9_-]+\//i.test(s),
    );
    expect(bad, `forbidden sibling-function imports: ${bad.join(", ")}`).toEqual(
      [],
    );
  });

  it("never imports from the React app (`src/` or `@/`)", () => {
    const bad = specs.filter(
      (s) =>
        s.startsWith("@/") ||
        s.includes("/src/") ||
        /^\.\.\/\.\.\/\.\.\/src\//.test(s),
    );
    expect(bad, `forbidden app imports: ${bad.join(", ")}`).toEqual([]);
  });

  it("only uses npm:, ../_shared/, or same-dir relative specifiers", () => {
    const bad = specs.filter((s) => {
      if (s.startsWith("npm:")) return false;
      if (s.startsWith("../_shared/")) return false;
      if (s.startsWith("./")) return false;
      // bare https:// (e.g. esm.sh) is discouraged but not part of this test.
      return true;
    });
    expect(bad, `unexpected import specifiers: ${bad.join(", ")}`).toEqual([]);
  });
});
