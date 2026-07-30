#!/usr/bin/env node
/**
 * Keeps the bounded GSC monitoring workflow aligned with the current sitemap.
 * The inspection runner receives URLs only from sitemap.xml, so this checks the
 * sitemap-backed subset of never_allowlist separately from static assets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const workflow = readFileSync(resolve(ROOT, ".github/workflows/seo-monitoring.yml"), "utf8");
const sitemap = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
const allowlist = JSON.parse(readFileSync(resolve(ROOT, "config/seo-allowlist.json"), "utf8"));
const docs = readFileSync(resolve(ROOT, "docs/seo-monitoring.md"), "utf8");
const inspectionScript = readFileSync(resolve(ROOT, "scripts/seo/gsc-inspect-urls.mjs"), "utf8");

const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const WORKFLOW_DEFAULT_MAX_URLS = 50;

test("SEO monitoring defaults to the hard-cap sitemap sweep", () => {
  assert.match(
    workflow,
    /max_urls:\s*\n\s*description:.*\n\s*required: false\s*\n\s*default: "50"/,
  );
  assert.match(
    workflow,
    /SEO_MAX_URLS:\s*\$\{\{\s*github\.event\.inputs\.max_urls\s*\|\|\s*'50'\s*\}\}/,
  );
  assert.match(
    workflow,
    /workflow_run:\s*\n\s*workflows:\s*\["ci"\]\s*\n\s*types:\s*\[completed\]\s*\n\s*branches:\s*\[verdant-grow-diary\]/,
  );
  assert.match(workflow, /--sitemap "\$SEO_SITEMAP_URL" --max "\$SEO_MAX_URLS"/);
  assert.match(inspectionScript, /const DEFAULT_MAX_URLS = HARD_CAP;/);
  assert.match(inspectionScript, /const HARD_CAP = 50;/);
  assert.ok(sitemapUrls.length > 0, "sitemap discovery must yield at least one URL");
  assert.ok(
    sitemapUrls.length <= WORKFLOW_DEFAULT_MAX_URLS,
    `default coverage (${WORKFLOW_DEFAULT_MAX_URLS}) must include all ${sitemapUrls.length} sitemap URLs`,
  );
});

test("every sitemap-backed never_allowlist URL is covered by the default sweep", () => {
  const coverage = new Set(sitemapUrls.slice(0, WORKFLOW_DEFAULT_MAX_URLS));
  const sitemapBackedNeverAllowlist = allowlist.never_allowlist.filter((url) =>
    sitemapUrls.includes(url),
  );
  const uncovered = sitemapBackedNeverAllowlist.filter((url) => !coverage.has(url));

  assert.deepEqual(uncovered, []);

  const nonSitemapNeverAllowlist = allowlist.never_allowlist.filter(
    (url) => !sitemapUrls.includes(url),
  );
  assert.deepEqual(nonSitemapNeverAllowlist, [
    "https://verdantgrowdiary.com/sitemap.xml",
    "https://verdantgrowdiary.com/robots.txt",
  ]);
  assert.match(
    docs,
    /`sitemap\.xml` and `robots\.txt` are intentionally outside the sitemap-driven\s+GSC URL Inspection input/i,
  );
});
