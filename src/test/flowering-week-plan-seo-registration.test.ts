/**
 * SEO registration for /guides/cannabis-flowering-stages-week-by-week, kept in its own file
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
  FLOWERING_PLAN_DESCRIPTION,
  FLOWERING_PLAN_FAQ,
  FLOWERING_PLAN_PATH,
  FLOWERING_PLAN_TITLE,
} from "@/lib/floweringWeekPlanRules";

const ROOT = resolve(__dirname, "../..");
const URL_ABS = `https://verdantgrowdiary.com${FLOWERING_PLAN_PATH}`;

function flowerDocument() {
  const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((entry) => entry.path === FLOWERING_PLAN_PATH);
  if (!doc) throw new Error("missing static document");
  return doc;
}

describe("flowering stages guide SEO registration", () => {
  it("is a public manifest route with no required feature", () => {
    const entries = APP_ROUTES.filter((entry) => entry.path === FLOWERING_PLAN_PATH);
    expect(entries).toHaveLength(1);
    expect(entries[0].access).toBe("public");
    expect(entries[0].requiredFeature).toBeUndefined();
  });

  it("is listed once in the sitemap with an absolute production URL", () => {
    const sitemap = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
    expect(sitemap.match(new RegExp(`<loc>${URL_ABS}</loc>`, "g"))).toHaveLength(1);
  });

  it("emits one indexable static document with the source title, meta and canonical", () => {
    expect(
      STATIC_PUBLIC_OUTPUT_DOCUMENTS.filter((d) => d.path === FLOWERING_PLAN_PATH),
    ).toHaveLength(1);
    const { metadata } = flowerDocument();
    expect(metadata.title).toBe(`${FLOWERING_PLAN_TITLE} | Verdant Grow Diary`);
    expect(metadata.description).toBe(FLOWERING_PLAN_DESCRIPTION);
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
    ).toEqual(FLOWERING_PLAN_FAQ.map((q) => ({ question: q.question, answer: q.answer })));
    const app = jsonLd.find((node) => node["@type"] === "WebApplication");
    expect(app).toMatchObject({ name: "Flowering Week-by-Week Planner", url: URL_ABS });
    const crumbs = jsonLd.find((node) => node["@type"] === "BreadcrumbList") as {
      itemListElement: { name: string }[];
    };
    expect(crumbs.itemListElement.at(-1)?.name).toBe("Cannabis Flowering Stages Week by Week");
    expect(JSON.stringify(jsonLd)).not.toMatch(/aggregateRating|"review"/i);
  });
});
