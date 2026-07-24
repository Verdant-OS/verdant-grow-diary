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
const GAMIFICATION_TIER_REFERENCE = ["profiles", "tier"].join(".");

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

  it("deduplicates the incumbent billing source with verified live checkout rows", () => {
    expect(SQL).toContain("FROM public.billing_subscriptions AS bs");
    expect(SQL).toContain("bs.plan_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')");
    expect(SQL).toContain("bs.status = 'active'");
    expect(SQL).toContain("bs.current_period_end IS NULL OR bs.current_period_end > now()");
    expect(SQL).toContain("FROM public.subscriptions AS s");
    expect(SQL).toContain("s.environment = 'live'");
    expect(SQL).toContain("s.paddle_subscription_id LIKE 'lifetime_%'");
    expect(SQL).toContain("SELECT DISTINCT ON (candidate.user_id)");
    expect(SQL).toContain("count(DISTINCT ap.user_id) AS active_paid");
    expect(SQL).toContain("LEFT JOIN active_paid AS ap ON ap.user_id = pr.user_id");
    expect(SQL).toContain("WHERE ap.user_id IS NULL");
    expect(SQL).not.toContain(GAMIFICATION_TIER_REFERENCE);
  });

  it("reports aggregate core-loop activation without exposing subscriber rows", () => {
    expect(SQL).toContain("FROM (SELECT DISTINCT user_id FROM active_paid) AS ap");
    expect(SQL).toContain("FROM public.grows AS g WHERE g.user_id = ap.user_id");
    expect(SQL).toContain("FROM public.tents AS t WHERE t.user_id = ap.user_id");
    expect(SQL).toContain("FROM public.plants AS p WHERE p.user_id = ap.user_id");
    expect(SQL).toContain("FROM public.diary_entries AS de WHERE de.user_id = ap.user_id");
    expect(SQL).toContain("FROM public.sensor_readings AS sr WHERE sr.user_id = ap.user_id");
    expect(SQL).toContain("INNER JOIN public.grows AS g");
    expect(SQL).toContain("INNER JOIN public.tents AS t");
    expect(SQL).toContain("t.grow_id = g.id");
    expect(SQL).toContain("INNER JOIN public.plants AS p");
    expect(SQL).toContain("p.grow_id = g.id");
    expect(SQL).toContain("p.tent_id = t.id");
    expect(SQL).toContain("AS has_connected_core");
    expect(SQL).toContain("count(*) FILTER (WHERE af.has_connected_core)");
    expect(SQL).toContain("AS active_paid_core_activated");
    expect(PAGE).toContain("<SubscriberActivationCard counts={snapshot.counts} />");
  });

  it("keeps pricing interest separate from paid subscriber counts", () => {
    expect(SQL).toContain("FROM public.leads AS l");
    expect(SQL).toContain("'pricing_interest_founder_share'");
    expect(SQL).toContain("'pricing_interest_referral'");
    expect(SQL).toContain("'pricing_interest_operator_outreach'");
    expect(SQL).toContain("'pricing_interest_pricing_page'");
    expect(SQL).toContain("'pricing_interest_grower_invite'");
    expect(SQL).toContain("'pricing_interest_context_check'");
    expect(SQL).toContain("'pricing_interest_vpd_calculator'");
    expect(SQL).toContain("AS pricing_interest_founder_share");
    expect(SQL).toContain("AS pricing_interest_referral");
    expect(SQL).toContain("AS pricing_interest_operator_outreach");
    expect(SQL).toContain("AS pricing_interest_grower_invite");
    expect(SQL).toContain("AS pricing_interest_context_check");
    expect(SQL).toContain("AS pricing_interest_vpd_calculator");
    expect(PAGE).toContain("Interest signals — not subscribers");
    expect(PAGE).toMatch(/they\s+never\s+increase\s+the\s+paid-subscriber\s+total/);
    expect(PAGE).toContain("Grower invites");
    expect(PAGE).toContain("Context check");
    expect(PAGE).toContain("VPD calculator");
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
