/**
 * Checkout return pages are transactional, not acquisition content. Their
 * route-local documents must keep non-JavaScript crawlers out of the root
 * canonical fallback while explicitly prohibiting indexing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  STATIC_PUBLIC_SEO_DOCUMENTS,
  STATIC_TRANSACTIONAL_NOINDEX_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";

const ROOT = resolve(__dirname, "../..");
const INDEX_HTML = readFileSync(resolve(ROOT, "index.html"), "utf8");
const SITEMAP = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");

const TRANSACTIONAL_PATHS = ["/checkout/success", "/checkout/cancel"] as const;

function readClientSeoCall(path: (typeof TRANSACTIONAL_PATHS)[number]): string {
  const page = path === "/checkout/success" ? "CheckoutSuccess.tsx" : "CheckoutCancel.tsx";
  const source = readFileSync(resolve(ROOT, "src/pages", page), "utf8");
  const call = source.match(/usePageSeo\(\{([\s\S]*?)\n {2}\}\);/);

  expect(call, `${page} must configure usePageSeo`).not.toBeNull();
  return call![1];
}

describe("transactional checkout route SEO", () => {
  it("keeps both checkout paths out of the sitemap and the indexable document registry", () => {
    const indexablePaths = new Set(STATIC_PUBLIC_SEO_DOCUMENTS.map((document) => document.path));
    const outputPaths = new Set(STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => document.path));

    for (const path of TRANSACTIONAL_PATHS) {
      expect(SITEMAP).not.toContain(`${VERDANT_SITE_ORIGIN}${path}`);
      expect(indexablePaths).not.toContain(path);
      expect(outputPaths).toContain(path);
    }
  });

  it("sets client noindex metadata for both checkout return pages", () => {
    for (const path of TRANSACTIONAL_PATHS) {
      const seoCall = readClientSeoCall(path);
      expect(seoCall).toContain(`path: "${path}",`);
      expect(seoCall).toMatch(/noindex:\s*true/);
    }
  });

  it("emits one noindex robots tag and a self-canonical static head for each route", () => {
    const byPath = new Map(
      STATIC_TRANSACTIONAL_NOINDEX_DOCUMENTS.map((document) => [document.path, document]),
    );

    expect(byPath.size).toBe(TRANSACTIONAL_PATHS.length);

    for (const path of TRANSACTIONAL_PATHS) {
      const document = byPath.get(path);
      expect(document, `missing transactional static document for ${path}`).toBeDefined();
      expect(document!.metadata.robots).toBe("noindex, follow");
      expect(document!.metadata.url).toBe(`${VERDANT_SITE_ORIGIN}${path}`);

      const html = buildStaticSocialRouteHtml(INDEX_HTML, document!.metadata);
      const robots = [
        ...html.matchAll(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["'][^>]*>/gi),
      ].map((match) => match[1]);
      const canonicals = [...html.matchAll(/<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/gi)];

      expect(robots, `${path} must have exactly one noindex robots tag`).toEqual([
        "noindex, follow",
      ]);
      expect(canonicals, `${path} must have exactly one canonical`).toHaveLength(1);
      expect(canonicals[0][0]).toContain(`href="${VERDANT_SITE_ORIGIN}${path}"`);
    }
  });
});
