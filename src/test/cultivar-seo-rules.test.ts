import { describe, expect, it } from "vitest";

import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  buildCultivarSeo,
  buildCultivarsIndexSeo,
  buildLegacyStrainSeo,
  buildUnknownCultivarSeo,
  CULTIVAR_SITE_ORIGIN,
  hasCultivarQueryVariant,
} from "@/lib/cultivarSeoRules";

const FILTER_VARIANTS = [
  "?q=oreoz",
  "?q=",
  "?difficulty=Intermediate",
  "?difficulty=all",
  "?q=cookies&difficulty=Beginner-friendly",
  "?difficulty=Advanced&q=gas",
  "?difficulty=not-a-real-filter",
  "?utm_source=discord",
] as const;

describe("cultivar SEO rules", () => {
  it("keeps the unfiltered hub indexable", () => {
    const seo = buildCultivarsIndexSeo();
    expect(seo.path).toBe("/cultivars");
    expect(seo.noindex).toBe(false);
    expect(seo.ogImage).toBe(`${CULTIVAR_SITE_ORIGIN}/og/cultivars/index.png`);
    expect(seo.ogImageWidth).toBe(1200);
    expect(seo.ogImageHeight).toBe(630);
  });

  for (const search of FILTER_VARIANTS) {
    it(`${search} collapses to the hub canonical and cannot become a duplicate index`, () => {
      expect(hasCultivarQueryVariant(search)).toBe(true);
      const seo = buildCultivarsIndexSeo(search);
      expect(seo.path).toBe("/cultivars");
      expect(seo.noindex).toBe(true);
      expect(seo.ogType).toBe("website");
    });
  }

  it("builds unique, indexable metadata for every curated cultivar", () => {
    const paths = new Set<string>();
    const images = new Set<string>();
    for (const cultivar of VERDANT_CULTIVARS) {
      const seo = buildCultivarSeo(cultivar);
      expect(seo.path).toBe(`/cultivars/${cultivar.slug}`);
      expect(seo.title).toContain(cultivar.name);
      expect(seo.description).toContain(cultivar.lineage);
      expect(seo.ogImage).toBe(`${CULTIVAR_SITE_ORIGIN}/og/cultivars/${cultivar.slug}.png`);
      expect(seo.ogImageAlt).toContain(cultivar.name);
      expect(seo.ogType).toBe("article");
      expect(seo.noindex).toBe(false);
      paths.add(seo.path);
      images.add(seo.ogImage);
    }
    expect(paths.size).toBe(VERDANT_CULTIVARS.length);
    expect(images.size).toBe(VERDANT_CULTIVARS.length);
  });

  it("fails closed for unknown and legacy cultivar routes", () => {
    expect(buildUnknownCultivarSeo().noindex).toBe(true);
    expect(buildUnknownCultivarSeo().path).toBe("/cultivars");
    expect(buildLegacyStrainSeo().noindex).toBe(true);
    expect(buildLegacyStrainSeo().path).toBe("/cultivars");

    for (const cultivar of VERDANT_CULTIVARS) {
      const legacy = buildLegacyStrainSeo(cultivar);
      expect(legacy.noindex).toBe(true);
      expect(legacy.path).toBe(`/cultivars/${cultivar.slug}`);
    }
  });
});
