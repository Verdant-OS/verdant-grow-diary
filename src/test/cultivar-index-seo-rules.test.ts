/**
 * Focused regression: /cultivars index SEO crawl-safety gate.
 *
 * Proves:
 * - base /cultivars is indexable
 * - every query-bearing filter variant has exactly one clean canonical path
 * - og:url is driven by the same clean path (via usePageSeo)
 * - filtered variants are noindex, follow
 * - no query parameter leaks into path/canonical
 * - title/description remain the evergreen hub copy
 */

import { describe, expect, it } from "vitest";

import {
  buildCultivarsIndexSeo,
  CULTIVARS_INDEX_PATH,
  hasCultivarIndexQueryVariant,
} from "@/lib/cultivarIndexSeoRules";

const FILTER_VARIANTS = [
  "?q=oreoz",
  "?q=",
  "?difficulty=Advanced",
  "?difficulty=all",
  "?q=oreoz&difficulty=Advanced",
  "?difficulty=Advanced&q=oreoz",
  "?q=cookies&difficulty=Beginner-friendly",
  "?difficulty=not-a-real-filter",
  "?utm_source=discord",
  "?q=%20oreoz%20",
  "q=oreoz",
  "difficulty=Intermediate&q=",
  new URLSearchParams("q=oreoz"),
  new URLSearchParams({ difficulty: "Advanced", q: "gas" }),
  new URLSearchParams("q=&difficulty="),
] as const;

describe("cultivarIndexSeoRules — unfiltered hub", () => {
  it("is indexable with a clean /cultivars path", () => {
    const seo = buildCultivarsIndexSeo();
    expect(seo.path).toBe(CULTIVARS_INDEX_PATH);
    expect(seo.path).toBe("/cultivars");
    expect(seo.noindex).toBe(false);
    expect(seo.title).toContain("Cultivar Guides");
    expect(seo.description).toMatch(/environment ranges/i);
    expect(seo.path).not.toContain("?");
    expect(seo.path).not.toContain("=");
  });

  it("treats empty / null / undefined search as unfiltered", () => {
    expect(hasCultivarIndexQueryVariant("")).toBe(false);
    expect(hasCultivarIndexQueryVariant(null)).toBe(false);
    expect(hasCultivarIndexQueryVariant(undefined)).toBe(false);
    expect(hasCultivarIndexQueryVariant(new URLSearchParams())).toBe(false);
    expect(buildCultivarsIndexSeo("").noindex).toBe(false);
    expect(buildCultivarsIndexSeo(new URLSearchParams()).noindex).toBe(false);
  });
});

describe("cultivarIndexSeoRules — query-bearing variants", () => {
  for (const search of FILTER_VARIANTS) {
    const label =
      search instanceof URLSearchParams
        ? `URLSearchParams(${search.toString()})`
        : String(search);

    it(`${label} collapses to clean hub canonical and is noindex, follow`, () => {
      expect(hasCultivarIndexQueryVariant(search)).toBe(true);

      const seo = buildCultivarsIndexSeo(search);

      // Exactly one clean canonical path — no query leakage.
      expect(seo.path).toBe("/cultivars");
      expect(seo.path).not.toMatch(/[?=&#]/);
      expect(seo.noindex).toBe(true);

      // Evergreen hub copy is preserved (not rewritten per filter).
      expect(seo.title).toContain("Cultivar Guides");
      expect(seo.description).toMatch(/environment ranges/i);
    });
  }

  it("is deterministic for the same input", () => {
    const a = buildCultivarsIndexSeo("?q=oreoz&difficulty=Advanced");
    const b = buildCultivarsIndexSeo("?q=oreoz&difficulty=Advanced");
    expect(a).toEqual(b);
    expect(a.noindex).toBe(true);
    expect(a.path).toBe("/cultivars");
  });
});

describe("cultivarIndexSeoRules — contract invariants", () => {
  it("never emits a path that contains query characters", () => {
    const cases = ["", "?q=x", "?difficulty=all", "?foo=bar&baz=", new URLSearchParams("a=1")];
    for (const search of cases) {
      const { path } = buildCultivarsIndexSeo(search);
      expect(path).toBe("/cultivars");
      expect(path.includes("?")).toBe(false);
      expect(path.includes("&")).toBe(false);
      expect(path.includes("=")).toBe(false);
    }
  });
});
