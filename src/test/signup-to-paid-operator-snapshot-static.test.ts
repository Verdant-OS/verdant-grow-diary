import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260715002000_signup_to_paid_operator_snapshot.sql"),
  "utf8",
);
const GAMIFICATION_TIER_REFERENCE = ["profiles", "tier"].join(".");

describe("signup-to-paid operator snapshot safety", () => {
  it("is a locked, operator-only, read-only SECURITY DEFINER function", () => {
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.signup_to_paid_operator_snapshot()");
    expect(SQL).toContain("STABLE");
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("SET search_path = public, pg_temp");
    expect(SQL).toContain("public.has_role(auth.uid(), 'operator'::public.app_role)");
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.signup_to_paid_operator_snapshot() FROM PUBLIC",
    );
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.signup_to_paid_operator_snapshot() FROM anon",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.signup_to_paid_operator_snapshot() TO authenticated",
    );
  });

  it("uses the deduplicated active-paid union and immutable attribution table", () => {
    expect(SQL).toContain("FROM public.billing_subscriptions AS bs");
    expect(SQL).toContain("bs.plan_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')");
    expect(SQL).toContain("bs.status = 'active'");
    expect(SQL).toContain("bs.current_period_end IS NULL OR bs.current_period_end > now()");
    expect(SQL).toContain("FROM public.subscriptions AS s");
    expect(SQL).toContain("s.environment = 'live'");
    expect(SQL).toContain("s.paddle_subscription_id LIKE 'lifetime_%'");
    expect(SQL).toContain("SELECT DISTINCT ON (candidate.user_id)");
    expect(SQL).toContain("LEFT JOIN public.signup_acquisition_attributions AS a");
    expect(SQL).toContain("('operator_outreach'::text)");
    expect(SQL).not.toContain(GAMIFICATION_TIER_REFERENCE);
  });

  it("returns aggregates only and performs no writes", () => {
    for (const responseKey of [
      "'email'",
      "'user_id'",
      "'provider_customer_id'",
      "'provider_subscription_id'",
      "'raw_user_meta_data'",
    ]) {
      expect(SQL).not.toContain(responseKey);
    }
    for (const operation of ["INSERT INTO", "UPDATE public", "DELETE FROM"]) {
      expect(SQL).not.toContain(operation);
    }
  });
});
