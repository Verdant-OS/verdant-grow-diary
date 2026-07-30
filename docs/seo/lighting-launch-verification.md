# Lighting launch verification

**Generated:** 2026-07-30T18:41:50.2169733Z
**Production host:** https://verdantgrowdiary.com
**Merged PR:** [#595](https://github.com/Verdant-OS/verdant-grow-diary/pull/595)
**Merge commit:** `1223c56c9db586160a2798d017c2e78d1de1dd5a`
**Lovable project:** `66255e7b-892c-4be5-8686-ab1cfc3666db`
**Production deployment:** `bdba8c36-79e6-4d7d-a86c-18e6c6a35a07`

## Launch verdict

**NOT READY — PRODUCTION DEFECT FOUND**

Both pages are published, publicly reachable, and technically indexable. Production matches the
content merged in PR #595. Day 0 has not started because:

1. production GA4 currently reports both long guide slugs as `/guides/:id` and sends the generic
   `Verdant Grow Diary` title before each lazy guide applies its page-specific metadata, which
   prevents a reliable page-by-page baseline; and
2. authenticated GA4 reporting and Search Console inspection are unavailable to this run.

The GA4 route-identity and page-title defects have a focused repair on
`codex/lighting-measurement-repair`. It must be merged, published through Lovable, and verified
before the baseline is captured.

## Publication and release evidence

- Lovable reports the project as published and its latest project commit as the exact PR #595 merge
  commit.
- The production response identifies deployment
  `bdba8c36-79e6-4d7d-a86c-18e6c6a35a07`.
- Both release-specific URLs, titles, descriptions, H1s, Article/FAQ schema, sitemap entries, and
  cross-links are present in production.
- No publisher header exposes a Git commit. The Lovable project record provides the commit match;
  production content fingerprints independently match the merged release.

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

The statically generated route document and the hydrated page both emit the same FAQ,
BreadcrumbList, and Article objects. The duplication is redundant but the objects parse, match the
visible content, and do not fabricate claims. Authenticated Search Console enhancement evidence is
still required before treating rich-result eligibility as confirmed.

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
- Fifteen distinct internal destinations found across the two pages were checked; none returned a
  broken response.
- Quick Log CTAs resolve through the existing authentication boundary; unauthenticated users are
  sent to the public welcome flow rather than private content.

## Regression and safety findings

- `/`, `/welcome`, `/demo`, and `/auth` render without browser errors.
- `/demo` reaches the intended welcome surface after client rendering.
- Unauthenticated `/timeline`, `/plants`, `/alerts`, and `/actions` requests resolve to
  `/welcome?redirectTo=...`.
- No private content, live telemetry, credentials, tokens, schema, RLS, Supabase, AI Doctor,
  Action Queue, automation, or device-control behavior changed in PR #595.
- No demo value is presented as live data on either lighting page.

### Non-blocking host mismatch

The six legacy public redirects added to `vercel.json` return HTTP 200 without a `Location` header
on Lovable production. Lovable is the production publisher and does not apply Vercel host
configuration. Client rendering reaches the intended public destinations, but these are not true
host redirects. This does not block measurement of the two canonical lighting URLs and is not
mixed into the GA4 repair.

## Measurement blocker

Production GA4 emits an explicit `page_view` for the long guide route with:

```text
page_location = https://verdantgrowdiary.com/guides/:id
page_title = Verdant Grow Diary
```

The shared privacy rule treated every path segment of 20 or more characters as a token. That is
correct for protected IDs but incorrect for intentional public SEO slugs. The focused repair
preserves hyphenated `/guides/<public-slug>` paths while continuing to mask long segments on
protected and token-bearing routes. It also mounts route-change analytics after the lazy route
content, so each guide applies its page-specific title before the explicit page view is sent.

Day 0 remains unset until the repair is live and authenticated GA4/GSC baselines are recorded.
