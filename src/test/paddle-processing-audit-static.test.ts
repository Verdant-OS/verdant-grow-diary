import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MIGRATION = readProjectFile(
  "supabase/migrations/20260621003000_paddle_event_processing_operator_audit.sql",
);
const PAGE = readProjectFile("src/pages/OperatorPaddleProcessingAudit.tsx");
const APP = readProjectFile("src/App.tsx");

describe("Paddle processing operator audit static guards", () => {
  it("adds an operator-gated sanitized RPC instead of client table grants", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.paddle_event_processing_operator_audit");
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("public.has_role(auth.uid(), 'operator'::public.app_role)");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.paddle_event_processing_operator_audit(integer) TO authenticated");
    expect(MIGRATION).not.toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.paddle_event_processing\s+TO\s+authenticated/i);
    expect(MIGRATION).not.toMatch(/CREATE\s+POLICY/i);
  });

  it("returns only sanitized fields from the processing table", () => {
    expect(MIGRATION).toContain("processed_at");
    expect(MIGRATION).toContain("event_type");
    expect(MIGRATION).toContain("environment");
    expect(MIGRATION).toContain("candidate_plan_id");
    expect(MIGRATION).not.toMatch(/payload/);
    expect(MIGRATION).not.toMatch(/details/);
    expect(MIGRATION).not.toMatch(/provider_customer_id/);
    expect(MIGRATION).not.toMatch(/provider_subscription_id/);
    expect(MIGRATION).not.toMatch(/provider_price_id/);
    expect(MIGRATION).not.toMatch(/event_id'\s*,\s*event_id/);
  });

  it("does not read or write entitlement source-of-truth rows", () => {
    for (const src of [MIGRATION, PAGE]) {
      expect(src).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
      expect(src).not.toMatch(/INSERT\s+INTO\s+public\.billing_subscriptions/i);
      expect(src).not.toMatch(/UPDATE\s+public\.billing_subscriptions/i);
      expect(src).not.toMatch(/DELETE\s+FROM\s+public\.billing_subscriptions/i);
      expect(src).not.toMatch(/UPSERT/i);
      expect(src).not.toMatch(/grantPro|setPro|isPro\s*=\s*true/i);
    }
  });

  it("keeps the page RPC-only with no direct processing table read or writes", () => {
    expect(PAGE).toContain("paddle_event_processing_operator_audit");
    expect(PAGE).not.toMatch(/\.from\(["']paddle_event_processing["']\)/);
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });

  it("routes the operator audit page without surfacing it as a customer route", () => {
    expect(APP).toContain("OperatorPaddleProcessingAudit");
    expect(APP).toContain('/operator/paddle-processing-audit');
    expect(APP).not.toContain('/billing/paddle-processing-audit');
    expect(APP).not.toContain('/customer/paddle-processing-audit');
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
      expect(PAGE).not.toContain(forbidden);
    }
  });
});
