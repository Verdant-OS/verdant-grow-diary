/**
 * genetics-propagation-purity-safety
 *
 * The genetics rules/view-model modules are presenter-grade pure logic: no
 * Supabase, no fetch, no React, no automation. This source-scan pins that so a
 * later refactor cannot smuggle I/O or a policy dependency into them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PURE_MODULES = [
  "src/lib/genetics/traceabilityTypes.ts",
  "src/lib/genetics/screeningEvidenceRules.ts",
  "src/lib/genetics/quarantineRules.ts",
  "src/lib/genetics/traceabilityViewModel.ts",
];

const FORBIDDEN = [
  "@/integrations/supabase",
  "supabase-js",
  "from \"react\"",
  "action-queue",
  "ActionQueue",
  "deviceControl",
  "device-control",
];

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("genetics propagation pure modules stay pure", () => {
  for (const mod of PURE_MODULES) {
    it(`${mod} has no I/O, framework, or automation dependency`, () => {
      const src = read(mod);
      for (const needle of FORBIDDEN) {
        expect(src, `${mod} must not reference ${needle}`).not.toContain(needle);
      }
      expect(src, `${mod} must not fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(src, `${mod} must not query a table`).not.toMatch(/\.from\(\s*["'`]/);
    });
  }

  it("never encodes a clean / pathogen-free evidence vocabulary", () => {
    for (const mod of PURE_MODULES) {
      const src = read(mod).toLowerCase();
      expect(src, `${mod} must not use pathogen_free`).not.toContain("pathogen_free");
      expect(src, `${mod} must not use pathogen-free`).not.toContain("pathogen-free");
    }
  });
});
