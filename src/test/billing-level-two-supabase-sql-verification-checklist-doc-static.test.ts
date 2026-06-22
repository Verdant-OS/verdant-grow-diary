import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DOC = readFileSync(
  join(
    process.cwd(),
    "docs",
    "billing-level-two-supabase-sql-verification-checklist.md",
  ),
  "utf8",
);

describe("billing level two supabase sql verification checklist doc", () => {
  it("declares docs/static-only, sandbox-only, no live mode", () => {
    expect(DOC).toMatch(/docs\/static-only/i);
    expect(DOC).toMatch(/sandbox[- ]only/i);
    expect(DOC).toMatch(/does not approve live mode/i);
  });

  it("warns to use non-production Supabase project only", () => {
    expect(DOC).toMatch(/non-production/i);
    expect(DOC).toMatch(/do not run against production/i);
  });

  it("forbids printing service-role keys and pasting Paddle secrets", () => {
    expect(DOC).toMatch(/do not print service-role keys/i);
    expect(DOC).toMatch(/do not paste paddle secrets/i);
  });

  it("references the migration apply-order doc", () => {
    expect(DOC).toContain("billing-level-two-migration-apply-order.md");
  });

  it("includes all expected table and function names", () => {
    for (const obj of [
      "public.billing_subscriptions",
      "public.paddle_events",
      "public.paddle_event_processing",
      "public.billing_customer_links",
      "public.billing_subscription_update_audit",
      "public.apply_paddle_subscription_update",
      "public.apply_paddle_subscription_update_with_audit",
      "public.billing_subscription_update_operator_audit",
      "public.purge_billing_subscription_update_audit",
      "public.billing_entitlement_resolution_operator_audit",
    ]) {
      expect(DOC).toContain(obj);
    }
  });

  it("uses read-only wording for migration/order verification", () => {
    expect(DOC).toMatch(/read-only/i);
  });

  it("includes sanitized operator RPC example calls", () => {
    expect(DOC).toContain(
      "public.billing_subscription_update_operator_audit(50)",
    );
    expect(DOC).toContain(
      "public.billing_entitlement_resolution_operator_audit(50)",
    );
  });

  it("lists all forbidden sanitized-output fields", () => {
    for (const field of [
      "provider_customer_id",
      "provider_subscription_id",
      "provider_price_id",
      "payload",
      "raw_payload",
      "details",
      "event_id",
    ]) {
      expect(DOC).toContain(field);
    }
  });

  it("warns not to delete billing_subscriptions rows during rollback", () => {
    expect(DOC).toMatch(/do not delete `?billing_subscriptions`? rows/i);
  });

  it("blocks live mode, Founder allocation, checkout-success grant", () => {
    expect(DOC).toMatch(/live mode/i);
    expect(DOC).toMatch(/founder allocation/i);
    expect(DOC).toMatch(/checkout-success entitlement grants?/i);
  });

  it("blocks direct webhook writes to billing_subscriptions", () => {
    expect(DOC).toMatch(/direct webhook writes to `?billing_subscriptions`?/i);
  });

  it("blocks grow-room / device automation", () => {
    expect(DOC).toMatch(/grow-room\/device automation|grow-room or device automation/i);
  });
});
