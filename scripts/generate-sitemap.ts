#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "../src/lib/build/staticPublicSeoDocuments";
import {
  deriveSitemapEntries,
  renderSitemapXml,
} from "../src/lib/build/sitemapRules";
import {
  SITEMAP_ONLY_LAST_MODIFIED_ON,
  SITEMAP_ONLY_ROUTES,
  STATIC_ONLY_ROUTES,
} from "./public-route-parity.config.mjs";

const SITEMAP_PATH = resolve(process.cwd(), "public/sitemap.xml");

export function buildSitemap(): string {
  const entries = deriveSitemapEntries({
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
  return renderSitemapXml(entries);
}

function firstDifference(actual: string, expected: string): string {
  const actualLines = actual.split(/\r?\n/);
  const expectedLines = expected.split(/\r?\n/);
  const count = Math.max(actualLines.length, expectedLines.length);
  for (let index = 0; index < count; index += 1) {
    if (actualLines[index] !== expectedLines[index]) {
      return `line ${index + 1}\n  actual:   ${actualLines[index] ?? "<missing>"}\n  expected: ${expectedLines[index] ?? "<missing>"}`;
    }
  }
  return "unknown difference";
}

export function run(argv: ReadonlyArray<string> = process.argv.slice(2)): number {
  const unknown = argv.filter((argument) => argument !== "--check");
  if (unknown.length > 0) {
    console.error(`generate-sitemap: unknown argument(s): ${unknown.join(", ")}`);
    return 1;
  }

  const expected = buildSitemap();
  const urlCount = [...expected.matchAll(/<loc>/g)].length;
  if (argv.includes("--check")) {
    const actual = readFileSync(SITEMAP_PATH, "utf8").replace(/\r\n/g, "\n");
    if (actual !== expected) {
      console.error(
        `generate-sitemap: public/sitemap.xml is stale (${firstDifference(actual, expected)}).\nRun: bun run generate:sitemap`,
      );
      return 1;
    }
    console.log(`generate-sitemap: OK — public/sitemap.xml matches ${urlCount} derived URLs.`);
    return 0;
  }

  writeFileSync(SITEMAP_PATH, expected, "utf8");
  console.log(`generate-sitemap: wrote ${urlCount} derived URLs to public/sitemap.xml.`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = run();
}
