import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260717010000_paid_return_cohort_measurement.sql"),
  "utf8",
);
const PAGE = readFileSync(resolve(process.cwd(), "src/pages/OperatorSubscriberGrowth.tsx"), "utf8");
const GAMIFICATION_TIER_REFERENCE = ["profiles", "tier"].join(".");

describe("paid-return operator snapshot safety", () => {
  it("uses a private forward-only first-paid ledger from the canonical live subscription lane", () => {
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS public.paid_return_cohort_memberships");
    expect(SQL).toContain("user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE");
    expect(SQL).toContain("captured_from = 'subscriptions'");
    expect(SQL).toContain("NEW.environment = 'live'");
    expect(SQL).toContain("NEW.status = 'active'");
    expect(SQL).toContain("ELSIF OLD.status = 'trialing'");
    expect(SQL).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(SQL).toContain("AFTER INSERT ON public.subscriptions");
    expect(SQL).toContain("AFTER UPDATE OF status, price_id, environment ON public.subscriptions");
    expect(SQL).toContain(
      "REVOKE ALL ON TABLE public.paid_return_cohort_memberships FROM authenticated",
    );
    expect(SQL).not.toContain("INSERT INTO public.paid_return_cohort_memberships\nSELECT");
  });

  it("keeps the snapshot operator-only, aggregate-only, and detached from entitlements", () => {
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.paid_return_operator_snapshot()");
    expect(SQL).toContain("STABLE");
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("SET search_path = public, pg_temp");
    expect(SQL).toContain("public.has_role(auth.uid(), 'operator'::public.app_role)");
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.paid_return_operator_snapshot() FROM PUBLIC",
    );
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.paid_return_operator_snapshot() FROM anon",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.paid_return_operator_snapshot() TO authenticated",
    );
    expect(SQL).not.toContain(GAMIFICATION_TIER_REFERENCE);
    expect(SQL).not.toContain("current_period_end");
    expect(SQL).not.toContain("sensor_readings");
  });

  it("uses bounded post-payment return evidence and retains churned cohort members", () => {
    expect(SQL).toContain("tracked.first_paid_at + interval '60 days' <= now()");
    expect(SQL).toContain("ge.source = 'manual'");
    expect(SQL).toContain("ge.is_deleted = false");
    expect(SQL).toContain("ge.event_type IN ('watering', 'observation')");
    expect(SQL).toContain("ge.created_at > cohort.first_paid_at");
    expect(SQL).toContain("ge.created_at < cohort.first_paid_at + interval '60 days'");
    expect(SQL).toContain(
      "CREATE INDEX IF NOT EXISTS paid_return_manual_grow_events_user_created_idx",
    );
    expect(SQL).toContain("Client-persisted AI sessions are excluded");
    expect(SQL).toContain("FROM public.paid_return_cohort_memberships AS membership");
    const snapshotSql = SQL.split(
      "CREATE OR REPLACE FUNCTION public.paid_return_operator_snapshot()",
    )[1];
    expect(snapshotSql).not.toMatch(/membership\.status|subscriptions\.status/i);
    expect(SQL).not.toContain("ai_doctor_sessions");
  });

  it("counts AI Doctor return only from a private, fresh server completion ledger", () => {
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS public.ai_doctor_review_completions");
    expect(SQL).toContain("spend_id uuid PRIMARY KEY REFERENCES public.ai_credit_spends(id)");
    expect(SQL).toContain(
      "ALTER TABLE public.ai_doctor_review_completions ENABLE ROW LEVEL SECURITY",
    );
    expect(SQL).toContain(
      "REVOKE ALL ON TABLE public.ai_doctor_review_completions FROM authenticated",
    );
    expect(SQL).toContain("GRANT ALL ON TABLE public.ai_doctor_review_completions TO service_role");
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.record_ai_doctor_review_completion(");
    expect(SQL).toContain("p_expected_user_id uuid");
    expect(SQL).toContain("IF NOT FOUND THEN");
    expect(SQL).toContain("v_spend.user_id IS DISTINCT FROM p_expected_user_id");
    expect(SQL).toContain("v_spend.feature IS DISTINCT FROM 'ai_doctor_review'");
    expect(SQL).toContain("v_spend.status IS DISTINCT FROM 'spent'");
    expect(SQL).toContain("reversal.refund_of = v_spend.id");
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.record_ai_doctor_review_completion(uuid, uuid) FROM authenticated",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.record_ai_doctor_review_completion(uuid, uuid) TO service_role",
    );
    expect(SQL).toContain("FROM public.ai_doctor_review_completions AS completion");
    expect(SQL).toContain("spend.feature = 'ai_doctor_review'");
    expect(SQL).toContain("spend.status = 'spent'");
    expect(SQL).toContain("server_completed_ai_doctor_returned_60d");
    expect(SQL).toContain("OR flags.has_server_completed_ai_doctor_return");

    const completionTableSql = SQL.split(
      "CREATE TABLE IF NOT EXISTS public.ai_doctor_review_completions",
    )[1].split("CREATE INDEX IF NOT EXISTS ai_doctor_review_completions_user_completed_idx")[0];
    expect(completionTableSql).toContain("spend_id uuid PRIMARY KEY");
    expect(completionTableSql).toContain("user_id uuid NOT NULL");
    expect(completionTableSql).toContain("completed_at timestamptz NOT NULL DEFAULT now()");
    expect(completionTableSql).not.toMatch(/prompt|result|payload|grow_id|plant_id/i);
  });

  it("never returns personal, provider, or raw-payload identifiers", () => {
    for (const responseKey of [
      "'email'",
      "'user_id'",
      "'provider_customer_id'",
      "'provider_subscription_id'",
      "'raw_payload'",
    ]) {
      expect(SQL).not.toContain(responseKey);
    }
    expect(PAGE).toContain('"paid_return_operator_snapshot"');
    expect(PAGE).toContain("PaidReturnCohortCard");
  });
});
