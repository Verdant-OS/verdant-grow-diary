# Lighting analytics owner setup checklist

**Last reconciled against production (UTC):** 2026-08-03T21:57:06.508Z

**Production host:** `https://verdantgrowdiary.com`

**Operating mode:** MODE A — ACCESS BLOCKED / READINESS WORK

```text
GA4 BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE
GSC BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE
MEASUREMENT DAY 0: UNSET
FOUR-WEEK CLOCK: NOT STARTED
```

This is the owner-facing handoff for the two lighting guides. PR #595, the PR #597 analytics
repair, and the PR #624 structured-data ownership repair have current public release-fingerprint
evidence. At `2026-08-03T21:57:06.508Z`, the production domain served both intended lighting guides,
the sitemap, robots, and version endpoint through the expected Cloudflare/Lovable edge. The two
guides expose their intended metadata, indexability, JSON-LD, and `G-B3QRSZEM9S` tag. The deployed
commit remains unavailable from `version.json`, so this is not deploy-branch parity proof.

The historical controlled collection-endpoint test across nine navigation states found five
automatic GA4 page views alongside Verdant's nine explicit SPA events, so the singleton collection
contract remains unresolved pending the Enhanced Measurement change below. The owner has confirmed
the intended production stream name, stream URL, stream ID, and measurement ID, and the current
server-rendered guides expose that tag. The GA4 property identity and authenticated
reporting access are still unavailable to Codex, as is authenticated Search Console access.

Never paste a Google password, OAuth code, client secret, refresh token, access token,
service-account key, verification token, or private export into chat, an issue, a pull request, a
repository file, or an artifact. Keep credential values in the owner-controlled account, approved
local ignored storage, or GitHub Actions secrets. The detailed GSC procedure is in
[`docs/seo-monitoring.md`](../seo-monitoring.md).

## Status key

- `COMPLETE` — current source, production evidence, or explicit owner confirmation proves the step.
- `INCOMPLETE` — the owner must confirm or configure the step.
- `BLOCKED_BY_ACCESS` — Codex can verify the outcome after owner setup, but not from public data.

## Production-host prerequisite

| Setup item                       | State        | Exact owner action                                                                                                                                                                                                                             | Codex can verify afterward                                                                                                                                |
| -------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intended publisher custom domain | `COMPLETE` | Keep `verdantgrowdiary.com` and `www.verdantgrowdiary.com` attached to the Verdant app. Do not publish a no-op release merely to change this checklist. | Public recheck confirmed the two guides, `version.json`, sitemap, and robots are reachable again. The intercepted analytics identity still needs a browser-control bridge. |

## GA4 owner checklist

| Setup item                                    | State               | Exact owner action                                                                                                                                                                                                                         | Codex can verify afterward                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct Google account and organization       | `INCOMPLETE`        | Sign in to the account that owns Verdant analytics; keep account identity out of repository artifacts.                                                                                                                                     | Confirm the selected account in an owner-approved session.                                                                                                                                                                   |
| Correct GA4 property                          | `INCOMPLETE`        | Select the single existing production property and record its name and numeric property ID in the approved handoff. The numeric property ID **must not be inferred** from the measurement ID.                                              | Confirm the authenticated property identity.                                                                                                                                                                                 |
| Production web data stream                    | `COMPLETE`          | Owner-confirmed stream: `Verdant Grow Diary`; stream URL: `https://verdantgrowdiary.com`; stream ID: `15065867361`; measurement ID: `G-B3QRSZEM9S`. Do not create a duplicate property or stream.                                          | Owner-supplied stream identity is recorded; the current server-rendered guides include the same measurement ID.                                                                                                              |
| Production hostname and deployed tag          | `COMPLETE`          | Keep the canonical host targeting `G-B3QRSZEM9S`; keep preview, Lovable, Vercel, and alternate domains out of the production stream.                                            | Public recheck confirmed the canonical host and static tag. The navigation/runtime collection contract remains separately blocked.                                                                                           |
| Read-only reporting access                    | `INCOMPLETE`        | Grant the designated reporting account property-level `Viewer` access, or provide an owner-approved authenticated reporting session. Do not send credentials.                                                                              | Capture the GA4 baseline.                                                                                                                                                                                                    |
| Enhanced measurement review                   | `BLOCKED_BY_ACCESS` | In the existing production stream, open Enhanced Measurement > Page views > advanced settings and disable **Page changes based on browser history events**. Retain Verdant's explicit SPA `page_view` emitter; do not create a new stream. | Repeat the nine-state direct-load, cross-guide, history, refresh, repeat, and new-tab check with collection blocked locally; require **one intentional `page_view` per navigation and zero duplicate automatic page views**. |
| Internal and developer traffic handling       | `BLOCKED_BY_ACCESS` | Decide how owner/developer verification traffic is identified; test a filter before activating it.                                                                                                                                         | Confirm filter state with a controlled, privacy-safe test.                                                                                                                                                                   |
| Both lighting paths and route-specific titles | `BLOCKED_BY_ACCESS` | In Pages and screens or an Exploration, confirm separate path/title rows for both identities below. Authenticated no-data is `NO_DATA`; unavailable reporting remains `BLOCKED`.                                                           | Record the dated page-specific baseline without inventing zero metrics.                                                                                                                                                      |
| Conversion-measurement gaps documented        | `COMPLETE`          | `docs/v0-loop-event-map.md` records both lighting-guide CTAs as `MISSING`: plain links to `/quick-log` with no guide-specific click event. Do not add or infer an event merely to complete setup.                                          | Confirm only shipped, privacy-safe events are reported.                                                                                                                                                                      |

Google documents the Enhanced Measurement page-view advanced setting as a listener for
`pushState`, `popState`, and `replaceState`. Verdant already owns SPA page views explicitly, so
both sources must not remain enabled together. See
[Enhanced measurement events](https://support.google.com/analytics/answer/9216061) and
[Measure pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views).

| Expected page path                                           | Expected page title                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `/guides/cannabis-grow-light-distance-and-schedule`          | `Cannabis Grow Light Distance, PPFD & DLI Guide \| Verdant`   |
| `/guides/cannabis-light-stress-light-burn-bleaching-or-heat` | `Cannabis Light Stress: Burn, Bleaching, or Heat? \| Verdant` |

## Google Search Console owner checklist

| Setup item                              | State               | Exact owner action                                                                                                                                                                            | Codex can verify afterward                                                                      |
| --------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Correct Google account                  | `INCOMPLETE`        | Sign in to the account that owns or is approved to access Verdant Search Console; keep account identity out of artifacts.                                                                     | Confirm the selected account in an owner-approved session.                                      |
| Correct property type and scope         | `INCOMPLETE`        | Prefer a Domain property for `verdantgrowdiary.com` when DNS is controlled; otherwise use the exact `https://verdantgrowdiary.com/` URL-prefix property. Do not create both without a reason. | Confirm the authenticated property identifier and scope.                                        |
| DNS or property verification            | `INCOMPLETE`        | Complete the owner-approved verification method and retain it account-side. Do not share its token.                                                                                           | Confirm verified status without exposing verification material.                                 |
| Production hostname                     | `BLOCKED_BY_ACCESS` | Confirm the selected property covers the exact HTTPS production host. Public canonicals prove the intended host, not the selected Search Console property.                                    | Confirm the authenticated property covers the production host.                                  |
| Sitemap submission                      | `INCOMPLETE`        | Submit or confirm `https://verdantgrowdiary.com/sitemap.xml`; record its status and last-read/error state.                                                                                    | Verify the authenticated Sitemaps report.                                                       |
| URL Inspection access                   | `BLOCKED_BY_ACCESS` | Confirm both exact lighting URLs can be inspected in the selected property.                                                                                                                   | Capture the page-level authenticated baseline.                                                  |
| Read-only or owner-approved access path | `INCOMPLETE`        | Complete the least-privileged local/GitHub OAuth setup in `docs/seo-monitoring.md`, or provide another approved authenticated session.                                                        | Check configuration names and workflow behavior without viewing credential values.              |
| Index-request policy                    | `INCOMPLETE`        | State whether a single indexing request is authorized for either exact URL after inspection. Sitemap discovery remains the broad mechanism.                                                   | Act only after explicit owner authorization.                                                    |
| Credential and export safety            | `COMPLETE`          | Keep local OAuth material in ignored storage and review any shared export for private data.                                                                                                   | Confirm `.seo/gsc-token.local.json` stays absent from Git and artifacts contain no credentials. |

## Owner handoff sequence

1. In the existing GA4 stream, disable Enhanced Measurement page views based on browser-history
   changes, then complete the property identity, read-only access, and filter decisions. The
   production stream identity is already recorded above.
2. Complete the Search Console property, verification, sitemap, and read-only access decisions.
3. Tell Codex only that access is ready, which approved access path to use, and whether indexing
   requests are authorized. Do not send credential values.
4. Codex reverifies the public release and properties, captures genuine `NO_DATA` or measured values, and starts Day 0
   only after both authenticated baselines exist.

Until then, the access verdict remains **BLOCKED — GA4/GSC OWNER SETUP REQUIRED**. The overall
launch verdict is **NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND**, Day 0 is `UNSET`, and
the four-week clock is `NOT_STARTED`.
