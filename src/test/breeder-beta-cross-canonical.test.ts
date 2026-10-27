/**
 * /breeder-beta cross-canonical contract.
 *
 * /breeder-beta and /creator-beta render the same <BetaLanding> component and
 * differ only in kicker, support copy, and meta description. Two self-canonical
 * near-duplicates would compete on the same queries, so /breeder-beta concedes
 * its ranking URL to /creator-beta (owner adjudication 2026-08-20).
 *
 * 2026-10-26, owner: hide from search. Both URLs are `noindex, follow` and
 * neither loc is in the sitemap. The pages stay public.
 *
 * Resolved-value assertions: these import the modules and read the real
 * documents, route head, hydrated head, and sitemap locs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  STATIC_PUBLIC_NOINDEX_DOCUMENTS,
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { STATIC_ONLY_ROUTES } from "../../scripts/public-route-parity.config.mjs";

const REPO = resolve(__dirname, "../..");
const VARIANT = "/breeder-beta";
const CANONICAL = "/creator-beta";
const CANONICAL_URL = `${VERDANT_SITE_ORIGIN}${CANONICAL}`;

/**
 * Minimal shell mirroring the tags staticSocialRouteHtml.ts rewrites, matching
 * the fixture in static-social-documents-no-conflicting-robots.test.ts. The
 * repo has no root index.html to read, and a fixture keeps this test measuring
 * the document's own metadata rather than the app shell's defaults.
 */
const INDEX_HTML_FIXTURE = `<!doctype html><html><head>
<title>Verdant</title>
<meta name="description" content="d" />
<meta name="robots" content="index, follow" />
<meta property="og:title" content="t" />
<meta property="og:description" content="d" />
<meta property="og:url" content="${VERDANT_SITE_ORIGIN}" />
<meta property="og:image" content="${VERDANT_SITE_ORIGIN}/brand/verdant-logo-512.png" />
<meta property="og:image:alt" content="a" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="t" />
<meta name="twitter:description" content="d" />
<meta name="twitter:image" content="${VERDANT_SITE_ORIGIN}/brand/verdant-logo-512.png" />
<link rel="canonical" href="${VERDANT_SITE_ORIGIN}" />
</head><body></body></html>`;

function documentFor(path: string) {
  const doc = STATIC_PUBLIC_OUTPUT_DOCUMENTS.find((candidate) => candidate.path === path);
  if (!doc) throw new Error(`No STATIC_PUBLIC_OUTPUT_DOCUMENTS entry for ${path}`);
  return doc;
}

function robotsContent(html: string): string {
  const robots = [...html.matchAll(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/gi)].map(
    (match) => match[1],
  );
  expect(robots, "expected exactly one robots meta").toHaveLength(1);
  return robots[0];
}

describe("/breeder-beta → /creator-beta cross-canonical", () => {
  it("both routes still have a pre-rendered document", () => {
    expect(documentFor(VARIANT)).toBeTruthy();
    expect(documentFor(CANONICAL)).toBeTruthy();
  });

  it("the variant's canonical identity points at /creator-beta, not itself", () => {
    const doc = documentFor(VARIANT);
    expect(doc.metadata.url).toBe(CANONICAL_URL);
    expect(doc.metadata.url).not.toBe(`${VERDANT_SITE_ORIGIN}${VARIANT}`);
  });

  it("records the canonical target explicitly, not just by URL coincidence", () => {
    expect((documentFor(VARIANT) as { canonicalPath?: string }).canonicalPath).toBe(CANONICAL);
  });

  it("/creator-beta remains self-canonical — the pair must not point at each other", () => {
    expect(documentFor(CANONICAL).metadata.url).toBe(CANONICAL_URL);
  });

  it("keeps its own breeder-oriented title and description", () => {
    const variant = documentFor(VARIANT);
    const canonical = documentFor(CANONICAL);
    expect(variant.metadata.title).toContain("Breeder Beta");
    expect(variant.metadata.title).not.toBe(canonical.metadata.title);
    expect(variant.metadata.description).not.toBe(canonical.metadata.description);
    expect(variant.metadata.description.toLowerCase()).toContain("breeder");
  });

  it("emits noindex, follow on the pre-rendered variant head", () => {
    const html = buildStaticSocialRouteHtml(INDEX_HTML_FIXTURE, documentFor(VARIANT).metadata);
    expect(robotsContent(html)).toBe("noindex, follow");
    expect(documentFor(VARIANT).metadata.robots).toBe("noindex, follow");
  });

  it("emits canonical and og:url in agreement, both on the canonical target", () => {
    const html = buildStaticSocialRouteHtml(INDEX_HTML_FIXTURE, documentFor(VARIANT).metadata);
    const canonicals = [
      ...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/gi),
    ].map((match) => match[1]);
    expect(canonicals, "expected exactly one canonical link").toHaveLength(1);
    expect(canonicals[0]).toBe(CANONICAL_URL);

    const ogUrls = [
      ...html.matchAll(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/gi),
    ].map((match) => match[1]);
    expect(ogUrls).toHaveLength(1);
    expect(ogUrls[0], "og:url disagreeing with canonical sends two answers").toBe(canonicals[0]);
  });

  it("the route head agrees with the pre-rendered canonical and robots", () => {
    const head = staticRouteHead(VARIANT);
    expect(head.links).toEqual([{ rel: "canonical", href: CANONICAL_URL }]);
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex, follow" });
    expect((documentFor(VARIANT) as { canonicalPath?: string }).canonicalPath).toBe(CANONICAL);
  });

  it("neither URL is advertised, and neither stays in the indexable document set", () => {
    const sitemap = readFileSync(resolve(REPO, "public/sitemap.xml"), "utf8");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
    expect(locs).not.toContain(`${VERDANT_SITE_ORIGIN}${VARIANT}`);
    expect(locs).not.toContain(CANONICAL_URL);
    expect(STATIC_ONLY_ROUTES as readonly string[]).toEqual([]);
    expect(STATIC_PUBLIC_SEO_DOCUMENTS.some((document) => document.path === VARIANT)).toBe(false);
    expect(STATIC_PUBLIC_SEO_DOCUMENTS.some((document) => document.path === CANONICAL)).toBe(false);
    expect(STATIC_PUBLIC_NOINDEX_DOCUMENTS.map((document) => document.path)).toEqual(
      expect.arrayContaining([VARIANT, CANONICAL]),
    );
  });
});
