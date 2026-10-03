/**
 * Pins docs/seo/route-indexation-matrix.md to the route manifest and the
 * static SEO documents. The matrix is the artifact under test; robots,
 * canonicals, and sitemap membership are read from the modules and
 * public/sitemap.xml, not from the markdown.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VERDANT_SEO_GUIDES } from "@/constants/verdantSeoContent";
import { APP_ROUTES, getRoutesByAccess } from "@/lib/appRouteManifest";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";

const ROOT = resolve(__dirname, "../..");
const MATRIX = readFileSync(resolve(ROOT, "docs/seo/route-indexation-matrix.md"), "utf8");
const SITEMAP = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");

const sitemapPaths = new Set(
  [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1].trim()).pathname),
);

function inventoryLine(document: (typeof STATIC_PUBLIC_OUTPUT_DOCUMENTS)[number]): string {
  const robots = document.metadata.robots ?? "index, follow";
  const canonical = new URL(document.metadata.url).pathname;
  const inSitemap = sitemapPaths.has(document.path) ? "yes" : "no";
  return `- \`${document.path}\` — robots \`${robots}\`; sitemap ${inSitemap}; canonical \`${canonical}\``;
}

describe("route indexation matrix", () => {
  it("states the manifest access counts", () => {
    const counts = {
      public: getRoutesByAccess("public").length,
      auth: getRoutesByAccess("auth").length,
      operator: getRoutesByAccess("operator").length,
      internal: getRoutesByAccess("internal").length,
      redirect: getRoutesByAccess("redirect").length,
    };
    const total = APP_ROUTES.length;
    expect(MATRIX).toContain(
      `**Coverage:** ${total} of ${total} manifest routes — ${counts.public} public, ${counts.auth} authenticated, ${counts.operator} operator, ${counts.internal} internal, and ${counts.redirect} redirects.`,
    );
    expect(MATRIX).not.toContain("134 of 134");
  });

  it("names every manifest path", () => {
    const missing = APP_ROUTES.map((route) => route.path).filter(
      (path) => !MATRIX.includes(`\`${path}\``),
    );
    expect(missing).toEqual([]);
  });

  it("reproduces the static-document robots, sitemap, and canonical inventory", () => {
    const missing = STATIC_PUBLIC_OUTPUT_DOCUMENTS.map(inventoryLine).filter(
      (line) => !MATRIX.includes(line),
    );
    expect(missing).toEqual([]);
  });

  it("keeps sitemap locs on the documented origin", () => {
    for (const raw of [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
      match[1].trim(),
    )) {
      expect(raw.startsWith(`${VERDANT_SITE_ORIGIN}/`) || raw === VERDANT_SITE_ORIGIN).toBe(true);
    }
  });

  it("names the guides that emit Article JSON-LD", () => {
    const withArticle = VERDANT_SEO_GUIDES.filter((guide) => guide.publishedOn).map(
      (guide) => `/guides/${guide.slug}`,
    );
    expect(withArticle.length).toBeGreaterThan(0);
    for (const path of withArticle) {
      expect(MATRIX).toContain(path);
    }
    expect(MATRIX).toContain("Article is added only when `publishedOn` is set.");
  });

  it("marks the retired customer share routes as unmounted", () => {
    const retired = ["/customer/:shareId", "/customer/:shareId/cannabis-care"] as const;
    for (const path of retired) {
      expect(APP_ROUTES.find((route) => route.path === path)).toBeUndefined();
      expect(MATRIX).toContain(`\`${path}\``);
    }
    expect(MATRIX).toContain("## Retired routes");
    expect(MATRIX).toContain("**NOT_MEASURED**");
  });
});
