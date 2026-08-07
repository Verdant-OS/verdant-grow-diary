import { PRICING } from "../../constants/pricing";
import { ogImageSlugForPath } from "./ogImageCard";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
  type StaticPublicSeoDocument,
} from "./staticPublicSeoDocuments";

export const VERDANT_SITE_NAME = "Verdant Grow Diary";
export const VERDANT_SITE_DESCRIPTION =
  "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.";

const VERDANT_SITE_IMAGE = `${VERDANT_SITE_ORIGIN}/og/home.png`;

export const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${VERDANT_SITE_ORIGIN}/#organization`,
      name: VERDANT_SITE_NAME,
      url: VERDANT_SITE_ORIGIN,
      logo: `${VERDANT_SITE_ORIGIN}/brand/verdant-logo-512.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${VERDANT_SITE_ORIGIN}/#website`,
      name: VERDANT_SITE_NAME,
      url: VERDANT_SITE_ORIGIN,
      publisher: { "@id": `${VERDANT_SITE_ORIGIN}/#organization` },
      description: VERDANT_SITE_DESCRIPTION,
    },
  ],
} as const;

/**
 * Public product truth shared by every prerendered route. Prices come from the
 * same constants as the pricing UI. Founder Lifetime is intentionally absent:
 * it is not a publicly purchasable plan.
 */
export const SOFTWARE_APPLICATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${VERDANT_SITE_ORIGIN}/#app`,
  name: VERDANT_SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: VERDANT_SITE_ORIGIN,
  description: VERDANT_SITE_DESCRIPTION,
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

const HOME_DOCUMENT: StaticPublicSeoDocument = {
  path: "/",
  fileName: "index.html",
  metadata: {
    title: "Verdant Grow Diary — Plant memory. Sensor truth.",
    description: VERDANT_SITE_DESCRIPTION,
    url: VERDANT_SITE_ORIGIN,
    image: VERDANT_SITE_IMAGE,
    imageAlt: "Verdant Grow Diary — Plant memory. Sensor truth.",
  },
};

const DOCUMENT_BY_PATH = new Map(
  STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => [document.path, document] as const),
);

export const TANSTACK_PUBLIC_PRERENDER_PATHS: ReadonlyArray<string> = Object.freeze([
  HOME_DOCUMENT.path,
  ...STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => document.path),
]);

if (new Set(TANSTACK_PUBLIC_PRERENDER_PATHS).size !== TANSTACK_PUBLIC_PRERENDER_PATHS.length) {
  throw new Error("Duplicate TanStack public prerender path");
}

export interface TanStackSeoMetaDescriptor {
  readonly [key: string]: string | undefined;
}

export interface TanStackSeoLinkDescriptor {
  readonly rel: string;
  readonly href: string;
}

export interface TanStackSeoScriptDescriptor {
  readonly type: "application/ld+json";
  readonly children: string;
}

export interface TanStackPublicSeoHead {
  readonly meta: ReadonlyArray<TanStackSeoMetaDescriptor>;
  readonly links: ReadonlyArray<TanStackSeoLinkDescriptor>;
  readonly scripts: ReadonlyArray<TanStackSeoScriptDescriptor>;
}

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] || "/";
  if (withoutQuery === "/") return "/";
  return withoutQuery.replace(/\/+$/, "") || "/";
}

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function routeOgImageUrl(document: StaticPublicSeoDocument): string {
  const canonicalPath = new URL(document.metadata.url).pathname;
  return `${VERDANT_SITE_ORIGIN}/og/${ogImageSlugForPath(canonicalPath)}.png`;
}

/**
 * Builds the root-route head from the leaf TanStack match. Known public paths
 * receive their exact static metadata; everything else fails closed as
 * noindex with no canonical claim.
 */
export function buildTanStackPublicSeoHead(pathname: string): TanStackPublicSeoHead {
  const normalizedPath = normalizePathname(pathname);
  const document =
    normalizedPath === HOME_DOCUMENT.path ? HOME_DOCUMENT : DOCUMENT_BY_PATH.get(normalizedPath);
  const metadata = document?.metadata;
  const image = document ? routeOgImageUrl(document) : VERDANT_SITE_IMAGE;
  const robots = metadata?.robots ?? (document ? "index, follow" : "noindex, nofollow");
  const title = metadata?.title ?? VERDANT_SITE_NAME;
  const description = metadata?.description ?? VERDANT_SITE_DESCRIPTION;

  const meta: TanStackSeoMetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robots },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: VERDANT_SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    { property: "og:image:alt", content: metadata?.imageAlt ?? VERDANT_SITE_NAME },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];

  if (metadata) {
    meta.push({ property: "og:url", content: metadata.url });
  }

  return {
    meta,
    links: metadata ? [{ rel: "canonical", href: metadata.url }] : [],
    scripts: [SITE_JSON_LD, SOFTWARE_APPLICATION_JSON_LD, ...(metadata?.jsonLd ?? [])].map(
      (value) => ({
        type: "application/ld+json" as const,
        children: serializeJsonLd(value),
      }),
    ),
  };
}
