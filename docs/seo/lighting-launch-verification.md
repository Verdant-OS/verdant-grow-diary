# Lighting launch verification

**Generated:** 2026-08-01T02:08:00.4849365Z
**Production host:** https://verdantgrowdiary.com
**Merged PR:** [#595](https://github.com/Verdant-OS/verdant-grow-diary/pull/595)
**Merge commit:** `1223c56c9db586160a2798d017c2e78d1de1dd5a`
**Measurement repair:** [#597](https://github.com/Verdant-OS/verdant-grow-diary/pull/597),
commit `51363737ca97e74f861558f082b849bbbd389aa2`
**Lovable project:** `66255e7b-892c-4be5-8686-ab1cfc3666db`
**Production build manifest commit:** `2560d83a6b740cb9d6c4521bc6edc083977d51fc`
**Deploy branch head:** `2560d83a6b740cb9d6c4521bc6edc083977d51fc`
**Production deployment ID:** not exposed by the current production response

## Launch verdict

**NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND**

Both pages are published, publicly reachable, technically indexable, and match the content merged
in PR #595. Their exact paths and route-specific titles still pass intercepted production browser
verification. The collection requests were blocked, so no verification events were transmitted to
GA4.

A P0 analytics privacy defect is present in production. An unauthenticated visit to a protected
plant route containing a synthetic email-like path sentinel queued the literal protected pathname
before the authentication redirect. The query string was not included in `page_path`, but the
path segment itself was not masked. A two-file route-shape sanitizer repair on
`codex/fix-protected-analytics-paths` is locally validated and masks that shape to `/plants/:id`;
it is **not merged or deployed** at this snapshot. Unknown routes are also reduced to `/:unknown`
by the local repair.

Day 0 has not started because the P0 production defect remains and authenticated GA4 reporting
and Search Console inspection are unavailable. Observed collection payloads and public crawl
checks prove implementation behavior, but they are not reporting baselines.

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
- The production manifest exactly matches deploy head
  `2560d83a6b740cb9d6c4521bc6edc083977d51fc`. Release content matches production, but the local
  protected-route sanitizer repair is a source-only change and still requires a PR, merge,
  production publish, and intercepted production re-verification.
- The current production response does not expose a Lovable deployment ID, so none is inferred.
- Both release-specific URLs, titles, descriptions, H1s, Article/FAQ schema, sitemap entries, and
  cross-links are present in production.
- The current public probe returned HTTP 200 for `version.json`, both
  lighting guides, `sitemap.xml`, and `robots.txt`. The sitemap contains 51 URLs and each lighting
  route exactly once; robots declares the production sitemap and protects app prefixes.

**Release content match: PASS**

**Analytics privacy readiness: FAIL in production**

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

**Verified low-urgency, non-launch-blocking P1 technical SEO defect:** after cross-guide client
navigation, the prior route's three static objects remain while the current route's runtime objects
mount, so the target DOM advertises conflicting page identities until a reload or back navigation
realigns them. Raw static HTML has one of each. A focused fix must establish one owner for these
page-level objects and add a combined static-plus-hydration navigation regression test; it must not
change visible copy or schema claims.

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

Production still emits explicit `page_view` events for the two public lighting pages with:

```text
page_location = https://verdantgrowdiary.com/guides/cannabis-grow-light-distance-and-schedule
page_path = /guides/cannabis-grow-light-distance-and-schedule
page_title = Cannabis Grow Light Distance, PPFD & DLI Guide | Verdant

page_location = https://verdantgrowdiary.com/guides/cannabis-light-stress-light-burn-bleaching-or-heat
page_path = /guides/cannabis-light-stress-light-burn-bleaching-or-heat
page_title = Cannabis Light Stress: Burn, Bleaching, or Heat? | Verdant
```

The browser verification blocked the collection endpoint, so the inspected payloads did not add
verification traffic to the production property. The two lighting routes retained their exact
path and title identities with no duplicate page views. However, the protected synthetic
email-like plant path queued its literal pathname before redirect, which is a P0 production
privacy failure.

**GA4 public lighting identity: PASS**

**GA4 protected-route masking: FAIL in production**

The local source repair is `FIXED_LOCALLY_VALIDATED_AWAITING_PR_PRODUCTION`. Its focused validation
is 90 passing tests, plus passing typecheck, production build, postbuild, and intercepted local
browser proof. This is not production evidence and does not close the P0.

## Authenticated access and monitoring status

- **GA4 BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE**
- **GSC BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE**
- **MEASUREMENT DAY 0: UNSET**
- **FOUR-WEEK CLOCK: NOT STARTED**
- **GA4 production stream identity:** PASS — owner-confirmed values match the deployed host and tag.
- Name-only GitHub secret listings found none of the expected GA4
  or GSC reporting secrets configured at repository scope or in the `verdant-production`,
  `verdant-sandbox`, and `copilot` environments; `.seo/gsc-token.local.json` is also absent. The
  workflow and documentation reference the expected `GSC_*` names, but no credential value was
  read or recorded in this verification.
- The latest SEO workflow on deploy head `2560d83a…`
  ([run 30678528505](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/30678528505))
  succeeded and evaluated all 51 sitemap URLs. Its GSC operation was `SKIPPED`, access was
  `BLOCKED`, execution was `SKIPPED`, OAuth was not configured, and it made 0 GSC API attempts.
  Workflow success is not an authenticated GSC baseline.
- The checked-in `artifacts/seo/seo-job-summary.json` and `.md` files are stale July 2 snapshots.
  The uploaded artifact from run 30678528505 is authoritative for this checkpoint.
- Owner handoff: complete the status-marked steps in the
  [lighting analytics owner setup checklist](./analytics-owner-setup-checklist.md) without sending
  credentials through chat or committing them.
- Machine-readable handoff: the current blocked state is recorded in
  [`artifacts/seo/seo-readiness-status.json`](../../artifacts/seo/seo-readiness-status.json).

The current bounded slice is `P0 PROTECTED_ANALYTICS_PATH_REDACTION`. Its source repair is locally
validated but awaits PR, merge, production publish, and intercepted production proof. The existing
`P1 LIGHTING_DUPLICATE_HYDRATED_JSON_LD` defect remains unresolved and is next only after the P0 is
closed in production.

Day 0 remains `UNSET`, and the four-week clock remains `NOT_STARTED`, until the P0 is verified
closed in production and both authenticated baselines are recorded.
