/**
 * Lighthouse CI config for Verdant.
 *
 * URLs are loaded dynamically from public/sitemap.xml so the audit stays
 * in lockstep with the canonical route list — no second source of truth.
 *
 * LCP budget: 2500ms (Core Web Vitals "good" threshold).
 * Runs 3 times per URL to smooth out cold-cache noise; asserts on median.
 */
const fs = require("node:fs");
const path = require("node:path");

function loadSitemapUrls() {
  const sitemapPath = path.resolve(__dirname, "public/sitemap.xml");
  const xml = fs.readFileSync(sitemapPath, "utf8");
  const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
  if (urls.length === 0) {
    throw new Error("lighthouserc: no <loc> entries found in public/sitemap.xml");
  }
  return urls;
}

module.exports = {
  ci: {
    collect: {
      url: loadSitemapUrls(),
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        // Skip auth-gated behavior; public routes only.
        onlyCategories: ["performance", "seo", "accessibility", "best-practices"],
      },
    },
    assert: {
      assertions: {
        // Core Web Vitals — LCP is the gate the user asked to protect.
        "largest-contentful-paint": ["error", { maxNumericValue: 2500, aggregationMethod: "median" }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1, aggregationMethod: "median" }],
        "total-blocking-time": ["warn", { maxNumericValue: 300, aggregationMethod: "median" }],
        // Category floors.
        "categories:performance": ["warn", { minScore: 0.8, aggregationMethod: "median" }],
        "categories:seo": ["error", { minScore: 0.9, aggregationMethod: "median" }],
        "categories:accessibility": ["warn", { minScore: 0.9, aggregationMethod: "median" }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
