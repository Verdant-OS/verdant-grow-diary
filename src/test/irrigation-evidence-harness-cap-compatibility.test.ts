import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HARNESS = readFileSync(resolve("scripts/run-irrigation-evidence-rls-harness.ts"), "utf8");

describe("irrigation evidence harness creation-cap compatibility", () => {
  it("keeps the primary owner fixture on the authenticated client path", () => {
    expect(HARNESS).toContain('const oTent = await seedId(ownerC, "tents", {');
  });

  it("uses trusted test setup only for the required over-cap tent fixture", () => {
    expect(HARNESS).toContain('const oTent2 = await seedId(admin, "tents", {');
    expect(HARNESS).toContain("trusted service-role setup");
  });

  it("never manufactures a paid entitlement to bypass the creation cap", () => {
    expect(HARNESS).not.toContain('.from("billing_subscriptions")');
    expect(HARNESS).not.toContain('.from("subscriptions")');
  });
});
