/**
 * pheno-keepers-stability-runs-migration-safety
 *
 * Static assertions over the stability-runs column migration: one
 * additive, defaulted, constrained jsonb array column on pheno_keepers,
 * no privilege/policy changes, and no premature-stability machinery
 * baked into the schema.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260718010000_pheno_keepers_stability_runs.sql";
const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

describe("pheno_keepers stability_runs migration safety", () => {
  it("adds only one nullable/defaulted array column, idempotently", () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS stability_runs jsonb NOT NULL DEFAULT '\[\]'::jsonb/,
    );
    expect(sql).not.toMatch(/DROP\s+(COLUMN|TABLE)/i);
  });

  it("constrains stability_runs to a json array, guarded idempotently", () => {
    expect(sql).toMatch(/jsonb_typeof\(stability_runs\) = 'array'/);
    expect(sql).toMatch(/pheno_keepers_stability_runs_is_array/);
    expect(sql).toMatch(/IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_constraint/);
  });

  it("changes no policies, grants, or triggers (inherits pheno_keepers RLS)", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
    expect(sql).not.toMatch(/^\s*GRANT /im);
    expect(sql).not.toMatch(/^\s*REVOKE /im);
    expect(sql).not.toMatch(/CREATE TRIGGER/i);
    expect(sql).not.toMatch(/SECURITY DEFINER/i);
    expect(sql).not.toMatch(/TO anon/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it("never bakes a stability verdict / ranking claim into the schema", () => {
    expect(sql).not.toMatch(/ADD COLUMN[^;]*\b(winner|rank|is_stable|confirmed|proven)\b/i);
    expect(sql).not.toMatch(/materialized\s+view/i);
    expect(sql.toLowerCase()).not.toMatch(/\bwinner\b|\bbest\s+pheno\b/);
  });
});
