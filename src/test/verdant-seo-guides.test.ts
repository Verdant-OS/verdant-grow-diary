/**
 * verdant-seo-guides.test.ts
 *
 * Static scanner for the /guides hub, the thirteen grower-intent guide pages,
 * sitemap discoverability, robots.txt safety, and forbidden-language rules.
 *
 * No React render, no Supabase, no network. Reads project files at test time.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VERDANT_CUSTOMER_GUIDE_PATH,
  VERDANT_CUSTOMER_MODE_GROWER_FAQ,
  VERDANT_GROWER_GUIDE_FAQ,
  VERDANT_GUIDES_BREADCRUMB_ITEMS,
  VERDANT_SEO_GUIDES,
  VERDANT_SITE_ORIGIN,
  VERDANT_GUIDE_SLUGS,
  findGuideBySlug,
} from "@/constants/verdantSeoContent";
import { VERDANT_FORBIDDEN_PUBLIC_PHRASES } from "@/constants/verdantSeoCopy";
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";

const REPO = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

const APP_TSX = read("src/App.tsx");
const GUIDES_INDEX = read("src/pages/GuidesIndex.tsx");
const GUIDE_PAGE = read("src/pages/GuidePage.tsx");
const CONTENT_TS = read("src/constants/verdantSeoContent.ts");
const SITEMAP = read("public/sitemap.xml");
const ROBOTS = read("public/robots.txt");
const LANDING = read("src/pages/Landing.tsx");
const PRICING = read("src/pages/Pricing.tsx");
const CUSTOMER_MODE_GUIDE = read("src/pages/CustomerModeGuide.tsx");

const EXPECTED_SLUGS = [
  "grow-diary-app",
  "grow-log-app-vs-grow-journal",
  "grow-room-vpd-tracker",
  "ac-infinity-data-logging",
  "spider-farmer-data-logging",
  "sensor-truth-grow-room",
  "ai-grow-doctor",
  // Search-to-first-value cluster (funnels to the public /quick-log starter).
  "how-to-start-a-grow-journal",
  "what-to-log-in-a-grow-journal",
  "grow-journal-template",
  "plant-watering-log",
  "grow-journal-app-without-account",
  "daily-grow-log-checklist",
];

describe("Verdant grower guide FAQ (/guides)", () => {
  it("has 8 grower-intent FAQ entries with non-empty answers", () => {
    expect(VERDANT_GROWER_GUIDE_FAQ.length).toBe(8);
    for (const q of VERDANT_GROWER_GUIDE_FAQ) {
      expect(q.question.trim().length).toBeGreaterThan(0);
      expect(q.answer.trim().length).toBeGreaterThan(0);
    }
  });

  it("covers the required grower-guide questions", () => {
    const required = [
      /start my first grow/i,
      /log in Quick Log/i,
      /sensor readings matter most/i,
      /VPD in a grow room/i,
      /without live sensors/i,
      /source-labeled sensor data/i,
      /before asking AI Doctor/i,
      /approval-required actions/i,
    ];
    for (const rx of required) {
      expect(VERDANT_GROWER_GUIDE_FAQ.some((q) => rx.test(q.question))).toBe(true);
    }
  });

  it("names all six source labels somewhere in guide-index or content", () => {
    const combined = [GUIDES_INDEX, CONTENT_TS].join("\n").toLowerCase();
    for (const label of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(combined).toContain(label);
    }
  });

  it("GuidesIndex builds FAQPage JSON-LD from the shared constant", () => {
    expect(GUIDES_INDEX).toContain("VERDANT_GROWER_GUIDE_FAQ");
    expect(GUIDES_INDEX).toContain("buildFaqPageJsonLd");
  });

  it("produces valid FAQPage JSON-LD for the grower guide", () => {
    const doc = buildFaqPageJsonLd({
      pageUrl: "https://verdantgrowdiary.com/guides",
      questions: VERDANT_GROWER_GUIDE_FAQ,
    });
    expect(doc["@type"]).toBe("FAQPage");
    expect(doc.mainEntity.length).toBe(VERDANT_GROWER_GUIDE_FAQ.length);
    // Round-trip through safeJsonLdStringify.
    expect(() => JSON.parse(safeJsonLdStringify(doc))).not.toThrow();
  });
});

describe("Verdant SEO guide pages (13)", () => {
  it("defines exactly the thirteen expected slugs, in order", () => {
    expect(VERDANT_GUIDE_SLUGS).toEqual(EXPECTED_SLUGS);
  });

  it("registers /guides and /guides/:slug in App.tsx", () => {
    expect(APP_TSX).toMatch(/path="\/guides"/);
    expect(APP_TSX).toMatch(/path="\/guides\/:slug"/);
    expect(APP_TSX).toContain("GuidesIndex");
    expect(APP_TSX).toContain("GuidePage");
  });

  it("every guide has H1, intro, sections, FAQ, related, and a target keyword", () => {
    for (const g of VERDANT_SEO_GUIDES) {
      expect(g.h1.trim().length).toBeGreaterThan(0);
      expect(g.intro.trim().length).toBeGreaterThan(20);
      expect(g.sections.length).toBeGreaterThanOrEqual(3);
      expect(g.sections.length).toBeLessThanOrEqual(5);
      expect(g.faq.length).toBeGreaterThanOrEqual(1);
      expect(g.related.length).toBeGreaterThanOrEqual(1);
      expect(g.targetKeyword.trim().length).toBeGreaterThan(0);

      // Target keyword or a close-phrase must appear in H1, intro, or a section body.
      const body =
        `${g.h1}\n${g.intro}\n${g.sections.map((s) => `${s.heading} ${s.body}`).join("\n")}`.toLowerCase();
      expect(body).toContain(g.targetKeyword.toLowerCase());
    }
  });

  it("every guide's related slugs resolve to real guides", () => {
    for (const g of VERDANT_SEO_GUIDES) {
      for (const rel of g.related) {
        expect(findGuideBySlug(rel)).not.toBeNull();
      }
    }
  });

  it("GuidePage renders H1, sections, FAQ accordion, and internal links", () => {
    expect(GUIDE_PAGE).toMatch(/<h1[^>]*>[\s\S]*guide\.h1[\s\S]*<\/h1>/);
    expect(GUIDE_PAGE).toContain("guide.sections.map");
    expect(GUIDE_PAGE).toContain("guide.faq.map");
    expect(GUIDE_PAGE).toContain("buildFaqPageJsonLd");
    // Verdant positioning + required internal links.
    expect(GUIDE_PAGE).toMatch(/to="\/welcome"/);
    expect(GUIDE_PAGE).toMatch(/to="\/pricing"/);
    expect(GUIDE_PAGE).toMatch(/to="\/guides"/);
  });

  it("GuidesIndex includes Verdant positioning + links to welcome/pricing", () => {
    expect(GUIDES_INDEX).toMatch(/Plant memory/i);
    expect(GUIDES_INDEX).toMatch(/Sensor truth/i);
    expect(GUIDES_INDEX).toMatch(/Grower-approved/i);
    expect(GUIDES_INDEX).toMatch(/to="\/welcome"/);
    expect(GUIDES_INDEX).toMatch(/to="\/pricing"/);
  });

  it("no guide content contains forbidden autopilot / device-control language", () => {
    const surface = [GUIDES_INDEX, GUIDE_PAGE, CONTENT_TS].join("\n").toLowerCase();
    for (const phrase of VERDANT_FORBIDDEN_PUBLIC_PHRASES) {
      expect(surface).not.toContain(phrase.toLowerCase());
    }
  });

  it("no guide content markets Verdant as ERP / seed-to-sale / compliance", () => {
    const surface = [GUIDES_INDEX, GUIDE_PAGE, CONTENT_TS].join("\n").toLowerCase();
    for (const forbidden of [
      "seed-to-sale",
      "metrc",
      "dispensary pos",
      "cannabis erp",
      "state compliance tracker",
    ]) {
      expect(surface).not.toContain(forbidden);
    }
  });
});

describe("Sitemap and robots discoverability", () => {
  it("sitemap includes /welcome, /pricing, /guides, and all 13 guide URLs", () => {
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/welcome");
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/pricing");
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/guides");
    for (const slug of EXPECTED_SLUGS) {
      expect(SITEMAP).toContain(`https://verdantgrowdiary.com/guides/${slug}`);
    }
  });

  it("sitemap does not include auth-protected routes", () => {
    for (const priv of [
      "/dashboard",
      "/diary",
      "/tents",
      "/plants",
      "/settings",
      "/action-queue",
      "/operator/",
      "/internal/",
      "/admin/",
    ]) {
      expect(SITEMAP).not.toContain(`https://verdantgrowdiary.com${priv}`);
    }
  });

  it("robots.txt does not block /guides and references the sitemap", () => {
    expect(ROBOTS).not.toMatch(/^\s*Disallow:\s*\/guides/im);
    expect(ROBOTS).toContain("Sitemap: https://verdantgrowdiary.com/sitemap.xml");
  });
});

describe("Landing and Pricing OG/Twitter metadata", () => {
  it("Landing wires usePageSeo with a title and description", () => {
    expect(LANDING).toContain("usePageSeo({");
    expect(LANDING).toMatch(/title:\s*"[^"]+"/);
    expect(LANDING).toMatch(/description:\s*"[^"]+"/);
    expect(LANDING).toMatch(/canonicalPath\?:\s*"\/"\s*\|\s*"\/welcome"/);
    expect(LANDING).toMatch(/canonicalPath\s*=\s*"\/welcome"/);
    expect(LANDING).toMatch(/path:\s*canonicalPath/);
  });

  it("Pricing wires usePageSeo with a title and description", () => {
    expect(PRICING).toContain("usePageSeo({");
    expect(PRICING).toMatch(/title:\s*"[^"]+"/);
    expect(PRICING).toMatch(/description:\s*"[^"]+"/);
    expect(PRICING).toMatch(/path:\s*"\/pricing"/);
  });

  it("usePageSeo hook still emits og:* and twitter:* meta tags", () => {
    const hook = read("src/hooks/usePageSeo.ts");
    for (const tag of [
      "og:title",
      "og:description",
      "og:url",
      "og:image",
      "og:type",
      "twitter:title",
      "twitter:description",
      "twitter:image",
      "twitter:card",
    ]) {
      expect(hook).toContain(tag);
    }
  });

  it("usePageSeo defaults og:image to an absolute https URL (no broken paths)", () => {
    const hook = read("src/hooks/usePageSeo.ts");
    // Default is `${SITE_ORIGIN}/brand/verdant-logo.png` — accept template form.
    expect(hook).toMatch(/\/brand\/verdant-logo\.png/);
    expect(hook).toMatch(/https:\/\/verdantgrowdiary\.com/);
  });
});

describe("Guide internal links to Customer Guide route", () => {
  it("Customer Guide path resolves to the real /customer/:shareId route", () => {
    expect(VERDANT_CUSTOMER_GUIDE_PATH.startsWith("/customer/")).toBe(true);
    expect(APP_TSX).toMatch(/path="\/customer\/:shareId"/);
  });

  it("GuidePage and GuidesIndex link to the Customer Guide route", () => {
    expect(GUIDE_PAGE).toContain("VERDANT_CUSTOMER_GUIDE_PATH");
    expect(GUIDES_INDEX).toContain("VERDANT_CUSTOMER_GUIDE_PATH");
  });

  it("guide pages do not link to protected/private app routes", () => {
    const surface = [GUIDES_INDEX, GUIDE_PAGE].join("\n");
    for (const priv of [
      'to="/dashboard"',
      'to="/diary"',
      'to="/tents"',
      'to="/plants"',
      'to="/settings"',
      'to="/action-queue"',
      'to="/operator',
      'to="/admin',
      'to="/internal',
    ]) {
      expect(surface).not.toContain(priv);
    }
  });
});

describe("Guides hub metadata (/guides)", () => {
  it("GuidesIndex title/description carry the target keyword phrases", () => {
    expect(GUIDES_INDEX).toContain(
      "Verdant Grower Guides | Grow Diary, VPD Tracking, and Sensor Truth",
    );
    expect(GUIDES_INDEX).toMatch(/source-labeled sensor data/i);
    expect(GUIDES_INDEX).toMatch(/path:\s*"\/guides"/);
  });

  it("GuidePage passes guide.title and guide.description into usePageSeo", () => {
    expect(GUIDE_PAGE).toContain("guide?.title");
    expect(GUIDE_PAGE).toContain("guide?.description");
  });

  it("every guide title ends with the shared brand suffix segment", () => {
    for (const g of VERDANT_SEO_GUIDES) {
      expect(g.title).toMatch(/Verdant/);
    }
  });

  it("every guide description is unique and non-empty", () => {
    const descs = VERDANT_SEO_GUIDES.map((g) => g.description);
    expect(new Set(descs).size).toBe(descs.length);
    for (const d of descs) expect(d.trim().length).toBeGreaterThan(20);
  });
});

describe("BreadcrumbList JSON-LD for guides", () => {
  it("hub breadcrumb has Home + Grower Guides in correct positions", () => {
    const doc = buildBreadcrumbListJsonLd({
      items: VERDANT_GUIDES_BREADCRUMB_ITEMS,
    });
    expect(doc["@type"]).toBe("BreadcrumbList");
    expect(doc.itemListElement.length).toBe(2);
    expect(doc.itemListElement[0]).toMatchObject({
      position: 1,
      name: "Home",
      item: `${VERDANT_SITE_ORIGIN}/welcome`,
    });
    expect(doc.itemListElement[1]).toMatchObject({
      position: 2,
      name: "Grower Guides",
      item: `${VERDANT_SITE_ORIGIN}/guides`,
    });
    expect(() => JSON.parse(safeJsonLdStringify(doc))).not.toThrow();
  });

  it("each guide breadcrumb has Home + Grower Guides + current guide", () => {
    for (const g of VERDANT_SEO_GUIDES) {
      const items = [
        ...VERDANT_GUIDES_BREADCRUMB_ITEMS,
        { name: g.h1, url: `${VERDANT_SITE_ORIGIN}/guides/${g.slug}` },
      ];
      const doc = buildBreadcrumbListJsonLd({ items });
      expect(doc.itemListElement.length).toBe(3);
      expect(doc.itemListElement[2]).toMatchObject({
        position: 3,
        name: g.h1,
        item: `${VERDANT_SITE_ORIGIN}/guides/${g.slug}`,
      });
    }
  });

  it("rejects relative breadcrumb URLs", () => {
    expect(() =>
      buildBreadcrumbListJsonLd({
        items: [{ name: "Home", url: "/welcome" }],
      }),
    ).toThrow();
  });

  it("GuidesIndex and GuidePage inject breadcrumb JSON-LD", () => {
    expect(GUIDES_INDEX).toContain("buildBreadcrumbListJsonLd");
    expect(GUIDES_INDEX).toContain("guides-index-breadcrumb");
    expect(GUIDE_PAGE).toContain("buildBreadcrumbListJsonLd");
    expect(GUIDE_PAGE).toContain("breadcrumb");
  });
});

describe("Customer Mode grower FAQ", () => {
  it("exposes the same 8 grower-intent questions as the /guides hub", () => {
    expect(VERDANT_CUSTOMER_MODE_GROWER_FAQ.length).toBe(8);
    expect(VERDANT_CUSTOMER_MODE_GROWER_FAQ).toEqual(VERDANT_GROWER_GUIDE_FAQ);
  });

  it("CustomerModeGuide renders the visible grower FAQ from shared constants", () => {
    expect(CUSTOMER_MODE_GUIDE).toContain("VERDANT_CUSTOMER_MODE_GROWER_FAQ");
    expect(CUSTOMER_MODE_GUIDE).toContain("customer-mode-grower-faq");
    expect(CUSTOMER_MODE_GUIDE).toContain("buildFaqPageJsonLd");
  });

  it("all six sensor source labels appear in Customer Mode visible copy", () => {
    const lower = CUSTOMER_MODE_GUIDE.toLowerCase();
    for (const label of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(lower).toContain(label);
    }
  });

  it("Customer Mode FAQ JSON-LD is derived from the visible constant", () => {
    const doc = buildFaqPageJsonLd({
      questions: VERDANT_CUSTOMER_MODE_GROWER_FAQ,
    });
    expect(doc.mainEntity.length).toBe(VERDANT_CUSTOMER_MODE_GROWER_FAQ.length);
    for (let i = 0; i < doc.mainEntity.length; i++) {
      expect(doc.mainEntity[i].name).toBe(VERDANT_CUSTOMER_MODE_GROWER_FAQ[i].question);
      expect(doc.mainEntity[i].acceptedAnswer.text).toBe(
        VERDANT_CUSTOMER_MODE_GROWER_FAQ[i].answer,
      );
    }
  });

  it("Customer Mode contains no forbidden autopilot / device-control language", () => {
    const lower = CUSTOMER_MODE_GUIDE.toLowerCase();
    for (const phrase of VERDANT_FORBIDDEN_PUBLIC_PHRASES) {
      expect(lower).not.toContain(phrase.toLowerCase());
    }
  });
});
