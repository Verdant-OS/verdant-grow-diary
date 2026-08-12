/**
 * Static metadata documents for public acquisition routes.
 *
 * Vite emits these as directory-local index.html files. Filesystem-first
 * static hosts (including Lovable's documented SPA setup) resolve a clean
 * route such as `/privacy` to `privacy/index.html` before falling back to the
 * root SPA document. This lets non-JavaScript crawlers receive the same title,
 * canonical, robots, OpenGraph, and Twitter metadata as the app. The
 * interactive React application still boots from the same asset shell.
 */

import { formatVerificationStatus, VERDANT_CULTIVARS } from "../../constants/verdantCultivars";
import {
  VERDANT_GROWER_GUIDE_FAQ,
  VERDANT_GUIDES_BREADCRUMB_ITEMS,
  VERDANT_SEO_GUIDES,
} from "../../constants/verdantSeoContent";
import { PUBLIC_QUICK_LOG_STARTER_COPY } from "../../constants/publicQuickLogStarterCopy";
import { FOUNDER_SOCIAL_META } from "../../constants/founderSocialMeta";
import { buildCultivarBreadcrumbItems, buildCultivarFaqItems } from "../cultivarDetailSeo";
import {
  buildArticleJsonLd,
  buildBreadcrumbListJsonLd,
  buildCultivarCollectionJsonLd,
  buildFaqPageJsonLd,
  buildSoftwareApplicationJsonLd,
} from "../seoStructuredData";
import type { StaticSocialRouteMetadata } from "./staticSocialRouteHtml";

export const VERDANT_SITE_ORIGIN = "https://verdantgrowdiary.com";
const DEFAULT_OG_IMAGE = `${VERDANT_SITE_ORIGIN}/brand/verdant-logo-512.png`;

export interface StaticPublicSeoDocument {
  /** Public pathname without query parameters. */
  readonly path: string;
  /** Vite output path served at `path` by filesystem-first static hosts. */
  readonly fileName: string;
  /**
   * Verified content review or modification date used by the sitemap.
   * Omitted when the route is intentionally outside the sitemap or no
   * defensible source date exists.
   */
  readonly lastModifiedOn?: string;
  readonly metadata: StaticSocialRouteMetadata;
}

export interface StaticPublicAliasDocument extends StaticPublicSeoDocument {
  /** Canonical public route that owns indexing and social identity. */
  readonly canonicalPath: string;
}

function routeFileName(path: string): string {
  if (!path.startsWith("/") || path === "/" || path.includes("?") || path.includes("#")) {
    throw new Error(`Static SEO route must be a non-root clean path: ${path}`);
  }
  return `${path.slice(1)}/index.html`;
}

function buildStaticWebPageJsonLd(metadata: {
  readonly title: string;
  readonly description: string;
  readonly url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${metadata.url}#webpage`,
    url: metadata.url,
    name: metadata.title,
    description: metadata.description,
    isPartOf: {
      "@type": "WebSite",
      "@id": `${VERDANT_SITE_ORIGIN}/#website`,
    },
  } as const;
}

function buildStaticGuideJsonLd(guide: (typeof VERDANT_SEO_GUIDES)[number]) {
  const url = `${VERDANT_SITE_ORIGIN}/guides/${guide.slug}`;
  const article = guide.publishedOn
    ? buildArticleJsonLd({
        headline: guide.h1,
        description: guide.description,
        url,
        datePublished: guide.publishedOn,
        dateModified: guide.modifiedOn,
        image: DEFAULT_OG_IMAGE,
        authorName: "Verdant Grow Diary",
        publisherName: "Verdant Grow Diary",
        siteUrl: VERDANT_SITE_ORIGIN,
      })
    : null;
  return [
    buildStaticWebPageJsonLd({ title: guide.title, description: guide.description, url }),
    buildFaqPageJsonLd({ pageUrl: url, questions: guide.faq }),
    buildBreadcrumbListJsonLd({
      items: [...VERDANT_GUIDES_BREADCRUMB_ITEMS, { name: guide.h1, url }],
    }),
    ...(article ? [article] : []),
  ];
}

function buildStaticCultivarJsonLd(cultivar: (typeof VERDANT_CULTIVARS)[number]) {
  const url = `${VERDANT_SITE_ORIGIN}/cultivars/${cultivar.slug}`;
  const verifiedDate = cultivar.lastVerifiedAt.slice(0, 10);
  return [
    buildStaticWebPageJsonLd({
      title: `${cultivar.name} Cultivar Grow Guide | Verdant`,
      description: `${cultivar.name} grow guide: lineage (${cultivar.lineage}), ${cultivar.flowerWeeks} flower, environment ranges by stage, and common issues home growers report.`,
      url,
    }),
    buildCultivarCollectionJsonLd({
      name: `${cultivar.name} source-backed grow reference`,
      alternateName: [cultivar.searchAlias, ...cultivar.aliases].join(", "),
      description: `${cultivar.name} reference profile with reported lineage (${cultivar.lineage}), ${cultivar.flowerWeeks}, sources, confidence, and missing-information notes.`,
      url,
      properties: [
        { name: "Lineage", value: cultivar.lineage },
        { name: "Life cycle", value: cultivar.lifeCycle },
        { name: "Reported flower window", value: cultivar.flowerWeeks },
        { name: "Difficulty", value: cultivar.difficulty },
        { name: "Evidence state", value: formatVerificationStatus(cultivar.verificationStatus) },
      ],
    }),
    buildFaqPageJsonLd({ pageUrl: url, questions: buildCultivarFaqItems(cultivar) }),
    buildBreadcrumbListJsonLd({
      items: buildCultivarBreadcrumbItems(cultivar, VERDANT_SITE_ORIGIN),
    }),
    buildArticleJsonLd({
      headline: `${cultivar.name} Cultivar Grow Guide`,
      description: `${cultivar.name} source-backed grow reference: reported lineage (${cultivar.lineage}), ${cultivar.flowerWeeks}, environment context by stage, and common issues home growers report.`,
      url,
      datePublished: verifiedDate,
      dateModified: verifiedDate,
      image: DEFAULT_OG_IMAGE,
      siteUrl: VERDANT_SITE_ORIGIN,
    }),
  ];
}

function publicDocument(
  path: string,
  metadata: Omit<StaticSocialRouteMetadata, "url" | "image"> & {
    readonly image?: string;
  },
  lastModifiedOn?: string,
): StaticPublicSeoDocument {
  const url = `${VERDANT_SITE_ORIGIN}${path}`;
  return {
    path,
    fileName: routeFileName(path),
    lastModifiedOn,
    metadata: {
      ...metadata,
      url,
      image: metadata.image ?? DEFAULT_OG_IMAGE,
      jsonLd: metadata.jsonLd ?? [buildStaticWebPageJsonLd({ ...metadata, url })],
    },
  };
}

function aliasDocument(
  path: string,
  canonicalDocument: StaticPublicSeoDocument,
): StaticPublicAliasDocument {
  return {
    path,
    fileName: routeFileName(path),
    canonicalPath: canonicalDocument.path,
    metadata: {
      ...canonicalDocument.metadata,
      robots: "noindex, follow",
    },
  };
}

const GUIDE_HUB = publicDocument("/guides", {
  title: "Grower Guides: Diary, Lighting & Sensor Truth | Verdant",
  description:
    "Practical grower guides for plant timelines, grow-light distance, PPFD, DLI, source-labeled sensor data, VPD context, and cautious troubleshooting.",
  imageAlt: "Verdant Grower Guides",
  jsonLd: [
    buildStaticWebPageJsonLd({
      title: "Grower Guides: Diary, Lighting & Sensor Truth | Verdant",
      description:
        "Practical grower guides for plant timelines, grow-light distance, PPFD, DLI, source-labeled sensor data, VPD context, and cautious troubleshooting.",
      url: `${VERDANT_SITE_ORIGIN}/guides`,
    }),
    buildFaqPageJsonLd({
      pageUrl: `${VERDANT_SITE_ORIGIN}/guides`,
      questions: VERDANT_GROWER_GUIDE_FAQ,
    }),
    buildBreadcrumbListJsonLd({ items: VERDANT_GUIDES_BREADCRUMB_ITEMS }),
  ],
}, "2026-07-30");

const CULTIVAR_HUB = publicDocument("/cultivars", {
  title: "Cannabis Cultivar Guides: Oreoz, Do-Si-Dos & More | Verdant",
  description:
    "Evergreen cultivar profiles for serious home growers: environment ranges, flower windows, common issues, and what to compare when pheno-hunting.",
  imageAlt: "Verdant cultivar guides",
}, "2026-07-27");

const CORE_ACQUISITION_DOCUMENTS: ReadonlyArray<StaticPublicSeoDocument> = [
  publicDocument("/welcome", {
    title: "Grow Diary & Grow Room Tracking App | Verdant Grow Diary",
    description:
      "See what changed in your grow and decide what to do next. Verdant turns logs, photos, and sensor readings from the gear you already own into one plant timeline.",
    imageAlt: "Verdant Grow Diary",
  }, "2026-07-26"),
  publicDocument("/pricing", {
    title: "Pricing — Free, Pro & Craft | Verdant Grow Diary",
    description:
      "Free grow diary forever. Pro adds multi-tent support, full sensor history and advanced exports. Craft adds the live Pro Blueprint.",
    imageAlt: "Verdant pricing",
  }, "2026-07-30"),
  publicDocument("/guides/grow-stage-care-guide", {
    title: "Grow stage care guide | Seedling, Veg, and Flower checklists | Verdant",
    description:
      "A searchable grow-stage care guide with watering, nutrients, environment, and harvest checklists for seedling, vegetative, and flower stages.",
    imageAlt: "Verdant grow-stage care guide",
  }, "2026-07-27"),
  publicDocument("/tools/vpd-calculator", {
    title: "Free Cannabis VPD Calculator by Growth Stage | Verdant",
    description:
      "Calculate air VPD from manual temperature and humidity inputs, then compare it with a conservative stage-aware range. No upload, live telemetry, diagnosis, or device control.",
    imageAlt: "Verdant VPD calculator",
  }, "2026-07-27"),
  publicDocument("/hardware-integrations", {
    title: "Sensor & Hardware Integrations | Verdant Grow Diary",
    description:
      "Hardware-neutral Grow OS. Connect Ecowitt, ESP32, MQTT, webhook, or Raspberry Pi sensors read-only, or import CSVs. Bring your own gear — the grower stays in control.",
    imageAlt: "Verdant sensor and hardware integrations",
  }, "2026-07-26"),
  publicDocument("/how-ai-doctor-works", {
    title: "How AI Doctor Works | Verdant Grow Diary",
    description:
      "See how Verdant AI Doctor uses logs, photos, source-labeled sensor context, evidence, confidence, and missing information to support grower-approved decisions.",
    imageAlt: "How Verdant AI Doctor works",
  }, "2026-07-26"),
  publicDocument("/ai-doctor-readiness-check", {
    title: "Free AI Doctor Context Check | Verdant Grow Diary",
    description:
      "Check whether you have enough plant stage, medium, pot size, watering, feeding, sensor, photo, target, and history context for a cautious grow review.",
    imageAlt: "Verdant AI Doctor readiness check",
  }, "2026-07-15"),
  publicDocument("/quick-log", {
    title: "Free 30-Second Quick Log Starter | Verdant Grow Diary",
    description:
      "Try the Verdant Quick Log without an account: nickname a plant, jot one note, and keep the draft on your device. Create a free account when you want it in your grow diary.",
    imageAlt: "Verdant 30-second Quick Log starter",
    jsonLd: [
      buildStaticWebPageJsonLd({
        title: PUBLIC_QUICK_LOG_STARTER_COPY.seoTitle,
        description: PUBLIC_QUICK_LOG_STARTER_COPY.seoDescription,
        url: `${VERDANT_SITE_ORIGIN}/quick-log`,
      }),
      buildSoftwareApplicationJsonLd({
        name: "Verdant Grow Diary",
        description: PUBLIC_QUICK_LOG_STARTER_COPY.seoDescription,
        url: `${VERDANT_SITE_ORIGIN}/quick-log`,
      }),
      buildFaqPageJsonLd({
        pageUrl: `${VERDANT_SITE_ORIGIN}/quick-log`,
        questions: PUBLIC_QUICK_LOG_STARTER_COPY.faq,
      }),
    ],
  }, "2026-07-25"),
  publicDocument("/glossary", {
    title: "Cannabis Cultivation Glossary | Verdant Grow Diary",
    description:
      "Alphabetized reference of cannabis breeding, cultivation, and phenotype terms — searchable and category-filterable for serious growers.",
    imageAlt: "Verdant cultivation glossary",
  }),
  publicDocument("/breeder-beta", {
    title: "Verdant Breeder Beta | Verdant Grow Diary",
    description:
      "Controlled beta for breeders and pheno hunters. See how Verdant records lab evidence, pathogen screening, sensory rubrics, and pheno decisions — while the breeder always decides which plants advance.",
    imageAlt: "Verdant Breeder Beta",
  }),
  publicDocument("/creator-beta", {
    title: "Verdant Creator & Breeder Beta | Verdant Grow Diary",
    description:
      "Controlled beta for serious growers, breeders, and grower-educators. See how Verdant turns plant logs, photos, sensor snapshots, phenotype notes, and lab evidence into one clear plant history.",
    imageAlt: "Verdant Creator & Breeder Beta",
  }),
  publicDocument("/pheno-comparison", {
    title: "Pheno Comparison Preview — Verdant Grow Diary",
    description:
      "Read-only preview of Verdant's pheno-hunt comparison view: structure, resin, aroma, vigor, and finish laid side by side. Demo fixtures only.",
    imageAlt: "Verdant pheno comparison preview (sample data)",
  }),
  publicDocument("/pheno-expression-showcase", {
    title: "Pheno Expression Showcase — Verdant Grow Diary",
    description:
      "Ten example phenotypes — loud gas, dessert, fruit, yield-monster, frost bomb, and more — laid side by side. Demo data only; Verdant never picks a keeper for you.",
    imageAlt: "Verdant pheno expression showcase (sample data)",
  }),
  publicDocument("/privacy", {
    title: "Privacy Policy | Verdant Grow Diary",
    description:
      "Privacy Policy for Verdant Grow Diary — what data is collected and why, retention, your rights, and Paddle's role as Merchant of Record payment processor.",
    imageAlt: "Verdant privacy policy",
  }, "2026-07-09"),
  publicDocument("/terms", {
    title: "Terms of Service | Verdant Grow Diary",
    description:
      "Terms of Service for Verdant Grow Diary — seller identity, Paddle Merchant of Record disclosure, acceptable use, and plain-language liability terms.",
    imageAlt: "Verdant terms of service",
  }, "2026-07-09"),
  publicDocument("/refund", {
    title: "Refund Policy | Verdant Grow Diary",
    description:
      "Verdant Grow Diary refund policy — 30-day money-back guarantee on paid plans, with refunds through Paddle (paddle.net) as Merchant of Record.",
    imageAlt: "Verdant refund policy",
  }, "2026-07-09"),
  publicDocument("/feedback", {
    title: "Customer Feedback | Verdant Grow Diary",
    description:
      "Tell the humans building Verdant what's working and what isn't. Read by real people, no automated replies.",
    imageAlt: "Verdant customer feedback",
  }, "2026-07-28"),
  publicDocument("/contact", {
    title: "Contact Us | Verdant Grow Diary",
    description:
      "Reach the humans building Verdant. Support, bugs, hardware ideas, billing, or questions.",
    imageAlt: "Contact the Verdant team",
  }, "2026-07-28"),
  // Indexable public documentation. Without a pre-rendered doc this route
  // inherits the shell's root canonical and declares itself a duplicate of
  // the homepage to non-JS crawlers. Title/description mirror the page's own
  // usePageSeo call (src/pages/McpApiReference.tsx) so hydration changes
  // nothing. Deliberately STATIC_ONLY (not in sitemap.xml) — advertising it
  // is a separate acquisition decision; this entry only makes its canonical
  // truthful.
  publicDocument("/docs/mcp-api", {
    title: "Verdant Grow OS MCP API Reference | Tools, Parameters, Safety",
    description:
      "Reference for the Verdant Grow OS MCP server: list_grows, list_recent_diary_entries, and get_latest_sensor_snapshot — parameters, response examples, and safety invariants.",
    imageAlt: "Verdant Grow OS MCP API reference",
  }),
];

const GUIDE_DOCUMENTS = VERDANT_SEO_GUIDES.map((guide) =>
  publicDocument(`/guides/${guide.slug}`, {
    title: guide.title,
    description: guide.description,
    imageAlt: guide.h1,
    jsonLd: buildStaticGuideJsonLd(guide),
  }, guide.modifiedOn ?? guide.publishedOn),
);

const CULTIVAR_DOCUMENTS = VERDANT_CULTIVARS
  .filter((cultivar) => cultivar.publicationStatus === "published")
  .map((cultivar) =>
  publicDocument(`/cultivars/${cultivar.slug}`, {
    title: `${cultivar.name} Cultivar Grow Guide | Verdant`,
    description: `${cultivar.name} grow guide: lineage (${cultivar.lineage}), ${cultivar.flowerWeeks} flower, environment ranges by stage, and common issues home growers report.`,
    imageAlt: `${cultivar.name} cultivar guide`,
    jsonLd: buildStaticCultivarJsonLd(cultivar),
  }, cultivar.lastVerifiedAt.slice(0, 10)),
  );

/**
 * Transactional checkout return routes are reachable without JavaScript, but
 * must never compete for organic results. They intentionally stay separate
 * from `STATIC_PUBLIC_SEO_DOCUMENTS`, whose callers enforce indexable public
 * acquisition metadata and sitemap parity.
 */
export const STATIC_TRANSACTIONAL_NOINDEX_DOCUMENTS: ReadonlyArray<StaticPublicSeoDocument> =
  Object.freeze([
    publicDocument("/checkout/success", {
      title: "Checkout status | Verdant Grow Diary",
      description: "Paid Verdant access is confirmed server-side by the billing webhook.",
      imageAlt: "Verdant checkout status",
      robots: "noindex, follow",
    }),
    publicDocument("/checkout/cancel", {
      title: "Checkout not completed | Verdant Grow Diary",
      description: "No charge was made. You can try again anytime.",
      imageAlt: "Verdant checkout not completed",
      robots: "noindex, follow",
    }),
  ]);

/** All public documents emitted alongside Vite's primary SPA entry. */
export const STATIC_PUBLIC_SEO_DOCUMENTS: ReadonlyArray<StaticPublicSeoDocument> = Object.freeze([
  {
    path: "/founder",
    fileName: routeFileName("/founder"),
    lastModifiedOn: "2026-07-19",
    metadata: {
      ...FOUNDER_SOCIAL_META,
      image: `${VERDANT_SITE_ORIGIN}/brand/verdant-logo-512.png`,
      jsonLd: [
        buildStaticWebPageJsonLd({
          title: FOUNDER_SOCIAL_META.title,
          description: FOUNDER_SOCIAL_META.description,
          url: FOUNDER_SOCIAL_META.url,
        }),
      ],
    },
  },
  ...CORE_ACQUISITION_DOCUMENTS,
  GUIDE_HUB,
  ...GUIDE_DOCUMENTS,
  CULTIVAR_HUB,
  ...CULTIVAR_DOCUMENTS,
]);

/**
 * Legacy route aliases emitted for filesystem-first hosts that do not apply
 * vercel.json redirects. They are never indexable documents: each one points
 * crawlers at its cultivar canonical while the existing React route performs
 * the browser redirect after hydration.
 */
export const STATIC_PUBLIC_ALIAS_DOCUMENTS: ReadonlyArray<StaticPublicAliasDocument> =
  Object.freeze([
    aliasDocument("/strains", CULTIVAR_HUB),
    ...CULTIVAR_DOCUMENTS.map((document) =>
      aliasDocument(document.path.replace(/^\/cultivars\//, "/strains/"), document),
    ),
  ]);

/** Every route-local HTML document emitted by the Vite build. */
export const STATIC_PUBLIC_OUTPUT_DOCUMENTS: ReadonlyArray<StaticPublicSeoDocument> =
  Object.freeze([
    ...STATIC_PUBLIC_SEO_DOCUMENTS,
    ...STATIC_TRANSACTIONAL_NOINDEX_DOCUMENTS,
    ...STATIC_PUBLIC_ALIAS_DOCUMENTS,
  ]);
