/**
 * Part B (B2) — static safety for the reversals + cross-types migration.
 *
 * Reads the migration SQL and locks the properties that keep it private and
 * correct, so a later edit can't silently weaken them:
 *   - pheno_reversals is APPEND-ONLY (SELECT + INSERT grant only; no
 *     UPDATE/DELETE grant or policy) and ownership-scoped on read + write.
 *   - pheno_crosses keeps the cross_type enum, the nullable male parent, the
 *     type-conditional parents CHECK, and the RLS null-male ownership guard.
 *
 * Pure text assertions — no DB, no client.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707120000_pheno_reversals_and_cross_types.sql"),
  "utf8",
);

/** Normalize whitespace so multi-line SQL clauses match reliably. */
const flat = sql.replace(/\s+/g, " ");

describe("pheno_reversals — append-only + owner/keeper scoped", () => {
  it("grants SELECT + INSERT only (never UPDATE or DELETE) to authenticated", () => {
    expect(flat).toMatch(/GRANT SELECT, INSERT ON public\.pheno_reversals TO authenticated/);
    expect(flat).not.toMatch(/GRANT[^;]*UPDATE[^;]*ON public\.pheno_reversals TO authenticated/);
    expect(flat).not.toMatch(/GRANT[^;]*DELETE[^;]*ON public\.pheno_reversals TO authenticated/);
  });

  it("declares no UPDATE or DELETE policy (immutable log)", () => {
    expect(flat).not.toMatch(/CREATE POLICY[^;]*pheno_reversals[^;]*FOR UPDATE/i);
    expect(flat).not.toMatch(/CREATE POLICY[^;]*pheno_reversals[^;]*FOR DELETE/i);
  });

  it("enables RLS and scopes read + insert to the owner AND the referenced keeper", () => {
    expect(flat).toMatch(/ALTER TABLE public\.pheno_reversals ENABLE ROW LEVEL SECURITY/);
    expect(flat).toMatch(/pheno_reversals_select_own[\s\S]*auth\.uid\(\) = user_id/);
    // Insert requires ownership of the keeper being reversed.
    expect(flat).toMatch(
      /pheno_reversals_insert_own[\s\S]*pheno_keepers k WHERE k\.id = keeper_id AND k\.user_id = auth\.uid\(\)/,
    );
  });

  it("constrains method to the recognized reversal vocabulary", () => {
    expect(flat).toMatch(/method IN \('sts', 'colloidal_silver', 'ga3', 'other'\)/);
  });
});

describe("pheno_crosses — cross_type + nullable male + guarded RLS", () => {
  it("adds cross_type with a default and the three-value CHECK", () => {
    expect(flat).toMatch(/ADD COLUMN cross_type text NOT NULL DEFAULT 'standard_f1'/);
    expect(flat).toMatch(/cross_type IN \('standard_f1', 'feminized_cross', 'selfing_s1'\)/);
  });

  it("makes male_keeper_id nullable and replaces the unconditional distinct-parents CHECK", () => {
    expect(flat).toMatch(/ALTER COLUMN male_keeper_id DROP NOT NULL/);
    expect(flat).toMatch(/DROP CONSTRAINT pheno_crosses_distinct_parents/);
  });

  it("adds the type-conditional parents CHECK (selfing → 1 parent; two-parent types → 2 distinct)", () => {
    expect(flat).toMatch(/cross_type = 'selfing_s1' AND male_keeper_id IS NULL/);
    expect(flat).toMatch(
      /cross_type IN \('standard_f1', 'feminized_cross'\) AND male_keeper_id IS NOT NULL AND male_keeper_id <> female_keeper_id/,
    );
  });

  it("guards the male-ownership RLS check so a NULL male can't pass trivially", () => {
    // The guard must appear in BOTH the recreated insert and update policies.
    // Regex tolerates optional whitespace around EXISTS/parens (assert intent,
    // not exact formatting).
    const guards = flat.match(
      /male_keeper_id IS NULL OR EXISTS\s*\(\s*SELECT 1 FROM public\.pheno_keepers m WHERE m\.id = male_keeper_id AND m\.user_id = auth\.uid\(\)\s*\)/g,
    );
    expect(guards?.length ?? 0).toBeGreaterThanOrEqual(2);
    // Female + hunt ownership must still be enforced regardless of male.
    expect(flat).toMatch(
      /pheno_keepers f WHERE f\.id = female_keeper_id AND f\.user_id = auth\.uid\(\)/,
    );
  });

  it("enforces the reversal precondition on feminized/selfing crosses (defense in depth)", () => {
    // A CHECK can't cross tables, so the RLS WITH CHECK must require a
    // pheno_reversals row: selfing → mother reversed; feminized → male reversed.
    const selfingGuards = flat.match(
      /cross_type = 'selfing_s1' AND EXISTS\s*\(\s*SELECT 1 FROM public\.pheno_reversals r WHERE r\.keeper_id = female_keeper_id AND r\.user_id = auth\.uid\(\)\s*\)/g,
    );
    const femGuards = flat.match(
      /cross_type = 'feminized_cross' AND EXISTS\s*\(\s*SELECT 1 FROM public\.pheno_reversals r WHERE r\.keeper_id = male_keeper_id AND r\.user_id = auth\.uid\(\)\s*\)/g,
    );
    // Present in BOTH the insert and update policies.
    expect(selfingGuards?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(femGuards?.length ?? 0).toBeGreaterThanOrEqual(2);
    // standard_f1 stays exempt (no reversal required).
    expect(flat).toMatch(/cross_type = 'standard_f1' OR/);
  });
});
