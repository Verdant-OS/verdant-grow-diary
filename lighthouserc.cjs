/**
 * Lighthouse CI config for Verdant.
 *
 * URLs are loaded dynamically from public/sitemap.xml so the audit stays
 * in lockstep with the canonical route list — no second source of truth.
 *
 * LCP budget: 2500ms (Core Web Vitals "good" threshold).
 * Runs 3 times per URL to smooth out cold-cache noise; asserts on median.
 */
const path = require("node:path");
const {
  loadSitemapUrls,
  resolveLighthouseShardConfig,
  selectLighthouseShard,
} = require("./scripts/lib/lighthouse-url-sharding.cjs");

const sitemapUrls = loadSitemapUrls(path.resolve(__dirname, "public/sitemap.xml"));
const lighthouseUrls = selectLighthouseShard(sitemapUrls, resolveLighthouseShardConfig());

module.exports = {
  ci: {
    collect: {
      url: lighthouseUrls,
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
        "largest-contentful-paint": [
          "error",
          { maxNumericValue: 2500, aggregationMethod: "median" },
        ],
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
