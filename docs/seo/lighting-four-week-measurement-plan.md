# Lighting four-week measurement plan

**Status:** Day 0 not started
**Timezone:** America/Chicago
**Pages:** the two lighting guides published through PR #595

## Measurement purpose

Measure whether the first two lighting support pages become discoverable for relevant searches,
earn useful engagement, and move growers toward an honest first Verdant action. The plan does not
assume that early indexing latency or low Week 1 traffic means the content failed.

## Day 0 definition

Day 0 is the first timestamp when all of the following are simultaneously proven:

1. both lighting pages return HTTP 200 and match the approved merged release;
2. both pages are intentionally indexable with production self-canonicals;
3. sitemap, robots, internal-link, and protected-route checks pass;
4. no release-blocking technical defect remains;
5. a page-specific GA4 baseline is captured through authenticated reporting access; and
6. an authenticated Search Console baseline is captured, even when the values are zero or no data.

Missing access is not a zero. Day 0 must not be backdated to publication.

## Current checkpoint state

| Checkpoint | Timestamp       |
| ---------- | --------------- |
| Day 0      | Not started     |
| Week 1     | Day 0 + 7 days  |
| Week 2     | Day 0 + 14 days |
| Week 3     | Day 0 + 21 days |
| Week 4     | Day 0 + 28 days |

The exact UTC, America/Chicago, and ISO 8601 values will be written here and in
`artifacts/seo/lighting-launch-baseline.json` immediately after both authenticated baselines are
recorded.

## Current blockers

1. Merge and publish the focused page-identity repair in PR #597.
2. Verify production GA4 sends each full public lighting-guide path and its page-specific title.
3. Provide authenticated access to the existing Verdant GA4 property.
4. Configure the existing read-only Search Console OAuth workflow or provide another authorized
   authenticated Search Console session.

Day 0 must remain unset until all four conditions are resolved and both authenticated baselines are
recorded.

## Review source contract

- **Technical:** rendered production browser checks, raw HTTP, sitemap, and robots.
- **GSC:** authenticated Search Console property only.
- **GA4:** authenticated existing Verdant GA4 property only.
- **Product conversion:** existing privacy-safe events only; no new analytics vendor.
- **Comparison:** each checkpoint versus the prior checkpoint and the full cumulative window.

## Weekly review template

Complete one copy for each page at Weeks 1–4.

### Identity

- Checkpoint:
- Review timestamp (UTC):
- Review timestamp (America/Chicago):
- Canonical URL:
- GA4 page path:
- Page title:

### Technical state

| Field                 | Value | Change or evidence |
| --------------------- | ----- | ------------------ |
| HTTP status           |       |                    |
| Canonical             |       |                    |
| Robots/indexability   |       |                    |
| Sitemap inclusion     |       |                    |
| GSC inspection status |       |                    |
| Last crawl date       |       |                    |
| Technical regressions |       |                    |

### Search Console

| Metric           | Current | Previous | Change |
| ---------------- | ------: | -------: | -----: |
| Impressions      |         |          |        |
| Clicks           |         |          |        |
| CTR              |         |          |        |
| Average position |         |          |        |

- Indexed:
- Top relevant queries:
- Meaningful query movement:
- Page-level warnings:

### GA4

| Metric                      | Current | Previous | Change |
| --------------------------- | ------: | -------: | -----: |
| Page views                  |         |          |        |
| Users                       |         |          |        |
| Organic landing sessions    |         |          |        |
| Engaged sessions            |         |          |        |
| Engagement rate             |         |          |        |
| Average engagement time     |         |          |        |
| CTA clicks                  |         |          |        |
| Signup starts               |         |          |        |
| Signup completions          |         |          |        |
| First meaningful activation |         |          |        |

### Interpretation

- What changed:
- Is the signal meaningful or still immature:
- Most likely next action:
- Evidence required before changing the page:
- Decision: keep measuring / investigate a technical regression / prepare a Week 4 option

## Interpretation rules

- Do not rewrite a page because Week 1 traffic is low.
- Do not call indexing latency a content failure.
- Treat zero authenticated metrics as valid; keep unavailable metrics marked blocked.
- Prefer page-specific query relevance and engagement over aggregate traffic.
- Do not change title, H1, canonical, intent, or main content during the window without recording
  the measurement impact.
- A technical regression is investigated before content is blamed.

## Day 0 reset conditions

Reset Day 0 after a production change that materially affects:

- indexability or robots behavior;
- canonical URL;
- title, H1, or primary search intent;
- main educational content;
- sitemap or internal-link discovery; or
- analytics page identity or collection.

Do not reset for a harmless typo that cannot reasonably affect discovery or measurement. Record the
reason either way.

## Week 4 decision gate

Recommend exactly one outcome after comparing both pages:

### A. Keep measuring

Use when indexing or search data remains too immature.

### B. Optimize an existing page

Use when a page has relevant impressions but weak CTR, weak intent alignment, or a clear
technical/content gap.

### C. Strengthen internal links

Use when discovery is weak but the content remains sound.

### D. Build the next lighting page

Use only when both pages are technically stable and page/query evidence supports expanding the
cluster.

### E. Pause the cluster

Use when evidence shows a weaker opportunity than another verified search cluster.

No outcome automatically creates content. A next page— including the existing autoflower schedule
brief—must be selected from Week 4 evidence, not from prior enthusiasm.
