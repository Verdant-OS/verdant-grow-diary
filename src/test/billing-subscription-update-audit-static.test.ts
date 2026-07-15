import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function findMigration(substring: string): string {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const match = readdirSync(dir).find((name) => name.includes(substring));
  if (!match) throw new Error(`migration not found: ${substring}`);
  return readFileSync(resolve(dir, match), "utf8");
}

const MIGRATION = findMigration("billing_subscription_update_audit");
const RETENTION_MIGRATION = findMigration("billing_subscription_update_audit_retention");
const WEBHOOK = readProjectFile("supabase/functions/paddle-webhook/index.ts");

describe("billing_subscription_update_audit migration", () => {
  it("creates the audit table with the required sanitized columns", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS public.billing_subscription_update_audit");
    for (const col of [
      "processing_id uuid",
      "user_id uuid",
      "result_status text NOT NULL",
      "result_reason text",
      "candidate_plan_id text",
      "candidate_status text",
      "subscription_status text",
      "created_at timestamptz",
    ]) {
      expect(MIGRATION).toContain(col);
    }
  });

  it("constrains status/plan/subscription_status enums", () => {
    expect(MIGRATION).toContain("'created','updated','noop','blocked','failed','skipped'");
    expect(MIGRATION).toContain("'free','pro_monthly','pro_annual','founder_lifetime'");
    expect(MIGRATION).toMatch(/candidate_status .*'active','past_due','canceled','paused','expired'/s);
    expect(MIGRATION).toMatch(/subscription_status .*'active','past_due','canceled','paused','expired'/s);
  });

  it("locks direct table access to service_role only and enables RLS", () => {
    expect(MIGRATION).toContain("REVOKE ALL ON public.billing_subscription_update_audit FROM PUBLIC");
    expect(MIGRATION).toContain("REVOKE ALL ON public.billing_subscription_update_audit FROM anon");
    expect(MIGRATION).toContain("REVOKE ALL ON public.billing_subscription_update_audit FROM authenticated");
    expect(MIGRATION).toContain("GRANT ALL ON public.billing_subscription_update_audit TO service_role");
    expect(MIGRATION).toContain("ALTER TABLE public.billing_subscription_update_audit ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).not.toMatch(/CREATE POLICY[\s\S]*billing_subscription_update_audit[\s\S]*(anon|authenticated)/i);
    expect(MIGRATION).not.toMatch(/GRANT[^;]*ON public\.billing_subscription_update_audit[^;]*TO\s+(anon|authenticated)/i);
  });

  it("creates a service-role-only wrapper RPC that calls the existing updater", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.apply_paddle_subscription_update_with_audit");
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("SET search_path = public, pg_temp");
    expect(MIGRATION).toContain("public.apply_paddle_subscription_update(p_processing_id)");
    expect(MIGRATION).toContain("INSERT INTO public.billing_subscription_update_audit");
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update_with_audit(uuid) FROM anon");
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update_with_audit(uuid) FROM authenticated");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.apply_paddle_subscription_update_with_audit(uuid) TO service_role");
    expect(MIGRATION).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.apply_paddle_subscription_update_with_audit\(uuid\)\s+TO\s+(anon|authenticated)/i);
  });

  it("wrapper RPC does not persist raw provider IDs, prices, or payloads", () => {
    const wrapperSection = MIGRATION.split("apply_paddle_subscription_update_with_audit")[1] ?? "";
    for (const forbidden of [
      "provider_customer_id",
      "provider_subscription_id",
      "provider_price_id",
      "raw_payload",
      "payload",
    ]) {
      expect(wrapperSection.includes(forbidden)).toBe(false);
    }
  });

  it("creates an operator-only read RPC that exposes only sanitized fields", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.billing_subscription_update_operator_audit");
    expect(MIGRATION).toContain("public.has_role(auth.uid(), 'operator'::public.app_role)");
    expect(MIGRATION).toContain("operator_required");
    expect(MIGRATION).toContain("LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)");

    const operatorSection = MIGRATION.split("billing_subscription_update_operator_audit")[1] ?? "";
    for (const forbidden of [
      "provider_customer_id",
      "provider_subscription_id",
      "provider_price_id",
      "raw_payload",
      "payload",
      "details",
    ]) {
      expect(operatorSection.includes(forbidden)).toBe(false);
    }
  });

  it("does not write grow/plant/tent/sensor/alert/action/AI/device tables", () => {
    for (const forbidden of [
      "public.grows",
      "public.plants",
      "public.tents",
      "public.sensor_readings",
      "public.alerts",
      "public.action_queue",
      "public.ai_doctor_sessions",
      "public.grow_events",
      "public.diary_entries",
      "device_control",
      "mqtt",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
  });
});

describe("paddle webhook -> audited wrapper handoff", () => {
  it("webhook calls the audited wrapper RPCs via the founder-aware dispatch", () => {
    expect(WEBHOOK).toMatch(
      /const rpcName = processing\.isFounderCandidate\s*\?\s*"allocate_founder_lifetime_with_audit"\s*:\s*"apply_paddle_subscription_update_with_audit";/,
    );
    expect(WEBHOOK).toMatch(/await supabase\.rpc\(rpcName,\s*\{\s*p_processing_id: processing\.id,?\s*\}/);
  });

  it("webhook does not call the raw updater RPC directly", () => {
    expect(WEBHOOK).not.toMatch(/rpc\(\s*["']apply_paddle_subscription_update["']\s*,/);
  });

  it("webhook does not directly access billing_subscriptions", () => {
    expect(WEBHOOK).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(WEBHOOK).not.toMatch(/INSERT\s+INTO\s+public\.billing_subscriptions/i);
    expect(WEBHOOK).not.toMatch(/UPDATE\s+public\.billing_subscriptions/i);
    expect(WEBHOOK).not.toMatch(/DELETE\s+FROM\s+public\.billing_subscriptions/i);
  });

  it("webhook does not touch grow-room operating-loop or device-control surfaces", () => {
    for (const forbidden of [
      "sensor_readings",
      "raw_payload",
      "action_queue",
      "ai_doctor_sessions",
      "grow_events",
      "diary_entries",
      "device_control",
      "device-control",
    ]) {
      expect(WEBHOOK).not.toContain(forbidden);
    }
  });
});

describe("billing_subscription_update_audit retention purge migration", () => {
  it("creates a SECURITY DEFINER purge RPC with locked search_path", () => {
    expect(RETENTION_MIGRATION).toContain(
      "CREATE OR REPLACE FUNCTION public.purge_billing_subscription_update_audit",
    );
    expect(RETENTION_MIGRATION).toContain("SECURITY DEFINER");
    expect(RETENTION_MIGRATION).toContain("SET search_path = public, pg_temp");
    expect(RETENTION_MIGRATION).toContain("RETURNS jsonb");
  });

  it("is service-role-only: revokes from PUBLIC/anon/authenticated, grants only service_role", () => {
    expect(RETENTION_MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.purge_billing_subscription_update_audit(integer) FROM PUBLIC",
    );
    expect(RETENTION_MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.purge_billing_subscription_update_audit(integer) FROM anon",
    );
    expect(RETENTION_MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.purge_billing_subscription_update_audit(integer) FROM authenticated",
    );
    expect(RETENTION_MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.purge_billing_subscription_update_audit(integer) TO service_role",
    );
    expect(RETENTION_MIGRATION).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.purge_billing_subscription_update_audit\(integer\)\s+TO\s+(anon|authenticated|PUBLIC)/i,
    );
  });

  it("clamps retention days between 90 and 2555", () => {
    expect(RETENTION_MIGRATION).toContain(
      "LEAST(GREATEST(COALESCE(p_retention_days, 365), 90), 2555)",
    );
  });

  it("deletes only from billing_subscription_update_audit, never from entitlement or grow-room tables", () => {
    expect(RETENTION_MIGRATION).toMatch(
      /DELETE\s+FROM\s+public\.billing_subscription_update_audit/i,
    );
    for (const forbidden of [
      "DELETE FROM public.billing_subscriptions",
      "DELETE FROM public.paddle_events",
      "DELETE FROM public.paddle_event_processing",
      "DELETE FROM public.billing_customer_links",
      "DELETE FROM public.grows",
      "DELETE FROM public.plants",
      "DELETE FROM public.tents",
      "DELETE FROM public.sensor_readings",
      "DELETE FROM public.alerts",
      "DELETE FROM public.action_queue",
      "DELETE FROM public.ai_doctor_sessions",
      "DELETE FROM public.grow_events",
      "DELETE FROM public.diary_entries",
    ]) {
      expect(RETENTION_MIGRATION).not.toContain(forbidden);
    }
  });

  it("returns only sanitized counts, no raw IDs or payloads", () => {
    expect(RETENTION_MIGRATION).toContain("'ok'");
    expect(RETENTION_MIGRATION).toContain("'retention_days'");
    expect(RETENTION_MIGRATION).toContain("'deleted_count'");
    // Strip SQL line comments so documentation that names forbidden tokens
    // (e.g. "no provider IDs returned") does not trip the guard.
    const codeOnly = RETENTION_MIGRATION.replace(/--[^\n]*/g, "");
    for (const forbidden of [
      "provider_customer_id",
      "provider_subscription_id",
      "provider_price_id",
      "raw_payload",
      "payload",
      "details",
      "event_id",
      "processing_id",
      "user_id",
      "RETURNING",
    ]) {
      expect(codeOnly).not.toContain(forbidden);
    }
  });

  it("does not touch grow-room or device-control surfaces", () => {
    for (const forbidden of [
      "sensor_readings",
      "action_queue",
      "ai_doctor_sessions",
      "grow_events",
      "diary_entries",
      "alerts",
      "mqtt",
      "device_control",
      "device-control",
    ]) {
      expect(RETENTION_MIGRATION).not.toContain(forbidden);
    }
  });

  it("documents scheduling: either an existing cron pattern or a service-role manual schedule note", () => {
    const hasCron = /pg_cron|cron\.schedule/i.test(RETENTION_MIGRATION);
    const hasManualNote = /service-role scheduled maintenance/i.test(RETENTION_MIGRATION);
    expect(hasCron || hasManualNote).toBe(true);
  });
});
