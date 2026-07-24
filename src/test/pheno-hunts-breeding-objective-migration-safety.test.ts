/**
 * pheno-hunts-breeding-objective-migration-safety
 *
 * Static assertions over the breeding-objective column migration: one
 * additive, defaulted, constrained jsonb array column, no privilege or
 * policy changes smuggled in, and — the doctrine unique to this feature —
 * no ranking/winner/keeper-recommendation machinery baked into the schema.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260718000000_pheno_hunts_breeding_objective.sql";

const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

describe("pheno_hunts breeding_objective migration safety", () => {
  it("adds only one nullable/defaulted array column, idempotently", () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS breeding_objective jsonb NOT NULL DEFAULT '\[\]'::jsonb/,
    );
    expect(sql).not.toMatch(/DROP\s+(COLUMN|TABLE)/i);
  });

  it("constrains breeding_objective to a json array", () => {
    expect(sql).toMatch(/jsonb_typeof\(breeding_objective\) = 'array'/);
    expect(sql).toMatch(/pheno_hunts_breeding_objective_is_array/);
  });

  it("the array-shape check is idempotent (guarded by pg_constraint existence)", () => {
    expect(sql).toMatch(/IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_constraint/);
  });

  it("changes no policies, grants, or triggers", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
    // Statement-position only — comments may mention the words.
    expect(sql).not.toMatch(/^\s*GRANT /im);
    expect(sql).not.toMatch(/^\s*REVOKE /im);
    expect(sql).not.toMatch(/CREATE TRIGGER/i);
    expect(sql).not.toMatch(/SECURITY DEFINER/i);
    expect(sql).not.toMatch(/TO anon/i);
  });

  it("inherits pheno_hunts' existing owner + Pro-entitlement RLS rather than defining its own", () => {
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/has_pheno_tracker_entitlement/i);
  });

  it("never bakes ranking, winner, or keeper-recommendation machinery into the schema", () => {
    expect(sql).not.toMatch(/ADD COLUMN[^;]*\b(winner|rank|keeper_recommendation)\b/i);
    expect(sql).not.toMatch(/materialized\s+view/i);
    expect(sql.toLowerCase()).not.toMatch(/\bwinner\b|\bbest\s+pheno\b/);
  });

  it("never stores a readiness claim — only the grower's own stated targets", () => {
    expect(sql).not.toMatch(/ADD COLUMN[^;]*\breadiness\b/i);
    expect(sql).not.toMatch(/ADD COLUMN[^;]*\bcomparison\b/i);
  });
});
