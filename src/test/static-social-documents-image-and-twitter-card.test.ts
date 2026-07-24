/**
 * Invariant: every static social document must emit `twitter:card` =
 * `summary_large_image` and use an absolute, cacheable image URL served
 * from the canonical verdantgrowdiary.com origin (no query strings, no
 * relative paths, no third-party CDN that could rotate/expire).
 *
 * Twitter/X, LinkedIn, Slack, and Facebook cache the first preview they
 * scrape; a bad card type downgrades the card silently and a
 * non-cacheable image URL (querystring signed, ephemeral, or relative)
 * breaks the preview across every network at once. This test locks the
 * contract next to the document definitions so a future entry can't
 * regress it.
 */
import { describe, expect, it } from "vitest";

import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";
import {
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";

const CANONICAL_ORIGIN = new URL(VERDANT_SITE_ORIGIN).origin;

// Minimal shell mirroring the tags staticSocialRouteHtml.ts rewrites.
const INDEX_HTML_FIXTURE = `<!doctype html><html><head>
<title>Verdant</title>
<meta name="description" content="d" />
<meta name="robots" content="index, follow" />
<meta property="og:title" content="t" />
<meta property="og:description" content="d" />
<meta property="og:url" content="${VERDANT_SITE_ORIGIN}" />
<meta property="og:image" content="${VERDANT_SITE_ORIGIN}/brand/verdant-logo.png" />
<meta property="og:image:alt" content="a" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="t" />
<meta name="twitter:description" content="d" />
<meta name="twitter:image" content="${VERDANT_SITE_ORIGIN}/brand/verdant-logo.png" />
<link rel="canonical" href="${VERDANT_SITE_ORIGIN}" />
</head><body></body></html>`;

describe("static social documents: twitter:card and image URLs", () => {
  it("every document's image is absolute, https, canonical-origin, and cacheable", () => {
    expect(STATIC_PUBLIC_SEO_DOCUMENTS.length).toBeGreaterThan(0);
    for (const doc of STATIC_PUBLIC_SEO_DOCUMENTS) {
      const image = doc.metadata.image;
      // Absolute URL — parses standalone (no relative resolution).
      const parsed = new URL(image);
      expect(parsed.protocol, `${doc.path} image must be https`).toBe("https:");
      expect(parsed.origin, `${doc.path} image must live on canonical origin`).toBe(
        CANONICAL_ORIGIN,
      );
      // Cacheable: no query string, no fragment, no signed-URL surface.
      expect(parsed.search, `${doc.path} image must have no query string`).toBe("");
      expect(parsed.hash, `${doc.path} image must have no fragment`).toBe("");
      expect(image, `${doc.path} image must not use data: URI`).not.toMatch(/^data:/);
      expect(image, `${doc.path} image must not use blob: URI`).not.toMatch(/^blob:/);
    }
  });

  it("built HTML for every document emits twitter:card=summary_large_image", () => {
    for (const doc of STATIC_PUBLIC_SEO_DOCUMENTS) {
      const html = buildStaticSocialRouteHtml(INDEX_HTML_FIXTURE, doc.metadata);
      const cards = [
        ...html.matchAll(
          /<meta\s+name=["']twitter:card["']\s+content=["']([^"']+)["']/gi,
        ),
      ].map((m) => m[1]);
      expect(cards, `${doc.path} must declare exactly one twitter:card`).toHaveLength(1);
      expect(cards[0], `${doc.path} twitter:card must be summary_large_image`).toBe(
        "summary_large_image",
      );

      // og:image and twitter:image in the emitted HTML must both point at
      // the same canonical-origin absolute URL as the metadata declares.
      const ogImage = html.match(
        /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
      )?.[1];
      const twitterImage = html.match(
        /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
      )?.[1];
      expect(ogImage).toBe(doc.metadata.image);
      expect(twitterImage).toBe(doc.metadata.image);
    }
  });
});
