/**
 * Pins the three migration P2s on the unmerged Stripe test-mode sink.
 * @source-scan-justified: the sink is SQL, not a TypeScript module; this file pins rollback, canceled-terminal, and the audited writer.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PATH = "supabase/migrations/20261101180000_stripe_test_mode_subscription_sink.sql";

function between(text: string, start: string, end: string | null): string {
  const from = text.indexOf(start);
  if (from < 0) return "";
  if (end === null) return text.slice(from);
  const to = text.indexOf(end, from + start.length);
  return to < 0 ? "" : text.slice(from, to);
}

describe("stripe test-mode sink P2s", () => {
  const sql = readFileSync(PATH, "utf8");
  const audit = between(
    sql,
    "CREATE OR REPLACE FUNCTION public.apply_stripe_test_mode_subscription_with_audit(",
    "CREATE OR REPLACE FUNCTION public.apply_stripe_test_mode_event(",
  );
  const event = between(
    sql,
    "CREATE OR REPLACE FUNCTION public.apply_stripe_test_mode_event(",
    null,
  );

  it("writes subscriptions only through the audited function", () => {
    expect(audit).toContain("INSERT INTO public.subscriptions (");
    expect(audit).toContain("INSERT INTO public.stripe_test_mode_subscription_audit (");
    expect(audit).toContain("SET search_path = public, pg_temp");
    expect(event).toContain("public.apply_stripe_test_mode_subscription_with_audit(");
    expect(event).not.toContain("INSERT INTO public.subscriptions (");
    expect(event).not.toContain("UPDATE public.subscriptions");
  });

  it("treats a canceled subscription as terminal", () => {
    expect(sql).toContain("CREATE TABLE public.stripe_test_mode_canceled_subscriptions");
    expect(audit).toContain("v_reason := 'canceled_terminal'");
    expect(audit).toContain("status IS DISTINCT FROM 'canceled'");
    expect(audit).toContain("INSERT INTO public.stripe_test_mode_canceled_subscriptions");
  });

  it("rolls the event row back when a credit grant fails", () => {
    expect(event).toContain("RAISE EXCEPTION 'stripe_test_mode_credit_grant_failed'");
    expect(event).not.toContain("COALESCE(v_grant->>'reason', 'grant_failed')");
    expect(event).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(event).toContain("'idempotent'");
  });
});
