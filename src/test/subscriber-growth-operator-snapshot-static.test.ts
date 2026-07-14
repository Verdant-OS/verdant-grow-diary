import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const SQL = read("supabase/migrations/20260714193000_subscriber_growth_operator_snapshot.sql");
const PAGE = read("src/pages/OperatorSubscriberGrowth.tsx");
const APP = read("src/App.tsx");
const MANIFEST = read("src/lib/appRouteManifest.ts");

describe("subscriber growth operator snapshot — security and truth fences", () => {
  it("uses an operator-only SECURITY DEFINER RPC with a locked search path", () => {
    expect(SQL).toContain(
      "CREATE OR REPLACE FUNCTION public.subscriber_growth_operator_snapshot()",
    );
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("SET search_path = public, pg_temp");
    expect(SQL).toContain("public.has_role(auth.uid(), 'operator'::public.app_role)");
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.subscriber_growth_operator_snapshot() FROM PUBLIC",
    );
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.subscriber_growth_operator_snapshot() FROM anon",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.subscriber_growth_operator_snapshot() TO authenticated",
    );
  });

  it("counts active paid users only from billing_subscriptions", () => {
    expect(SQL).toContain("FROM public.billing_subscriptions AS bs");
    expect(SQL).toContain("bs.plan_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')");
    expect(SQL).toContain("bs.status = 'active'");
    expect(SQL).toContain("bs.current_period_end IS NULL OR bs.current_period_end > now()");
    expect(SQL).toContain("count(DISTINCT ap.user_id) AS active_paid");
    expect(SQL).not.toContain("public.subscriptions");
    expect(SQL).not.toContain("profiles.tier");
  });

  it("keeps pricing interest separate from paid subscriber counts", () => {
    expect(SQL).toContain("FROM public.leads AS l");
    expect(SQL).toContain("'pricing_interest_founder_share'");
    expect(SQL).toContain("'pricing_interest_referral'");
    expect(SQL).toContain("'pricing_interest_grower_invite'");
    expect(SQL).toContain("'pricing_interest_context_check'");
    expect(SQL).toContain("AS pricing_interest_founder_share");
    expect(SQL).toContain("AS pricing_interest_referral");
    expect(SQL).toContain("AS pricing_interest_grower_invite");
    expect(SQL).toContain("AS pricing_interest_context_check");
    expect(PAGE).toContain("Interest signals — not subscribers");
    expect(PAGE).toMatch(/they\s+never\s+increase\s+the\s+paid-subscriber\s+total/);
    expect(PAGE).toContain("Grower invites");
    expect(PAGE).toContain("Context check");
  });

  it("deduplicates interest metrics and exposes actionable follow-up workload", () => {
    expect(SQL).toContain("count(DISTINCT lower(btrim(l.email))) FILTER");
    expect(SQL).toContain("AS pricing_interest_needs_contact");
    expect(SQL).toContain("l.status IN ('new', 'reviewed')");
    expect(SQL).toContain("l.contacted_at IS NULL");
    expect(SQL).toContain("AS pricing_interest_follow_up_due");
    expect(SQL).toContain("l.follow_up_at <= now()");
    expect(SQL).toContain("AS pricing_interest_contacted_7d");
    expect(PAGE).toContain("Unique normalized email addresses only");
    expect(PAGE).toContain("Needs first contact");
    expect(PAGE).toContain("Follow-up due");
  });

  it("returns no personal or provider identifiers and performs no writes", () => {
    for (const responseKey of [
      "'email'",
      "'user_id'",
      "'provider_customer_id'",
      "'provider_subscription_id'",
      "'raw_payload'",
    ]) {
      expect(SQL).not.toContain(responseKey);
    }
    for (const operation of ["INSERT INTO", "UPDATE public", "DELETE FROM"]) {
      expect(SQL).not.toContain(operation);
      expect(PAGE).not.toContain(`.${operation.toLowerCase()}(`);
    }
    expect(PAGE).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(PAGE).not.toMatch(/\.from\(["']leads["']\)/);
  });

  it("mounts the page only on the operator route", () => {
    expect(APP).toContain("OperatorSubscriberGrowth");
    expect(APP).toContain('path="/operator/subscriber-growth"');
    expect(MANIFEST).toContain('path: "/operator/subscriber-growth"');
    expect(MANIFEST).toContain('access: "operator"');
  });
});
