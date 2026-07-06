/**
 * pheno-hunt-workspace-safety — static safety scan of the hunt workspace WRITE
 * surface (services + hook + page). These files legitimately write the grower's
 * OWN data via RLS-scoped upserts, but must never: use service_role, import
 * AI/alerts/action-queue modules, touch device-control/automation surfaces,
 * delete plant rows, or use public/customer-mode language.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/phenoCandidateScoresService.ts",
  "src/lib/phenoKeeperDecisionService.ts",
  "src/lib/phenoScoreRoundsService.ts",
  "src/hooks/usePhenoHuntWorkspace.ts",
  "src/pages/PhenoHuntWorkspace.tsx",
];

/** Tables the workspace write surface is allowed to write. */
const ALLOWED_WRITE_TABLES = [
  "pheno_candidate_scores",
  "pheno_keeper_decisions",
  "pheno_score_rounds",
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const sources = Object.fromEntries(
  FILES.map((f) => [f, stripComments(readFileSync(resolve(process.cwd(), f), "utf8"))]),
) as Record<string, string>;

describe("pheno hunt workspace — write-surface static safety", () => {
  it("never uses service_role or bridge tokens", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/service[_-]?role/i);
      expect(src, path).not.toMatch(/SUPABASE_SERVICE_ROLE/);
      expect(src, path).not.toMatch(/bridge[_-]?token/i);
    }
  });

  it("never imports AI / alerts / action-queue modules", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/ai/i);
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/alerts/i);
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/actionQueue/i);
      expect(src, path).not.toMatch(/action_queue/i);
    }
  });

  it("never touches device-control / automation surfaces", () => {
    for (const [path, src] of Object.entries(sources)) {
      const lower = src.toLowerCase();
      expect(lower, path).not.toMatch(/device[_-]?control/);
      expect(lower, path).not.toMatch(/device_command/);
      expect(lower, path).not.toMatch(/\bautomation\b/);
      expect(lower, path).not.toMatch(/autopilot|target_device|actuator|\bmqtt\b/);
      expect(lower, path).not.toMatch(/\bauto[-_ ]?execute\b/);
    }
  });

  it("only writes the two candidate-owned tables and never deletes plant rows", () => {
    // Split on each `.from(...)` and assert no chained .delete() on plants,
    // and that writes target only the scores/decisions tables.
    for (const [path, src] of Object.entries(sources)) {
      const segments = src.split(/\.from\(/);
      for (const seg of segments.slice(1)) {
        const m = seg.match(/^["']([^"']+)["']\)([\s\S]*?)(?=\.from\(|$)/);
        if (!m) continue;
        const table = m[1];
        const ops = m[2];
        if (table === "plants") {
          expect(ops, `${path} must not delete plants`).not.toMatch(/\.delete\(/);
          expect(ops, `${path} must not update plants`).not.toMatch(/\.update\(/);
          expect(ops, `${path} must not upsert plants`).not.toMatch(/\.upsert\(/);
        }
        // Any write (upsert/insert/update/delete) must be on an allowed table.
        if (/\.(upsert|insert|update|delete)\(/.test(ops)) {
          expect(
            ALLOWED_WRITE_TABLES.includes(table),
            `${path} writes to unexpected table: ${table}`,
          ).toBe(true);
        }
      }
    }
  });

  it("uses no public/customer-mode language and never ranks/picks a phenotype", () => {
    for (const [path, src] of Object.entries(sources)) {
      const lower = src.toLowerCase();
      expect(lower, path).not.toMatch(/customer mode/);
      expect(lower, path).not.toMatch(/public mode/);
      expect(lower, path).not.toMatch(/\bwinner\b|\bbest\s+pheno\b|auto[_-]?select/);
    }
  });
});
