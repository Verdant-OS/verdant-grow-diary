/**
 * pheno-scale-up-static-safety — hard-fence static assertions for the Pheno
 * Hunt scale-up files. Comments are stripped first (doc comments legitimately
 * describe these fences), so only executable CODE is scanned. Guards against:
 * ranking/winner language, automatic candidate numbering / allocators, auto
 * Action Queue writes, device control / automation, AI imports, and any
 * client-side service_role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/phenoCandidateIdentity.ts",
  "src/lib/phenoCandidateReadiness.ts",
  "src/lib/phenoCandidateNumberService.ts",
  "src/lib/phenoComparisonCohort.ts",
  "src/lib/phenoHuntCandidatesService.ts",
  "src/lib/phenoHuntCsvExport.ts",
  "src/hooks/usePhenoHuntWorkspace.ts",
  "src/pages/PhenoHuntWorkspace.tsx",
  "src/pages/PhenoHuntCompare.tsx",
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const sources = Object.fromEntries(
  FILES.map((f) => [f, stripComments(readFileSync(resolve(process.cwd(), f), "utf8"))]),
) as Record<string, string>;

describe("pheno scale-up — hard safety fences (code only)", () => {
  it("never uses service_role, bridge tokens, or service secrets in client code", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/service[_-]?role/i);
      expect(src, path).not.toMatch(/SUPABASE_SERVICE_ROLE/);
      expect(src, path).not.toMatch(/bridge[_-]?token/i);
    }
  });

  it("never imports AI / alerts / action-queue modules or writes action_queue", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/ai/i);
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/alerts/i);
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/actionQueue/i);
      expect(src, path).not.toMatch(/action_queue/i);
    }
  });

  it("never touches device control / automation surfaces", () => {
    for (const [path, src] of Object.entries(sources)) {
      const lower = src.toLowerCase();
      expect(lower, path).not.toMatch(/device[_-]?control/);
      expect(lower, path).not.toMatch(/device_command/);
      expect(lower, path).not.toMatch(/actuator|autopilot|target_device/);
      expect(lower, path).not.toMatch(/\bmqtt\b/);
    }
  });

  it("never ranks candidates or picks a winner / best pheno", () => {
    for (const [path, src] of Object.entries(sources)) {
      const lower = src.toLowerCase();
      expect(lower, path).not.toMatch(/\bwinner\b/);
      expect(lower, path).not.toMatch(/\bbest\s+pheno\b/);
      expect(lower, path).not.toMatch(/auto[-_ ]?select/);
      expect(lower, path).not.toMatch(/auto[-_ ]?rank/);
    }
  });

  it("never auto-allocates a candidate number (no allocator RPC, no 'next number')", () => {
    const svc = sources["src/lib/phenoCandidateNumberService.ts"];
    // The confirmed contract: assignment is a manual owner-chosen UPDATE. No
    // allocator RPC, no computed "next" number.
    expect(svc).not.toMatch(/allocate_pheno_candidate_number/);
    expect(svc).not.toMatch(/\.rpc\(/);
    expect(svc).not.toMatch(/next[_-]?number|nextNumber|Math\.max/i);
    // Assignment writes candidate_number and never auto-increments a sequence.
    expect(svc).not.toMatch(/nextval|sequence/i);
  });

  it("the assignment write is an UPDATE, never an INSERT/upsert of a numbering table", () => {
    const svc = sources["src/lib/phenoCandidateNumberService.ts"];
    expect(svc).toMatch(/\.update\(\{\s*candidate_number/);
    expect(svc).not.toMatch(/pheno_candidate_numbers/); // no separate numbering table
  });
});
