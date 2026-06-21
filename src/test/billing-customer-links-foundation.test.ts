import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MIGRATION = readProjectFile(
  "supabase/migrations/20260621004500_billing_customer_links_foundation.sql",
);

describe("billing customer links foundation migration", () => {
  it("creates a server-owned billing customer link table", () => {
    expect(MIGRATION).toContain("CREATE TABLE public.billing_customer_links");
    expect(MIGRATION).toContain("user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE");
    expect(MIGRATION).toContain("provider text NOT NULL CHECK (provider IN ('paddle'))");
    expect(MIGRATION).toContain("provider_customer_id text NOT NULL");
    expect(MIGRATION).toContain("provider_subscription_id text NULL");
    expect(MIGRATION).toContain("provider_checkout_id text NULL");
    expect(MIGRATION).toContain("last_paddle_event_id text NULL");
  });

  it("constrains link state without implying paid access", () => {
    expect(MIGRATION).toContain("CHECK (link_status IN ('linked', 'pending_review', 'blocked', 'inactive'))");
    expect(MIGRATION).toContain("CHECK (link_source IN ('checkout', 'webhook', 'operator', 'import', 'unknown'))");
    expect(MIGRATION).toContain("CHECK (confidence IN ('verified', 'review_required', 'blocked'))");
    expect(MIGRATION).toContain("No entitlement grant is implied");
    expect(MIGRATION).toContain("Does not grant paid access");
  });

  it("enforces unambiguous provider identifier ownership", () => {
    expect(MIGRATION).toContain("billing_customer_links_provider_customer_uniq");
    expect(MIGRATION).toContain("ON public.billing_customer_links (provider, provider_customer_id)");
    expect(MIGRATION).toContain("billing_customer_links_provider_subscription_uniq");
    expect(MIGRATION).toContain("WHERE provider_subscription_id IS NOT NULL");
    expect(MIGRATION).toContain("billing_customer_links_provider_checkout_uniq");
    expect(MIGRATION).toContain("WHERE provider_checkout_id IS NOT NULL");
  });

  it("keeps direct table access service-role only", () => {
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.billing_customer_links FROM PUBLIC");
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.billing_customer_links FROM anon");
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.billing_customer_links FROM authenticated");
    expect(MIGRATION).toContain("GRANT ALL ON TABLE public.billing_customer_links TO service_role");
    expect(MIGRATION).toContain("ALTER TABLE public.billing_customer_links ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).not.toMatch(/CREATE\s+POLICY/i);
    expect(MIGRATION).not.toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.billing_customer_links\s+TO\s+authenticated/i);
  });

  it("adds sanitized self-summary and operator-audit RPCs", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.billing_customer_link_summary()");
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.billing_customer_link_operator_audit");
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("public.has_role(auth.uid(), 'operator'::public.app_role)");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.billing_customer_link_summary() TO authenticated");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.billing_customer_link_operator_audit(integer) TO authenticated");
  });

  it("keeps RPC output sanitized", () => {
    expect(MIGRATION).toContain("'has_customer_id', provider_customer_id IS NOT NULL");
    expect(MIGRATION).toContain("'has_subscription_id', provider_subscription_id IS NOT NULL");
    expect(MIGRATION).toContain("'has_checkout_id', provider_checkout_id IS NOT NULL");
    expect(MIGRATION).toContain("'has_event_reference', last_paddle_event_id IS NOT NULL");
    expect(MIGRATION).not.toContain("'provider_customer_id', provider_customer_id");
    expect(MIGRATION).not.toContain("'provider_subscription_id', provider_subscription_id");
    expect(MIGRATION).not.toContain("'provider_checkout_id', provider_checkout_id");
    expect(MIGRATION).not.toContain("'last_paddle_event_id', last_paddle_event_id");
    expect(MIGRATION).not.toMatch(/payload/);
    expect(MIGRATION).not.toMatch(/details/);
  });

  it("does not read or mutate billing subscription entitlement rows", () => {
    expect(MIGRATION).not.toMatch(/FROM\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/JOIN\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/INSERT\s+INTO\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/UPSERT/i);
  });

  it("does not touch grow-room operating-loop or device-control surfaces", () => {
    for (const forbidden of [
      "sensor_readings",
      "raw_payload",
      "action_queue",
      "ai_doctor_sessions",
      "grow_events",
      "diary_entries",
      "mqtt",
      "device_control",
      "device-control",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
  });
});
