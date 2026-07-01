/**
 * pheno-comparison-static-safety — static file scan proving the read-only
 * Pheno Comparison surface has no writes, no AI, no automation, no device
 * control, no supabase imports.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/pages/PhenoComparison.tsx",
  "src/lib/phenoComparisonViewModel.ts",
  "src/lib/phenoComparisonRules.ts",
  "src/lib/phenoComparisonFixtures.ts",
];

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("pheno comparison static safety", () => {
  for (const f of FILES) {
    it(`${f} has no forbidden imports or language`, () => {
      const src = read(f);
      expect(src, "no supabase").not.toMatch(/@\/integrations\/supabase/);
      expect(src, "no fetch").not.toMatch(/\bfetch\s*\(/);
      expect(src, "no XMLHttpRequest").not.toMatch(/XMLHttpRequest/);
      expect(src, "no ai-doctor call").not.toMatch(/ai-doctor|ai-coach/i);
      expect(src, "no action queue write").not.toMatch(/action.?queue/i);
      expect(src, "no device control").not.toMatch(/device.?control/i);
      expect(src, "no automation").not.toMatch(/\bautomation\b/i);
      expect(src, "no service_role").not.toMatch(/service_role/);
      expect(src, "no window.location write").not.toMatch(
        /location\.href\s*=/,
      );
    });
  }
});
