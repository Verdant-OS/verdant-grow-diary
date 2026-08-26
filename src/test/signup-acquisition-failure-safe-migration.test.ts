/**
 * Static contract for the failure-safe attribution guard migration.
 * Pins EXCEPTION + RAISE LOG around the attribution INSERT and the
 * operator readiness RPC. Does not edit 20260813030000.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  "supabase/migrations/20260821150000_signup_acquisition_failure_safe_attribution.sql",
  "utf8",
).replace(/\r\n/g, "\n");

const FORWARD = readFileSync(
  "supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql",
  "utf8",
);

describe("signup acquisition failure-safe attribution migration", () => {
  it("replaces handle_new_user without touching the immutable forward-repair file", () => {
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.handle_new_user()");
    expect(FORWARD).not.toContain("RAISE LOG");
    expect(FORWARD).not.toContain("signup_acquisition_readiness_operator_snapshot");
  });

  it("keeps profile insert outside the attribution EXCEPTION block", () => {
    const profilesIdx = SQL.indexOf("INSERT INTO public.profiles (");
    const attributionIdx = SQL.indexOf(
      "INSERT INTO public.signup_acquisition_attributions (user_id, source, created_at)",
    );
    const attributionExceptionIdx = SQL.indexOf(
      "RAISE LOG\n        'signup_acquisition_attributions write failed",
    );
    expect(profilesIdx).toBeGreaterThan(-1);
    expect(attributionIdx).toBeGreaterThan(profilesIdx);
    expect(attributionExceptionIdx).toBeGreaterThan(attributionIdx);

    const beforeAttribution = SQL.slice(profilesIdx, attributionIdx);
    expect(beforeAttribution).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/);
  });

  it("wraps only the attribution INSERT in EXCEPTION WHEN OTHERS + RAISE LOG", () => {
    const block = SQL.slice(
      SQL.indexOf("IF v_signup_source IS NOT NULL THEN"),
      SQL.indexOf("BEGIN\n    v_ref_code :="),
    );
    expect(block).toContain("BEGIN");
    expect(block).toContain("INSERT INTO public.signup_acquisition_attributions");
    expect(block).toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN/);
    expect(block).toContain("RAISE LOG");
    expect(block).toContain("SQLSTATE");
    expect(block).toContain("SQLERRM");
    expect(block).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN\s*\n\s*NULL;/);
  });

  it("preserves referral best-effort behavior and marketing opt-in", () => {
    expect(SQL).toContain("public.generate_referral_code()");
    expect(SQL).toContain("PERFORM public.convert_referral(");
    expect(SQL).toContain("marketing_opt_in");
    expect(SQL).toContain("ON CONFLICT (user_id) DO NOTHING");
  });

  it("adds an operator-only readiness RPC with exact checks", () => {
    expect(SQL).toContain(
      "CREATE OR REPLACE FUNCTION public.signup_acquisition_readiness_operator_snapshot()",
    );
    expect(SQL).toContain("public.has_role(auth.uid(), 'operator'::public.app_role)");
    expect(SQL).toContain("to_regclass('public.signup_acquisition_attributions')");
    expect(SQL).toContain(
      "to_regprocedure('public.record_signup_acquisition_first_touch(text)')",
    );
    expect(SQL).toContain("to_regprocedure('public.signup_acquisition_operator_snapshot()')");
    expect(SQL).toContain("to_regprocedure('public.signup_to_paid_operator_snapshot()')");
    expect(SQL).toContain("sm.version = '20260813030000'");
    expect(SQL).toContain("'signup_acquisition_forward_repair'");
    expect(SQL).toContain("'20260813030000_signup_acquisition_forward_repair'");
    expect(SQL).toContain("'status', CASE WHEN v_ready THEN 'ready' ELSE 'not_ready' END");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.signup_acquisition_readiness_operator_snapshot() FROM PUBLIC");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.signup_acquisition_readiness_operator_snapshot() FROM anon");
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.signup_acquisition_readiness_operator_snapshot() TO authenticated",
    );
  });

  it("does not invent unrelated schema or hand-insert ledger rows", () => {
    const executable = SQL.split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/CREATE\s+TABLE/i);
    expect(executable).not.toMatch(/INSERT\s+INTO\s+supabase_migrations\.schema_migrations/i);
    expect(executable).not.toMatch(/\bgardens\b/i);
    expect(executable).not.toMatch(/verdant\s+cup/i);
    expect(executable).not.toMatch(/supply\s+shop/i);
  });
});
