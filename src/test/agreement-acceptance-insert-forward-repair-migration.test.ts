/**
 * Fence: agreement-acceptance forward repair stays fail-closed.
 *
 * Source-scan is intentional here — we assert forbidden RLS weakenings and
 * required auth.uid() ownership are present in the additive migration text.
 * @source-scan-justified: migration SQL has no runtime import surface; the
 * gate is "forbidden constructs absent / required ownership present".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260824180000_agreement_acceptance_insert_forward_repair.sql",
  ),
  "utf8",
);

describe("agreement acceptance insert forward repair migration", () => {
  it("re-asserts authenticated INSERT policy with auth.uid() ownership", () => {
    expect(MIGRATION).toMatch(/CREATE POLICY "Users insert own acceptances"/);
    expect(MIGRATION).toMatch(/WITH CHECK\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/);
    expect(MIGRATION).toMatch(
      /GRANT SELECT, INSERT ON TABLE public\.user_agreement_acceptances TO authenticated/,
    );
  });

  it("keeps append-only posture (no authenticated UPDATE/DELETE grants or policies)", () => {
    expect(MIGRATION).toMatch(
      /REVOKE UPDATE, DELETE ON TABLE public\.user_agreement_acceptances FROM authenticated/,
    );
    expect(MIGRATION).toMatch(/DROP POLICY IF EXISTS "Users update own acceptances"/);
    expect(MIGRATION).toMatch(/DROP POLICY IF EXISTS "Users delete own acceptances"/);
    expect(MIGRATION).not.toMatch(/FOR UPDATE[\s\S]{0,80}TO authenticated/);
    expect(MIGRATION).not.toMatch(/FOR DELETE[\s\S]{0,80}TO authenticated/);
  });

  it("RPC forces user_id from auth.uid() and is not anon-executable", () => {
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.record_own_agreement_acceptances/,
    );
    expect(MIGRATION).toMatch(/SECURITY INVOKER/);
    expect(MIGRATION).toMatch(/uid uuid := auth\.uid\(\)/);
    expect(MIGRATION).toMatch(/ON CONFLICT \(user_id, agreement_type, version\) DO NOTHING/);
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.record_own_agreement_acceptances\(jsonb\) FROM anon/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_own_agreement_acceptances\(jsonb\) TO authenticated/,
    );
  });

  it("does not weaken RLS to true / USING(true)", () => {
    expect(MIGRATION).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(MIGRATION).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
    expect(MIGRATION).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it("does not touch signup-acquisition handle_new_user repair surface", () => {
    expect(MIGRATION).not.toMatch(/handle_new_user/);
    expect(MIGRATION).not.toMatch(/signup_acquisition/);
  });
});
