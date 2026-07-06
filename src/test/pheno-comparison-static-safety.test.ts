/**
 * pheno-comparison-static-safety — static file scan proving the read-only
 * Pheno Comparison surface has no writes, no AI, no automation, no device
 * control, no supabase imports.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The read-only, network-free surface. Live siblings that legitimately read
// Supabase (phenoHuntCandidatesService, usePhenoHuntCandidates, PhenoHuntCompare)
// are intentionally excluded — their RLS-scoped reads are covered elsewhere.
const FILES = [
  "src/pages/PhenoComparison.tsx",
  "src/components/PhenoComparisonView.tsx",
  "src/lib/phenoComparisonViewModel.ts",
  "src/lib/phenoComparisonRules.ts",
  "src/lib/phenoComparisonFixtures.ts",
  "src/lib/phenoHuntCandidateAdapter.ts",
  "src/lib/phenoCandidatePostCureViewModel.ts",
];

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

/** Strip // line comments and /* block comments *\/ so denial language in
 * file headers doesn't false-positive. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("pheno comparison static safety", () => {
  for (const f of FILES) {
    it(`${f} has no forbidden imports or calls`, () => {
      const src = stripComments(read(f));
      expect(src, "no supabase").not.toMatch(/@\/integrations\/supabase/);
      expect(src, "no fetch call").not.toMatch(/\bfetch\s*\(/);
      expect(src, "no XMLHttpRequest").not.toMatch(/XMLHttpRequest/);
      expect(src, "no ai-doctor import").not.toMatch(/from\s+["'][^"']*ai-(doctor|coach)/i);
      expect(src, "no service_role").not.toMatch(/service_role/);
      expect(src, "no location write").not.toMatch(/location\.href\s*=/);
      expect(src, "no navigator sendBeacon").not.toMatch(/sendBeacon/);
    });
  }
});
