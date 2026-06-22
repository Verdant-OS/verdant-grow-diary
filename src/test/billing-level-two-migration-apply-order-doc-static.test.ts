import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(
  __dirname,
  "..",
  "..",
  "docs",
  "billing-level-two-migration-apply-order.md",
);

describe("billing level two migration apply order manifest (docs/static-only)", () => {
  it("doc file exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
  const lower = doc.toLowerCase();

  it("declares docs/static-only, sandbox-only, and does not approve live mode", () => {
    expect(lower).toContain("docs/static-only");
    expect(lower).toContain("sandbox-only");
    expect(lower).toContain("does not approve live mode");
  });

  it("includes a migration apply order section", () => {
    expect(doc).toMatch(/##\s+Apply Order/);
  });

  it("lists all required dependency groups", () => {
    const groups = [
      "billing subscription source-of-truth foundation",
      "paddle events table",
      "paddle event processing table",
      "billing customer links",
      "subscription updater rpc",
      "subscription updater harness",
      "subscription updater audit",
      "subscription updater audit retention purge rpc",
      "entitlement resolution operator audit rpc",
    ];
    for (const g of groups) {
      expect(lower).toContain(g);
    }
  });

  it("references all three operator routes", () => {
    expect(doc).toContain("/operator/paddle-processing");
    expect(doc).toContain("/operator/billing-subscription-updates");
    expect(doc).toContain("/operator/billing-entitlement-resolution");
  });

  it("requires preflight non-production confirmation", () => {
    expect(lower).toContain("not production");
  });

  it("requires service-role secret safety", () => {
    expect(lower).toMatch(/service-role secrets? (are )?not printed/);
  });

  it("requires Paddle sandbox environment", () => {
    expect(lower).toContain("paddle environment remains sandbox");
  });

  it("warns rollback must not delete billing_subscriptions rows", () => {
    expect(lower).toContain("do not delete `billing_subscriptions` rows");
  });

  it("explicitly blocks live mode, Founder allocation, and checkout-success grants", () => {
    expect(lower).toContain("- live mode");
    expect(lower).toContain("- founder allocation");
    expect(lower).toContain("- checkout-success entitlement grants");
  });

  it("explicitly blocks direct webhook writes to billing_subscriptions", () => {
    expect(lower).toContain("direct webhook writes to `billing_subscriptions`");
  });

  it("explicitly blocks raw provider IDs and Paddle payload JSON in operator UI", () => {
    expect(lower).toContain("raw provider ids in operator ui");
    expect(lower).toContain("paddle payload json in operator ui");
  });

  it("explicitly blocks grow-room/device automation", () => {
    expect(lower).toContain("grow-room/device automation");
  });

  it("does not contain Paddle payload JSON-looking examples", () => {
    // No raw JSON blob examples (curly-brace blocks with quoted keys).
    expect(doc).not.toMatch(/\{\s*"[a-z_]+"\s*:/i);
  });
});
