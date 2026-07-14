import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260714231627_signup_acquisition_attribution.sql"),
  "utf8",
);

describe("signup acquisition migration safety", () => {
  it("stores one allowlisted, immutable first-touch source without client table access", () => {
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS public.signup_acquisition_attributions");
    expect(SQL).toContain("user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE");
    for (const source of [
      "landing_page",
      "pricing_page",
      "founder_page",
      "founder_share",
      "pricing_interest_share",
      "grower_invite",
      "context_check",
    ]) {
      expect(SQL).toContain(`'${source}'`);
    }
    expect(SQL).toContain("ENABLE ROW LEVEL SECURITY");
    expect(SQL).toContain(
      "REVOKE ALL ON TABLE public.signup_acquisition_attributions FROM authenticated",
    );
    expect(SQL).not.toMatch(/CREATE POLICY[\s\S]*signup_acquisition_attributions/i);
    expect(SQL).not.toMatch(
      /GRANT (INSERT|UPDATE|DELETE|TRUNCATE).*signup_acquisition_attributions/i,
    );
  });

  it("copies user-editable metadata for analytics only and never for authorization", () => {
    expect(SQL).toContain("NEW.raw_user_meta_data->>'verdant_signup_source'");
    expect(SQL).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(SQL).toMatch(/never grants? a role, entitlement, billing state, credit/i);
    expect(SQL).not.toMatch(/profiles\.tier|billing_subscriptions[\s\S]*(INSERT|UPDATE|DELETE)/i);
    expect(SQL).not.toMatch(/has_role\s*\([^)]*raw_user_meta_data/i);
    expect(SQL).not.toMatch(/plan_id\s*=\s*[^;]*raw_user_meta_data/i);
  });

  it("keeps the public trigger function locked and preserves profile creation", () => {
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.handle_new_user()");
    expect(SQL).toContain("SET search_path = public, pg_temp");
    expect(SQL).toContain("INSERT INTO public.profiles (user_id, display_name)");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated");
  });

  it("exposes only aggregate counts through an operator-checked read RPC", () => {
    expect(SQL).toContain(
      "CREATE OR REPLACE FUNCTION public.signup_acquisition_operator_snapshot()",
    );
    expect(SQL).toContain("public.has_role(auth.uid(), 'operator'::public.app_role)");
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("STABLE");
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.signup_acquisition_operator_snapshot() FROM PUBLIC",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.signup_acquisition_operator_snapshot() TO authenticated",
    );
    for (const key of ["'email'", "'user_id'", "'raw_user_meta_data'", "'plan_id'"]) {
      expect(SQL).not.toContain(key);
    }
  });
});
