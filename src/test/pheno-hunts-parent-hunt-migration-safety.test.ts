/**
 * pheno-hunts-parent-hunt-migration-safety
 *
 * Static assertions over the generation-lineage migration: one additive,
 * nullable, self-referencing column with a self-parent guard and an index,
 * no privilege/policy changes, and no ranking machinery baked into the schema.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260807100000_pheno_hunts_parent_hunt.sql";
const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

describe("pheno_hunts parent_hunt_id migration safety", () => {
  it("adds one nullable self-referencing column, idempotently", () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS parent_hunt_id uuid REFERENCES public\.pheno_hunts\(id\)/,
    );
    // Nullable: every existing hunt keeps working untouched. Scoped to the
    // ADD COLUMN statement itself — the partial index legitimately says
    // "WHERE parent_hunt_id IS NOT NULL", which is a different thing.
    const addColumn = /ALTER TABLE public\.pheno_hunts\s+ADD COLUMN[^;]*;/.exec(sql)?.[0] ?? "";
    expect(addColumn).not.toBe("");
    expect(addColumn).not.toMatch(/NOT NULL/);
    expect(addColumn).not.toMatch(/DEFAULT/);
    expect(sql).not.toMatch(/DROP\s+(COLUMN|TABLE)/i);
  });

  it("clears the pointer instead of deleting hunts when a parent is removed", () => {
    expect(sql).toMatch(/ON DELETE SET NULL/);
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
  });

  it("guards the one-hop self-parent case, idempotently", () => {
    expect(sql).toMatch(/parent_hunt_id IS NULL OR parent_hunt_id <> id/);
    expect(sql).toMatch(/pheno_hunts_parent_hunt_not_self/);
    expect(sql).toMatch(/IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_constraint/);
  });

  it("documents that longer cycles are broken in the app walker", () => {
    // The DB cannot express A→B→A as a row constraint; the migration must say
    // where that guard actually lives so it is never assumed to be enforced here.
    expect(sql).toMatch(/buildGenerationChain/);
  });

  it("indexes the lookup without scanning unlinked hunts", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS pheno_hunts_parent_hunt_id_idx/);
    expect(sql).toMatch(/WHERE parent_hunt_id IS NOT NULL/);
  });

  it("changes no policies, grants, or triggers (inherits pheno_hunts RLS)", () => {
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

  it("never bakes a ranking or quality claim into the schema", () => {
    expect(sql).not.toMatch(/ADD COLUMN[^;]*\b(winner|rank|score_rank|is_better|improved)\b/i);
    expect(sql).not.toMatch(/materialized\s+view/i);
    expect(sql.toLowerCase()).not.toMatch(/\bwinner\b|\bbest\s+generation\b/);
  });
});
