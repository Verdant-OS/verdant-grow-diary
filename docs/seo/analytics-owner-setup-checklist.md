# Lighting analytics owner setup checklist

**Last verified (UTC):** 2026-07-31T19:18:39.6233761Z

**Production host:** `https://verdantgrowdiary.com`

**Operating mode:** MODE A — ACCESS BLOCKED / READINESS WORK

```text
GA4 BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE
GSC BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE
MEASUREMENT DAY 0: UNSET
FOUR-WEEK CLOCK: NOT STARTED
```

This is the owner-facing handoff for the two lighting guides. PR #595 and the PR #597 analytics
repair are live; public technical checks and the GA4 collection contract pass. The remaining work
requires owner-approved access to the existing GA4 and Search Console properties.

Never paste a Google password, OAuth code, client secret, refresh token, access token,
service-account key, verification token, or private export into chat, an issue, a pull request, a
repository file, or an artifact. Keep credential values in the owner-controlled account, approved
local ignored storage, or GitHub Actions secrets. The detailed GSC procedure is in
[`docs/seo-monitoring.md`](../seo-monitoring.md).

## Status key

- `COMPLETE` — current source or production evidence proves the step.
- `INCOMPLETE` — the owner must confirm or configure the step.
- `BLOCKED_BY_ACCESS` — Codex can verify the outcome after owner setup, but not from public data.

## GA4 owner checklist

| Setup item                                    | State               | Exact owner action                                                                                                                                                                              | Codex can verify afterward                                                                                |
| --------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Correct Google account and organization       | `INCOMPLETE`        | Sign in to the account that owns Verdant analytics; keep account identity out of repository artifacts.                                                                                          | Confirm the selected account in an owner-approved session.                                                |
| Correct GA4 property                          | `INCOMPLETE`        | Select the single existing production property and record its name and numeric property ID in the approved handoff. The numeric property ID **must not be inferred** from the measurement ID.   | Confirm the authenticated property identity.                                                              |
| Production web data stream                    | `INCOMPLETE`        | Confirm one web stream for `https://verdantgrowdiary.com` and that it owns deployed measurement ID `G-B3QRSZEM9S`. Do not create a duplicate property or stream just to unblock this checklist. | Compare the authenticated stream, host, and deployed tag.                                                 |
| Production hostname and deployed tag          | `COMPLETE`          | Confirm no preview, Lovable, Vercel, or alternate-domain stream is being treated as production.                                                                                                 | Public source and intercepted payloads already identify the production host and tag.                      |
| Read-only reporting access                    | `INCOMPLETE`        | Grant the designated reporting account property-level `Viewer` access, or provide an owner-approved authenticated reporting session. Do not send credentials.                                   | Capture the GA4 baseline.                                                                                 |
| Enhanced measurement review                   | `BLOCKED_BY_ACCESS` | Review browser-history page-view settings. Do not change them speculatively; retain exactly one SPA page-view owner.                                                                            | Test direct load, cross-guide navigation, back, forward, refresh, and repeated navigation for duplicates. |
| Internal and developer traffic handling       | `BLOCKED_BY_ACCESS` | Decide how owner/developer verification traffic is identified; test a filter before activating it.                                                                                              | Confirm filter state with a controlled, privacy-safe test.                                                |
| Both lighting paths and route-specific titles | `BLOCKED_BY_ACCESS` | In Pages and screens or an Exploration, confirm separate path/title rows for both identities below. Authenticated no-data is `NO_DATA`; unavailable reporting remains `BLOCKED`.                | Record the dated page-specific baseline without inventing zero metrics.                                   |
| Conversion-measurement gaps documented        | `COMPLETE`          | Review `docs/v0-loop-event-map.md`; do not add events merely to complete setup.                                                                                                                 | Confirm only shipped, privacy-safe events are reported.                                                   |

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
| Production hostname                     | `COMPLETE`          | Confirm the selected property covers the exact HTTPS production host.                                                                                                                         | Public canonicals already identify the host.                                                    |
| Sitemap submission                      | `INCOMPLETE`        | Submit or confirm `https://verdantgrowdiary.com/sitemap.xml`; record its status and last-read/error state.                                                                                    | Verify the authenticated Sitemaps report.                                                       |
| URL Inspection access                   | `BLOCKED_BY_ACCESS` | Confirm both exact lighting URLs can be inspected in the selected property.                                                                                                                   | Capture the page-level authenticated baseline.                                                  |
| Read-only or owner-approved access path | `INCOMPLETE`        | Complete the least-privileged local/GitHub OAuth setup in `docs/seo-monitoring.md`, or provide another approved authenticated session.                                                        | Check configuration names and workflow behavior without viewing credential values.              |
| Index-request policy                    | `INCOMPLETE`        | State whether a single indexing request is authorized for either exact URL after inspection. Sitemap discovery remains the broad mechanism.                                                   | Act only after explicit owner authorization.                                                    |
| Credential and export safety            | `COMPLETE`          | Keep local OAuth material in ignored storage and review any shared export for private data.                                                                                                   | Confirm `.seo/gsc-token.local.json` stays absent from Git and artifacts contain no credentials. |

## Owner handoff sequence

1. Complete the GA4 property, stream, read-only access, and filter decisions.
2. Complete the Search Console property, verification, sitemap, and read-only access decisions.
3. Tell Codex only that access is ready, which approved access path to use, and whether indexing
   requests are authorized. Do not send credential values.
4. Codex reverifies the properties, captures genuine `NO_DATA` or measured values, and starts Day 0
   only after both authenticated baselines exist.

Until then, the canonical verdict remains **BLOCKED — GA4/GSC OWNER SETUP REQUIRED**, Day 0 is
`UNSET`, and the four-week clock is `NOT_STARTED`.
