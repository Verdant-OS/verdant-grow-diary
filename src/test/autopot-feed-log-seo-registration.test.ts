/**
 * SEO registration for /guides/autopot-stash-nutrients-feed-log, kept in its own file
 * so the existing (scorer-locked) SEO suites stay untouched.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  STATIC_PUBLIC_SEO_DOCUMENTS,
} from "@/lib/build/staticPublicSeoDocuments";
import {
  AUTOPOT_LOG_DESCRIPTION,
  AUTOPOT_LOG_FAQ,
  AUTOPOT_LOG_PATH,
  AUTOPOT_LOG_TITLE,
} from "@/lib/autopotFeedLogRules";

const ROOT = resolve(__dirname, "../..");
const URL_ABS = `https://verdantgrowdiary.com${AUTOPOT_LOG_PATH}`;

function flowerDocument() {
  const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((entry) => entry.path === AUTOPOT_LOG_PATH);
  if (!doc) throw new Error("missing static document");
  return doc;
}

describe("AutoPot feed log guide SEO registration", () => {
  it("is a public manifest route with no required feature", () => {
    const entries = APP_ROUTES.filter((entry) => entry.path === AUTOPOT_LOG_PATH);
    expect(entries).toHaveLength(1);
    expect(entries[0].access).toBe("public");
    expect(entries[0].requiredFeature).toBeUndefined();
  });

  it("is listed once in the sitemap with an absolute production URL", () => {
    const sitemap = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
    expect(sitemap.match(new RegExp(`<loc>${URL_ABS}</loc>`, "g"))).toHaveLength(1);
  });

  it("emits one indexable static document with the source title, meta and canonical", () => {
    expect(STATIC_PUBLIC_OUTPUT_DOCUMENTS.filter((d) => d.path === AUTOPOT_LOG_PATH)).toHaveLength(
      1,
    );
    const { metadata } = flowerDocument();
    expect(metadata.title).toBe(`${AUTOPOT_LOG_TITLE} | Verdant Grow Diary`);
    expect(metadata.description).toBe(AUTOPOT_LOG_DESCRIPTION);
    expect(metadata.url).toBe(URL_ABS);
    expect(metadata.robots ?? "index, follow").toBe("index, follow");
  });

  it("carries the four source JSON-LD blocks, the FAQ word for word, and no ratings", () => {
    const jsonLd = (flowerDocument().metadata.jsonLd ?? []) as Record<string, unknown>[];
    const types = jsonLd.map((node) => node["@type"]);
    for (const type of ["Article", "FAQPage", "WebApplication", "BreadcrumbList"]) {
      expect(types).toContain(type);
    }
    const faq = jsonLd.find((node) => node["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(
      faq.mainEntity.map((q) => ({ question: q.name, answer: q.acceptedAnswer.text })),
    ).toEqual(AUTOPOT_LOG_FAQ.map((q) => ({ question: q.question, answer: q.answer })));
    const app = jsonLd.find((node) => node["@type"] === "WebApplication");
    expect(app).toMatchObject({ name: "AutoPot Reservoir & Feed Log", url: URL_ABS });
    const crumbs = jsonLd.find((node) => node["@type"] === "BreadcrumbList") as {
      itemListElement: { name: string }[];
    };
    expect(crumbs.itemListElement.at(-1)?.name).toBe("AutoPot + Stash Nutrients Feed Log");
    expect(JSON.stringify(jsonLd)).not.toMatch(/aggregateRating|"review"/i);
    expect(JSON.stringify(jsonLd)).not.toMatch(/Example from our grow|476/);
  });
});
