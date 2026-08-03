# Lighting launch verification

**Generated:** 2026-08-03T17:25:08Z
**Production host:** https://verdantgrowdiary.com
**Merged PR:** [#595](https://github.com/Verdant-OS/verdant-grow-diary/pull/595)
**Merge commit:** `1223c56c9db586160a2798d017c2e78d1de1dd5a`
**Measurement repair:** [#597](https://github.com/Verdant-OS/verdant-grow-diary/pull/597),
commit `51363737ca97e74f861558f082b849bbbd389aa2`
**Lovable project:** `66255e7b-892c-4be5-8686-ab1cfc3666db`
**Structured-data repair:** [#624](https://github.com/Verdant-OS/verdant-grow-diary/pull/624),
commit `b62aac5d4b0e9296bfdbee4c46e03fc35f350c0c`
**Production build manifest commit:** `NOT EXPOSED BY PUBLISHER`
**Deploy branch head:** `7efaaa5ed09a76e01e0555328e204934900f0083`
**Production deployment ID:** not exposed by the current production response

## Current P0 production recheck

At `2026-08-03T17:25:08Z`, the apex, both lighting routes, and `/version.json`
returned HTTP 200 from a Squarespace **Coming Soon** page with `noindex`. The
current `/sitemap.xml` and `/robots.txt` responses return HTTP 401. No response
exposes a Verdant release fingerprint, `G-B3QRSZEM9S`, a route-specific title, or
the expected guide content.

This is a production-host/origin failure, not a successful Verdant deployment. The
current domain must be restored to the intended publisher custom-domain configuration
before any technical SEO, GA4 identity, or GSC baseline claim can be renewed. Do not
guess DNS values, publish a no-op release, or infer a deployed commit from source.

**Required owner action:** Restore verdantgrowdiary.com and www.verdantgrowdiary.com to the intended publisher custom-domain configuration, then authorize an immediate production and intercepted-analytics recheck.

The prior August 2 release and analytics observations below remain historical evidence
only; they do not prove the current public host.

## Launch verdict

**NOT READY — PRODUCTION DEFECT FOUND**

The current public pages are Squarespace placeholders, not the Verdant lighting guides. They are
not intentionally indexable, do not expose current guide metadata or structured data, and cannot be
used for a GA4 page-view or GSC baseline. The current release content match is **FAIL**.

The last completed Verdant app-level collection matrix
(`2026-08-02T02:08:43.179Z`) remains historical evidence that the source and prior release emitted
one exact explicit SPA page view for each expected route, title, and query-free location.

One historical production instrumentation defect remains unresolved after restoration: a controlled nine-state
collection-endpoint matrix observed nine exact app-owned SPA events plus five automatic page views
without Verdant's explicit `page_path` on SPA/history transitions. All collection requests were
fulfilled locally, so no verification events were transmitted to GA4. The automatic source requires
an owner-side Enhanced Measurement review because authenticated stream settings are unavailable.
Authenticated GA4 reporting and Search Console inspection are also unavailable, so Day 0 remains
unset. Current production restoration is now the first gate.

The owner-confirmed GA4 production stream is `Verdant Grow Diary`, stream URL
`https://verdantgrowdiary.com`, stream ID `15065867361`, and measurement ID `G-B3QRSZEM9S`.
The last known Verdant production release loaded and targeted that exact measurement ID. The
current Squarespace response does not. The numeric property ID and authenticated reporting baseline
remain unavailable to Codex.

## Historical Verdant release evidence (not current production proof)

- `https://verdantgrowdiary.com/version.json` identifies production build commit
  `a20776993bd606f07977674934864b888a407e1c`, built at
  `2026-08-02T01:28:54.548Z`.
- Repository ancestry proves the PR #595 release, PR #597 analytics repair, and PR #624
  structured-data repair commits are all ancestors of that production manifest commit.
- Production manifest and deploy head both resolve to `a2077699…`. The production release now has
  full deploy-branch parity. Lighting release-content verification remains deliberately scoped to the
  two guides; no runtime publish is required for the measurement evidence itself.
- The point-in-time readiness artifact identifies the recheck-bearing evidence head
  (`913f1b9deb0934d5ce76491cbc945816f4581b73`) separately from its audited production release
  (`a20776993bd606f07977674934864b888a407e1c`). Its pre-recheck audit-start head
  (`c794e4c6ff0debb6ae2a83566b2a73f690a96393`) was seven evidence-only commits ahead at audit
  start and is not represented as deployed content. Neither evidence commit identifies deployed
  application content.
- Its evidence snapshot remains timestamped `2026-08-02T05:19:48.245Z`. The later
  `2026-08-02T08:07:28.792Z` revision is classified as
  `POST_DEPLOY_ANALYTICS_RECHECK_PROVENANCE_CORRECTION_ONLY`; it corrects the audit-head
  provenance without adding a fresh production or analytics verification.
- The current production response does not expose a Lovable deployment ID, so none is inferred.
- Both release-specific URLs, titles, descriptions, H1s, Article/FAQ schema, sitemap entries, and
  cross-links are present in production.
- The raw public probe at `2026-08-02T02:53:25.627Z` returned HTTP 200 for `version.json`, both
  lighting guides, `sitemap.xml`, and `robots.txt`. The sitemap contains 51 URLs and each lighting
  route exactly once; robots declares the production sitemap and protects app prefixes. Rendered
  browser checks at `2026-08-02T02:55:02.718Z` and `2026-08-02T02:55:07.852Z` confirmed both
  pages' route-scoped metadata, JSON-LD identities, cross-links, and zero application errors.

**Historical release content match: PASS — LIGHTING GUIDES ONLY; DEPLOYMENT PARITY: PASS**

**Current release content match: FAIL — Squarespace noindex placeholder; deployment parity: NOT VERIFIABLE**

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

## Historical per-page technical verification

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

PR #624 gives hydration one route owner for `WebPage`, `FAQPage`, `BreadcrumbList`, and `Article`.
The production matrix covered direct load, both cross-guide directions, back, forward, refresh,
repeated navigation, and a new tab. Every state parsed with one current page-level identity set,
zero duplicate identities, zero stale prior-route objects, and four FAQ questions matching visible
copy. Authenticated Search Console enhancement evidence is still required before treating
rich-result eligibility as confirmed.

**P1 technical SEO repair: PASS — FIXED AND PRODUCTION VERIFIED**

## Historical sitemap and robots verification

- `https://verdantgrowdiary.com/sitemap.xml`: HTTP 200.
- Both canonical lighting URLs are present.
- `https://verdantgrowdiary.com/robots.txt`: HTTP 200 and declares the production sitemap.
- Neither lighting page is disallowed.
- Protected prefixes for grows, tents, plants, timeline, sensors, AI Doctor, alerts, Action Queue,
  settings, account, and authentication are disallowed.
- No protected/private prefix appears in the public sitemap.

## Historical internal links and CTA destinations

- `/guides` links to both pages with descriptive lighting anchors.
- The two pages cross-link to each other with descriptive anchors.
- Existing supporting guides link into the lighting cluster.
- Timeline empty-state and lighting-event guidance link to the distance/schedule guide in the
  protected application.
- Thirty-five distinct internal destinations found across the two pages and verified inbound source
  pages were checked; none returned a broken response or unnecessary redirect.
- Quick Log CTAs resolve to the existing public, no-account 30-second Quick Log starter. The page
  returns HTTP 200 and does not expose private grow data.

## Historical regression and safety findings

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

## Historical measurement repair verification

The last completed controlled collection matrix observed production emitting explicit `page_view`
events for the two pages with:

```text
page_location = https://verdantgrowdiary.com/guides/cannabis-grow-light-distance-and-schedule
page_path = /guides/cannabis-grow-light-distance-and-schedule
page_title = Cannabis Grow Light Distance, PPFD & DLI Guide | Verdant

page_location = https://verdantgrowdiary.com/guides/cannabis-light-stress-light-burn-bleaching-or-heat
page_path = /guides/cannabis-light-stress-light-burn-bleaching-or-heat
page_title = Cannabis Light Stress: Burn, Bleaching, or Heat? | Verdant
```

That completed matrix fulfilled the collection endpoint locally, so the inspected payloads did not
add verification traffic to the production property. Protected token-bearing paths remained masked.
Verdant emitted nine exact explicit events across nine observed navigation states: direct deep-link
load, refresh on each guide, both cross-guide directions, back, forward, repeated navigation, and a
new tab.

The collection endpoint also received five tag-generated `page_view` events without Verdant's
explicit `page_path` during cross-guide, back/forward, and repeated navigation. That is consistent
with GA4 Enhanced Measurement's separate browser-history page-view option and would double-count
those navigations if left enabled beside Verdant's explicit SPA owner. The owner must disable the
advanced "page changes based on browser history events" option in the existing stream, retain the
explicit app emitter, and then authorize the same controlled re-verification.

The production build subsequently advanced to `a2077699…`; its source delta excludes analytics
paths, and current source inspection preserves the explicit SPA emitter and bootstrap
`send_page_view: false`. A corrected targeted post-deploy recheck at `2026-08-02T05:19:48.245Z`
fulfilled every observed GA collection request locally. Across a direct distance-guide load and a
client transition to the stress guide, it observed two exact app-owned page views and one separate
automatic page view without the explicit path: three page views for two navigation actions. The
interceptor covered `analytics.google.com`, `google-analytics.com`, and
`stats.g.doubleclick.net`; five collection requests were fulfilled locally and zero escaped.

A preceding exploratory browser probe omitted `analytics.google.com` from its collection-host
matcher. It is excluded from this evidence, and its transmission status is not asserted. The corrected
two-state recheck reconfirms the P0 owner-setting defect but does not replace the completed
`2026-08-02T02:08:43.179Z` nine-state matrix.

**GA4 explicit page identity: PASS**

**GA4 page-view singleton contract: FAIL — OWNER ENHANCED MEASUREMENT CHANGE REQUIRED**

## Guide CTA measurement gap

Each lighting guide has one prominent public CTA to `/quick-log`, but it is a
plain `GuidePage` link with no guide-specific CTA-click event. Guide CTA clicks
are therefore `MISSING`, not zero and not inferred from a destination page
view, a later `quick_log_saved`, or any other downstream event. No CTA event
means no user-entered text, user identifier, grow/tent/plant identifier, or
private route value is emitted.

This documented P2 gap does not block Day 0 after page-view identity and the
authenticated GA4/GSC baselines are sound. Adding attribution requires a
separate authorized analytics/privacy slice; this readiness work adds no new
event or runtime behavior.

## Authenticated access and monitoring status

- **GA4 baseline:** BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE.
- **GSC baseline:** BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE.
- **GA4 production stream identity:** PASS — owner-confirmed values match the deployed host and tag.
- At `2026-08-02T02:08:43.179Z`, name-only GitHub secret listings found none of the expected GA4
  or GSC reporting secrets configured at repository scope or in the `verdant-production`,
  `verdant-sandbox`, and `copilot` environments; `.seo/gsc-token.local.json` is also absent. The
  workflow and documentation reference the expected `GSC_*` names, but no credential value was
  read or recorded in this verification.
- The latest SEO workflow on deploy head `a2077699…`
  ([run 30727208474](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/30727208474))
  succeeded and evaluated all 51 sitemap URLs. Its GSC operation was `SKIPPED`, access was
  `BLOCKED`, execution was `SKIPPED`, OAuth was not configured, and it made 0 GSC API attempts.
  Workflow success is not an authenticated GSC baseline.
- The checked-in `artifacts/seo/seo-job-summary.*` pair is a historical 2026-07-02 dry-run
  (two URLs), not the current monitoring evidence. The readiness artifact identifies run
  `30727208474` and its immutable `seo-monitoring-reports` artifact (`8826754533`) as the current
  51-URL, access-blocked evidence instead.
- Owner handoff: complete the status-marked steps in the
  [lighting analytics owner setup checklist](./analytics-owner-setup-checklist.md) without sending
  credentials through chat or committing them.
- Machine-readable handoff: the current blocked state is recorded in
  [`artifacts/seo/seo-readiness-status.json`](../../artifacts/seo/seo-readiness-status.json).

The current bounded slice is `P0 PRODUCTION_HOST_ORIGIN_MISMATCH`: it records the verified public
host failure without changing DNS, publisher settings, runtime code, or analytics configuration.
The next owner action is to restore the intended publisher custom-domain configuration, then allow
an immediate production and intercepted-analytics recheck. The historical P0
`GA4_ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS` defect remains unresolved after that restoration.

Separately, the next unblocked Codex slice is
`P0 ANALYTICS_CONTRACT_TEST_HARNESS_RECONCILIATION`: the deploy-head default Vitest config imports
undeclared `@vitejs/plugin-react-swc`, so the analytics contract suite fails before collection; two
historic analytics tests also still read deleted pre-TanStack `App.tsx` and `index.html` files. That
source-test repair must remain separate from this production-host evidence update.

Day 0 remains `UNSET`, and the four-week clock remains `NOT_STARTED`, until both authenticated
baselines are recorded.
