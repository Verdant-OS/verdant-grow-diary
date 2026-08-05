# Lighting four-week measurement plan

**Verdict:** NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND
**Day 0:** UNSET
**Four-week clock:** NOT_STARTED
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

The public release and technical SEO identity are complete, but an analytics collection defect and
authenticated-access gates remain:

- The current production manifest is `97e23e1f46a2cb998eed87b75845963bc32f1579`, built at
  `2026-08-05T16:38:38.485Z`. The deploy branch is one documentation-only `CURRENT_STATE` commit
  ahead at `5841d9f22d96aadad255c88369554c52a1691bcd`. The production deploy includes a
  router/AppShell change, so the
  historical intercepted matrix must be repeated before it can describe current runtime behavior.
- The last completed intercepted browser matrix (`2026-08-02T02:08:43.179Z`) preserved each exact
  lighting-guide path and page-specific title across nine navigation states, kept protected IDs
  masked, and transmitted no verification events. It observed nine exact app-owned page views plus
  five automatic GA4 page views without Verdant's explicit `page_path`. A corrected targeted
  post-deploy recheck (`2026-08-02T05:19:48.245Z`) then covered one direct distance-guide load and
  one client transition to the stress guide. It fulfilled five collection requests locally, observed
  two exact app-owned page views plus one automatic page view without the explicit path, and had zero
  escaped collection requests. This reconfirms the owner-setting defect without replacing the
  count-bearing nine-state matrix. A preceding exploratory probe omitted `analytics.google.com` from
  its matcher and is excluded from this evidence; its transmission status is not asserted.
- The owner-confirmed GA4 production stream is `Verdant Grow Diary`, stream URL
  `https://verdantgrowdiary.com`, stream ID `15065867361`, and measurement ID `G-MCXQ9GVS5H`;
  the consent-gated source contract retains that exact measurement ID as its target. The property ID is still unconfirmed.
- The current public probe (`2026-08-05T16:52:31.830Z`) returns HTTP 200 for both guides, the sitemap,
  robots, and version manifest. Each lighting route occurs exactly once in the sitemap, and robots
  protects app prefixes. The current source contract preserves consent-gated
  `send_page_view: false` plus the explicit sanitized page-view emitter; no current intercepted
  collection result is claimed because the in-app browser control bridge was unavailable.
- Workflow [30727208474](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/30727208474)
  succeeded across all 51 URLs, but its GSC operation was `SKIPPED`, access was `BLOCKED`,
  execution was `SKIPPED`, OAuth was not configured, and it made 0 API attempts.
- Production is one documentation-only commit behind the deploy branch. Lighting release-content
  verification remains scoped to the two guides.
- PR #624 is live. Its production direct/cross-guide/history/refresh/repeat/new-tab matrix found one
  current `WebPage`, `FAQPage`, `BreadcrumbList`, and `Article` identity set per page state, with
  zero duplicate identities, zero stale prior-route objects, and zero JSON-LD parse errors.

Three owner gates remain:

1. Disable Enhanced Measurement page views based on browser-history changes in the existing
   production stream, retaining Verdant's explicit SPA page-view owner, then authorize a controlled
   re-verification.
2. Confirm the existing Verdant GA4 property identity and provide read-only authenticated
   reporting access. The production stream identity itself is complete.
3. Configure the existing owner-controlled, read-only Search Console OAuth workflow, or provide
   another authorized authenticated Search Console session.

Use the [analytics owner setup checklist](./analytics-owner-setup-checklist.md). Do not send
credentials through chat or commit them. Day 0 must remain unset until both authenticated
baselines are recorded. Observed GA4 collection payloads and successful public/static checks are
implementation evidence, not reporting baselines.

## Review source contract

- **Technical:** rendered production browser checks, raw HTTP, sitemap, and robots.
- **GSC:** authenticated Search Console property only.
- **GA4:** authenticated existing Verdant GA4 property only.
- **Product conversion:** existing privacy-safe events only; no new analytics vendor.
- **Comparison:** each checkpoint versus the prior checkpoint and the full cumulative window.

### Guide CTA measurement boundary

Guide CTA clicks are currently `MISSING`: both lighting-guide CTAs are plain
links to `/quick-log`, with no guide-specific click event. Do not infer a CTA
click from the destination page view, a later `quick_log_saved`, or any other
downstream event. This is a documented measurement gap, not a Day 0 blocker;
exclude it from comparison until a separately authorized implementation exists.

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

| Metric                                     | Current | Previous | Change |
| ------------------------------------------ | ------: | -------: | -----: |
| Page views                                 |         |          |        |
| Users                                      |         |          |        |
| Organic landing sessions                   |         |          |        |
| Engaged sessions                           |         |          |        |
| Engagement rate                            |         |          |        |
| Average engagement time                    |         |          |        |
| Guide CTA clicks (MISSING — do not report) |         |          |        |
| Signup starts                              |         |          |        |
| Signup completions                         |         |          |        |
| First meaningful activation                |         |          |        |

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
