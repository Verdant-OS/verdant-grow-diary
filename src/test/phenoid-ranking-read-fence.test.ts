/**
 * PhenoID ranking-data read fence.
 *
 * The pheno doctrine (phenoid_addon_layer_foundation.sql) promises that core
 * Verdant NEVER reads or ranks by the imported PhenoID ranking data:
 * `winner_score`, `loud_shortlist`, and the `phenoid_*` tables. Until now that
 * was a comment; this test makes it an enforced invariant — the columns and
 * tables are one render away from a "Verdant picks winners" contract breach.
 *
 * Allowed references (each documented):
 *  - src/integrations/supabase/types.ts — generated DB types, unavoidable.
 *  - src/lib/phenoIdIngestMapping.ts — the pure PhenoID→Verdant ingest
 *    WRITE-conduit (dual-write payload builder). It carries the values INTO
 *    the gated add-on layer; it never reads them back or renders them.
 *  - src/test/** — tests may reference the names (this file included).
 *
 * Everything else in src/** must stay clean. If a future feature legitimately
 * needs to READ this data (e.g. a gated PhenoID viewer), add it here with a
 * comment explaining why — that forces the contract conversation instead of
 * letting a ranking UI slip in silently.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "..");

const EXEMPT = new Set(
  ["integrations/supabase/types.ts", "lib/phenoIdIngestMapping.ts"].map((p) =>
    resolve(SRC, p).split("\\").join("/"),
  ),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      // Tests may reference the fenced names (including this file).
      if (full.split("\\").join("/").endsWith("/src/test")) continue;
      walk(full, out);
    } else if (/\.(t|j)sx?$/.test(entry)) {
      out.push(full.split("\\").join("/"));
    }
  }
  return out;
}

describe("PhenoID ranking-data read fence", () => {
  const files = walk(SRC).filter((f) => !EXEMPT.has(f));

  it("no core src module references winner_score or loud_shortlist", () => {
    const offenders = files
      .filter((f) => /winner_score|loud_shortlist/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(f.lastIndexOf("/src/") + 5));
    expect(offenders).toEqual([]);
  });

  it("no core src module queries the phenoid_* tables (closes the select-* hole)", () => {
    const offenders = files
      .filter((f) => /from\(\s*["'`]phenoid_/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(f.lastIndexOf("/src/") + 5));
    expect(offenders).toEqual([]);
  });

  it("the exempt ingest conduit is still a pure write-path module (no supabase import, no JSX)", () => {
    const conduit = readFileSync(resolve(SRC, "lib/phenoIdIngestMapping.ts"), "utf8");
    expect(conduit).not.toMatch(/@\/integrations\/supabase/);
    expect(conduit).not.toMatch(/from\(\s*["'`]phenoid_/);
    // Pure module: exemption is for carrying values INTO the add-on layer only.
    expect(conduit).toContain("pure");
  });
});
