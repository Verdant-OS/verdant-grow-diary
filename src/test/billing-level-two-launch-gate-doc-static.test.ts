import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/billing-level-two-launch-gate.md");
const doc = readFileSync(DOC_PATH, "utf8");
const lower = doc.toLowerCase();

describe("billing level two launch gate doc — static guard", () => {
  it("declares sandbox-only status and blocks live mode in this slice", () => {
    expect(lower).toContain("sandbox-only");
    expect(lower).toContain("live mode is not approved in this slice");
  });

  it("lists all three operator verification routes", () => {
    expect(doc).toContain("/operator/paddle-processing");
    expect(doc).toContain("/operator/billing-subscription-updates");
    expect(doc).toContain("/operator/billing-entitlement-resolution");
  });

  it("explicitly blocks live mode", () => {
    expect(lower).toMatch(/explicitly blocked until future slice[\s\S]*live mode/);
  });

  it("explicitly blocks Founder allocation", () => {
    expect(lower).toContain("founder allocation");
  });

  it("explicitly blocks checkout-success entitlement grant", () => {
    expect(lower).toContain("checkout-success entitlement grant");
  });

  it("explicitly blocks direct webhook writes to billing_subscriptions", () => {
    expect(lower).toContain("direct webhook writes to `billing_subscriptions`");
  });

  it("explicitly blocks raw provider IDs in operator UI", () => {
    expect(lower).toContain("raw provider ids in operator ui");
  });

  it("explicitly blocks Paddle payload JSON in operator UI", () => {
    expect(lower).toContain("paddle payload json in operator ui");
  });

  it("lists required green checks before live mode", () => {
    expect(doc).toMatch(/Required Green Checks Before Live Mode/);
    for (const token of [
      "typecheck clean",
      "build green",
      "Paddle sandbox webhook signing verified",
      "duplicate webhook delivery verified idempotent",
      "rollback checklist reviewed",
    ]) {
      expect(doc).toContain(token);
    }
  });

  it("rollback notes forbid deleting billing_subscriptions rows", () => {
    expect(lower).toContain("do not delete `billing_subscriptions` rows");
  });

  it("explicitly blocks grow-room/device automation", () => {
    expect(lower).toContain("grow-room/device automation");
  });

  it("does not embed raw Paddle payload JSON examples", () => {
    // Guard: doc must not contain a JSON-looking Paddle payload block.
    expect(doc).not.toMatch(/"event_type"\s*:/);
    expect(doc).not.toMatch(/"customer_id"\s*:\s*"ctm_/);
    expect(doc).not.toMatch(/"subscription_id"\s*:\s*"sub_/);
  });
});
