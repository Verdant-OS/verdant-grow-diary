# Lighting Day 0 gate run — 2026-08-07

**Verdict:** NOT READY — do not set Day 0  
**Timezone:** America/Chicago  
**Runner:** non-transmitting Playwright matrix against production  

## Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| 1. Non-transmitting 9-state navigation matrix | **RAN — FAIL** | 9 states completed; 0 collect requests; 0 transmitted |
| 2. Enhanced Measurement history behavior | **NOT MEASURABLE** | Collection dark; cannot re-verify double-count |
| 3. Authenticated GA4 property / baseline | **BLOCKED** | No reporting access / property ID |
| 4. Authenticated GSC property / baseline | **BLOCKED** | Workflow `31224349241`: OAuth not configured, 0 API attempts |
| 5. Day 0 | **UNSET** | Every prior gate must pass first |

## Production identity at matrix time

- Host: `https://verdantgrowdiary.com`
- Manifest commit: `a21afd5c1e4467334e714e6898ee4cf2ec2f1d0e`
- Build time: `2026-08-07T22:31:05.591Z`
- Measurement ID (tag + owner stream): `G-MCXQ9GVS5H`
- Lighting routes, sitemap (55 URLs, one each), robots: HTTP 200
- Titles match expected distance / stress guide identities

## Matrix method

- Consent pre-granted via `localStorage["verdant.analytics-consent.v1"] = "granted"`
- Collection hosts intercepted for observation; production emitted **zero** collect attempts, so nothing was transmitted
- States: direct deep-link, refresh distance, cross-guide both ways, back, forward, repeated navigation, new tab, refresh stress

## P0 defect found (current release)

**`GA4_GTAG_DATALAYER_ARRAY_PUSH`**

The consent-gated loader in `src/lib/googleAnalyticsLoader.ts` defines:

```ts
function gtag(...args: unknown[]) {
  dataLayer.push(args); // Array — silently ignored by gtag.js
}
```

Production minified form:

```js
function i(...e){r.push(e)}n.gtag=i,i(`js`,new Date),i(`config`,e,{send_page_view:!1})
```

Observed `dataLayer` entry types under consent: `[object Array]` for `js` and `config`.

A/B against the same production host and measurement ID:

| Bootstrap | Collect requests | `en=page_view` |
| --- | ---: | ---: |
| Rest Array push (app) | 0 | 0 |
| Official Arguments push | 2 | 1 |

With Arguments push, the page view carried `dp`/`dl`/`dt` for the distance guide and `tid=G-MCXQ9GVS5H`.

This is a **dark collection** defect — worse than the August 2 Enhanced Measurement double-count. The historical double-count remains unresolved and cannot be re-verified until collection works again.

## Enhanced Measurement

Not re-measurable on this release while the loader is dark. Historical Aug 2 evidence still shows 9 explicit + 5 automatic page views under a working tag. Owner action (disable history-based page views) remains required after the loader fix lands and the matrix is re-run.

## Authenticated baselines

### GA4

- Stream identity (name / URL / stream ID / measurement ID): previously owner-confirmed; tag still loads `G-MCXQ9GVS5H`
- Numeric property ID: unconfirmed
- Reporting access: unavailable in this environment
- Metrics: not captured (`null`, not zero)

### GSC

- Latest SEO workflow: [31224349241](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/31224349241) — success with GSC **SKIPPED**
- OAuth configured: false
- API attempts: 0
- Metrics: not captured (`null`, not zero)

## Day 0

**Not set.** Missing access is not a zero. Day 0 must not be backdated.

Required before Day 0:

1. Ship Arguments-style `dataLayer.push` loader fix and deploy
2. Re-run non-transmitting 9-state matrix → expect exact explicit SPA page views; automatic history count 0 after EM change
3. Owner disables Enhanced Measurement “page changes based on browser history events”
4. Owner provides GA4 Viewer access + property ID; capture page baselines (real values or `NO_DATA`)
5. Owner configures GSC OAuth secrets or session; capture URL inspection / Search baselines
6. Only then stamp Day 0 UTC + America/Chicago and start the four-week clock

## Machine-readable matrix

`artifacts/seo/lighting-collection-matrix-2026-08-07.json`
