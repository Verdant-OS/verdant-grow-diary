# Verdant SEO baseline — Day 0, 2026-08-26 (Gate Zero)

**Audit date:** 2026-08-26 (all fetches 2026-08-26T21:49–21:53 UTC)<br>
**Live release anchor at fetch time:** commit `2cc97c0e91aa` (= deploy-branch tip, PR #1156), `buildTime 2026-08-26T21:44:08.140Z`<br>
**Repository ref:** `origin/verdant-grow-diary` at `2cc97c0e91aae7337289aa6f99bc3864d3c61f23`<br>
**Audit status:** unauthenticated production probe sweep complete; GSC / GA4 / Bing / Ahrefs **NO_BASELINE / BLOCKED**.

This file is the Day-0 successor to [`docs/seo/seo-baseline.md`](seo-baseline.md) (2026-07-30, `1c40c21f2`). That file's snapshot content is preserved unchanged — the only edit to it is the pointer line at its top; this file does not overwrite or restate it.

**Authorization boundary:** this file does **not** authorize a content cohort, a publish, a production SQL apply, or any other production change. It is a dated measurement record and nothing else.

**Day 0 note:** this file does **not** set Day 0 in the growth-calendar sense (`docs/growth/verdant-60-day-growth-execution-calendar.md`, `docs/seo/lighting-four-week-measurement-plan.md`): Day 0 remains `UNSET` in `docs/agents/CURRENT_STATE.md` until the authenticated GA4/GSC baselines exist, which this file records as BLOCKED (condition 6). "Day-0" in this file's title names the sprint's dated technical snapshot, not that calendar anchor.

## Measurement frame

`established fact` about method; every claim below inherits it:

- All fetches were **unauthenticated** HTTPS GETs against `https://verdantgrowdiary.com` — no cookies, no session, no auth header. Redirects were **not** followed, so each recorded status is the raw first response. User agent: `verdant-day0-baseline-probe/2026-08-26`.
- Probe set: `/version.json`, `/sitemap.xml`, `/robots.txt`, all 62 live sitemap `<loc>` URLs, plus three off-sitemap probes (`/login`, `/dashboard`, `/internal/demo-advanced-nutrients-feeding`). `/grows` and `/operator` paths were **not fetched at all** (per the slice order).
- Timestamps: `/version.json` 21:49:48Z; `/sitemap.xml` 21:49:49Z; `/robots.txt` 21:49:50Z; 65-URL sweep 21:51:26–21:51:59Z; header spot-checks ~21:53Z. Two distinct production builds were observed roughly 24 hours apart (below), so every row here is perishable and carries its timestamp. Re-fetch before citing.
- **Word-count method:** strip `<script>`/`<style>`/`<noscript>`, drop everything before `<body>`, strip remaining tags, HTML-unescape, count whitespace-separated tokens. Counts from other methods (including the 2026-08-25 sprint-brief readings) are not comparable digit-for-digit; where they differ, both are kept with their dates.
- Where a 2026-08-25 sprint-brief value and a 2026-08-26 re-fetch differ, **both readings are recorded with timestamps** — neither is discarded. The 2026-08-25 values are `source claim` (GDP/Cheek sprint brief); the 2026-08-26 values are `established fact` from this sweep.
- Raw response bodies were saved in the (ephemeral) audit session workspace; they are not committed. The numbers in this file are the durable record.
- A network miss would have been recorded as `NOT_MEASURED`; none occurred — all 68 fetches returned.

## Identity

| Field         | 2026-08-25 reading (`source claim`, sprint brief; observed ~21:32 UTC build)                                                                                                                                                                                         | 2026-08-26T21:49:48Z re-fetch (`established fact`)                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `shortCommit` | `5e75a3a3ae85`                                                                                                                                                                                                                                                       | `2cc97c0e91aa`                                                          |
| `commit`      | — (short form only in brief)                                                                                                                                                                                                                                         | `2cc97c0e91aae7337289aa6f99bc3864d3c61f23`                              |
| `dirty`       | `false`                                                                                                                                                                                                                                                              | `false`                                                                 |
| `ref`         | `__orphan__`                                                                                                                                                                                                                                                         | `__orphan__`                                                            |
| `buildTime`   | `2026-08-25T21:32:43.924Z`                                                                                                                                                                                                                                           | `2026-08-26T21:44:08.140Z`                                              |
| vs. tip       | Live ≠ tip per the brief; contemporaneous relation **NOT_MEASURED** (the brief, written 2026-08-26, cited the then-current tip #1156 = `2cc97c0e`, while `CURRENT_STATE.md` records `5e75a3a` as deploy tip at 01:30 UTC 2026-08-26); **publish lag NOT COMPUTABLE** | **Live = tip.** Served commit equals `origin/verdant-grow-diary` head — |
|               |                                                                                                                                                                                                                                                                      | publish lag **0 commits at 21:49:48Z**                                  |

`established fact` — production **republished between the two readings**: the build served on 2026-08-26 was stamped 21:44:08Z, roughly five minutes before this sweep began. The brief's 2026-08-25 identity FAIL (live ≠ tip) is a `source claim` whose contemporaneous half is **NOT_MEASURED**: it compared the 2026-08-25 build against the tip as of brief-writing on 2026-08-26, and `docs/agents/CURRENT_STATE.md` (01:30 UTC 2026-08-26 block) records `5e75a3a` — the served SHA — as the deploy tip at that hour, so whether live ≠ tip held at any moment on 2026-08-25 is not established. Either way it does **not** describe the build served at this baseline's timestamps.

`established fact` — the served commit is a GitHub object: `git fetch origin verdant-grow-diary` performed during this audit returned `2cc97c0e91aae7337289aa6f99bc3864d3c61f23` as the current remote head, byte-equal to the served `commit`.

`uncertainty` — `ref: "__orphan__"` persists across both readings (with `dirty: false`, `commitSource: "git"`, `treeHash 53971fb5cd45`). The cause of the orphan ref remains **NOT_MEASURED**, exactly as `docs/agents/CURRENT_STATE.md` records; a commit-identity match is **not** a provenance PASS and is not smoothed into one here.

## Sitemap census

| Check                      | 2026-08-25 reading (`source claim`, sprint brief) | 2026-08-26T21:49:49Z re-fetch (`established fact`)                               |
| -------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Live `<loc>` count         | 61                                                | **62**                                                                           |
| Repo `<loc>` count         | 62                                                | 62 (at `2cc97c0e`)                                                               |
| Live vs repo               | Missing live loc: `/tools/grow-help-toolkit`      | **Byte-identical** (`diff` of live body vs `public/sitemap.xml`: no differences) |
| `lastmod` range (live)     | 2026-07-03 … 2026-08-20                           | 2026-07-03 … **2026-08-26**                                                      |
| `/tools/grow-help-toolkit` | absent from live sitemap                          | present, `lastmod 2026-08-26`                                                    |

`established fact` — the live sitemap served 62 locs, byte-identical to the repo, at 21:49:49Z. `inference` — the 61-vs-62 gap closed with a republish between the two readings; no probe was taken between them, so which republish carried the change is not pinned. Each census stands as recorded at its own timestamp.

## Dual-home: `/` and `/welcome`

All values from the 2026-08-26T21:51Z sweep, `established fact`:

| Field         | `/`                                                         | `/welcome`                                    |
| ------------- | ----------------------------------------------------------- | --------------------------------------------- |
| HTTP status   | 200                                                         | 200                                           |
| Canonical     | self (`https://verdantgrowdiary.com/`)                      | self (`https://verdantgrowdiary.com/welcome`) |
| Meta robots   | `index, follow`                                             | `index, follow`                               |
| `<title>`     | `Grow Diary & Grow Room Tracking App \| Verdant Grow Diary` | **identical to `/`**                          |
| `<h1>`        | `See what changed. Decide what to do next.`                 | **identical to `/`**                          |
| Word count    | 1,047 (this method; brief's 2026-08-25 method read ~930)    | 1,046 (this method; brief read ~930)          |
| Sitemap entry | yes, `lastmod 2026-07-03`                                   | yes, `lastmod 2026-07-03`                     |

**Verdict: FAIL — no single owner.** Two sitemapped, indexable, self-canonical URLs serve the same title, the same `<h1>`, and near-identical body copy. `inference` — combined with the 2026-08-25 brief reading (`source claim`), the condition persisted across the intervening republish(es). `established fact` — `docs/seo/root-route-canonical-home-spec.md` (the `/welcome` → `/` consolidation, Slice 2) exists in this repository; `source claim` (task order) — it is **deliberately not implemented in this slice**.

## Sitemap URL class rollup (62 live URLs)

`established fact`, 2026-08-26T21:51:26–21:51:59Z. Every one of the 62 sitemap URLs returned **HTTP 200, a self-referential canonical, and meta robots `index, follow`**; none carried an `X-Robots-Tag` header on spot-check. Word counts use this file's method.

| Class                         |   URLs | Word-count range | Notes                                                                                                                   |
| ----------------------------- | -----: | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Home pair (`/`, `/welcome`)   |      2 | 1,046–1,047      | Dual-home FAIL — see table above                                                                                        |
| Marketing / product           |      6 | 283–1,052        | `/pricing`, `/founder`, `/hardware-integrations`, `/how-ai-doctor-works`, `/ai-doctor-readiness-check`, `/creator-beta` |
| Tools                         |      3 | 359–1,407        | `/tools/blueprint-targets`, `/tools/grow-help-toolkit` (767 — no longer thin), `/tools/vpd-calculator`                  |
| Guides index                  |      1 | 1,321            | `/guides`                                                                                                               |
| Guide detail                  |     29 | 283–1,158        | thinnest: `/guides/spider-farmer-data-logging` and `/guides/ac-infinity-data-logging` (283, 312)                        |
| Cultivars index               |      1 | 614              | `/cultivars`                                                                                                            |
| Cultivar detail               |     10 | 1,505–1,568      | uniform template depth                                                                                                  |
| Legal / support               |      5 | 98–913           | `/terms`, `/privacy`, `/refund`, `/contact` (98 — thinnest sitemapped URL), `/feedback`                                 |
| Quick Log starter             |      1 | 269              | `/quick-log`                                                                                                            |
| Glossary                      |      1 | 1,962            | `/glossary`                                                                                                             |
| Docs                          |      1 | 2,089            | `/docs/mcp-api` — largest page in the set                                                                               |
| Pheno (showcase + comparison) |      2 | 397–782          | see below                                                                                                               |
| **Total**                     | **62** |                  |                                                                                                                         |

Thin-risk **within** the sitemap set (< 300 words by this method, all still 200/self-canonical/indexable): `/contact` (98), `/feedback` (216), `/refund` (243), `/quick-log` (269), `/ai-doctor-readiness-check` (283), `/guides/spider-farmer-data-logging` (283). `inference` — these are utility/transactional surfaces, not content pages; they are recorded here as a watch item, not adjudicated.

**Pheno pages:** `/pheno-expression-showcase` (782 words) and `/pheno-comparison` (397 words) — sitemapped `lastmod 2026-08-20`, `index, follow`, self-canonical, **INDEXABLE**. Their indexation-policy record stays **OPEN**; per the task order they are **not** noindexed in this PR.

## Extra probes (off-sitemap)

`established fact`, 2026-08-26T21:51Z sweep:

| URL                                         | Status | Canonical | Meta robots     | Words | Class         |
| ------------------------------------------- | ------ | --------- | --------------- | ----- | ------------- |
| `/login`                                    | 200    | none      | `index, follow` | 14    | SOFT_200_THIN |
| `/dashboard`                                | 200    | none      | `index, follow` | 15    | SOFT_200_THIN |
| `/internal/demo-advanced-nutrients-feeding` | 200    | none      | `index, follow` | 22    | SOFT_200_THIN |

- All three are ~8 KB app shells with no canonical tag and an `index, follow` meta — soft-200s. Mitigation as served: live `robots.txt` **Disallows** `/login`, `/dashboard`, and `/internal/` under all three of its crawl groups (Googlebot, Bingbot, `*`). `inference` — a robots Disallow blocks crawling, not indexing-by-reference, so SOFT_200_THIN remains the honest class for these URLs; none carries a `noindex`.
- **`/tools/grow-help-toolkit` changed class between readings.** 2026-08-25 brief: SOFT_200_THIN and absent from the live sitemap (`source claim`). 2026-08-26T21:51Z: 767 words, self-canonical, sitemapped with `lastmod 2026-08-26` (`established fact`). `inference` — the Grow Help Toolkit page shipped in a republish between the two readings; which one is not pinned. Both readings kept.

**P0 private-content leak: PASS on the 65 swept page bodies** (both readings — brief 2026-08-25 `source claim`, and this sweep 2026-08-26). `established fact` for 2026-08-26: an automated scan of the 65 fetched page bodies found zero occurrences of `service_role`, zero JWT-shaped tokens, zero live-secret-class strings, and zero non-`verdantgrowdiary.com` email addresses. The three non-page endpoints (`/version.json`, `/sitemap.xml`, `/robots.txt`) were not run through the scanner; each was read in full during this audit and contains build metadata, URLs, and crawl directives only. Scope bound: this proves nothing about authenticated surfaces; `/grows` and `/operator` were not followed.

## External measurement baseline

| Source                                         | Status                    | Note                                                                                       |
| ---------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| Google Search Console (impressions/coverage)   | **NO_BASELINE / BLOCKED** | No authenticated run exists; no credentials in this session.                               |
| GA4 (organic users, landing pages, conversion) | **NO_BASELINE / BLOCKED** | No owner-provided export or authorized read access.                                        |
| Bing Webmaster Tools                           | **NO_BASELINE / BLOCKED** | Never measured.                                                                            |
| Ahrefs (DR, backlinks, keywords)               | **NO_BASELINE / BLOCKED** | Not re-run for this slice; the 2026-08-07 site-audit doc stands as its own dated snapshot. |

No finding is invented for any of the four. A future authenticated export must be recorded as its own dated snapshot, not backfilled into this file.

## What is not claimed

- No indexation, ranking, impression, click, traffic, or conversion figure — all NO_BASELINE.
- No GSC / GA4 / Bing / Ahrefs finding of any kind.
- No cause for `ref: "__orphan__"` (NOT_MEASURED), and no publisher-mechanism claim.
- No claim that any PASS row survives the next republish — every row is timestamped, and two different production builds were observed within ~24 hours.
- No claim about authenticated surfaces, `/grows`, or `/operator` (not fetched).
- No Lighthouse / CWV measurement (NOT_MEASURED in this slice).
- No claim that this file's word counts equal counts from any other method.
- No migration, database, or payments state claim — those axes live in `docs/agents/CURRENT_STATE.md`.

## Gate Zero conditions 1–6

`missing evidence` — no numbered "Gate Zero" condition list is committed to this repository (a repo-wide search finds none). `source claim` (GDP/Cheek sprint brief, 2026-08-26): "Gate Zero is not all true. Condition 6 is FAIL." The numbering below is therefore **this file's own explicit mapping** of the six axes this baseline measures; if the sprint's canonical numbering differs, the sprint brief controls the numbering and this section re-keys — the measurements themselves stand.

| #   | Condition (as mapped here)                                      | 2026-08-25 (brief, `source claim`)                                                                         | 2026-08-26T21:49–21:53Z (`established fact`)                                                                                                                                                                  |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Live serves the deploy-branch tip, with attributable provenance | FAIL — `ref: "__orphan__"` per brief; the live-≠-tip half is contemporaneously NOT_MEASURED (see Identity) | **FAIL (orphan / no provenance)** — live commit = tip `2cc97c0e91aa` and `dirty: false` at timestamp (lag 0), but `ref: "__orphan__"` persists and its cause is NOT_MEASURED, so the condition does not hold. |
| 2   | Live sitemap = repo sitemap                                     | FAIL (61 vs 62)                                                                                            | **PASS at timestamp** — byte-identical, 62/62                                                                                                                                                                 |
| 3   | Single canonical home                                           | FAIL                                                                                                       | **FAIL** — `/` and `/welcome` dual-home persists                                                                                                                                                              |
| 4   | No indexable thin / soft-200 public surfaces                    | FAIL                                                                                                       | **FAIL** — `/login`, `/dashboard`, `/internal/*` remain SOFT_200_THIN with `index, follow`; toolkit half resolved                                                                                             |
| 5   | No private-content leak on the unauth public surface (P0)       | PASS                                                                                                       | **PASS** (bounded to the swept set)                                                                                                                                                                           |
| 6   | Current dated Day-0 baseline with external analytics anchors    | FAIL (baseline file dated 2026-07-30; GSC/GA4 NO_BASELINE)                                                 | **FAIL** — this file discharges the dated-snapshot half once merged; the GSC/GA4/Bing/Ahrefs half remains NO_BASELINE / BLOCKED, so condition 6 stays FAIL until an owner-authenticated baseline exists.      |

**Gate Zero is not all true** at either reading — consistent with the sprint brief. Conditions 1 (on provenance), 3, 4, and 6 fail as of 2026-08-26T21:53Z; condition 2 passes **only at its timestamp** and is perishable, and condition 5 passes bounded to the swept set.

## Operating rule

This file is the dated comparison point for the Organic Knowledge-to-Diary sprint (see the Day 0 note at the top — it does not set the growth calendar's Day 0). It does **not** authorize a content cohort, a publish, or any production change — those decisions belong to GDP/Cheek, gated on Gate Zero actually holding. Any future measurement that differs from a row here gets its own timestamped entry (in a successor file or `docs/agents/CURRENT_STATE.md`); rows in this file are never edited to match later reality.
