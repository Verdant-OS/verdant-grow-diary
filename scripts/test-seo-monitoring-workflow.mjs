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
import { load as loadYaml } from "js-yaml";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const workflow = readFileSync(
  resolve(ROOT, ".github/workflows/seo-monitoring.yml"),
  "utf8",
).replace(/\r\n/g, "\n");
const sitemap = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
const allowlist = JSON.parse(readFileSync(resolve(ROOT, "config/seo-allowlist.json"), "utf8"));
const docs = readFileSync(resolve(ROOT, "docs/seo-monitoring.md"), "utf8");
const inspectionScript = readFileSync(resolve(ROOT, "scripts/seo/gsc-inspect-urls.mjs"), "utf8");

const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const WORKFLOW_DEFAULT_MAX_URLS = 100;

test("SEO monitoring defaults to the hard-cap sitemap sweep", () => {
  assert.match(workflow, /node-version:\s*["']20["']/);
  assert.doesNotMatch(workflow, /node_version:/);
  assert.match(
    workflow,
    /max_urls:\s*\n\s*description:.*\n\s*required: false\s*\n\s*default: "100"/,
  );
  assert.match(
    workflow,
    /SEO_MAX_URLS:\s*\$\{\{\s*github\.event\.inputs\.max_urls\s*\|\|\s*'100'\s*\}\}/,
  );
  assert.match(
    workflow,
    /workflow_run:\s*\n\s*workflows:\s*\["ci"\]\s*\n\s*types:\s*\[completed\]\s*\n\s*branches:\s*\[verdant-grow-diary\]/,
  );
  assert.match(workflow, /--sitemap "\$SEO_SITEMAP_URL" --max "\$SEO_MAX_URLS"/);
  assert.match(inspectionScript, /const DEFAULT_MAX_URLS = HARD_CAP;/);
  assert.match(inspectionScript, /const HARD_CAP = 100;/);
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

test("GSC runner always emits the terminal summary even when OAuth is unavailable", () => {
  const start = workflow.indexOf("      - name: GSC URL inspection");
  const end = workflow.indexOf("      - name: Verify last GSC finding", start);
  assert.ok(start >= 0 && end > start, "GSC workflow steps must remain discoverable");

  const inspectionStep = workflow.slice(start, end);
  assert.match(
    inspectionStep,
    /^\s*if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}/m,
    "workflow must override the implicit success gate without running after cancellation",
  );
  assert.match(inspectionStep, /node scripts\/seo\/gsc-inspect-urls\.mjs/);
  assert.match(inspectionScript, /mode: "live-skipped"/);
  assert.match(inspectionScript, /status: "SKIPPED"/);
  assert.match(inspectionScript, /observedGscRun\.oauthConfigured = creds\.ok/);
  assert.match(inspectionScript, /observedGscRun\.explicitlySkipped = true/);
  assert.match(inspectionScript, /gscObservation: observedGscRun/);
});

test("SEO monitoring installs dependencies with Bun from bun.lock", () => {
  // Assert on the parsed job, not the raw text: a commented-out step or one
  // moved into another job must fail this contract.
  const steps = loadYaml(workflow)?.jobs?.["seo-monitoring"]?.steps;
  assert.ok(Array.isArray(steps), "seo-monitoring job must declare steps");

  const setupBun = steps.filter((step) => /^oven-sh\/setup-bun@/.test(step.uses ?? ""));
  assert.equal(setupBun.length, 1, "exactly one setup-bun step");
  assert.match(setupBun[0].uses, /^oven-sh\/setup-bun@[0-9a-f]{40}$/);
  assert.equal(String(setupBun[0].with?.["bun-version"]), "1.3.14");

  const cache = steps.find((step) => step.with?.path === "~/.bun/install/cache");
  assert.ok(cache, "Bun install cache step must exist");
  assert.equal(cache.with.key, "${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}");

  const installIndex = steps.findIndex((step) => step.run === "bun install --frozen-lockfile");
  const validateIndex = steps.findIndex((step) =>
    /node --test scripts\/test-seo-monitoring-workflow\.mjs/.test(step.run ?? ""),
  );
  assert.ok(installIndex >= 0, "frozen Bun install step must exist");
  assert.ok(
    installIndex > steps.indexOf(setupBun[0]) && installIndex < validateIndex,
    "install must run after setup-bun and before the scripts that need dependencies",
  );

  // Forbidden-construct scans stay on the source text.
  assert.doesNotMatch(workflow, /\bnpm\s+(?:ci|install)\b/);
  assert.doesNotMatch(workflow, /package-lock\.json/);
});
