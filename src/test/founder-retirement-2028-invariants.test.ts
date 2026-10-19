/**
 * #2028: Founder Lifetime is no longer sold and /founder is retired. Source
 * invariants for the permanent redirect, canonical URLs, sitemap entries and
 * llms.txt. Live HTTP behaviour is measured separately, never here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHostRouting } from "@/lib/cloudflareHostRoutingRules";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import { getRoutesByAccess } from "@/lib/appRouteManifest";
import {
  resolvePricingCreditPackPreselect,
  resolvePricingPlanPreselect,
} from "@/lib/pricingPlanPreselect";
import { buildCheckoutPlanReturnPath } from "@/lib/checkoutPlanIntent";
import { resolveCheckoutCancelRecovery } from "@/lib/checkoutCancelRecoveryRules";
import { isFounderLifetimeCheckoutSku } from "@/lib/founderLifetimeCheckoutGuard";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("#2028 Founder page retirement", () => {
  it("permanently redirects /founder to /pricing and keeps the query", () => {
    expect(
      resolveHostRouting({ pathname: "/founder", search: "?utm_source=founder_share" }),
    ).toMatchObject({
      kind: "redirect",
      status: 308,
      location: "/pricing?utm_source=founder_share",
    });
  });

  it("publishes no /founder document or canonical, and lists it only as a redirect", () => {
    for (const doc of STATIC_PUBLIC_OUTPUT_DOCUMENTS) {
      expect(doc.path).not.toBe("/founder");
      expect(new URL(doc.metadata.url).pathname).not.toBe("/founder");
    }
    expect(getRoutesByAccess("redirect").map((route) => route.path)).toContain("/founder");
    expect(getRoutesByAccess("public").map((route) => route.path)).not.toContain("/founder");
  });

  it("keeps /founder out of the sitemap and Founder Lifetime out of llms.txt", () => {
    const locs = [...read("public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain(`${VERDANT_SITE_ORIGIN}/pricing`);
    expect(locs.filter((loc) => new URL(loc).pathname.startsWith("/founder"))).toEqual([]);
    const llms = read("public/llms.txt");
    expect(llms).not.toMatch(/founder lifetime/i);
    expect(llms).not.toMatch(/\]\(\/founder/);
  });

  describe("an old Founder query cannot reopen checkout", () => {
    const FOUNDER_QUERY_VALUES = ["founder_lifetime", "founder-lifetime", "FOUNDER_LIFETIME"];

    it("keeps attribution on the redirect but never preselects a Founder plan on /pricing", () => {
      const decision = resolveHostRouting({
        pathname: "/founder",
        search: "?plan=founder_lifetime&utm_source=founder_share",
      });
      expect(decision).toMatchObject({
        status: 308,
        location: "/pricing?plan=founder_lifetime&utm_source=founder_share",
      });
      for (const value of FOUNDER_QUERY_VALUES) {
        expect(resolvePricingPlanPreselect(value)).toEqual({ plan: null, billing: null });
        expect(resolvePricingCreditPackPreselect(value)).toBeNull();
      }
    });

    it("drops a Founder plan from the signed-in return path", () => {
      expect(
        buildCheckoutPlanReturnPath({
          pathname: "/pricing",
          search: "?plan=founder_lifetime&utm_source=founder_share",
          plan: undefined,
        }),
      ).toBe("/pricing?utm_source=founder_share");
    });

    it("does not recover a Founder plan after a cancelled checkout", () => {
      for (const value of FOUNDER_QUERY_VALUES) {
        const recovery = resolveCheckoutCancelRecovery(`?plan=${value}`);
        expect(recovery.planId).toBeNull();
        expect(recovery.pricingPath).toBe("/pricing");
      }
    });

    it("refuses every Founder SKU spelling, including a resumed stored intent", () => {
      for (const value of [...FOUNDER_QUERY_VALUES, " founder_lifetime "]) {
        expect(isFounderLifetimeCheckoutSku(value)).toBe(true);
      }
      expect(isFounderLifetimeCheckoutSku("pro_annual")).toBe(false);
    });
  });
});
