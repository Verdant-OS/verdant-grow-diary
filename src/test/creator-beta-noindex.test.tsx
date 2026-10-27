/**
 * /creator-beta is hidden from search (2026-10-26, owner: hide from search).
 * The page stays public. Assertions read the resolved document, route head,
 * hydrated head, and sitemap locs.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

import {
  STATIC_PUBLIC_NOINDEX_DOCUMENTS,
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import BreederBeta from "@/pages/BreederBeta";
import CreatorBeta from "@/pages/CreatorBeta";

const PATH = "/creator-beta";
const URL = `${VERDANT_SITE_ORIGIN}${PATH}`;

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

afterEach(() => {
  cleanup();
  document.head.querySelector('meta[name="robots"]')?.remove();
  document.head.querySelector('link[rel="canonical"]')?.remove();
});

describe("/creator-beta noindex", () => {
  const seoDocument = STATIC_PUBLIC_NOINDEX_DOCUMENTS.find((candidate) => candidate.path === PATH);

  it("is a noindex static document and not an indexable acquisition document", () => {
    expect(seoDocument?.metadata.robots).toBe("noindex, follow");
    expect(seoDocument?.metadata.url).toBe(URL);
    expect(STATIC_PUBLIC_SEO_DOCUMENTS.some((candidate) => candidate.path === PATH)).toBe(false);
  });

  it("the route head and the pre-rendered HTML say noindex, follow", () => {
    expect(staticRouteHead(PATH).meta).toContainEqual({
      name: "robots",
      content: "noindex, follow",
    });
    expect(staticRouteHead(PATH).links).toEqual([{ rel: "canonical", href: URL }]);
    const html = buildStaticSocialRouteHtml(INDEX_HTML_FIXTURE, seoDocument!.metadata);
    expect(html).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("the hydrated creator page emits noindex, follow and a self-canonical", () => {
    render(
      <MemoryRouter>
        <CreatorBeta />
      </MemoryRouter>,
    );
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, follow",
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(URL);
  });

  it("the hydrated breeder page stays noindex and canonicalises to /creator-beta", () => {
    cleanup();
    render(
      <MemoryRouter>
        <BreederBeta />
      </MemoryRouter>,
    );
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, follow",
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(URL);
  });

  it("is absent from the sitemap", () => {
    const sitemap = readFileSync(resolve(__dirname, "../../public/sitemap.xml"), "utf8");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
    expect(locs).not.toContain(URL);
  });
});
