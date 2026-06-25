import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MIGRATION = readProjectFile(
  "supabase/migrations/20260620234500_add_paddle_event_processing.sql",
);

describe("paddle_event_processing migration", () => {
  it("creates a one-row-per-recorded-event processing table", () => {
    expect(MIGRATION).toContain("CREATE TABLE public.paddle_event_processing");
    expect(MIGRATION).toContain(
      "paddle_event_id uuid NOT NULL UNIQUE REFERENCES public.paddle_events(id) ON DELETE CASCADE",
    );
    expect(MIGRATION).toContain("event_id text NOT NULL");
    expect(MIGRATION).toContain("event_type text NOT NULL");
    expect(MIGRATION).toContain("environment text NOT NULL");
  });

  it("models processing outcomes without granting entitlement", () => {
    expect(MIGRATION).toContain(
      "status text NOT NULL CHECK (status IN ('processed', 'ignored', 'blocked', 'failed'))",
    );
    expect(MIGRATION).toContain("reason text NULL");
    expect(MIGRATION).toContain("candidate_plan_id text NULL");
    expect(MIGRATION).toContain("candidate_status text NULL");
    expect(MIGRATION).toContain("provider_customer_id text NULL");
    expect(MIGRATION).toContain("provider_subscription_id text NULL");
    expect(MIGRATION).toContain("provider_price_id text NULL");
    expect(MIGRATION).toContain("is_founder_candidate boolean NOT NULL DEFAULT false");
  });

  it("keeps plan and status candidates constrained to known Verdant values", () => {
    expect(MIGRATION).toContain(
      "candidate_plan_id IS NULL OR candidate_plan_id IN ('free', 'pro_monthly', 'pro_annual', 'founder_lifetime')",
    );
    expect(MIGRATION).toContain(
      "candidate_status IS NULL OR candidate_status IN ('active', 'past_due', 'canceled', 'paused', 'expired')",
    );
  });

  it("uses service-role-only access with RLS default-deny for client roles", () => {
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.paddle_event_processing FROM PUBLIC");
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.paddle_event_processing FROM anon");
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.paddle_event_processing FROM authenticated");
    expect(MIGRATION).toContain("GRANT ALL ON TABLE public.paddle_event_processing TO service_role");
    expect(MIGRATION).toContain("ALTER TABLE public.paddle_event_processing ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).not.toMatch(/CREATE\s+POLICY/i);
  });

  it("adds indexes useful for replay, operator audit, and future processing", () => {
    expect(MIGRATION).toContain("idx_paddle_event_processing_status");
    expect(MIGRATION).toContain("idx_paddle_event_processing_event_type");
    expect(MIGRATION).toContain("idx_paddle_event_processing_processed_at");
    expect(MIGRATION).toContain("idx_paddle_event_processing_provider_customer");
    expect(MIGRATION).toContain("idx_paddle_event_processing_provider_subscription");
  });

  it("does not modify entitlement source-of-truth rows or webhook behavior", () => {
    expect(MIGRATION).not.toMatch(/ALTER\s+TABLE\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/INSERT\s+INTO\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
    expect(MIGRATION).not.toMatch(/public\.paddle_events\s+ADD/i);
  });

  it("does not touch grow-room operating-loop or device-control surfaces", () => {
    for (const forbidden of [
      "sensor_readings",
      "raw_payload",
      "alerts",
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
