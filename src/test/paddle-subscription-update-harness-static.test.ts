import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const HARNESS = readProjectFile("supabase/tests/paddle_subscription_update_rpc_harness.sql");
const MIGRATION = readProjectFile("supabase/migrations/20260621015000_apply_paddle_subscription_update_rpc.sql");
const WEBHOOK = readProjectFile("supabase/functions/paddle-webhook/index.ts");

describe("Paddle subscription update runtime harness", () => {
  it("is a rollback-only database-local harness", () => {
    expect(HARNESS).toContain("BEGIN;");
    expect(HARNESS).toContain("ROLLBACK;");
    expect(HARNESS).toContain("Run only against local or disposable staging databases");
    expect(HARNESS).not.toContain("COMMIT;");
  });

  it("covers create, replay noop, update, missing link block, and Founder block", () => {
    expect(HARNESS).toContain("Pro Monthly create");
    expect(HARNESS).toContain("already_applied");
    expect(HARNESS).toContain("Pro Annual update");
    expect(HARNESS).toContain("missing_verified_customer_link");
    expect(HARNESS).toContain("founder_allocation_deferred");
    expect(HARNESS).toContain("Blocked Founder candidate created unexpected subscription row");
  });

  it("exercises the merged RPC without wiring app runtime", () => {
    expect(HARNESS).toContain("public.apply_paddle_subscription_update");
    expect(WEBHOOK).not.toContain("apply_paddle_subscription_update");
    expect(WEBHOOK).not.toContain("apply_paddle_entitlement_update");
  });

  it("keeps the RPC service-role-only by migration grant posture", () => {
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.apply_paddle_subscription_update(uuid) TO service_role");
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update(uuid) FROM anon");
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.apply_paddle_subscription_update(uuid) FROM authenticated");
    expect(MIGRATION).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.apply_paddle_subscription_update\(uuid\)\s+TO\s+(anon|authenticated)/i);
  });

  it("does not touch grow-room operating-loop or device-control tables", () => {
    for (const forbidden of [
      "public.grows",
      "public.plants",
      "public.tents",
      "public.sensor_readings",
      "public.alerts",
      "public.action_queue",
      "public.ai_doctor_sessions",
      "mqtt",
      "device_control",
      "device-control",
    ]) {
      expect(HARNESS).not.toContain(forbidden);
    }
  });
});
