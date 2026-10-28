/**
 * Sitewide SoftwareApplication JSON-LD.
 *
 * Carried over verbatim from the Classic `softwareApplicationJsonLd` vite
 * plugin, which injected this node into the single `index.html` shell. Under
 * SSR there is no shell, so the node is emitted from the root route's head()
 * instead — same bytes, same @id, same public offer list.
 *
 * DISPLAY TRUTH: only plans a grower can actually buy from the PUBLIC pricing
 * grid may appear here. Founder Lifetime is no longer sold and must never be
 * advertised. Prices come from the pricing single source of truth.
 * `src/test/software-application-offers-truth.test.ts` pins both invariants.
 */
import { PRICING } from "@/constants/pricing";

export const VERDANT_SITE_ORIGIN = "https://verdantgrowdiary.com";

export const SITE_SOFTWARE_APPLICATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${VERDANT_SITE_ORIGIN}/#app`,
  name: "Verdant Grow Diary",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: VERDANT_SITE_ORIGIN,
  publisher: { "@id": `${VERDANT_SITE_ORIGIN}/#organization` },
  description:
    "Verdant Grow Diary is a web-based Grow OS for indoor cultivation, combining plant logs, photos, timelines and source-labeled sensor readings with cautious AI and grower-approved decisions.",
  offers: [
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
  ],
} as const;
