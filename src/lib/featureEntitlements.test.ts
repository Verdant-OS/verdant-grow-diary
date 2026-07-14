/**
 * featureEntitlements.test.ts — pure helper tests. No React, no Supabase.
 */
import { describe, it, expect } from "vitest";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import {
  canUseFeature,
  canReadExistingFeatureData,
  canWriteFeatureData,
  FEATURE_KEYS,
  type FeatureKey,
} from "@/lib/featureEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";

const NOW = new Date("2026-08-01T00:00:00Z");

function row(overrides: Partial<BillingSubscriptionRow>): BillingSubscriptionRow {
  return {
    id: "r1",
    user_id: "u1",
    plan_id: "pro_monthly",
    status: "active",
    provider: "paddle",
    provider_customer_id: null,
    provider_subscription_id: null,
    current_period_end: "2027-01-01T00:00:00Z",
    cancel_at_period_end: false,
    founder_number: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const FK: FeatureKey = "pheno_tracker";

describe("featureEntitlements", () => {
  it("exports a deterministic, typed pheno_tracker key", () => {
    expect(FEATURE_KEYS).toEqual(["pheno_tracker"]);
  });

  it("active pro_monthly can read and write", () => {
    const e = resolveEntitlements(row({ plan_id: "pro_monthly" }), NOW);
    expect(canUseFeature(e, FK)).toBe(true);
    expect(canReadExistingFeatureData(e, FK)).toBe(true);
    expect(canWriteFeatureData(e, FK)).toBe(true);
  });

  it("active pro_annual can read and write", () => {
    const e = resolveEntitlements(row({ plan_id: "pro_annual" }), NOW);
    expect(canWriteFeatureData(e, FK)).toBe(true);
  });

  it("active founder_lifetime can read and write", () => {
    const e = resolveEntitlements(row({ plan_id: "founder_lifetime" }), NOW);
    expect(canWriteFeatureData(e, FK)).toBe(true);
    expect(canUseFeature(e, FK)).toBe(true);
  });

  it("free (null row) cannot write and cannot read existing data", () => {
    const e = resolveEntitlements(null, NOW);
    expect(canUseFeature(e, FK)).toBe(false);
    expect(canWriteFeatureData(e, FK)).toBe(false);
    expect(canReadExistingFeatureData(e, FK)).toBe(false);
  });

  it("canceled pro can read existing but cannot write", () => {
    const e = resolveEntitlements(
      row({ plan_id: "pro_monthly", status: "canceled" }),
      NOW,
    );
    expect(canWriteFeatureData(e, FK)).toBe(false);
    expect(canReadExistingFeatureData(e, FK)).toBe(true);
  });

  it("expired pro cannot write; read-existing follows displayPlanId", () => {
    const e = resolveEntitlements(
      row({ plan_id: "pro_monthly", status: "expired" }),
      NOW,
    );
    expect(canWriteFeatureData(e, FK)).toBe(false);
    expect(canReadExistingFeatureData(e, FK)).toBe(true);
  });

  it("null/undefined entitlement always denies", () => {
    expect(canUseFeature(null, FK)).toBe(false);
    expect(canWriteFeatureData(undefined, FK)).toBe(false);
    expect(canReadExistingFeatureData(null, FK)).toBe(false);
  });

  it("helper source contains no localStorage/sessionStorage access", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/featureEntitlements.ts"),
      "utf8",
    );
    // Strip block + line comments so a docstring mention of the forbidden
    // globals does not falsely fail the test. Only executable references
    // should be forbidden.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(code).not.toMatch(/localStorage/);
    expect(code).not.toMatch(/sessionStorage/);
  });
});
