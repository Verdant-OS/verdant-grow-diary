/**
 * pheno_crosses full-taxonomy migration — static safety.
 *
 * Guards the migration file 20260707210000_pheno_crosses_full_taxonomy.sql:
 *   - contains all 15 CrossType values inside the cross_type CHECK
 *   - adds type-aware CHECKs for channel / generation / recurrent_parent_id
 *   - does NOT disable RLS
 *   - does NOT grant PUBLIC / anon on pheno_crosses
 *   - rebuilds both INSERT and UPDATE policies (WITH CHECK)
 *
 * Pure text scan — no DB, no writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CROSS_TYPES } from "@/lib/genetics/breedingReproductionRules";

const SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707210000_pheno_crosses_full_taxonomy.sql"),
  "utf8",
);

describe("pheno_crosses full taxonomy migration — static safety", () => {
  it("cross_type CHECK enumerates all 15 taxonomy values", () => {
    for (const t of CROSS_TYPES) {
      expect(SQL, `cross_type ${t}`).toMatch(new RegExp(`'${t}'`));
    }
    // Rebuilds the CHECK — drops old, adds new.
    expect(SQL).toMatch(/DROP CONSTRAINT pheno_crosses_cross_type_check/i);
    expect(SQL).toMatch(/ADD CONSTRAINT pheno_crosses_cross_type_check/i);
  });

  it("adds nullable channel / generation / recurrent_parent_id columns", () => {
    expect(SQL).toMatch(/ADD COLUMN channel text/i);
    expect(SQL).toMatch(/ADD COLUMN generation integer/i);
    expect(SQL).toMatch(/ADD COLUMN recurrent_parent_id uuid/i);
  });

  it("adds type-aware CHECKs for generation and recurrent_parent_id", () => {
    expect(SQL).toMatch(/pheno_crosses_generation_check/);
    expect(SQL).toMatch(/pheno_crosses_recurrent_parent_by_type/);
    expect(SQL).toMatch(/pheno_crosses_channel_check/);
    // Backcross / feminized_bx must require recurrent parent.
    expect(SQL).toMatch(/backcross[^\n]*feminized_bx[^\n]*recurrent_parent_id IS NOT NULL/is);
  });

  it("rebuilds INSERT and UPDATE policies with ownership WITH CHECK", () => {
    expect(SQL).toMatch(/DROP POLICY "pheno_crosses_insert_own"/);
    expect(SQL).toMatch(/CREATE POLICY "pheno_crosses_insert_own"[\s\S]+WITH CHECK/);
    expect(SQL).toMatch(/DROP POLICY "pheno_crosses_update_own"/);
    expect(SQL).toMatch(/CREATE POLICY "pheno_crosses_update_own"[\s\S]+WITH CHECK/);
  });

  it("never disables RLS or grants unsafe roles", () => {
    expect(SQL).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(SQL).not.toMatch(/GRANT[^;]+TO\s+(anon|PUBLIC)\b/i);
    expect(SQL).not.toMatch(/service_role/i);
  });

  it("bans reversed-female donors on every regular way in both policies (no allow-list escape)", () => {
    // The reversed-donor guard: a regular (non-inherently-feminized) way must
    // reject a donor with a recorded reversal — its pollen is feminized. This
    // holds on the natural_male/open channel arm AND the channel-less ELSE, in
    // BOTH the INSERT and UPDATE policies → the exact string appears >= 4x.
    // Assert the full guard INCLUDING the per-user scoping (`AND r.user_id =
    // auth.uid()`) — dropping that clause would silently change the policy's
    // cross-user semantics while a laxer regex still passed. Case-insensitive
    // to tolerate SQL keyword-casing changes.
    const guard =
      /cross_type NOT IN \('selfing_s1', 'selfing_sn', 'feminized_cross', 'feminized_bx'\)\s+AND NOT EXISTS \(\s*SELECT 1 FROM public\.pheno_reversals r\s*WHERE r\.keeper_id = male_keeper_id AND r\.user_id = auth\.uid\(\)/gi;
    expect((SQL.match(guard) ?? []).length).toBeGreaterThanOrEqual(4);

    // The old fix-defeating unconditional allow-list (which let ibl/sib_cross/…
    // pass regardless of a reversed donor) must NOT reappear. Guard against the
    // specific `OR cross_type IN ('ibl', ...)` escape hatch.
    expect(SQL).not.toMatch(/OR\s+cross_type IN \(\s*'ibl',\s*'sib_cross'/);
  });
});
