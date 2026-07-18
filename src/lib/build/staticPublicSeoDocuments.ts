/**
 * Static metadata documents for public acquisition routes.
 *
 * Vite emits these as route-local index.html files. Static hosts serve them
 * before the SPA fallback, which lets non-JavaScript crawlers receive the
 * same title, canonical, robots, OpenGraph, and Twitter metadata as the app.
 * The interactive React application still boots from the same asset shell.
 */

import { VERDANT_CULTIVARS } from "../../constants/verdantCultivars";
import { VERDANT_SEO_GUIDES } from "../../constants/verdantSeoContent";
import { FOUNDER_SOCIAL_META } from "../../constants/founderSocialMeta";
import type { StaticSocialRouteMetadata } from "./staticSocialRouteHtml";

export const VERDANT_SITE_ORIGIN = "https://verdantgrowdiary.com";
const DEFAULT_OG_IMAGE = `${VERDANT_SITE_ORIGIN}/brand/verdant-logo.png`;

export interface StaticPublicSeoDocument {
  /** Public pathname without query parameters. */
  readonly path: string;
  /** Vite output path. Vercel clean URLs map this static file back to `path`. */
  readonly fileName: string;
  readonly metadata: StaticSocialRouteMetadata;
}

function routeFileName(path: string): string {
  if (!path.startsWith("/") || path === "/" || path.includes("?") || path.includes("#")) {
    throw new Error(`Static SEO route must be a non-root clean path: ${path}`);
  }
  return `${path.slice(1)}.html`;
}

function publicDocument(
  path: string,
  metadata: Omit<StaticSocialRouteMetadata, "url" | "image"> & {
    readonly image?: string;
  },
): StaticPublicSeoDocument {
  return {
    path,
    fileName: routeFileName(path),
    metadata: {
      ...metadata,
      url: `${VERDANT_SITE_ORIGIN}${path}`,
      image: metadata.image ?? DEFAULT_OG_IMAGE,
    },
  };
}

const GUIDE_HUB = publicDocument("/guides", {
  title: "Verdant Grower Guides | Grow Diary, VPD Tracking, and Sensor Truth",
  description:
    "Practical grower guides for using plant timelines, source-labeled sensor data, VPD context, and cautious AI to make better cultivation decisions.",
  imageAlt: "Verdant Grower Guides",
});

const CULTIVAR_HUB = publicDocument("/cultivars", {
  title: "Cannabis Cultivar Guides — Oreoz, Do-Si-Dos, Blue Cookies Strain Info | Verdant",
  description:
    "Evergreen cultivar profiles for serious home growers: environment ranges, flower windows, common issues, and what to compare when pheno-hunting.",
  imageAlt: "Verdant cultivar guides",
});

const CORE_ACQUISITION_DOCUMENTS: ReadonlyArray<StaticPublicSeoDocument> = [
  publicDocument("/welcome", {
    title: "Grow Diary & Grow Room Tracking App | Verdant Grow Diary",
    description:
      "See what changed in your grow and decide what to do next. Verdant turns logs, photos, and sensor readings from the gear you already own into one plant timeline.",
    imageAlt: "Verdant Grow Diary",
  }),
  publicDocument("/pricing", {
    title: "Pricing — Free, Pro & Founder Lifetime | Verdant Grow Diary",
    description:
      "Free grow diary forever. Pro adds multi-tent support, sensor history and advanced exports. Founder Lifetime is a one-time plan for early supporters.",
    imageAlt: "Verdant pricing",
  }),
  publicDocument("/guides/grow-stage-care-guide", {
    title: "Grow stage care guide | Seedling, Veg, and Flower checklists | Verdant",
    description:
      "A searchable grow-stage care guide with watering, nutrients, environment, and harvest checklists for seedling, vegetative, and flower stages.",
    imageAlt: "Verdant grow-stage care guide",
  }),
  publicDocument("/tools/vpd-calculator", {
    title: "Free Cannabis VPD Calculator by Growth Stage | Verdant",
    description:
      "Calculate air VPD from manual temperature and humidity inputs, then compare it with a conservative stage-aware range. No upload, live telemetry, diagnosis, or device control.",
    imageAlt: "Verdant VPD calculator",
  }),
  publicDocument("/hardware-integrations", {
    title: "Sensor & Hardware Integrations | Verdant Grow Diary",
    description:
      "Hardware-neutral Grow OS. Connect Ecowitt, ESP32, MQTT, webhook, or Raspberry Pi sensors read-only, or import CSVs. Bring your own gear — the grower stays in control.",
    imageAlt: "Verdant sensor and hardware integrations",
  }),
  publicDocument("/how-ai-doctor-works", {
    title: "How AI Doctor Works | Verdant Grow Diary",
    description:
      "See how Verdant AI Doctor uses logs, photos, source-labeled sensor context, evidence, confidence, and missing information to support grower-approved decisions.",
    imageAlt: "How Verdant AI Doctor works",
  }),
  publicDocument("/ai-doctor-readiness-check", {
    title: "Free AI Doctor Context Check | Verdant Grow Diary",
    description:
      "Check whether you have enough plant stage, medium, pot size, watering, feeding, sensor, photo, target, and history context for a cautious grow review.",
    imageAlt: "Verdant AI Doctor readiness check",
  }),
  publicDocument("/quick-log", {
    title: "Free 30-Second Quick Log Starter | Verdant Grow Diary",
    description:
      "Try the Verdant Quick Log without an account: nickname a plant, jot one note, and keep the draft on your device. Create a free account when you want it in your grow diary.",
    imageAlt: "Verdant 30-second Quick Log starter",
  }),
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
  }),
  publicDocument("/terms", {
    title: "Terms of Service | Verdant Grow Diary",
    description:
      "Terms of Service for Verdant Grow Diary — seller identity, Paddle Merchant of Record disclosure, acceptable use, and plain-language liability terms.",
    imageAlt: "Verdant terms of service",
  }),
  publicDocument("/refund", {
    title: "Refund Policy | Verdant Grow Diary",
    description:
      "Verdant Grow Diary refund policy — 30-day money-back guarantee on paid plans, with refunds through Paddle (paddle.net) as Merchant of Record.",
    imageAlt: "Verdant refund policy",
  }),
];

const GUIDE_DOCUMENTS = VERDANT_SEO_GUIDES.map((guide) =>
  publicDocument(`/guides/${guide.slug}`, {
    title: guide.title,
    description: guide.description,
    imageAlt: guide.h1,
  }),
);

const CULTIVAR_DOCUMENTS = VERDANT_CULTIVARS.map((cultivar) =>
  publicDocument(`/cultivars/${cultivar.slug}`, {
    title: `${cultivar.name} Cultivar Guide (${cultivar.searchAlias} info) | Verdant`,
    description: `${cultivar.name} grow guide: lineage (${cultivar.lineage}), ${cultivar.flowerWeeks} flower, environment ranges by stage, and common issues home growers report.`,
    imageAlt: `${cultivar.name} cultivar guide`,
  }),
);

/** All public documents emitted alongside Vite's primary SPA entry. */
export const STATIC_PUBLIC_SEO_DOCUMENTS: ReadonlyArray<StaticPublicSeoDocument> = Object.freeze([
  {
    path: "/founder",
    fileName: "founder.html",
    metadata: FOUNDER_SOCIAL_META,
  },
  ...CORE_ACQUISITION_DOCUMENTS,
  GUIDE_HUB,
  ...GUIDE_DOCUMENTS,
  CULTIVAR_HUB,
  ...CULTIVAR_DOCUMENTS,
]);
