# Lighting launch verification

**Generated:** 2026-08-01T03:59:17.0220380Z
**Production host:** https://verdantgrowdiary.com
**Merged PR:** [#595](https://github.com/Verdant-OS/verdant-grow-diary/pull/595)
**Merge commit:** `1223c56c9db586160a2798d017c2e78d1de1dd5a`
**Measurement repair:** [#597](https://github.com/Verdant-OS/verdant-grow-diary/pull/597),
commit `51363737ca97e74f861558f082b849bbbd389aa2`
**Lovable project:** `66255e7b-892c-4be5-8686-ab1cfc3666db`
**Production build manifest commit:** `2560d83a6b740cb9d6c4521bc6edc083977d51fc`
**Deploy branch head:** `591081b387ae9a6d9eb00aeb1f4ed9b43c90cc7d`
**Production deployment ID:** not exposed by the current production response

## Launch verdict

**NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND**

Both pages are published, publicly reachable, intentionally indexable, and match the content merged
in PR #595. The explicit page-identity repair from PR #597 is live: each tested navigation queued
one exact route path, title, and query-free location, and protected identifiers remained masked.
Two production defects prevent a ready verdict: route JSON-LD is duplicate/stale after hydration,
and GA4's tag also emits automatic page views without Verdant's explicit `page_path` alongside the
app-owned SPA events. All collection requests were fulfilled locally, so no verification events
were transmitted to GA4.

The JSON-LD ownership defect has a bounded local repair with a passing built-browser navigation
matrix, but production still needs that repair merged and published. The automatic GA4 page-view
source requires an owner-side Enhanced Measurement review because authenticated stream settings
are unavailable. Authenticated GA4 reporting and Search Console inspection are also unavailable,
so Day 0 remains unset.

The owner-confirmed GA4 production stream is `Verdant Grow Diary`, stream URL
`https://verdantgrowdiary.com`, stream ID `15065867361`, and measurement ID `G-B3QRSZEM9S`.
Production loads and targets that exact measurement ID. This closes stream identity only; the
numeric property ID and authenticated reporting baseline remain unavailable to Codex.

## Publication and release evidence

- `https://verdantgrowdiary.com/version.json` identifies production build commit
  `2560d83a6b740cb9d6c4521bc6edc083977d51fc`, built at
  `2026-08-01T01:40:18.366Z`.
- Repository ancestry proves the PR #595 merge commit and PR #597 repair commit are ancestors of
  that production manifest commit.
- The production manifest is an ancestor of deploy head. The committed delta through
  `591081b387ae9a6d9eb00aeb1f4ed9b43c90cc7d` is EcoWitt adapter hardening only; no public SEO or
  analytics runtime changed, so release content still matches production. This bounded slice adds
  a public guide JSON-LD runtime repair and therefore requires a new publish after merge.
- The current production response does not expose a Lovable deployment ID, so none is inferred.
- Both release-specific URLs, titles, descriptions, H1s, Article/FAQ schema, sitemap entries, and
  cross-links are present in production.
- The public probe at `2026-08-01T03:58:28.982Z` returned HTTP 200 for `version.json`, both
  lighting guides, `sitemap.xml`, and `robots.txt`. The sitemap contains 51 URLs and each lighting
  route exactly once; robots declares the production sitemap and protects app prefixes.

**Release content match: PASS**

## Exact lighting pages

| Route                                                        | Canonical production URL                                                                 | Search intent                                                                                   | Intended indexability |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------- |
| `/guides/cannabis-grow-light-distance-and-schedule`          | `https://verdantgrowdiary.com/guides/cannabis-grow-light-distance-and-schedule`          | Help growers measure distance, PPFD, DLI, and schedule before changing lighting                 | `index, follow`       |
| `/guides/cannabis-light-stress-light-burn-bleaching-or-heat` | `https://verdantgrowdiary.com/guides/cannabis-light-stress-light-burn-bleaching-or-heat` | Help growers compare light burn, bleaching, heat stress, and look-alikes without overdiagnosing | `index, follow`       |

### Release fingerprints

#### Grow-light distance and schedule

- Title: `Cannabis Grow Light Distance, PPFD & DLI Guide | Verdant`
- H1: `Cannabis grow light distance, PPFD, DLI, and schedules: what to measure before changing anything`
- Distinctive section: `Use DLI to connect intensity with the light schedule`
- Structured data: `WebPage`, `FAQPage`, `BreadcrumbList`, and `Article`

#### Light-stress troubleshooting

- Title: `Cannabis Light Stress: Burn, Bleaching, or Heat? | Verdant`
- H1: `Cannabis light stress: compare light burn, bleaching, heat, and look-alikes before reacting`
- Distinctive section: `Use a 24-hour and three-day observation sequence`
- Structured data: `WebPage`, `FAQPage`, `BreadcrumbList`, and `Article`

## Per-page technical verification

| Check                                |      Distance/schedule |           Light stress |
| ------------------------------------ | ---------------------: | ---------------------: |
| Direct/deep URL HTTP 200             |                   PASS |                   PASS |
| Redirect chain                       |                      0 |                      0 |
| Production hostname                  |                   PASS |                   PASS |
| Main content rendered                | PASS, 5,966 characters | PASS, 5,772 characters |
| Soft 404                             |                     No |                     No |
| One title                            |                   PASS |                   PASS |
| One useful description               |                   PASS |                   PASS |
| One absolute self-canonical          |                   PASS |                   PASS |
| `index, follow`                      |                   PASS |                   PASS |
| OG title/description/URL             |                   PASS |                   PASS |
| OG image                             |               HTTP 200 |               HTTP 200 |
| One page-level H1                    |                   PASS |                   PASS |
| Heading-level leaps                  |                      0 |                      0 |
| Mobile horizontal overflow at 390 px |                   0 px |                   0 px |
| Browser console/page errors          |                      0 |                      0 |
| JSON-LD parse errors                 |                      0 |                      0 |
| Fabricated review/rating fields      |                      0 |                      0 |

On a direct load, the statically generated route document and hydrated page emit identical FAQ,
BreadcrumbList, and Article object pairs. Those objects parse, match the visible content, and do
not fabricate claims. Authenticated Search Console enhancement evidence is still required before
treating rich-result eligibility as confirmed.

**Verified P1 technical SEO defect:** after cross-guide client navigation, the prior route's static
objects remain while the current route's runtime objects mount, so the target DOM advertises
conflicting page identities. Direct loads also duplicate FAQPage, BreadcrumbList, and Article.
The bounded local repair gives hydration one route owner for WebPage, FAQPage, BreadcrumbList, and
Article. Targeted regression coverage and the built local direct/back/forward/refresh/repeat/new-tab
matrix observed zero duplicate or stale route objects without changing visible copy or schema
claims. Production remains failed until that repair is published and reverified.

## Sitemap and robots

- `https://verdantgrowdiary.com/sitemap.xml`: HTTP 200.
- Both canonical lighting URLs are present.
- `https://verdantgrowdiary.com/robots.txt`: HTTP 200 and declares the production sitemap.
- Neither lighting page is disallowed.
- Protected prefixes for grows, tents, plants, timeline, sensors, AI Doctor, alerts, Action Queue,
  settings, account, and authentication are disallowed.
- No protected/private prefix appears in the public sitemap.

## Internal links and CTA destinations

- `/guides` links to both pages with descriptive lighting anchors.
- The two pages cross-link to each other with descriptive anchors.
- Existing supporting guides link into the lighting cluster.
- Timeline empty-state and lighting-event guidance link to the distance/schedule guide in the
  protected application.
- Thirty-five distinct internal destinations found across the two pages and verified inbound source
  pages were checked; none returned a broken response or unnecessary redirect.
- Quick Log CTAs resolve to the existing public, no-account 30-second Quick Log starter. The page
  returns HTTP 200 and does not expose private grow data.

## Regression and safety findings

- `/`, `/welcome`, `/demo`, `/auth`, and `/quick-log` render without browser errors.
- `/demo` reaches the intended welcome surface after client rendering.
- Unauthenticated `/dashboard`, `/grows`, `/plants`, `/timeline`, `/sensors`, `/doctor`, `/alerts`,
  `/actions`, and `/account/preferences` requests resolve to `/welcome?redirectTo=...`.
- No private content, live telemetry, credentials, tokens, schema, RLS, Supabase, AI Doctor,
  Action Queue, automation, or device-control behavior changed in PR #595.
- No demo value is presented as live data on either lighting page.

### Non-blocking host mismatch

The six legacy public redirects added to `vercel.json` return HTTP 200 without a `Location` header
on Lovable production. Lovable is the production publisher and does not apply Vercel host
configuration. Client rendering reaches the intended public destinations, but these are not true
host redirects. This does not block measurement of the two canonical lighting URLs and is not
mixed into the GA4 repair.

## Measurement repair verification

Production now emits explicit `page_view` events for the two pages with:

```text
page_location = https://verdantgrowdiary.com/guides/cannabis-grow-light-distance-and-schedule
page_path = /guides/cannabis-grow-light-distance-and-schedule
page_title = Cannabis Grow Light Distance, PPFD & DLI Guide | Verdant

page_location = https://verdantgrowdiary.com/guides/cannabis-light-stress-light-burn-bleaching-or-heat
page_path = /guides/cannabis-light-stress-light-burn-bleaching-or-heat
page_title = Cannabis Light Stress: Burn, Bleaching, or Heat? | Verdant
```

The browser verification fulfilled the collection endpoint locally, so the inspected payloads did
not add verification traffic to the production property. Protected token-bearing paths remained
masked. Verdant queued exactly one explicit event for every observed route transition, including
both direct loads, both cross-guide directions, back, forward, refresh, repeated navigation, and a
new tab.

The collection endpoint also received tag-generated `page_view` events without Verdant's explicit
`page_path` during direct/history navigation. That is consistent with GA4 Enhanced Measurement's
separate browser-history page-view option and would double-count some navigation if left enabled
beside Verdant's explicit SPA owner. The owner must disable the advanced "page changes based on
browser history events" option in the existing stream, retain the explicit app emitter, and then
authorize the same controlled re-verification.

**GA4 explicit page identity: PASS**

**GA4 page-view singleton contract: FAIL — OWNER ENHANCED MEASUREMENT CHANGE REQUIRED**

## Authenticated access and monitoring status

- **GA4 baseline:** BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE.
- **GSC baseline:** BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE.
- **GA4 production stream identity:** PASS — owner-confirmed values match the deployed host and tag.
- At `2026-08-01T03:59:17.0220380Z`, name-only GitHub secret listings found none of the expected GA4
  or GSC reporting secrets configured at repository scope or in the `verdant-production`,
  `verdant-sandbox`, and `copilot` environments; `.seo/gsc-token.local.json` is also absent. The
  workflow and documentation reference the expected `GSC_*` names, but no credential value was
  read or recorded in this verification.
- The latest SEO workflow on deploy head `591081b3…`
  ([run 30681587094](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/30681587094))
  succeeded and evaluated all 51 sitemap URLs. Its GSC operation was `SKIPPED`, access was
  `BLOCKED`, execution was `SKIPPED`, OAuth was not configured, and it made 0 GSC API attempts.
  Workflow success is not an authenticated GSC baseline.
- Owner handoff: complete the status-marked steps in the
  [lighting analytics owner setup checklist](./analytics-owner-setup-checklist.md) without sending
  credentials through chat or committing them.
- Machine-readable handoff: the current blocked state is recorded in
  [`artifacts/seo/seo-readiness-status.json`](../../artifacts/seo/seo-readiness-status.json).

The current bounded slice is `P1 LIGHTING_DUPLICATE_HYDRATED_JSON_LD`; its local repair is verified
and requires merge, publish, and production re-verification. The next P1 is owner-blocked:
`GA4_ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS`.

Day 0 remains `UNSET`, and the four-week clock remains `NOT_STARTED`, until both authenticated
baselines are recorded.
