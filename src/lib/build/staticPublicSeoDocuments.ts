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
  VERDANT_BLUEPRINT_TARGETS_FAQ,
  VERDANT_GROWER_GUIDE_FAQ,
  VERDANT_GUIDES_BREADCRUMB_ITEMS,
  VERDANT_SEO_GUIDES,
} from "../../constants/verdantSeoContent";
import {
  CARE_CATEGORY_LABELS,
  CARE_CATEGORY_ORDER,
  GROW_STAGE_CARE_CHECKLIST,
  GROW_STAGE_CARE_FAQ,
  GROW_STAGE_LABELS,
  type CareCategory,
  type GrowStage,
} from "../../constants/growStageCareGuide";
import { PUBLIC_QUICK_LOG_STARTER_COPY } from "../../constants/publicQuickLogStarterCopy";
import { FOUNDER_SOCIAL_META } from "../../constants/founderSocialMeta";
import {
  NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
  NEXT_DOOR_CUSTOMER_BRAND,
  OREOZ_GELONADE_CUSTOMER_SEO,
  OREOZ_GELONADE_GUIDE_SLUG,
} from "../../constants/oreozGelonadeExperience";
import { buildCultivarBreadcrumbItems, buildCultivarFaqItems } from "../cultivarDetailSeo";
import {
  buildArticleJsonLd,
  buildBreadcrumbListJsonLd,
  buildCultivarCollectionJsonLd,
  buildFaqPageJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebPageJsonLd,
} from "../seoStructuredData";
import type { StaticSocialRouteMetadata } from "./staticSocialRouteHtml";

export const VERDANT_SITE_ORIGIN = "https://verdantgrowdiary.com";
const DEFAULT_OG_IMAGE = `${VERDANT_SITE_ORIGIN}/brand/verdant-logo-512.png`;

export interface StaticPublicSeoDocument {
  /** Public pathname without query parameters. */
  readonly path: string;
  /** Vite output path served at `path` by filesystem-first static hosts. */
  readonly fileName: string;
  readonly metadata: StaticSocialRouteMetadata;
}

export interface StaticPublicAliasDocument extends StaticPublicSeoDocument {
  /** Canonical public route that owns indexing and social identity. */
  readonly canonicalPath: string;
}

function escapeStaticHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSafeStaticInternalPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !/[\r\n]/.test(value);
}

function isSafeStaticExternalUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Vite loads this document generator while evaluating vite.config.ts, before
 * the app's `@/` alias exists. Keep this build-time mirror deliberately tiny
 * and pin it against buildGuideQuickLogStarterHref in its test suite.
 */
function buildStaticGuideQuickLogStarterHref(guideSlug: string): string {
  const params = new URLSearchParams();
  params.set("utm_source", "organic_guide");
  params.set("utm_medium", "owned");
  params.set("utm_campaign", "search_to_first_value");
  params.set("utm_content", guideSlug);
  return `/quick-log?${params.toString()}`;
}

/**
 * Build the small, semantic no-JavaScript counterpart of a public guide.
 * React remains the interactive renderer after hydration; this markup exists
 * so crawlers that do not execute the application bundle still receive the
 * guide's real heading, evidence-first sections, FAQs, and internal links.
 */
function buildStaticGuideBodyFallback(guide: (typeof VERDANT_SEO_GUIDES)[number]): string {
  const sectionMarkup = guide.sections
    .map((section) => {
      const links = (section.links ?? [])
        .filter((link) => isSafeStaticInternalPath(link.to))
        .map(
          (link) =>
            `<li><a href="${escapeStaticHtml(link.to)}">${escapeStaticHtml(link.label)}</a></li>`,
        )
        .join("");
      return [
        `<section><h2>${escapeStaticHtml(section.heading)}</h2>`,
        `<p>${escapeStaticHtml(section.body)}</p>`,
        links ? `<ul>${links}</ul>` : "",
        "</section>",
      ].join("");
    })
    .join("");

  const editorialProvenance =
    guide.publishedOn || guide.modifiedOn
      ? `<p data-guide-editorial-provenance="true">${[
          guide.publishedOn
            ? `Published <time datetime="${escapeStaticHtml(guide.publishedOn)}">${escapeStaticHtml(guide.publishedOn)}</time>`
            : "",
          guide.modifiedOn
            ? `Reviewed <time datetime="${escapeStaticHtml(guide.modifiedOn)}">${escapeStaticHtml(guide.modifiedOn)}</time>`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}</p>`
      : "";

  const faq = guide.faq
    .map(
      (entry) =>
        `<details><summary>${escapeStaticHtml(entry.question)}</summary><p>${escapeStaticHtml(entry.answer)}</p></details>`,
    )
    .join("");

  const referenceTable = guide.referenceTable
    ? [
        `<section><h2>${escapeStaticHtml(guide.referenceTable.caption)}</h2>`,
        "<table><thead><tr><th scope=\"col\">Visible sign</th><th scope=\"col\">Compare first</th><th scope=\"col\">What to log next</th><th scope=\"col\">Do not assume</th></tr></thead><tbody>",
        guide.referenceTable.rows
          .map(
            (row) =>
              `<tr><th scope="row">${escapeStaticHtml(row.visibleSign)}</th><td>${escapeStaticHtml(row.compareFirst)}</td><td>${escapeStaticHtml(row.whatToLogNext)}</td><td>${escapeStaticHtml(row.doNotAssume)}</td></tr>`,
          )
          .join(""),
        "</tbody></table></section>",
      ].join("")
    : "";

  const evidenceTable = guide.evidenceTable
    ? [
        `<section><h2>${escapeStaticHtml(guide.evidenceTable.heading)}</h2>`,
        `<p>${escapeStaticHtml(guide.evidenceTable.description)}</p>`,
        `<table aria-label="${escapeStaticHtml(guide.evidenceTable.ariaLabel)}"><thead><tr><th scope="col">Evidence</th><th scope="col">Usable</th><th scope="col">Conditional</th><th scope="col">Untrusted</th></tr></thead><tbody>`,
        guide.evidenceTable.rows
          .map(
            (row) =>
              `<tr><th scope="row">${escapeStaticHtml(row.evidence)}</th><td>${escapeStaticHtml(row.usable)}</td><td>${escapeStaticHtml(row.conditional)}</td><td>${escapeStaticHtml(row.untrusted)}</td></tr>`,
          )
          .join(""),
        "</tbody></table></section>",
      ].join("")
    : "";

  const sources = (guide.sources ?? [])
    .filter((source) => isSafeStaticExternalUrl(source.href))
    .map(
      (source) =>
        `<li><a href="${escapeStaticHtml(source.href)}" rel="noopener noreferrer">${escapeStaticHtml(source.label)}</a><p>${escapeStaticHtml(source.note)}</p></li>`,
    )
    .join("");

  const cta =
    guide.cta && isSafeStaticInternalPath(guide.cta.to)
      ? [
          `<aside aria-label="${escapeStaticHtml(guide.cta.heading)}"><h2>${escapeStaticHtml(guide.cta.heading)}</h2>`,
          `<p>${escapeStaticHtml(guide.cta.description)}</p>`,
          guide.cta.prompts && guide.cta.prompts.length > 0
            ? `<ul>${guide.cta.prompts.map((prompt) => `<li>${escapeStaticHtml(prompt)}</li>`).join("")}</ul>`
            : "",
          `<p><a href="${escapeStaticHtml(guide.cta.to)}">${escapeStaticHtml(guide.cta.label)}</a></p></aside>`,
        ].join("")
      : "";

  const budRotChecklist =
    guide.slug === "bud-rot-prevention-identification"
      ? [
          '<section><p>Printable resource</p><h2>Download the Bud Rot prevention checklist (PDF)</h2>',
          "<p>A one-page, grower-approved checklist for late flower: environment targets, a daily walk-through, a weekly Environment Check audit, and what to do if you find rot. Print it and pin it next to the tent, or keep it on your phone.</p>",
          '<p><a href="/verdant-bud-rot-prevention-checklist.pdf" download>Download checklist (PDF)</a></p>',
          "<p>Verdant suggests; the grower decides. Nothing on this checklist triggers automation.</p></section>",
        ].join("")
      : "";

  const vpdCalculator =
    guide.slug === "grow-room-vpd-tracker"
      ? '<section><p>Put the guide into practice</p><h2>Calculate air VPD from a manual reading</h2><p>Verdant\'s free calculator keeps the source honest: manual inputs, derived air VPD, no upload, no diagnosis, and no device control.</p><p><a href="/tools/vpd-calculator">Open the stage-aware VPD calculator</a></p></section>'
      : "";

  const customerComparison =
    guide.slug === OREOZ_GELONADE_GUIDE_SLUG
      ? `<section><p>Customer Mode</p><h2>Open the ${escapeStaticHtml(NEXT_DOOR_CUSTOMER_BRAND)} comparison guide</h2><p>Open this customer-safe guide. It is static education only and does not load Operator grows, plants, diary entries, sensors, or private customer records.</p><p><a href="${escapeStaticHtml(NEXT_DOOR_CUSTOMER_COMPARISON_PATH)}">Open customer guide</a></p></section>`
      : "";

  const relatedLinks = [
    ...guide.related
      .map((slug) => VERDANT_SEO_GUIDES.find((candidate) => candidate.slug === slug))
      .filter((candidate): candidate is (typeof VERDANT_SEO_GUIDES)[number] => candidate !== undefined)
      .map(
        (candidate) =>
          `<li><a href="/guides/${escapeStaticHtml(candidate.slug)}">${escapeStaticHtml(candidate.h1)}</a></li>`,
      ),
    '<li><a href="/guides">All grower guides</a></li>',
    '<li><a href="/welcome">See how Verdant works</a></li>',
    '<li><a href="/pricing">Compare Free and Pro pricing</a></li>',
  ].join("");

  const starterHref = buildStaticGuideQuickLogStarterHref(guide.slug);
  const standardCallsToAction = [
    `<nav aria-label="Keep reading"><h2>Keep reading</h2><ul>${relatedLinks}</ul></nav>`,
    `<section><h2>Log your first grow note in 30 seconds — no account needed</h2><p>Try the public Quick Log starter: nickname a plant, jot one note, and the draft stays on your device until you decide to keep it.</p><p><a href="${escapeStaticHtml(starterHref)}">Try the 30-second Quick Log</a></p></section>`,
    '<section><h2>See a real One-Tent Loop before signing up</h2><p>Walk through how Verdant connects a grow, tent, plant, Quick Log, timeline, sensor snapshot, cautious AI review, and grower-approved action queue.</p><p><a href="/welcome">Explore the public demo</a></p></section>',
  ].join("");

  return [
    `<main id="static-guide-fallback"><article data-guide-slug="${escapeStaticHtml(guide.slug)}">`,
    `<p><a href="/guides">Grower Guides</a></p>`,
    `<h1>${escapeStaticHtml(guide.h1)}</h1>`,
    `<p>${escapeStaticHtml(guide.intro)}</p>`,
    editorialProvenance,
    referenceTable,
    cta,
    sectionMarkup,
    evidenceTable,
    budRotChecklist,
    vpdCalculator,
    customerComparison,
    faq ? `<section><h2>Frequently asked questions</h2>${faq}</section>` : "",
    sources ? `<section><h2>Evidence and scope</h2><p>These sources support the measurement concepts and study-specific observations in this guide. They do not establish a universal fixture setting or diagnose a plant.</p><ul>${sources}</ul></section>` : "",
    standardCallsToAction,
    "</article></main>",
  ].join("");
}

/**
 * The guide directory is the primary static discovery route. Keep its card
 * list derived from the same registry that owns the individual route pages.
 */
function buildStaticGuideHubBodyFallback(): string {
  const guideLinks = VERDANT_SEO_GUIDES.map(
    (guide) =>
      `<li><a href="/guides/${escapeStaticHtml(guide.slug)}">${escapeStaticHtml(guide.h1)}</a><p>${escapeStaticHtml(guide.description)}</p></li>`,
  ).join("");
  const faq = VERDANT_GROWER_GUIDE_FAQ.map(
    (entry) =>
      `<details><summary>${escapeStaticHtml(entry.question)}</summary><p>${escapeStaticHtml(entry.answer)}</p></details>`,
  ).join("");

  return [
    '<main id="static-guide-fallback"><article data-guide-directory="true">',
    "<h1>The Verdant grower guide</h1>",
    "<p>Plant memory. Sensor truth. Grower-approved decisions. These guides cover diary practice, lighting, sensor context, and cautious troubleshooting. Verdant suggests; the grower decides. Verdant cannot touch your equipment.</p>",
    "<section><h2>Grower guides</h2><ul>",
    guideLinks,
    '</ul></section><section><h2>Stage-aware care checklist</h2><p>Use a stage-based reference for watering, nutrients, environment, and harvest tasks. Cultivars move at different speeds, so the checklist follows the plant rather than a calendar.</p><p><a href="/guides/grow-stage-care-guide">Open the grow-stage care guide</a></p></section>',
    '<section><h2>Free cannabis VPD calculator</h2><p>Calculate air VPD from manual temperature and humidity inputs. Nothing is uploaded, saved, or treated as live telemetry.</p><p><a href="/tools/vpd-calculator">Open the free VPD calculator</a></p></section>',
    `<section><h2>Common grower questions</h2>${faq}</section>`,
    '<p>Ready to start? See <a href="/welcome">what Verdant does</a>, or compare <a href="/pricing">Verdant plans</a>.</p>',
    "</article></main>",
  ].join("");
}

/**
 * Preserve the useful non-interactive reference content when JavaScript is
 * unavailable. The browser-only filters and checkboxes remain React features;
 * this fallback intentionally exposes every checklist row in canonical order.
 */
function buildStaticGrowStageCareBodyFallback(): string {
  const stages: ReadonlyArray<GrowStage> = ["seedling", "veg", "flower"];
  const sections = stages
    .map((stage) => {
      const categories = CARE_CATEGORY_ORDER.map((category: CareCategory) => {
        const items = GROW_STAGE_CARE_CHECKLIST.filter(
          (item) => item.stage === stage && item.category === category,
        );
        if (items.length === 0) return "";
        return [
          `<section><h3>${escapeStaticHtml(CARE_CATEGORY_LABELS[category])}</h3><ul>`,
          items
            .map(
              (item) =>
                `<li><strong>${escapeStaticHtml(item.label)}</strong><p>${escapeStaticHtml(item.detail)}</p></li>`,
            )
            .join(""),
          "</ul></section>",
        ].join("");
      }).join("");
      return `<section><h2>${escapeStaticHtml(GROW_STAGE_LABELS[stage])}</h2>${categories}</section>`;
    })
    .join("");

  const faq = GROW_STAGE_CARE_FAQ.map(
    (entry) =>
      `<details><summary>${escapeStaticHtml(entry.question)}</summary><p>${escapeStaticHtml(entry.answer)}</p></details>`,
  ).join("");

  return [
    '<main id="static-guide-fallback"><article data-grow-stage-care-guide="true">',
    '<p><a href="/guides">Grower Guides</a></p>',
    "<h1>Grow-stage care guide</h1>",
    "<p>A stage-based reference for seedling, vegetative, and flower care. Cultivars move at different speeds, so compare the plant's current stage and response instead of following a fixed calendar.</p>",
    sections,
    `<section><h2>Common questions</h2>${faq}</section>`,
    '<nav aria-label="Related guides"><h2>Keep reading</h2><ul><li><a href="/guides/cannabis-plant-care">Cannabis plant care FAQ</a></li><li><a href="/guides/grow-room-vpd-tracker">How to track VPD in a grow room</a></li><li><a href="/guides">All grower guides</a></li><li><a href="/welcome">See how Verdant works</a></li><li><a href="/pricing">Compare Free and Pro pricing</a></li></ul></nav>',
    '<section><h2>See a real One-Tent Loop before signing up</h2><p>Walk through how Verdant connects a grow, tent, plant, Quick Log, timeline, sensor snapshot, cautious AI review, and grower-approved action queue.</p><p><a href="/welcome">Explore the public demo</a></p></section>',
    "</article></main>",
  ].join("");
}

function routeFileName(path: string): string {
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new Error(`Static SEO route must be a clean absolute path: ${path}`);
  }
  return path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
}

function buildStaticWebPageJsonLd(metadata: {
  readonly title: string;
  readonly description: string;
  readonly url: string;
}) {
  return buildWebPageJsonLd({ ...metadata, siteUrl: VERDANT_SITE_ORIGIN });
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
): StaticPublicSeoDocument {
  const url = `${VERDANT_SITE_ORIGIN}${path}`;
  return {
    path,
    fileName: routeFileName(path),
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

/**
 * An INDEXABLE audience variant that concedes its ranking URL to another route.
 *
 * Distinct from `aliasDocument` above, and the difference is the whole point:
 * `aliasDocument` builds a legacy redirect stub (`/strains/*`) that inherits the
 * target's title, description and JSON-LD wholesale and is marked
 * `noindex, follow`. This helper keeps the variant's OWN copy and leaves it
 * affirmatively indexable — only the canonical identity moves.
 *
 * Do not "simplify" this into `aliasDocument`. Pairing `noindex` with a
 * cross-canonical sends crawlers two contradictory instructions about the same
 * URL, and the variant would also lose the audience-specific title and
 * description that justify its existence.
 *
 * `metadata.url` is the single source for `<link rel="canonical">`, `og:url`,
 * and the WebPage JSON-LD `@id`, so pointing it at the canonical target keeps
 * all three in agreement — which is exactly what the postbuild
 * canonical/og-parity and JSON-LD `@id` validators assert.
 */
function crossCanonicalDocument(
  path: string,
  canonicalPath: string,
  metadata: Omit<StaticSocialRouteMetadata, "url" | "image"> & {
    readonly image?: string;
  },
): StaticPublicAliasDocument {
  const url = `${VERDANT_SITE_ORIGIN}${canonicalPath}`;
  return {
    path,
    fileName: routeFileName(path),
    canonicalPath,
    metadata: {
      ...metadata,
      url,
      image: metadata.image ?? DEFAULT_OG_IMAGE,
      jsonLd: metadata.jsonLd ?? [buildStaticWebPageJsonLd({ ...metadata, url })],
    },
  };
}

const GUIDE_HUB = publicDocument("/guides", {
  title: "Grower Guides: Diary, Lighting & Sensor Truth | Verdant",
  description:
    "Practical grower guides for plant timelines, grow-light distance, PPFD, DLI, source-labeled sensor data, VPD context, and cautious troubleshooting.",
  imageAlt: "Verdant Grower Guides",
  bodyFallbackHtml: buildStaticGuideHubBodyFallback(),
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
});

const CULTIVAR_HUB = publicDocument("/cultivars", {
  title: "Cannabis Cultivar Guides: Oreoz, Do-Si-Dos & More | Verdant",
  description:
    "Evergreen cultivar profiles for serious home growers: environment ranges, flower windows, common issues, and what to compare when pheno-hunting.",
  imageAlt: "Verdant cultivar guides",
});

const CORE_ACQUISITION_DOCUMENTS: ReadonlyArray<StaticPublicSeoDocument> = [
  publicDocument("/", {
    title: "Grow Diary & Grow Room Tracking App | Verdant Grow Diary",
    description:
      "See what changed in your grow and decide what to do next. Verdant turns logs, photos, and sensor readings from the gear you already own into one plant timeline.",
    imageAlt: "Verdant Grow Diary",
  }),
  publicDocument("/welcome", {
    title: "Grow Diary & Grow Room Tracking App | Verdant Grow Diary",
    description:
      "See what changed in your grow and decide what to do next. Verdant turns logs, photos, and sensor readings from the gear you already own into one plant timeline.",
    imageAlt: "Verdant Grow Diary",
  }),
  publicDocument("/pricing", {
    title: "Pricing — Free, Pro & Craft | Verdant Grow Diary",
    description:
      "Free grow diary forever. Pro adds multi-tent support, full sensor history and advanced exports. Craft adds the live Pro Blueprint.",
    imageAlt: "Verdant pricing",
  }),
  publicDocument("/guides/grow-stage-care-guide", {
    title: "Grow stage care guide | Seedling, Veg, and Flower checklists | Verdant",
    description:
      "A searchable grow-stage care guide with watering, nutrients, environment, and harvest checklists for seedling, vegetative, and flower stages.",
    imageAlt: "Verdant grow-stage care guide",
    bodyFallbackHtml: buildStaticGrowStageCareBodyFallback(),
  }),
  publicDocument("/tools/blueprint-targets", {
    title: "Grow stage target bands | Temperature, humidity, EC, pH, PPFD | Verdant",
    description:
      "Per-stage target ranges for air temperature, relative humidity, feed EC, pH, PPFD and DLI — from seedling through flower to dry and cure.",
    imageAlt: "Verdant grow stage target bands",
    // Registered here, not injected from a useEffect: staticRouteHead emits
    // these in the route's first SSR response, so a crawler that never
    // hydrates still receives the FAQPage and BreadcrumbList nodes.
    jsonLd: [
      buildStaticWebPageJsonLd({
        title: "Grow stage target bands | Temperature, humidity, EC, pH, PPFD | Verdant",
        description:
          "Per-stage target ranges for air temperature, relative humidity, feed EC, pH, PPFD and DLI — from seedling through flower to dry and cure.",
        url: `${VERDANT_SITE_ORIGIN}/tools/blueprint-targets`,
      }),
      buildFaqPageJsonLd({
        pageUrl: `${VERDANT_SITE_ORIGIN}/tools/blueprint-targets`,
        questions: VERDANT_BLUEPRINT_TARGETS_FAQ,
      }),
      buildBreadcrumbListJsonLd({
        items: [
          ...VERDANT_GUIDES_BREADCRUMB_ITEMS,
          {
            name: "Grow stage target bands",
            url: `${VERDANT_SITE_ORIGIN}/tools/blueprint-targets`,
          },
        ],
      }),
    ],
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
  }),
  publicDocument("/glossary", {
    title: "Cannabis Cultivation Glossary | Verdant Grow Diary",
    description:
      "Alphabetized reference of cannabis breeding, cultivation, and phenotype terms — searchable and category-filterable for serious growers.",
    imageAlt: "Verdant cultivation glossary",
  }),
  // /creator-beta is declared FIRST so it is the primary in the manifest's
  // duplicate-canonical report; /breeder-beta below points at it.
  publicDocument("/creator-beta", {
    title: "Verdant Creator & Breeder Beta | Verdant Grow Diary",
    description:
      "Controlled beta for serious growers, breeders, and grower-educators. See how Verdant turns plant logs, photos, sensor snapshots, phenotype notes, and lab evidence into one clear plant history.",
    imageAlt: "Verdant Creator & Breeder Beta",
  }),
  // Owner adjudication 2026-08-20: /breeder-beta keeps its breeder-oriented
  // title and description and stays indexable, but concedes its ranking URL to
  // /creator-beta. Both routes render the same <BetaLanding> component —
  // measured 233 of ~237 shared unique visible tokens, identical h1 and every
  // h2 — so two self-canonical URLs would compete on the same queries.
  // It is intentionally absent from public/sitemap.xml: never advertise a URL
  // whose canonical points somewhere else. See scripts/public-route-parity.config.mjs.
  crossCanonicalDocument("/breeder-beta", "/creator-beta", {
    title: "Verdant Breeder Beta | Verdant Grow Diary",
    description:
      "Controlled beta for breeders and pheno hunters. See how Verdant records lab evidence, pathogen screening, sensory rubrics, and pheno decisions — while the breeder always decides which plants advance.",
    imageAlt: "Verdant Breeder Beta",
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
  publicDocument("/feedback", {
    title: "Customer Feedback | Verdant Grow Diary",
    description:
      "Tell the humans building Verdant what's working and what isn't. Read by real people, no automated replies.",
    imageAlt: "Verdant customer feedback",
  }),
  publicDocument("/contact", {
    title: "Contact Us | Verdant Grow Diary",
    description:
      "Reach the humans building Verdant. Support, bugs, hardware ideas, billing, or questions.",
    imageAlt: "Contact the Verdant team",
  }),
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
    bodyFallbackHtml: buildStaticGuideBodyFallback(guide),
  }),
);

const CULTIVAR_DOCUMENTS = VERDANT_CULTIVARS.map((cultivar) =>
  publicDocument(`/cultivars/${cultivar.slug}`, {
    title: `${cultivar.name} Cultivar Grow Guide | Verdant`,
    description: `${cultivar.name} grow guide: lineage (${cultivar.lineage}), ${cultivar.flowerWeeks} flower, environment ranges by stage, and common issues home growers report.`,
    imageAlt: `${cultivar.name} cultivar guide`,
    jsonLd: buildStaticCultivarJsonLd(cultivar),
  }),
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

/**
 * Publicly reachable education pages that must not enter organic search or
 * the acquisition sitemap. Customer Mode remains outside Operator data and
 * outside share-token routing.
 */
export const STATIC_PUBLIC_NOINDEX_DOCUMENTS: ReadonlyArray<StaticPublicSeoDocument> =
  Object.freeze([
    publicDocument(NEXT_DOOR_CUSTOMER_COMPARISON_PATH, {
      title: OREOZ_GELONADE_CUSTOMER_SEO.title,
      description: OREOZ_GELONADE_CUSTOMER_SEO.description,
      imageAlt: "Next Door Cannabis Oreoz and Gelonade comparison",
      robots: "noindex, follow",
    }),
  ]);

/** All public documents emitted alongside Vite's primary SPA entry. */
export const STATIC_PUBLIC_SEO_DOCUMENTS: ReadonlyArray<StaticPublicSeoDocument> = Object.freeze([
  {
    path: "/founder",
    fileName: routeFileName("/founder"),
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
    ...STATIC_PUBLIC_NOINDEX_DOCUMENTS,
    ...STATIC_TRANSACTIONAL_NOINDEX_DOCUMENTS,
    ...STATIC_PUBLIC_ALIAS_DOCUMENTS,
  ]);
