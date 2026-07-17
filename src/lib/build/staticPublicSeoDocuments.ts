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
      "Free grow diary forever. Pro adds cloud sync, multi-tent support, sensor history and exports. Founder Lifetime is a one-time plan for early supporters.",
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
