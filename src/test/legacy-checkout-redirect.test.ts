/**
 * Pure unit tests for legacyCheckoutRedirect helpers (Slice E).
 */
import { describe, it, expect } from "vitest";
import {
  buildLegacyBillingRedirect,
  resolveLegacyPlanSlug,
} from "@/lib/legacyCheckoutRedirect";

describe("resolveLegacyPlanSlug", () => {
  it("maps hyphenated legacy slugs to canonical PlanIds", () => {
    expect(resolveLegacyPlanSlug("pro-monthly")).toBe("pro_monthly");
    expect(resolveLegacyPlanSlug("pro-annual")).toBe("pro_annual");
    expect(resolveLegacyPlanSlug("founder-lifetime")).toBe("founder_lifetime");
  });

  it("passes canonical underscore ids through", () => {
    expect(resolveLegacyPlanSlug("pro_monthly")).toBe("pro_monthly");
    expect(resolveLegacyPlanSlug("pro_annual")).toBe("pro_annual");
    expect(resolveLegacyPlanSlug("founder_lifetime")).toBe("founder_lifetime");
  });

  it("normalizes case", () => {
    expect(resolveLegacyPlanSlug("Pro-Monthly")).toBe("pro_monthly");
    expect(resolveLegacyPlanSlug("FOUNDER-LIFETIME")).toBe("founder_lifetime");
  });

  it("returns null for unknown, empty, or non-string input", () => {
    expect(resolveLegacyPlanSlug("free")).toBeNull();
    expect(resolveLegacyPlanSlug("enterprise")).toBeNull();
    expect(resolveLegacyPlanSlug("")).toBeNull();
    expect(resolveLegacyPlanSlug(null)).toBeNull();
    expect(resolveLegacyPlanSlug(undefined)).toBeNull();
    // @ts-expect-error runtime guard for non-string input
    expect(resolveLegacyPlanSlug(123)).toBeNull();
  });
});

describe("buildLegacyBillingRedirect", () => {
  it("builds /upgrade?plan=<canonical> for a known legacy slug", () => {
    expect(buildLegacyBillingRedirect({ planSlug: "pro-monthly" })).toBe(
      "/upgrade?plan=pro_monthly",
    );
    expect(buildLegacyBillingRedirect({ planSlug: "pro-annual" })).toBe(
      "/upgrade?plan=pro_annual",
    );
    expect(buildLegacyBillingRedirect({ planSlug: "founder-lifetime" })).toBe(
      "/upgrade?plan=founder_lifetime",
    );
  });

  it("returns bare /upgrade when the slug is unknown or missing", () => {
    expect(buildLegacyBillingRedirect({ planSlug: undefined })).toBe("/upgrade");
    expect(buildLegacyBillingRedirect({ planSlug: "" })).toBe("/upgrade");
    expect(buildLegacyBillingRedirect({ planSlug: "enterprise" })).toBe("/upgrade");
    expect(buildLegacyBillingRedirect({ planSlug: "free" })).toBe("/upgrade");
  });

  it("preserves a safe same-origin returnTo (URLSearchParams input)", () => {
    const search = new URLSearchParams("returnTo=/pheno-hunts/new");
    expect(
      buildLegacyBillingRedirect({ planSlug: "pro-monthly", search }),
    ).toBe("/upgrade?plan=pro_monthly&returnTo=%2Fpheno-hunts%2Fnew");
  });

  it("preserves returnTo when planSlug is missing (bare /upgrade + returnTo)", () => {
    expect(
      buildLegacyBillingRedirect({
        planSlug: null,
        search: "returnTo=/dashboard",
      }),
    ).toBe("/upgrade?returnTo=%2Fdashboard");
  });

  it("drops unsafe returnTo values silently", () => {
    for (const bad of [
      "returnTo=https://evil.example/",
      "returnTo=//evil.example/",
      "returnTo=javascript:alert(1)",
      "returnTo=/\\\\evil",
    ]) {
      expect(
        buildLegacyBillingRedirect({ planSlug: "pro-monthly", search: bad }),
      ).toBe("/upgrade?plan=pro_monthly");
    }
  });

  it("ignores unrelated query params", () => {
    expect(
      buildLegacyBillingRedirect({
        planSlug: "pro-monthly",
        search: "utm_source=x&plan=founder-lifetime&returnTo=/logs",
      }),
    ).toBe("/upgrade?plan=pro_monthly&returnTo=%2Flogs");
  });

  it("never grants entitlement — output is always a same-origin /upgrade path", () => {
    for (const slug of [
      "pro-monthly",
      "pro-annual",
      "founder-lifetime",
      "unknown",
      "",
      null,
      undefined,
    ] as const) {
      const out = buildLegacyBillingRedirect({ planSlug: slug });
      expect(out.startsWith("/upgrade")).toBe(true);
      expect(out.includes("://")).toBe(false);
    }
  });
});
