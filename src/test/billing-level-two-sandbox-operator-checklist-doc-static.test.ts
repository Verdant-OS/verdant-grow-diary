import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DOC = readFileSync(
  join(process.cwd(), "docs", "billing-level-two-sandbox-operator-checklist.md"),
  "utf8",
);

describe("billing level two sandbox operator checklist doc", () => {
  it("declares docs/static-only, sandbox-only, no live mode", () => {
    expect(DOC).toMatch(/docs\/static-only/i);
    expect(DOC).toMatch(/sandbox[- ]only/i);
    expect(DOC).toMatch(/does not approve live mode/i);
  });

  it("includes all required quick links", () => {
    for (const link of [
      "billing-level-two-launch-gate.md",
      "billing-level-two-migration-apply-order.md",
      "billing-level-two-sandbox-migration-operator-runbook.md",
      "billing-level-two-sandbox-verification-runbook.md",
      "billing-level-two-supabase-sql-verification-checklist.md",
    ]) {
      expect(DOC).toContain(link);
    }
  });

  it("includes all three operator routes", () => {
    expect(DOC).toContain("/operator/paddle-processing");
    expect(DOC).toContain("/operator/billing-subscription-updates");
    expect(DOC).toContain("/operator/billing-entitlement-resolution");
  });

  it("includes evidence rules for secrets, provider IDs, payload JSON", () => {
    expect(DOC).toMatch(/service-role keys/i);
    expect(DOC).toMatch(/paddle secrets/i);
    expect(DOC).toMatch(/raw provider ids/i);
    expect(DOC).toMatch(/paddle payload json/i);
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
