# Lighting launch verification

**Generated:** 2026-07-31T19:18:39.6233761Z
**Production host:** https://verdantgrowdiary.com
**Merged PR:** [#595](https://github.com/Verdant-OS/verdant-grow-diary/pull/595)
**Merge commit:** `1223c56c9db586160a2798d017c2e78d1de1dd5a`
**Measurement repair:** [#597](https://github.com/Verdant-OS/verdant-grow-diary/pull/597),
commit `51363737ca97e74f861558f082b849bbbd389aa2`
**Lovable project:** `66255e7b-892c-4be5-8686-ab1cfc3666db`
**Production build manifest commit:** `92d8330af90d983d3bcc1ad7507028505b8b14d8`
**Deploy branch head:** `9d3a56e1707a2bb666628b52178c0c59cbfd2f18`
**Production deployment ID:** not exposed by the current production response

## Launch verdict

**BLOCKED — GA4/GSC OWNER SETUP REQUIRED**

Both pages are published, publicly reachable, technically indexable, and match the content merged
in PR #595. The page-identity repair from PR #597 is also live: the intercepted production browser
verification at `2026-07-31T17:14:59.0979608Z` observed each exact guide path and title, no
duplicate page views, and protected-ID masking. The collection requests were intercepted, so no
verification events were transmitted to GA4.

No release-blocking production defect remains. Day 0 has not started because authenticated GA4
reporting and authenticated Search Console inspection are unavailable. Observed collection
payloads and public crawl checks prove implementation behavior, but they are not reporting
baselines.

## Publication and release evidence

- `https://verdantgrowdiary.com/version.json` identifies production build commit
  `92d8330af90d983d3bcc1ad7507028505b8b14d8`, built at
  `2026-07-31T03:34:48.447Z`.
- Repository ancestry proves the PR #595 merge commit and PR #597 repair commit are ancestors of
  that production manifest commit.
- The production manifest commit is an ancestor of deploy head
  `9d3a56e1707a2bb666628b52178c0c59cbfd2f18`. The delta contains only monitoring workflow,
  scripts, tests, and artifacts, so `production_publish_required=false` and release content still
  matches production.
- The current production response does not expose a Lovable deployment ID, so none is inferred.
- Both release-specific URLs, titles, descriptions, H1s, Article/FAQ schema, sitemap entries, and
  cross-links are present in production.
- The public probe at `2026-07-31T19:18:39.6233761Z` returned HTTP 200 for `version.json`, both
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
masked, and no duplicate page views were observed.

**GA4 page identity repair: PASS**

## Authenticated access and monitoring status

- **GA4 baseline:** BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE.
- **GSC baseline:** BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE.
- At `2026-07-31T19:18:39.6233761Z`, name-only GitHub secret listings found none of the expected GA4
  or GSC reporting secrets configured at repository scope or in the `verdant-production`,
  `verdant-sandbox`, and `copilot` environments; `.seo/gsc-token.local.json` is also absent. The
  workflow and documentation reference the expected `GSC_*` names, but no credential value was
  read or recorded in this verification.
- The latest SEO workflow on merge `9d3a56e…`
  ([run 30658003581](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/30658003581))
  succeeded and evaluated all 51 sitemap URLs. Its GSC operation was `SKIPPED`, access was
  `BLOCKED`, execution was `SKIPPED`, OAuth was not configured, and it made 0 GSC API attempts.
  Workflow success is not an authenticated GSC baseline.
- Owner handoff: complete the status-marked steps in the
  [lighting analytics owner setup checklist](./analytics-owner-setup-checklist.md) without sending
  credentials through chat or committing them.
- Machine-readable handoff: the current blocked state is recorded in
  [`artifacts/seo/seo-readiness-status.json`](../../artifacts/seo/seo-readiness-status.json).

The current bounded slice is `P2 SEO_READINESS_CANONICAL_TRUTH`. The next slice is
`P3 GSC_REGRESSION_NO_BASELINE_SEMANTICS`; it does not change the current access verdict.

Day 0 remains `UNSET`, and the four-week clock remains `NOT_STARTED`, until both authenticated
baselines are recorded.
