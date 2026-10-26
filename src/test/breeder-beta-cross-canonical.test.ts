/**
 * /breeder-beta cross-canonical contract (owner adjudication 2026-08-20).
 *
 * /breeder-beta and /creator-beta render the same <BetaLanding> component and
 * differ only in kicker, support copy, and meta description. Two self-canonical
 * near-duplicates would compete on the same queries, so /breeder-beta concedes
 * its ranking URL to /creator-beta while STAYING INDEXABLE for direct and paid
 * traffic.
 *
 * That contract has three independently breakable halves, and a regression in
 * any one of them is silent — the page keeps rendering, and only the index
 * notices weeks later:
 *
 *   1. the build-time pre-rendered <head>   (staticPublicSeoDocuments.ts)
 *   2. the hydrated runtime <head>          (BreederBeta.tsx via usePageSeo)
 *   3. sitemap exclusion                    (public-route-parity.config.mjs)
 *
 * If (2) drifts back to a self-canonical it silently overwrites (1) for every
 * JS-rendering crawler, which is the whole failure mode this file exists to
 * catch. If (3) drifts, we advertise a URL that disclaims itself.
 *
 * Resolved-value assertions throughout — these import the modules and read the
 * real values rather than pattern-matching source text.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";
import { STATIC_ONLY_ROUTES } from "../../scripts/public-route-parity.config.mjs";

const REPO = resolve(__dirname, "../..");
const VARIANT = "/breeder-beta";
const CANONICAL = "/creator-beta";
const CANONICAL_URL = `${VERDANT_SITE_ORIGIN}${CANONICAL}`;

const BLOCKING_DIRECTIVES = ["noindex", "nofollow", "none"] as const;

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
  const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((candidate) => candidate.path === path);
  if (!doc) throw new Error(`No STATIC_PUBLIC_SEO_DOCUMENTS entry for ${path}`);
  return doc;
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
    // Without this the relationship is only inferable by comparing two URLs;
    // the manifest's alias reporting reads canonicalPath directly.
    expect((documentFor(VARIANT) as { canonicalPath?: string }).canonicalPath).toBe(CANONICAL);
  });

  it("/creator-beta remains self-canonical — the pair must not point at each other", () => {
    expect(documentFor(CANONICAL).metadata.url).toBe(CANONICAL_URL);
  });

  it("keeps its own breeder-oriented title and description", () => {
    // The failure this guards: collapsing the variant into the generic
    // aliasDocument() helper, which inherits the target's copy wholesale and
    // would erase the reason the route exists.
    const variant = documentFor(VARIANT);
    const canonical = documentFor(CANONICAL);
    expect(variant.metadata.title).toContain("Breeder Beta");
    expect(variant.metadata.title).not.toBe(canonical.metadata.title);
    expect(variant.metadata.description).not.toBe(canonical.metadata.description);
    expect(variant.metadata.description.toLowerCase()).toContain("breeder");
  });

  it("stays affirmatively indexable — a cross-canonical must not also be noindex", () => {
    // noindex + cross-canonical are contradictory instructions about one URL.
    const html = buildStaticSocialRouteHtml(INDEX_HTML_FIXTURE, documentFor(VARIANT).metadata);
    const robots = [
      ...html.matchAll(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/gi),
    ].map((m) => m[1]);
    expect(robots, "expected exactly one robots meta").toHaveLength(1);
    const tokens = robots[0].split(",").map((t) => t.trim().toLowerCase());
    for (const blocking of BLOCKING_DIRECTIVES) {
      expect(tokens, `robots="${robots[0]}" must not contain "${blocking}"`).not.toContain(
        blocking,
      );
    }
    expect(tokens).toContain("index");
  });

  it("emits canonical and og:url in agreement, both on the canonical target", () => {
    const html = buildStaticSocialRouteHtml(INDEX_HTML_FIXTURE, documentFor(VARIANT).metadata);
    const canonicals = [
      ...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/gi),
    ].map((m) => m[1]);
    expect(canonicals, "expected exactly one canonical link").toHaveLength(1);
    expect(canonicals[0]).toBe(CANONICAL_URL);

    const ogUrls = [
      ...html.matchAll(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/gi),
    ].map((m) => m[1]);
    expect(ogUrls).toHaveLength(1);
    expect(ogUrls[0], "og:url disagreeing with canonical sends two answers").toBe(canonicals[0]);
  });

  it("the runtime page names the same canonical target as the build-time document", () => {
    // The silent killer: usePageSeo runs after hydration and rewrites the head,
    // so a self-canonical here defeats the pre-rendered one for Googlebot.
    const source = readFileSync(resolve(REPO, "src/pages/BreederBeta.tsx"), "utf8");
    const match = source.match(/canonicalPath:\s*"([^"]+)"/);
    expect(match, "BreederBeta.tsx must pass canonicalPath to usePageSeo").toBeTruthy();
    expect(match?.[1]).toBe(CANONICAL);
    expect(match?.[1], "runtime and build-time canonical targets must agree").toBe(
      (documentFor(VARIANT) as { canonicalPath?: string }).canonicalPath,
    );
  });

  it("is excluded from the sitemap — never advertise a URL that disclaims itself", () => {
    const sitemap = readFileSync(resolve(REPO, "public/sitemap.xml"), "utf8");
    expect(sitemap).not.toContain(`<loc>${VERDANT_SITE_ORIGIN}${VARIANT}</loc>`);
    expect(STATIC_ONLY_ROUTES as readonly string[]).toContain(VARIANT);
  });

  it("the canonical target IS advertised — conceding only makes sense if one ranks", () => {
    const sitemap = readFileSync(resolve(REPO, "public/sitemap.xml"), "utf8");
    expect(sitemap).toContain(`<loc>${CANONICAL_URL}</loc>`);
    expect(STATIC_ONLY_ROUTES as readonly string[]).not.toContain(CANONICAL);
  });
});
