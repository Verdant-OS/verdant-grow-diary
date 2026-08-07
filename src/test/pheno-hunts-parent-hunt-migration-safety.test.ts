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

  // This assertion originally forbade CREATE TRIGGER and REVOKE outright, to
  // pin "additive column, no security-posture change". That was the wrong
  // fence: a foreign key proves the parent EXISTS, never that the caller owns
  // it, and `pheno_hunts` grants UPDATE to `authenticated`. The pin was
  // therefore forbidding the only control that closes a cross-tenant write.
  // It now pins the posture POSITIVELY — the ownership trigger must be present
  // — while still forbidding the things that would actually widen access.
  it("enforces same-owner parentage in the database, not just referential existence", () => {
    expect(sql).toMatch(/CREATE TRIGGER pheno_hunts_parent_hunt_same_owner/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE/i);
    // The check must compare ownership explicitly, not rely on the parent being
    // invisible under RLS — that would not hold for service_role or the owner.
    expect(sql).toMatch(/parent\.user_id\s*=\s*NEW\.user_id/);
    expect(sql).toMatch(/RAISE EXCEPTION/i);
  });

  it("widens no access: no policy change, no new grant, no anon, no definer rights", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
    expect(sql).not.toMatch(/^\s*GRANT /im);
    // SECURITY INVOKER only: a DEFINER function here would run as the table
    // owner and bypass the RLS the rest of this table depends on.
    expect(sql).not.toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/SECURITY INVOKER/i);
    expect(sql).not.toMatch(/TO anon/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    // The only REVOKE permitted is the narrowing one on the new function.
    const revokes = sql.match(/^\s*REVOKE .*/gim) ?? [];
    expect(revokes).toHaveLength(1);
    expect(revokes[0]).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.pheno_hunts_assert_parent_same_owner\(\) FROM PUBLIC, anon;/,
    );
  });

  it("never bakes a ranking or quality claim into the schema", () => {
    expect(sql).not.toMatch(/ADD COLUMN[^;]*\b(winner|rank|score_rank|is_better|improved)\b/i);
    expect(sql).not.toMatch(/materialized\s+view/i);
    expect(sql.toLowerCase()).not.toMatch(/\bwinner\b|\bbest\s+generation\b/);
  });
});
