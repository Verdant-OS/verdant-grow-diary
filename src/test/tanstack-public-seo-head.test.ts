import { describe, expect, it } from "vitest";
import { PRICING } from "@/constants/pricing";
import {
  SOFTWARE_APPLICATION_JSON_LD,
  TANSTACK_PUBLIC_PRERENDER_PATHS,
  buildTanStackPublicSeoHead,
} from "@/lib/build/tanstackPublicSeoHead";
import { STATIC_PUBLIC_OUTPUT_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";

function metaContent(
  head: ReturnType<typeof buildTanStackPublicSeoHead>,
  key: "name" | "property",
  value: string,
): string | undefined {
  const item = head.meta.find((entry) => entry[key] === value);
  return item?.content;
}

describe("TanStack public SEO head", () => {
  it("allowlists the homepage and every static public document exactly once", () => {
    expect(TANSTACK_PUBLIC_PRERENDER_PATHS).toEqual([
      "/",
      ...STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => document.path),
    ]);
    expect(new Set(TANSTACK_PUBLIC_PRERENDER_PATHS).size).toBe(
      TANSTACK_PUBLIC_PRERENDER_PATHS.length,
    );
    expect(TANSTACK_PUBLIC_PRERENDER_PATHS.join("\n")).not.toMatch(
      /\/(?:_app|admin|internal|operator)(?:\/|$)/,
    );
  });

  it("renders exact route-owned metadata and generated OG identity", () => {
    const head = buildTanStackPublicSeoHead("/pricing");
    expect(head.meta).toContainEqual({ title: "Pricing — Free, Pro & Craft | Verdant Grow Diary" });
    expect(metaContent(head, "name", "description")).toContain("Free grow diary forever");
    expect(metaContent(head, "property", "og:url")).toBe(
      "https://verdantgrowdiary.com/pricing",
    );
    expect(metaContent(head, "property", "og:image")).toBe(
      "https://verdantgrowdiary.com/og/pricing.png",
    );
    expect(head.links.filter((link) => link.rel === "canonical")).toEqual([
      { rel: "canonical", href: "https://verdantgrowdiary.com/pricing" },
    ]);
  });

  it("keeps legacy aliases noindex and canonicalized to the cultivar route", () => {
    const head = buildTanStackPublicSeoHead("/strains");
    expect(metaContent(head, "name", "robots")).toBe("noindex, follow");
    expect(head.links.find((link) => link.rel === "canonical")?.href).toBe(
      "https://verdantgrowdiary.com/cultivars",
    );
  });

  it("fails closed for non-public routes", () => {
    const head = buildTanStackPublicSeoHead("/dashboard");
    expect(metaContent(head, "name", "robots")).toBe("noindex, nofollow");
    expect(head.links.some((link) => link.rel === "canonical")).toBe(false);
  });

  it("includes route JSON-LD plus site and application truth", () => {
    const head = buildTanStackPublicSeoHead("/guides");
    const jsonLd = head.scripts
      .filter((script) => script.type === "application/ld+json")
      .map((script) => JSON.parse(script.children));
    expect(jsonLd.some((node) => node?.["@type"] === "FAQPage")).toBe(true);
    expect(jsonLd.some((node) => node?.["@type"] === "SoftwareApplication")).toBe(true);
    expect(jsonLd.some((node) => Array.isArray(node?.["@graph"]))).toBe(true);
  });

  it("advertises only purchasable public plans from pricing constants", () => {
    expect(SOFTWARE_APPLICATION_JSON_LD.offers).toEqual([
      { "@type": "Offer", name: "Free", price: String(PRICING.free.price), priceCurrency: "USD" },
      {
        "@type": "Offer",
        name: "Pro (monthly)",
        price: String(PRICING.pro.monthlyPrice),
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Pro (annual)",
        price: String(PRICING.pro.annualPrice),
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Craft (monthly)",
        price: String(PRICING.craft.monthlyPrice),
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Craft (annual)",
        price: String(PRICING.craft.annualPrice),
        priceCurrency: "USD",
      },
    ]);
    expect(JSON.stringify(SOFTWARE_APPLICATION_JSON_LD)).not.toMatch(/founder/i);
  });
});
