/**
 * Static contract for the deletion-safe referrer cap migration (#2067).
 * Pins the UNION count (referrals + orphaned referrer grants) and the NOT EXISTS
 * guard so a grant is never counted twice while its referral row remains.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261014010000_referral_cap_counts_deleted_referees.sql",
  ),
  "utf8",
);

describe("referral cap counts deleted referees migration", () => {
  it("fails closed unless convert_referral and ai_credit_grants already exist", () => {
    expect(MIGRATION).toContain(
      "to_regprocedure('public.convert_referral(uuid,uuid,text,text,boolean)') IS NULL",
    );
    expect(MIGRATION).toContain("to_regclass('public.ai_credit_grants') IS NULL");
    expect(MIGRATION).toContain("referral deletion cap blocked");
  });

  it("replaces convert_referral only (no table or policy DDL)", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.convert_referral");
    expect(MIGRATION).not.toMatch(/CREATE TABLE/i);
    expect(MIGRATION).not.toMatch(/ALTER TABLE public\.referrals/i);
    expect(MIGRATION).not.toMatch(/CREATE POLICY/i);
  });

  it("counts rewarded referrals and orphaned referrer grants without double-counting", () => {
    expect(MIGRATION).toContain("FROM public.referrals r");
    expect(MIGRATION).toContain("FROM public.ai_credit_grants g");
    expect(MIGRATION).toContain("UNION");
    expect(MIGRATION).toContain("g.grant_ref LIKE '%\\_referrer' ESCAPE '\\'");
    expect(MIGRATION).toContain("NOT EXISTS");
    expect(MIGRATION).toContain("substring(g.grant_ref FROM '^referral_(.*)_referrer$')");
  });

  it("keeps service-role-only execution on the replacement function", () => {
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("SET search_path = public, pg_temp");
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) TO service_role",
    );
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) FROM authenticated",
    );
  });
});
