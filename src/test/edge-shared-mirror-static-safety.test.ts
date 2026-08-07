/**
 * Static-safety fence for the edge shared-lib mirror.
 *
 * Fails if any supabase/functions/**\/*.ts file (outside the generated
 * mirror at supabase/functions/_shared/lib/**) imports src/lib/**,
 * src/constants/**, or @/integrations/supabase/types directly. Those
 * imports must go through the generated mirror; see docs/edge-shared-sync.md.
 *
 * Also defers broad @/ / browser-module scanning to
 * scripts/check-no-src-lib-imports.mjs (CI preflight + this suite via import).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { findForbiddenImportsInSource } from "../../scripts/check-no-src-lib-imports.mjs";

const ROOT = resolve(__dirname, "..", "..");
const FUNCTIONS = join(ROOT, "supabase", "functions");
const MIRROR = join(FUNCTIONS, "_shared", "lib");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)(?:\s+[\s\S]*?\s+from)?\s*["']([^"']+)["']/g;

function specifiersOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) out.push(m[1]);
  return out;
}

describe("edge functions: no direct src/lib reach", () => {
  const files = walk(FUNCTIONS).filter(
    (f) => f.endsWith(".ts") && !f.startsWith(MIRROR + sep) && f !== MIRROR,
  );

  it("finds at least one edge-function .ts file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    const rel = relative(ROOT, f);
    it(`${rel} imports only via _shared/lib mirror`, () => {
      const src = readFileSync(f, "utf8");
      const bad = specifiersOf(src).filter(
        (s) =>
          s.startsWith("@/lib/") ||
          s.startsWith("@/constants/") ||
          s === "@/integrations/supabase/types" ||
          /(\.\.\/){2,}src\//.test(s),
      );
      expect(bad, `unmirrored imports: ${bad.join(", ")}`).toEqual([]);
    });
  }
});

describe("edge functions: check-no-src-lib-imports scan (full tree)", () => {
  const files = walk(FUNCTIONS).filter((f) => /\.tsx?$/.test(f));

  it("finds typescript under supabase/functions", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("every function file is free of @/, src escapes, Windows paths, and browser bare modules", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const hits = findForbiddenImportsInSource(readFileSync(f, "utf8"));
      for (const h of hits) {
        offenders.push(`${relative(ROOT, f)} → ${h.spec} (${h.reason})`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("edge shared mirror formatting contract", () => {
  it("keeps canonical and mirrored generated Supabase types out of Prettier", () => {
    const ignored = readFileSync(join(ROOT, ".prettierignore"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    expect(ignored).toEqual(
      expect.arrayContaining([
        "src/integrations/supabase/types.ts",
        "supabase/functions/_shared/lib/integrations/supabase/types.ts",
      ]),
    );
  });
});
