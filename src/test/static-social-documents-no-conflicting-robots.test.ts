/**
 * Invariant: every indexable public static document emits exactly one
 * `<meta name="robots">` tag whose directive list is affirmatively
 * indexable — no `noindex`, `nofollow`, `none`, `noarchive`,
 * `nosnippet`, or `noimageindex` tokens that would silently prevent
 * Google/Bing/DuckDuckGo from indexing the route.
 *
 * We also fail-closed on any conflicting sibling directive tag
 * (`googlebot`, `bingbot`, `x-robots-tag` in a `<meta>`) that would
 * carry a blocking token, and reject the historical footgun of
 * emitting the same `robots` meta twice with disagreeing content
 * (crawlers apply the most restrictive value, so a stray
 * `noindex` would silently win).
 *
 * These routes are the paid acquisition surface — a single stray
 * `noindex` on `/pricing` or a guide would delist that page without
 * any visible symptom. Locking the contract next to the document
 * definitions catches the regression in CI before it ships.
 */
import { describe, expect, it } from "vitest";

import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";
import {
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";

// Directive tokens that block or degrade indexing. Case-insensitive per
// the robots meta spec.
const BLOCKING_DIRECTIVES = [
  "noindex",
  "nofollow",
  "none",
  "noarchive",
  "nosnippet",
  "noimageindex",
  "unavailable_after",
] as const;

// Minimal shell mirroring the tags staticSocialRouteHtml.ts rewrites.
// Robots defaults to `index, follow` so a document that doesn't
// explicitly override it inherits an indexable directive.
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

function tokenize(content: string): string[] {
  return content
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

describe("static social documents: no conflicting robots directives", () => {
  it("has documents to check", () => {
    expect(STATIC_PUBLIC_SEO_DOCUMENTS.length).toBeGreaterThan(0);
  });

  it("no document metadata declares a blocking robots directive", () => {
    for (const doc of STATIC_PUBLIC_SEO_DOCUMENTS) {
      const declared = doc.metadata.robots;
      if (!declared) continue; // undefined → builder defaults to "index, follow"
      const tokens = tokenize(declared);
      for (const blocking of BLOCKING_DIRECTIVES) {
        expect(
          tokens,
          `${doc.path} metadata.robots="${declared}" must not contain "${blocking}"`,
        ).not.toContain(blocking);
      }
    }
  });

  it("built HTML for every document emits exactly one indexable robots meta and no blocking sibling directives", () => {
    for (const doc of STATIC_PUBLIC_SEO_DOCUMENTS) {
      const html = buildStaticSocialRouteHtml(INDEX_HTML_FIXTURE, doc.metadata);

      // Exactly one <meta name="robots"> — duplicates let the most
      // restrictive value win silently.
      const robotsMatches = [
        ...html.matchAll(
          /<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/gi,
        ),
      ].map((m) => m[1]);
      expect(
        robotsMatches,
        `${doc.path} must declare exactly one <meta name="robots">`,
      ).toHaveLength(1);

      const tokens = tokenize(robotsMatches[0]);
      for (const blocking of BLOCKING_DIRECTIVES) {
        expect(
          tokens,
          `${doc.path} robots="${robotsMatches[0]}" must not contain "${blocking}"`,
        ).not.toContain(blocking);
      }
      // Must affirmatively allow indexing — either "index" or "all",
      // or the default the builder injects. Reject an empty/whitespace
      // directive that would leave crawlers to guess.
      expect(
        tokens.length,
        `${doc.path} robots directive must not be empty`,
      ).toBeGreaterThan(0);

      // Sibling directive tags (per-crawler overrides + x-robots-tag in
      // <meta>) must not carry blocking tokens either.
      const siblingPatterns: Array<{ name: string; regex: RegExp }> = [
        {
          name: "googlebot",
          regex: /<meta\s+name=["']googlebot["']\s+content=["']([^"']+)["']/gi,
        },
        {
          name: "bingbot",
          regex: /<meta\s+name=["']bingbot["']\s+content=["']([^"']+)["']/gi,
        },
        {
          name: "x-robots-tag",
          regex: /<meta\s+(?:name|http-equiv)=["']x-robots-tag["']\s+content=["']([^"']+)["']/gi,
        },
      ];
      for (const { name, regex } of siblingPatterns) {
        for (const match of html.matchAll(regex)) {
          const siblingTokens = tokenize(match[1]);
          for (const blocking of BLOCKING_DIRECTIVES) {
            expect(
              siblingTokens,
              `${doc.path} <meta name="${name}" content="${match[1]}"> must not contain "${blocking}"`,
            ).not.toContain(blocking);
          }
        }
      }
    }
  });
});
