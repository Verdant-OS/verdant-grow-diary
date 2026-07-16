/**
 * Pure unit tests for legacyCheckoutRedirect helpers (Slice E).
 */
import { describe, it, expect } from "vitest";
import {
  buildLegacyBillingRedirect,
  buildLegacyUpgradeRedirect,
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
  it("builds /pricing?plan=<canonical> for a known legacy slug", () => {
    expect(buildLegacyBillingRedirect({ planSlug: "pro-monthly" })).toBe(
      "/pricing?plan=pro_monthly",
    );
    expect(buildLegacyBillingRedirect({ planSlug: "pro-annual" })).toBe("/pricing?plan=pro_annual");
    expect(buildLegacyBillingRedirect({ planSlug: "founder-lifetime" })).toBe(
      "/pricing?plan=founder_lifetime",
    );
  });

  it("returns bare /pricing when the slug is unknown or missing", () => {
    expect(buildLegacyBillingRedirect({ planSlug: undefined })).toBe("/pricing");
    expect(buildLegacyBillingRedirect({ planSlug: "" })).toBe("/pricing");
    expect(buildLegacyBillingRedirect({ planSlug: "enterprise" })).toBe("/pricing");
    expect(buildLegacyBillingRedirect({ planSlug: "free" })).toBe("/pricing");
  });

  it("preserves a safe same-origin returnTo (URLSearchParams input)", () => {
    const search = new URLSearchParams("returnTo=/pheno-hunts/new");
    expect(buildLegacyBillingRedirect({ planSlug: "pro-monthly", search })).toBe(
      "/pricing?plan=pro_monthly&returnTo=%2Fpheno-hunts%2Fnew",
    );
  });

  it("preserves returnTo when planSlug is missing (bare /pricing + returnTo)", () => {
    expect(
      buildLegacyBillingRedirect({
        planSlug: null,
        search: "returnTo=/dashboard",
      }),
    ).toBe("/pricing?returnTo=%2Fdashboard");
  });

  it("drops unsafe returnTo values silently", () => {
    for (const bad of [
      "returnTo=https://evil.example/",
      "returnTo=//evil.example/",
      "returnTo=javascript:alert(1)",
      "returnTo=/\\\\evil",
    ]) {
      expect(buildLegacyBillingRedirect({ planSlug: "pro-monthly", search: bad })).toBe(
        "/pricing?plan=pro_monthly",
      );
    }
  });

  it("ignores unrelated query params", () => {
    expect(
      buildLegacyBillingRedirect({
        planSlug: "pro-monthly",
        search: "utm_source=x&plan=founder-lifetime&returnTo=/logs",
      }),
    ).toBe("/pricing?plan=pro_monthly&returnTo=%2Flogs");
  });

  it("never grants entitlement — output is always a same-origin /pricing path", () => {
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
      expect(out.startsWith("/pricing")).toBe(true);
      expect(out.includes("://")).toBe(false);
    }
  });
});

describe("buildLegacyUpgradeRedirect", () => {
  it("preserves canonical or legacy paid plan selection", () => {
    expect(buildLegacyUpgradeRedirect({ search: "plan=pro_monthly" })).toBe(
      "/pricing?plan=pro_monthly",
    );
    expect(buildLegacyUpgradeRedirect({ search: "plan=pro-annual" })).toBe(
      "/pricing?plan=pro_annual",
    );
    expect(buildLegacyUpgradeRedirect({ search: "plan=founder_lifetime" })).toBe(
      "/pricing?plan=founder_lifetime",
    );
  });

  it("preserves only a safe same-origin return path", () => {
    expect(
      buildLegacyUpgradeRedirect({
        search: "plan=pro_monthly&returnTo=/pheno-hunts/new?growId=abc",
      }),
    ).toBe("/pricing?plan=pro_monthly&returnTo=%2Fpheno-hunts%2Fnew%3FgrowId%3Dabc");

    for (const value of ["https://evil.example", "//evil.example", "javascript:alert(1)"]) {
      expect(
        buildLegacyUpgradeRedirect({
          search: new URLSearchParams({ plan: "pro_monthly", returnTo: value }),
        }),
      ).toBe("/pricing?plan=pro_monthly");
    }
  });

  it("preserves an exact allowlisted acquisition tuple", () => {
    expect(
      buildLegacyUpgradeRedirect({
        search:
          "plan=founder-lifetime&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch&returnTo=/dashboard",
      }),
    ).toBe(
      "/pricing?plan=founder_lifetime&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch&returnTo=%2Fdashboard",
    );
  });

  it("drops partial, forged, free, and unrelated query data", () => {
    expect(
      buildLegacyUpgradeRedirect({
        search:
          "plan=free&utm_source=grower_invite&utm_medium=owned&utm_campaign=grower_invite&role=operator&credit=999",
      }),
    ).toBe("/pricing");
  });
});
