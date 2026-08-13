# Ahrefs Site Audit reconciliation — 2026-08-07

**Auditor:** Claude (Knowledge Library & Product Specification Architect)
**Crawl:** Ahrefs project `10204962`, `2026-08-07T07:14:05Z`, 18 issue types
**Verified against:** deploy branch `verdant-grow-diary` @ `cb98fe4e4` and the live site
**Deliverable type:** audit-only. No application code, schema, RLS, or route changes.

> **Point-in-time note (added 2026-08-12):** every count below is as of the 2026-08-07
> crawl. The sitemap has since grown to **56** URLs — `/tools/blueprint-targets` shipped
> 2026-08-11 via #892 and postdates this audit. Do not "correct" the 55s in this
> document; the living state is `docs/agents/CURRENT_STATE.md`.

---

## Data access status

| Source                            | Status    | Detail                           |
| --------------------------------- | --------- | -------------------------------- |
| Ahrefs `site-audit-issues`        | `BLOCKED` | `{"error": "Insufficient plan"}` |
| Ahrefs `site-audit-projects`      | `BLOCKED` | same                             |
| Ahrefs `site-audit-page-explorer` | `BLOCKED` | same                             |
| Live site (55 sitemap URLs)       | `PASS`    | fetched and parsed directly      |
| GA4                               | `BLOCKED` | owner-gated                      |
| GSC                               | `BLOCKED` | owner-gated                      |

The per-URL issue rows were **not** retrievable. Rather than infer them, the live
documents were measured directly: sitemap fetched, all 55 URLs pulled, each parsed for
metadata, headings, JSON-LD, word count and links; the internal link graph rebuilt from
those links; redirects probed separately on host variants.

**No traffic, impression, click, position, or CTR claim appears in this document.**
Those remain `BLOCKED`.

---

## Corrections to `docs/agents/CURRENT_STATE.md`

**Read the deploy-branch copy, not `main`'s.** An earlier pass of this audit was written
against the `main`-derived shift report and claimed three stale facts. Verified against
the deploy branch, only one of the three holds. The other two are `main`-only artifacts
and are retracted here so they are not carried forward.

| Shift-report claim                            | Verified reality                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sitemap = 51 URLs                             | **Stale — corrected to 55.** Live sitemap matches the deploy branch exactly; deploy/production parity `PASS`. The 51 was accurate when verified 2026-08-02                                                                         |
| Blocker `route_runtime_structured_data: FAIL` | **Retracted — not a deploy-branch claim.** No such blocker exists there; the file records `Lighting route technical SEO: PASS`. It survives only on `main`. Independently, all 55 live pages served parseable JSON-LD, 0 malformed |
| `analytics_identity_status: FAIL` unrecorded  | **Retracted — it is recorded.** The deploy branch carries `GA4 page-view singleton contract: FAIL` with the owner action as blocker 1                                                                                              |

New facts this audit adds to the shift report: the root-route empty shell (blocker 7),
the structured-data triage split (blocker 8), and the four indexable routes absent from
the sitemap.

---

## Reconciliation of all 18 issues

| Ahrefs issue                          |   n | Status                | Verified cause                                                          |
| ------------------------------------- | --: | --------------------- | ----------------------------------------------------------------------- |
| Page has no outgoing links            |   1 | `FAIL` confirmed      | `/` — SSR skeleton, 0 anchors                                           |
| H1 tag missing or empty               |   1 | `FAIL` confirmed      | `/` — same                                                              |
| Low word count                        |   1 | `FAIL` confirmed      | `/` — 7 body words                                                      |
| Meta description too long             |  22 | `FAIL` confirmed      | Exactly 22 pages >160 chars; max 226                                    |
| Meta description too short            |   1 | `FAIL` confirmed      | `/contact` — 88 chars                                                   |
| 3XX redirect                          |   3 | `FAIL` confirmed      | 301 http→https plus 2× 302 www→apex                                     |
| 302 redirect                          |   2 | `FAIL` confirmed      | `http://www.` and `https://www.` are **temporary**                      |
| Redirect chain                        |   1 | `FAIL` confirmed      | `http://www.` → 302 → **`http://`** → 301 → `https://`                  |
| HTTP to HTTPS redirect                |   1 | `PASS` informational  | Correct 301                                                             |
| Indexable page not in sitemap         |   2 | `FAIL` confirmed      | 4 routes ship `index, follow` unsitemapped; Ahrefs found 2              |
| Pages to submit to IndexNow           |  57 | informational         | 55 sitemapped + 2 discovered = 57                                       |
| More than three parameters in URL     |  21 | confirmed (mechanism) | 33 UTM-tagged internal links; 28 are duplicate variants of `/quick-log` |
| Structured data — Google rich results |  21 | **split**             | Partly intentional, partly real. See below                              |
| Structured data — schema.org          |  10 | plausible             | Exactly the 10 cultivar pages (7 JSON-LD blocks each)                   |
| One dofollow incoming internal link   |  24 | confirmed (pattern)   | 16 such pages within the sitemap set                                    |
| One dofollow incoming internal link   |  17 | confirmed (pattern)   | same cluster, second crawl segment                                      |
| Meta description too long (Notice)    |  20 | `NOT_REPRODUCED`      | Ahrefs' second threshold undocumented; >155 = 30, >150 = 39             |
| Slow page                             |   3 | plausible             | 1 page >3 s warm (3.6 s); `/` took 4.3 s cold                           |

---

## Findings, ranked

### 1. Homepage ships an empty shell — highest severity

`https://verdantgrowdiary.com/` serves crawlers a suspended SSR skeleton:

```html
<div role="status" aria-live="polite" ...><span class="sr-only">Loading…</span></div>
```

- 7 body words, **0** `<h1>`, **0** outgoing links, **no** `<link rel="canonical">`
- `<title>` is a bare `Verdant Grow Diary` (18 chars, no proposition)
- **Orphaned**: nothing links to `/`. Navigation points "home" at `/welcome`, which
  carries 52 incoming internal links — the most on the site
- Breadcrumbs agree: `ListItem position 1, "Home" → /welcome`

Every other public route SSRs 250–1500 words correctly. This is one route failing, not a
systemic rendering problem — but it is the canonical root, and it is simultaneously
empty, uncanonicalised and unlinked while a second page performs its role.

**This single page accounts for three of the eighteen issues.**

### 2. Structured data must be split, not bulk-fixed

**Reject — working as designed (56 nodes, every page).** All `SoftwareApplication` nodes
carry `offers` but neither `aggregateRating` nor `review`.
`scripts/validate-jsonld-rich-results.mjs` states the reason inline:

> "SoftwareApplication is not eligible for Google's rich result without offers or
> aggregateRating (**intentional for Verdant — no fake reviews**)"

Remediating this means fabricating ratings, violating the Hard Safety Rule _No fake live
data_. Record it as an accepted exception in `config/seo-allowlist.json` — the
suppression mechanism already exists — so the count stops re-litigating each crawl.

**Fix — genuine defect (17 pages).** Every `Article.image` is
`brand/verdant-logo-512.png`, a 512 px logo rather than article imagery. Google expects
representative images ≥1200 px. The local gate **cannot detect this**: it only checks
whether `image` is _absent_, never whether it is valid. Per-route OG cards already exist
at `/og/{slug}.png` and are the natural target.

This asymmetry is why the build gate is green while Ahrefs reports 21 errors. The gate is
deliberately calibrated below Google's bar in one place and blind in another.

### 3. Internal linking is hub-and-spoke with no lateral edges

- **16 pages have exactly one incoming internal link**
- All 10 cultivar detail pages hang off `/cultivars` alone
- 7 nutrient/comparison guides hang off `/guides` alone
- **`/founder` is a true orphan** — 0 incoming links, yet sitemapped

Highest-leverage durable win, and squarely within the knowledge-graph linking rules.

### 4. `/quick-log` has 28 UTM-duplicated crawlable URLs

33 internal links carry >3 query parameters; 28 are variants of `/quick-log` differing
only by `utm_content`. Canonical resolution should collapse them, but crawl budget is
being spent on 28 variants of one page.

### 5. Four indexable routes sit outside the sitemap

`/glossary`, `/breeder-beta`, `/creator-beta`, `/pheno-comparison` — all return 200 with
`robots: index, follow`, none are sitemapped. Two are **beta** surfaces and one is a
**preview**. This repeats the `/cultivars/*` pattern recorded as known blocker #3:
a page family shipped outside the eligibility gate.

---

## Recommended next tranche

1. **Resolve the `/` route server-side.** Acceptance: `curl https://verdantgrowdiary.com/`
   yields ≥1 `<h1>`, ≥300 words, ≥10 internal links, and a self-referential canonical.
   Decide `/` vs `/welcome` as canonical home; make nav, breadcrumbs and sitemap agree.
2. **Trim 22 meta descriptions to ≤160 chars.** The cultivar template is the main
   offender — shortening one shared string fixes 10 pages at once.
3. **Repoint `Article.image` to the per-route OG card** (17 pages) and extend
   `validate-jsonld-rich-results.mjs` to _validate_ `image`, not merely detect presence.
4. **Allowlist the `SoftwareApplication` exception** with the no-fake-reviews rationale
   recorded alongside it.
5. **Collapse the www redirect to a single 301** direct to `https://verdantgrowdiary.com/`,
   eliminating the plaintext hop.
6. **Adjudicate the 4 unsitemapped indexable routes** — sitemap them or `noindex` them.
   Beta and preview surfaces should not be indexable by default.

Items 3 and 4 belong in the same commit with the reasoning attached, because they are the
pair most likely to be got wrong by a naive "clear the SEO errors" task.

---

## Method (reproducible without Ahrefs)

```bash
curl -sS https://verdantgrowdiary.com/sitemap.xml -o live-sitemap.xml
grep -oE "<loc>[^<]+</loc>" live-sitemap.xml | sed 's/<[^>]*>//g' > live-urls.txt
cat live-urls.txt | xargs -P 6 -I{} ./fetch.sh {}
```

Parsing notes that cost time and are worth recording:

- **Flatten `@graph` before validating JSON-LD.** Block `[0]` on every page is a
  `@graph` container; a flat parse falsely reports a typeless node on all 55 pages.
- **Use `grep -a`.** The SSR responses trip binary-file detection.
- **Probe redirects separately.** All 55 sitemap URLs return 200 with zero redirects, so
  they explain none of the four redirect findings; those live on host variants only.

---

## Unknowns and blocked items

- `BLOCKED` — Ahrefs Site Audit API. Per-URL attribution for the 21/10 structured-data
  rows and the 24/17 link rows is inferred from live measurement, not read from Ahrefs.
- `NOT_REPRODUCED` — the 20-page "meta description too long" Notice threshold.
- `BLOCKED` — GA4/GSC. Nothing here claims traffic impact.
- `NOT_MEASURED` — Core Web Vitals. Timings are single curl samples, not field data.

---

## Verdict

`FAIL` — one severe, well-localised defect; the remainder is maintenance.

The public library is in better shape than the shift report claims: SSR landed, 55/55
URLs return 200, no page is accidentally `noindex`, no JSON-LD is malformed, and
deploy/production parity holds. Against that, the canonical root is not rendering and is
orphaned — serious precisely because everything around it works. Items 1–3 in one slice
should take the issue count from 18 to roughly 8 without touching a page of content.

Two caveats on the record: the shift report needs updating before the next agent trusts
it, and roughly a quarter of the reported "errors" are a Verdant safety decision working
as designed.

---

## Appendix — per-page measurements (live, 2026-08-07)

Bold = meta description exceeds 160 characters.

| Path                                                         |    Desc |  H1 | Words | Out-links | JSON-LD |
| ------------------------------------------------------------ | ------: | --: | ----: | --------: | ------: |
| `/`                                                          |     103 |   0 |     7 |         0 |       2 |
| `/ai-doctor-readiness-check`                                 |     150 |   1 |   273 |         3 |       3 |
| `/contact`                                                   |      88 |   1 |    85 |         5 |       3 |
| `/cultivars`                                                 |     144 |   1 |   583 |        16 |       3 |
| `/cultivars/blue-cookies`                                    | **182** |   1 |  1487 |        10 |       7 |
| `/cultivars/blue-dream`                                      | **167** |   1 |  1469 |        10 |       7 |
| `/cultivars/do-si-dos`                                       | **178** |   1 |  1501 |        10 |       7 |
| `/cultivars/gg4`                                             | **187** |   1 |  1530 |        10 |       7 |
| `/cultivars/jack-herer`                                      | **190** |   1 |  1513 |        10 |       7 |
| `/cultivars/lemon-cherry-gelato`                             | **226** |   1 |  1506 |        10 |       7 |
| `/cultivars/og-kush`                                         | **210** |   1 |  1495 |        10 |       7 |
| `/cultivars/oreoz`                                           |     156 |   1 |  1489 |        10 |       7 |
| `/cultivars/sour-diesel`                                     | **207** |   1 |  1495 |        10 |       7 |
| `/cultivars/sour-stomper`                                    | **189** |   1 |  1526 |        10 |       7 |
| `/feedback`                                                  |     116 |   1 |   203 |         5 |       3 |
| `/founder`                                                   |     140 |   1 |   425 |        10 |       3 |
| `/guides`                                                    |     147 |   1 |  1254 |        35 |       5 |
| `/guides/ac-infinity-data-logging`                           |     146 |   1 |   302 |        10 |       5 |
| `/guides/ai-grow-doctor`                                     | **183** |   1 |   309 |        10 |       5 |
| `/guides/athena-nutrients-grow-diary`                        |     153 |   1 |   535 |        12 |       5 |
| `/guides/bud-rot-prevention-identification`                  | **180** |   1 |   889 |        23 |       5 |
| `/guides/canna-nutrients-grow-diary`                         |     159 |   1 |   535 |        12 |       5 |
| `/guides/cannabis-burnt-crispy-leaf-tips`                    |     151 |   1 |   516 |        18 |       6 |
| `/guides/cannabis-grow-light-distance-and-schedule`          |     153 |   1 |   941 |        24 |       6 |
| `/guides/cannabis-leaf-spots-lesions`                        | **167** |   1 |   503 |        17 |       6 |
| `/guides/cannabis-leaf-symptoms`                             |     143 |   1 |   518 |        18 |       6 |
| `/guides/cannabis-leaves-turning-yellow`                     |     156 |   1 |   512 |        17 |       6 |
| `/guides/cannabis-light-stress-light-burn-bleaching-or-heat` |     152 |   1 |   900 |        25 |       6 |
| `/guides/cannabis-nutrient-schedule`                         | **196** |   1 |   874 |        18 |       5 |
| `/guides/cannabis-plant-care`                                |     153 |   1 |   839 |        21 |       5 |
| `/guides/cronk-nutrients-grow-diary`                         |     151 |   1 |   539 |        16 |       5 |
| `/guides/daily-grow-log-checklist`                           |     156 |   1 |   629 |        18 |       5 |
| `/guides/grow-diary-app`                                     |     158 |   1 |   405 |        10 |       5 |
| `/guides/grow-journal-app-without-account`                   |     153 |   1 |   423 |        11 |       5 |
| `/guides/grow-journal-template`                              | **168** |   1 |   442 |        11 |       5 |
| `/guides/grow-log-app-vs-grow-journal`                       | **183** |   1 |   352 |        10 |       5 |
| `/guides/grow-room-vpd-tracker`                              | **162** |   1 |  1145 |        20 |       5 |
| `/guides/grow-stage-care-guide`                              |     141 |   1 |   755 |         8 |       3 |
| `/guides/house-and-garden-nutrients-grow-diary`              |     151 |   1 |   541 |        12 |       5 |
| `/guides/how-to-start-a-grow-journal`                        | **195** |   1 |   487 |        11 |       5 |
| `/guides/jacks-nutrients-grow-diary`                         | **162** |   1 |   539 |        12 |       5 |
| `/guides/oreoz-vs-gelonade-comparison`                       | **197** |   1 |   967 |        28 |       6 |
| `/guides/plant-watering-log`                                 |     151 |   1 |   417 |        11 |       5 |
| `/guides/sensor-truth-grow-room`                             |     145 |   1 |  1014 |        19 |       5 |
| `/guides/spider-farmer-data-logging`                         |     132 |   1 |   272 |        10 |       5 |
| `/guides/what-to-log-in-a-grow-journal`                      |     136 |   1 |   609 |        18 |       5 |
| `/hardware-integrations`                                     | **166** |   1 |   729 |        13 |       3 |
| `/how-ai-doctor-works`                                       |     159 |   1 |   549 |         7 |       3 |
| `/pricing`                                                   |     130 |   1 |  1008 |         8 |       3 |
| `/privacy`                                                   |     159 |   1 |   696 |         5 |       4 |
| `/quick-log`                                                 | **171** |   1 |   252 |         1 |       5 |
| `/refund`                                                    |     141 |   1 |   229 |         5 |       4 |
| `/terms`                                                     |     148 |   1 |   897 |         5 |       4 |
| `/tools/vpd-calculator`                                      | **174** |   1 |   339 |         4 |       3 |
| `/welcome`                                                   |     160 |   1 |  1019 |        15 |       3 |

### Incoming internal links — pages at or below one

| Incoming | Path                                            | Sole source  |
| -------: | ----------------------------------------------- | ------------ |
|        0 | `/`                                             | ORPHAN       |
|        0 | `/founder`                                      | ORPHAN       |
|        1 | `/cultivars/blue-cookies`                       | `/cultivars` |
|        1 | `/cultivars/blue-dream`                         | `/cultivars` |
|        1 | `/cultivars/do-si-dos`                          | `/cultivars` |
|        1 | `/cultivars/gg4`                                | `/cultivars` |
|        1 | `/cultivars/jack-herer`                         | `/cultivars` |
|        1 | `/cultivars/lemon-cherry-gelato`                | `/cultivars` |
|        1 | `/cultivars/og-kush`                            | `/cultivars` |
|        1 | `/cultivars/sour-diesel`                        | `/cultivars` |
|        1 | `/cultivars/sour-stomper`                       | `/cultivars` |
|        1 | `/guides/athena-nutrients-grow-diary`           | `/guides`    |
|        1 | `/guides/canna-nutrients-grow-diary`            | `/guides`    |
|        1 | `/guides/cronk-nutrients-grow-diary`            | `/guides`    |
|        1 | `/guides/grow-journal-app-without-account`      | `/guides`    |
|        1 | `/guides/house-and-garden-nutrients-grow-diary` | `/guides`    |
|        1 | `/guides/jacks-nutrients-grow-diary`            | `/guides`    |
|        1 | `/guides/oreoz-vs-gelonade-comparison`          | `/guides`    |
