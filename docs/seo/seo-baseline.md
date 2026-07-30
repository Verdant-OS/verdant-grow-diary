# Verdant SEO baseline

**Audit date:** 2026-07-30<br>
**Repository baseline:** `1c40c21f2` on `origin/verdant-grow-diary`<br>
**Audit status:** repository and production-static audit complete; live Search Console and GA4 baseline **BLOCKED / NO_BASELINE**.

## What was verified

| Area                      | Verified state                                                                                                                                                                              | Evidence source                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Rendering                 | React 18 + Vite client-rendered SPA. Route-local HTML head documents are emitted at build time; page bodies are not SSR.                                                                    | `src/App.tsx`, `vite.config.ts`, `src/lib/build/staticPublicSeoDocuments.ts` |
| Route inventory           | 134 router paths match 134 manifest paths: 39 public, 42 auth, 29 operator, 6 internal, 18 redirects.                                                                                       | `src/lib/appRouteManifest.ts`, route-manifest sync test                      |
| Indexable set             | 47 concrete production URLs appear in `public/sitemap.xml`; every sitemap URL except `/` has a static route document.                                                                       | `public/sitemap.xml`, `src/test/root-canonical-seo.test.ts`                  |
| Crawl controls            | `robots.txt` has Googlebot, Bingbot, and wildcard protections for protected prefixes; route/sitemap parity is tested.                                                                       | `public/robots.txt`, `scripts/check-sitemap-robots-parity.mjs`               |
| Metadata                  | Client `usePageSeo` manages title, description, canonical, robots, Open Graph, and Twitter tags. Build output mirrors public route heads.                                                   | `src/hooks/usePageSeo.ts`, static-head validators                            |
| Structured data           | Organization/WebSite and SoftwareApplication at the shell; route documents use WebPage, FAQPage, BreadcrumbList, Article, and cultivar collection schema where visible content supports it. | `index.html`, `src/lib/seoStructuredData.ts`                                 |
| Analytics                 | GA4 route-change page views and a constrained funnel-event catalog exist. No new vendor is needed.                                                                                          | `src/hooks/useGoogleAnalyticsPageViews.ts`, `src/lib/funnelAnalytics.ts`     |
| Search Console monitoring | Read-only OAuth, URL Inspection, allowlist expiry, redacted artifacts, and a CI workflow already exist.                                                                                     | `docs/seo-monitoring.md`, `scripts/seo/`                                     |
| Performance monitoring    | A nightly/manual Lighthouse workflow shards sitemap URLs and uses median results.                                                                                                           | `.github/workflows/lighthouse-ci.yml`, `lighthouserc.cjs`                    |

## External measurement baseline

| Metric or check                                             | Status                                                                                        | What is missing                                                                                    | What this sprint can still prove                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Search Console impressions, clicks, CTR, position, coverage | **BLOCKED / NO_BASELINE**                                                                     | GSC OAuth credentials and an authenticated run; the tracked-finding config is still a placeholder. | Static crawl controls, route intent, and monitoring readiness. |
| GA4 organic users, sessions, landing pages, CTA conversion  | **BLOCKED / NO_BASELINE**                                                                     | Owner-provided export or authorized read-only reporting access.                                    | Event taxonomy and privacy boundaries.                         |
| Indexed-page count and excluded categories                  | **BLOCKED / NO_BASELINE**                                                                     | Search Console coverage export or URL Inspection results.                                          | Intended index/noindex matrix only.                            |
| Production Lighthouse and mobile CWV                        | **BLOCKED / NO_BASELINE**                                                                     | A repeatable published-site run and its uploaded artifacts.                                        | Build-time asset and static-head safeguards.                   |
| Published-site redirect behavior                            | Partially verified from source/configuration; live post-publish verification remains pending. | A production deployment containing this change.                                                    | Rule-level behavior and regression tests.                      |

No traffic, ranking, indexing, or conversion result is claimed in this document. A future GSC/GA4 export must be treated as a dated snapshot, not backfilled into this baseline without its source date.

## Baseline risks

1. Transactional return pages had an indexability gap in both client and non-JS paths.
2. Several public aliases were browser-only redirects, which leaves first-pass crawlers with a 200 shell rather than a canonical HTTP redirect.
3. Monitoring inspected only the first 15 sitemap URLs, omitting 32 current URLs and a never-allowlisted guide.
4. Guide Article dates used a shared historical value rather than per-guide provenance; this is a content-freshness trust risk, not proof that a page is stale.
5. The nutrient-guide registry and sitemap are being changed by open PR #560. Content publication from this sprint must not silently overlap that work.

## Baseline operating rule

Use this as the comparison point for the next authenticated weekly report. Mark a metric as **NO_BASELINE** until it has an owner-supplied or authenticated source, and preserve the source date and scope alongside every reported change.
