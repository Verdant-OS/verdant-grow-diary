import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MIGRATION = readProjectFile(
  "supabase/migrations/20260621015000_apply_paddle_subscription_update_rpc.sql",
);
const WEBHOOK = readProjectFile("supabase/functions/paddle-webhook/index.ts");

describe("Paddle subscription update RPC migration", () => {
  it("creates a service-role-only security-definer RPC", () => {
    expect(MIGRATION).toContain(
      "CREATE OR REPLACE FUNCTION public.apply_paddle_subscription_update",
    );
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("SET search_path = public, pg_temp");
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.apply_paddle_subscription_update(uuid) TO service_role",
    );
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update(uuid) FROM anon",
    );
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update(uuid) FROM authenticated",
    );
    expect(MIGRATION).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.apply_paddle_subscription_update\(uuid\)\s+TO\s+(anon|authenticated)/i,
    );
  });

  it("uses verified event, processed event state, and verified customer link gates", () => {
    expect(MIGRATION).toContain("FROM public.paddle_event_processing");
    expect(MIGRATION).toContain("FROM public.paddle_events");
    expect(MIGRATION).toContain("FROM public.billing_customer_links");
    expect(MIGRATION).toContain("v_event.signature_verified IS NOT TRUE");
    expect(MIGRATION).toContain("v_processing.status <> 'processed'");
    expect(MIGRATION).toContain("link_status = 'linked'");
    expect(MIGRATION).toContain("confidence = 'verified'");
    expect(MIGRATION).toContain("missing_verified_customer_link");
  });

  it("only supports recurring Pro plans and blocks Founder allocation", () => {
    expect(MIGRATION).toContain("candidate_plan_id NOT IN ('pro_monthly', 'pro_annual')");
    expect(MIGRATION).toContain("founder_allocation_deferred");
    expect(MIGRATION).toContain("founder_row_not_overwritten");
    expect(MIGRATION).not.toMatch(/founder_number\s*=\s*[1-9]/);
  });

  it("writes only the subscription source-of-truth table", () => {
    expect(MIGRATION).toContain("UPDATE public.billing_subscriptions");
    expect(MIGRATION).toContain("INSERT INTO public.billing_subscriptions");

    for (const forbidden of [
      "INSERT INTO public.paddle_events",
      "UPDATE public.paddle_events",
      "DELETE FROM public.paddle_events",
      "INSERT INTO public.paddle_event_processing",
      "UPDATE public.paddle_event_processing",
      "DELETE FROM public.paddle_event_processing",
      "INSERT INTO public.billing_customer_links",
      "UPDATE public.billing_customer_links",
      "DELETE FROM public.billing_customer_links",
      "INSERT INTO public.grows",
      "UPDATE public.grows",
      "INSERT INTO public.plants",
      "UPDATE public.plants",
      "INSERT INTO public.sensor_readings",
      "UPDATE public.sensor_readings",
      "INSERT INTO public.alerts",
      "UPDATE public.alerts",
      "INSERT INTO public.action_queue",
      "UPDATE public.action_queue",
      "INSERT INTO public.ai_doctor_sessions",
      "UPDATE public.ai_doctor_sessions",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
  });

  it("contains idempotency and conflict protections", () => {
    expect(MIGRATION).toContain("already_applied");
    expect(MIGRATION).toContain("stale_processing_row");
    expect(MIGRATION).toContain("existing_provider_identifier_conflict");
    expect(MIGRATION).toContain("existing_non_paddle_subscription");
    expect(MIGRATION).toContain("FOR UPDATE");
  });

  it("returns sanitized result fields only", () => {
    expect(MIGRATION).toContain("processing_id");
    expect(MIGRATION).toContain("user_id");
    expect(MIGRATION).toContain("plan_id");
    expect(MIGRATION).toContain("subscription_status");
    expect(MIGRATION).not.toContain("provider_price_id', v_processing.provider_price_id");
    expect(MIGRATION).not.toContain("payload");
    expect(MIGRATION).not.toContain("raw_payload");
  });
  it("allows webhook handoff only through the reviewed RPC", () => {
    expect(WEBHOOK).toContain('supabase.rpc("apply_paddle_subscription_update"');
    expect(WEBHOOK).toContain("applyPaddleSubscriptionUpdate(supabase, processing, linkCapture)");
    expect(WEBHOOK).not.toContain("apply_paddle_entitlement_update");
    expect(WEBHOOK).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(WEBHOOK).not.toMatch(/INSERT\s+INTO\s+public\.billing_subscriptions/i);
    expect(WEBHOOK).not.toMatch(/UPDATE\s+public\.billing_subscriptions/i);
    expect(WEBHOOK).not.toMatch(/DELETE\s+FROM\s+public\.billing_subscriptions/i);
  });
});
