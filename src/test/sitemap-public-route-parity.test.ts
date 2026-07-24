/**
 * sitemap-public-route-parity.test
 *
 * Build-time regression fence enforcing a strict bijection (with two
 * curated allowlists) between:
 *
 *   - public/sitemap.xml           (what we advertise to crawlers)
 *   - STATIC_PUBLIC_SEO_DOCUMENTS  (per-route <head> we pre-render for
 *                                    non-JS crawlers)
 *
 * Every path must live in exactly one of:
 *   (1) both sources — the default,
 *   (2) SITEMAP_ONLY_ROUTES — runtime-Helmet-only routes we still index,
 *   (3) STATIC_ONLY_ROUTES  — pre-rendered but intentionally unadvertised.
 *
 * Adding a public route without updating one of these fails the suite;
 * removing an allowlisted route also fails so removals stay intentional.
 * Static reads only — no network, no build required.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import {
  SITEMAP_ONLY_ROUTES,
  STATIC_ONLY_ROUTES,
} from "../../scripts/public-route-parity.config.mjs";


const REPO = resolve(__dirname, "../..");
const SITEMAP = readFileSync(resolve(REPO, "public/sitemap.xml"), "utf8");

const sitemapPaths = new Set(
  [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .map((loc) => {
      try {
        return new URL(loc).pathname;
      } catch {
        return loc;
      }
    }),
);

const staticDocPaths = new Set(STATIC_PUBLIC_SEO_DOCUMENTS.map((d) => d.path));
const sitemapOnly = new Set(SITEMAP_ONLY_ROUTES as readonly string[]);
const staticOnly = new Set(STATIC_ONLY_ROUTES as readonly string[]);

describe("sitemap ↔ STATIC_PUBLIC_SEO_DOCUMENTS parity", () => {
  it("sitemap advertises the project origin only", () => {
    for (const raw of [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())) {
      expect(
        raw.startsWith(`${VERDANT_SITE_ORIGIN}/`) || raw === `${VERDANT_SITE_ORIGIN}/`,
      ).toBe(true);
    }
  });

  it("every sitemap URL has a pre-rendered doc OR is in SITEMAP_ONLY_ROUTES", () => {
    const orphans = [...sitemapPaths].filter(
      (path) => !staticDocPaths.has(path) && !sitemapOnly.has(path),
    );
    expect(
      orphans,
      `Sitemap advertises paths with no pre-rendered <head>. Either add a STATIC_PUBLIC_SEO_DOCUMENTS entry so non-JS crawlers see per-route metadata, or add the path to SITEMAP_ONLY_ROUTES with justification: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  it("every STATIC_PUBLIC_SEO_DOCUMENTS path is in sitemap OR STATIC_ONLY_ROUTES", () => {
    const missing = [...staticDocPaths].filter(
      (path) => !sitemapPaths.has(path) && !staticOnly.has(path),
    );
    expect(
      missing,
      `Public routes are pre-rendered but not advertised in sitemap.xml. Either add them to public/sitemap.xml, or add to STATIC_ONLY_ROUTES with justification: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("SITEMAP_ONLY_ROUTES entries are all present in sitemap.xml", () => {
    const stale = [...sitemapOnly].filter((path) => !sitemapPaths.has(path));
    expect(
      stale,
      `SITEMAP_ONLY_ROUTES lists paths absent from sitemap.xml — remove them or restore the sitemap entry: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("STATIC_ONLY_ROUTES entries all still pre-render a static doc", () => {
    const stale = [...staticOnly].filter((path) => !staticDocPaths.has(path));
    expect(
      stale,
      `STATIC_ONLY_ROUTES lists paths with no STATIC_PUBLIC_SEO_DOCUMENTS entry — remove them or restore the doc: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("the two allowlists never overlap", () => {
    const overlap = [...sitemapOnly].filter((p) => staticOnly.has(p));
    expect(overlap, `Path in both allowlists: ${overlap.join(", ")}`).toEqual([]);
  });

  it("sitemap contains no duplicate <loc> entries", () => {
    const raw = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    const dups = raw.filter((x, i) => raw.indexOf(x) !== i);
    expect(dups, `Duplicate sitemap entries: ${dups.join(", ")}`).toEqual([]);
  });
});
