import { describe, expect, it } from "vitest";

import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import { VERDANT_SEO_GUIDES } from "@/constants/verdantSeoContent";
import {
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import {
  deriveSitemapEntries,
  renderSitemapXml,
  sitemapExclusionReason,
  type SitemapSourceDocument,
} from "@/lib/build/sitemapRules";
import {
  SITEMAP_ONLY_LAST_MODIFIED_ON,
  SITEMAP_ONLY_ROUTES,
  STATIC_ONLY_ROUTES,
} from "../../scripts/public-route-parity.config.mjs";

function projectEntries() {
  return deriveSitemapEntries({
    siteOrigin: VERDANT_SITE_ORIGIN,
    staticDocuments: STATIC_PUBLIC_SEO_DOCUMENTS.map((document) => ({
      path: document.path,
      canonicalUrl: document.metadata.url,
      lastModifiedOn: document.lastModifiedOn,
      robots: document.metadata.robots,
      publicationStatus: "published",
    })),
    staticOnlyRoutes: STATIC_ONLY_ROUTES,
    sitemapOnlyRoutes: SITEMAP_ONLY_ROUTES,
    sitemapOnlyLastModifiedOn: SITEMAP_ONLY_LAST_MODIFIED_ON,
  });
}

const cleanDocument: SitemapSourceDocument = {
  path: "/welcome",
  canonicalUrl: `${VERDANT_SITE_ORIGIN}/welcome`,
  lastModifiedOn: "2026-07-26",
  publicationStatus: "published",
};

describe("deterministic sitemap generation", () => {
  it("derives exactly the 51 canonical indexable project URLs", () => {
    const entries = projectEntries();
    expect(entries).toHaveLength(51);
    expect(entries[0]).toMatchObject({
      path: "/",
      loc: `${VERDANT_SITE_ORIGIN}/`,
      lastModifiedOn: "2026-07-26",
    });
    expect(new Set(entries.map((entry) => entry.path)).size).toBe(entries.length);
    expect(entries.every((entry) => entry.loc.startsWith(`${VERDANT_SITE_ORIGIN}/`))).toBe(true);
    expect(entries.some((entry) => entry.path.startsWith("/strains"))).toBe(false);
    expect(entries.every((entry) => entry.lastModifiedOn)).toBe(true);
  });

  it("takes guide dates from modifiedOn then publishedOn and cultivar dates from lastVerifiedAt", () => {
    const byPath = new Map(projectEntries().map((entry) => [entry.path, entry]));
    for (const guide of VERDANT_SEO_GUIDES) {
      expect(byPath.get(`/guides/${guide.slug}`)?.lastModifiedOn).toBe(
        guide.modifiedOn ?? guide.publishedOn,
      );
    }
    for (const cultivar of VERDANT_CULTIVARS) {
      const entry = byPath.get(`/cultivars/${cultivar.slug}`);
      if (cultivar.publicationStatus === "published") {
        expect(entry?.lastModifiedOn).toBe(cultivar.lastVerifiedAt.slice(0, 10));
      } else {
        expect(entry).toBeUndefined();
      }
    }
  });

  it("renders byte-stable XML with one lastmod per project URL", () => {
    const entries = projectEntries();
    const first = renderSitemapXml(entries);
    const second = renderSitemapXml(projectEntries());
    expect(second).toBe(first);
    expect([...first.matchAll(/<loc>/g)]).toHaveLength(51);
    expect([...first.matchAll(/<lastmod>/g)]).toHaveLength(51);
    expect(first.endsWith("</urlset>\n")).toBe(true);
  });

  it.each([
    ["noindex", { robots: "noindex, follow" }, "noindex"],
    ["redirect", { isRedirect: true }, "redirect"],
    ["draft cultivar", { publicationStatus: "draft" }, "unpublished"],
    [
      "foreign origin",
      { canonicalUrl: "https://example.com/welcome" },
      "foreign origin",
    ],
    [
      "query",
      { canonicalUrl: `${VERDANT_SITE_ORIGIN}/welcome?source=sitemap` },
      "query",
    ],
    [
      "hash",
      { canonicalUrl: `${VERDANT_SITE_ORIGIN}/welcome#intro` },
      "hash",
    ],
    [
      "dynamic placeholder",
      {
        path: "/cultivars/:slug",
        canonicalUrl: `${VERDANT_SITE_ORIGIN}/cultivars/:slug`,
      },
      "dynamic placeholder",
    ],
    [
      "legacy strain alias",
      {
        path: "/strains/oreoz",
        canonicalUrl: `${VERDANT_SITE_ORIGIN}/strains/oreoz`,
      },
      "private or alias route",
    ],
    [
      "private route",
      {
        path: "/plants/plant-id",
        canonicalUrl: `${VERDANT_SITE_ORIGIN}/plants/plant-id`,
      },
      "private or alias route",
    ],
  ])("excludes a %s source", (_label, override, reason) => {
    const document = { ...cleanDocument, ...override };
    expect(sitemapExclusionReason(document, VERDANT_SITE_ORIGIN)).toContain(reason);
    const entries = deriveSitemapEntries({
      siteOrigin: VERDANT_SITE_ORIGIN,
      staticDocuments: [document],
      staticOnlyRoutes: [],
      sitemapOnlyRoutes: [],
    });
    expect(entries).toEqual([]);
  });

  it("fails closed on duplicate eligible sources", () => {
    expect(() =>
      deriveSitemapEntries({
        siteOrigin: VERDANT_SITE_ORIGIN,
        staticDocuments: [cleanDocument, cleanDocument],
        staticOnlyRoutes: [],
        sitemapOnlyRoutes: [],
      }),
    ).toThrow("Duplicate sitemap source");
  });

  it("fails closed on an invalid claimed lastmod", () => {
    expect(() =>
      deriveSitemapEntries({
        siteOrigin: VERDANT_SITE_ORIGIN,
        staticDocuments: [{ ...cleanDocument, lastModifiedOn: "2026-02-31" }],
        staticOnlyRoutes: [],
        sitemapOnlyRoutes: [],
      }),
    ).toThrow("Invalid lastModifiedOn");
  });
});
