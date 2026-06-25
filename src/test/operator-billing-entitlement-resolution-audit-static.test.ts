/**
 * Static safety guards for the Operator entitlement resolution audit page,
 * its view-model, and the migration that ships the operator RPC.
 *
 * Proves the page does not surface raw provider IDs, payloads, user IDs,
 * emails, or internal event/processing IDs; does not read/write entitlement
 * source-of-truth tables from the browser; and does not touch grow-room or
 * device-control surfaces.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function findMigration(substring: string): string {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const matches = readdirSync(dir).filter((name) =>
    readFileSync(resolve(dir, name), "utf8").includes(substring),
  );
  if (matches.length === 0)
    throw new Error(`migration containing ${substring} not found`);
  return readFileSync(resolve(dir, matches[matches.length - 1]), "utf8");
}

const PAGE = read("src/pages/OperatorBillingEntitlementResolutionAudit.tsx");
const VIEW_MODEL = read(
  "src/lib/billingEntitlementResolutionAuditViewModel.ts",
);
const APP = read("src/App.tsx");
const SUB_UPDATE_PAGE = read(
  "src/pages/OperatorBillingSubscriptionUpdateAudit.tsx",
);
const MIGRATION = findMigration(
  "billing_entitlement_resolution_operator_audit",
);

describe("Operator entitlement resolution audit page — static safety", () => {
  it("calls the sanitized operator RPC only", () => {
    expect(PAGE).toContain("billing_entitlement_resolution_operator_audit");
    expect(PAGE).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(PAGE).not.toMatch(
      /\.from\(["']billing_subscription_update_audit["']\)/,
    );
    expect(PAGE).not.toMatch(/\.from\(["']paddle_events["']\)/);
    expect(PAGE).not.toMatch(/\.from\(["']paddle_event_processing["']\)/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });

  it("does not perform any client writes", () => {
    for (const op of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(PAGE).not.toContain(op);
    }
  });

  it("does not surface raw provider IDs, payloads, user IDs, or internal IDs", () => {
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
      "email",
    ]) {
      expect(PAGE).not.toContain(forbidden);
    }
  });

  it("does not touch grow-room operating-loop or device-control surfaces", () => {
    for (const forbidden of [
      "sensor_readings",
      "action_queue",
      "ai_doctor_sessions",
      "grow_events",
      "diary_entries",
      "alerts",
      "tents",
      "plants",
      "grows",
      "mqtt",
      "device_control",
      "device-control",
    ]) {
      expect(PAGE).not.toContain(forbidden);
    }
  });

  it("registers an operator-only route", () => {
    expect(APP).toContain("OperatorBillingEntitlementResolutionAudit");
    expect(APP).toContain("/operator/billing-entitlement-resolution");
    expect(APP).not.toContain("/billing/entitlement-resolution");
    expect(APP).not.toContain("/customer/entitlement-resolution");
  });

  it("subscription updater audit page links to the entitlement resolution audit", () => {
    expect(SUB_UPDATE_PAGE).toContain("/operator/billing-entitlement-resolution");
    expect(SUB_UPDATE_PAGE).toContain("View entitlement resolution");
  });

  it("labels the page as Operator Mode with sanitized empty/error copy", () => {
    expect(PAGE).toContain("Operator Mode");
    expect(PAGE).toContain("Billing Entitlement Resolution");
    expect(PAGE).toContain("Sanitized operator audit.");
    expect(PAGE).toContain("Provider IDs and webhook bodies are not");
    expect(PAGE).toContain("No entitlement resolution rows found.");
    expect(PAGE).toContain("Entitlement resolution audit unavailable.");
  });
});

describe("entitlement resolution view-model — forbidden keys guard", () => {
  it("declares all required forbidden keys", () => {
    for (const key of [
      "provider_customer_id",
      "provider_subscription_id",
      "provider_price_id",
      "payload",
      "raw_payload",
      "details",
      "event_id",
      "processing_id",
      "user_id",
      "email",
    ]) {
      expect(VIEW_MODEL).toContain(`"${key}"`);
    }
  });

  it("uses an explicit allow-list, never object-spreads untrusted rows", () => {
    expect(VIEW_MODEL).not.toMatch(/\.\.\.row\b/);
    expect(VIEW_MODEL).not.toMatch(/\.\.\.input\b/);
  });
});

describe("billing_entitlement_resolution_operator_audit migration", () => {
  it("creates the operator RPC with SECURITY DEFINER and locked search_path", () => {
    expect(MIGRATION).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_entitlement_resolution_operator_audit",
    );
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("SET search_path = public, pg_temp");
    expect(MIGRATION).toContain("RETURNS jsonb");
  });

  it("enforces operator role and clamps limit 1..100", () => {
    expect(MIGRATION).toContain(
      "public.has_role(auth.uid(), 'operator'::public.app_role)",
    );
    expect(MIGRATION).toContain("operator_required");
    expect(MIGRATION).toContain(
      "LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)",
    );
  });

  it("revokes from public/anon and grants execute to authenticated + service_role only", () => {
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.billing_entitlement_resolution_operator_audit(integer) FROM PUBLIC",
    );
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.billing_entitlement_resolution_operator_audit(integer) FROM anon",
    );
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.billing_entitlement_resolution_operator_audit(integer) TO authenticated",
    );
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.billing_entitlement_resolution_operator_audit(integer) TO service_role",
    );
  });

  it("never returns raw provider IDs, payloads, user IDs, or internal IDs", () => {
    // Strip SQL line comments and COMMENT ON documentation so prose that
    // names forbidden tokens (e.g. "no payloads returned") does not trip
    // the guard. Only executable SQL is inspected.
    const codeOnly = MIGRATION
      .replace(/--[^\n]*/g, "")
      .replace(/COMMENT\s+ON[\s\S]*?;/gi, "");
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
      "email",
    ]) {
      expect(codeOnly).not.toContain(forbidden);
    }
  });

  it("does not write to billing_subscriptions or grow-room/device-control tables", () => {
    for (const forbidden of [
      "INSERT INTO public.billing_subscriptions",
      "UPDATE public.billing_subscriptions",
      "DELETE FROM public.billing_subscriptions",
      "INSERT INTO public.paddle_events",
      "INSERT INTO public.billing_subscription_update_audit",
      "sensor_readings",
      "action_queue",
      "ai_doctor_sessions",
      "grow_events",
      "diary_entries",
      "alerts",
      "tents",
      "plants",
      "grows",
      "mqtt",
      "device_control",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
  });
});
