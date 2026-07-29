/**
 * Root self-canonical in the SPA shell, and the invariant that makes it safe.
 *
 * `index.html` deliberately shipped with NO canonical for a long time, because
 * one baked canonical would make every SPA route declare itself a duplicate of
 * the homepage. That reasoning expired when the prerender pass shipped:
 * `buildStaticSocialRouteHtml` REPLACES an existing canonical rather than
 * appending, so each prerendered route overwrites the shell's tag.
 *
 * The shell is therefore served verbatim only for:
 *   - "/", which is not prerendered (`routeFileName` rejects root) and used to
 *     reach non-JS crawlers with no canonical at all; and
 *   - unknown URLs, which static SPA hosting answers with this shell at
 *     HTTP 200 — previously carrying "index, follow" and no canonical, i.e. an
 *     invitation to index unlimited soft-404s.
 *
 * THE LOAD-BEARING INVARIANT: every sitemap URL except "/" must have a
 * prerendered document. If a public route is ever added to the sitemap without
 * one, it would inherit the root canonical and quietly deindex ITSELF by
 * declaring it is the homepage. That is a silent, high-cost SEO regression, so
 * it fails here instead.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { STATIC_PUBLIC_OUTPUT_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";

const ROOT = resolve(__dirname, "../..");
const SITE_ORIGIN = "https://verdantgrowdiary.com";
const INDEX_HTML = readFileSync(resolve(ROOT, "index.html"), "utf8");
const SITEMAP = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");

function sitemapPaths(): string[] {
  return [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim().replace(SITE_ORIGIN, ""))
    .map((p) => (p === "" ? "/" : p));
}

const prerendered = new Set(STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((d) => d.path));

describe("the invariant that keeps a baked root canonical safe", () => {
  it("every sitemap URL except / has a prerendered document", () => {
    const orphaned = sitemapPaths().filter((p) => p !== "/" && !prerendered.has(p));
    expect(
      orphaned,
      `These sitemap URLs have no prerendered document, so they would inherit the ` +
        `root canonical from index.html and declare themselves duplicates of the ` +
        `homepage — deindexing themselves. Add a static SEO document for each, or ` +
        `remove them from public/sitemap.xml:\n  ${orphaned.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the sitemap is non-trivial, so the check above cannot pass vacuously", () => {
    expect(sitemapPaths().length).toBeGreaterThan(20);
    expect(prerendered.size).toBeGreaterThan(20);
  });

  it("root itself is deliberately NOT prerendered", () => {
    // If root ever gains a prerendered document, it supplies its own canonical
    // and the shell tag stops being root's only source — worth re-reading this
    // file's reasoning at that point.
    expect(prerendered.has("/")).toBe(false);
  });
});

describe("index.html shell", () => {
  it("declares exactly one canonical", () => {
    const tags = INDEX_HTML.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi) ?? [];
    expect(tags).toHaveLength(1);
  });

  it("points that canonical at the site root", () => {
    const tag = (INDEX_HTML.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) ?? [""])[0];
    const href = (tag.match(/href=["']([^"']+)["']/) ?? [])[1];
    expect(href).toBe(`${SITE_ORIGIN}/`);
  });

  it("uses the absolute origin, not a relative path", () => {
    // A relative canonical on an unknown URL would self-reference the junk URL,
    // which is precisely the soft-404 behaviour being fixed.
    const tag = (INDEX_HTML.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) ?? [""])[0];
    expect(tag).toContain(SITE_ORIGIN);
  });
});

describe("prerendered routes override the shell canonical", () => {
  it("replaces rather than appends, so no page ships two canonicals", () => {
    // The safety of baking a root canonical rests entirely on this branch.
    const builder = readFileSync(
      resolve(ROOT, "src/lib/build/staticSocialRouteHtml.ts"),
      "utf8",
    );
    expect(builder).toMatch(/canonicalPattern\.test\(html\)/);
    expect(builder).toMatch(/html\.replace\(canonicalPattern, canonicalTag\)/);
  });

  it("gives every prerendered document an absolute self-canonical URL", () => {
    for (const doc of STATIC_PUBLIC_OUTPUT_DOCUMENTS) {
      const url = (doc as { metadata?: { url?: string } }).metadata?.url;
      expect(url, doc.path).toBeTruthy();
      expect(url, doc.path).toContain(SITE_ORIGIN);
    }
  });
});
