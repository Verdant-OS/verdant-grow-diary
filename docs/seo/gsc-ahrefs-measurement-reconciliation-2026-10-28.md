# GSC-through-Ahrefs measurement reconciliation — 2026-10-28

**Purpose:** settle what the October 27 SEO review's Search Console numbers can and
cannot support before anyone prioritises work on them. This is next action 1 of that
review ("reconcile measurement first"). It is a measurement receipt only. It changes no
code, no SEO markup, no GA4/GSC setting and no Ahrefs project setting.

**Measured by:** Claude Code cloud session, branch `claude/october-27-seo-review-4zbdgy`,
2026-10-28, through the Ahrefs API v3 connector (read-only calls, 0 API units charged).
**Deploy tip at measurement:** `bbc77ae23164847772de6b53ecf18d7735932342` (#2570).

## Results

| Check | Status | Evidence |
| --- | --- | --- |
| Review totals reproduce | `PASS` | `gsc-performance-history`, project `10225273`, web, all devices/countries, 2026-07-29 → 2026-10-28, daily: 61 day-rows, **559 impressions, 4 clicks, 0.72% CTR**. Exactly the review's figures. |
| Data is fresh to 2026-10-27 | `FAIL` | The **last row is 2026-10-01**. No row exists for 2026-10-02 → 2026-10-28, although the request covered those dates. The review's "July 29–October 27" totals are really **July 29–October 1**. |
| Missing October rows are a sync gap, not zero search demand | `NOT_MEASURED` (inference: sync gap) | `inference`: the 61 rows average 9.2 impressions/day and only 4 calendar days before Oct 1 have no row; 27 consecutive empty days is out of pattern. The Ahrefs API does not expose the GSC sync status, so this is not measured. |
| GSC property identity (domain vs URL-prefix, which Google account) | `BLOCKED` | The Ahrefs project and GSC endpoints do not return the linked property. Needs the owner to read Ahrefs → project settings → Google Search Console, or GSC directly. |
| Matching 28-day window | `PASS` (stale window) | Latest 28 days that have data: **2026-09-04 → 2026-10-01: 193 impressions, 3 clicks**. There is no 28-day window ending 2026-10-27 to measure. |
| Page table reconciles with totals | `FAIL` (explained) | `gsc-pages`, same window: 3 pages, **36 impressions** — 6.4% of 559. `gsc-keywords`: 10 queries, **39 impressions**. `inference`: the rest is Google's anonymised-query traffic, which page×query tables omit. Treat page/query rows as a sample, not coverage. |
| Comparison page figures | `PASS` | `/guides/grow-log-app-vs-grow-journal`: 25 impressions, 0 clicks, avg position 45.88, 7 queries. Top query "grow journal software" 12 impressions (pos 44.5); "grow log software" 9 (pos 63.2). Reproduces the review. |
| Which Ahrefs project is authoritative | `PASS` (for this connector) | `management-projects` returns **one** project: `10225273` "Verdantgrowdiary", `verdantgrowdiary.com/`, subdomains, verified, shared, owned by the founder's account. Project `10204962` (the email's project, and the 2026-08-07 audit's project in `docs/seo/ahrefs-site-audit-2026-08-07.md`) is **not visible** to this connector. |
| Site audit, project `10225273` | `PASS` (measured) | `site-audit-projects`: crawl **2026-10-28T01:10:18Z**, Completed, health **99**, 94 URLs, 1 URL with errors, 35 with warnings, 75 with notices. |
| Email's "97 → 100, errors 3 → 0, warnings 33 → 31, 91 → 90 URLs" | `NOT_APPLICABLE` to `10225273` | Different project (`10204962`), and it does not match the `10225273` crawl above (99 / 1 / 35 / 94). Do not combine the two into one trend. |
| Ranking gain | `NOT_MEASURED` | No fresh data after 2026-10-01. |
| Live canonical / robots / sitemap re-check | `BLOCKED` in this session | A local plugin network hook refused outbound `curl`. The review's live checks stay `source claim` here. |

## What this changes in the review's priorities

1. **Find out why October is missing before reading any trend.** Ahrefs' GSC view holds one
   October day: 2026-10-01 (2 impressions, 0 clicks). 2026-10-02 → 2026-10-28 is
   `NOT_MEASURED`, so any October total or trend from this source is too. Why the rows stop
   is also `NOT_MEASURED`; a stalled sync is the likely cause (`inference`), not a confirmed
   one. The owner checks the Search Console connection in Ahrefs project `10225273`, re-syncs
   it if it has stalled, and names the linked property. Until then, a weekly scorecard reports
   October 2 onward as `NOT_MEASURED`, not zero.
2. **Use `10225273` as the Ahrefs project of record** for this connector, unless the owner
   says `10204962` should be. Record the choice once; never mix their audits.
3. **The comparison page carries most of the attributable impressions** (25 of 36; the home
   page has 9 and the Cronk guide 2), at an average position near 46. That supports continuing the existing
   app/comparison work. It does not support a claim that anything ranked better.

## Collision audit (2026-10-28)

| Work | Status at audit | What it means for this review |
| --- | --- | --- |
| #2259 cultivar schema | Draft. Conflict **resolved** today by base merges `f85c08828…` (04:26 UTC) and `7b8e476244496f879fac9a03d7d50c4bb25f9296` (15:49 UTC). Head `7b8e4762`. | The review's "currently conflicts" is out of date. At `7b8e4762`, 23 check runs (including the required `Preflight — edge shared-lib mirror in sync` and `test:legal-seo`) ended `failure` within 1–3 s of starting, and the 32 shard and `Lint, typecheck, test, build` contexts were skipped. A real failure does not finish that fast, so that run proves nothing either way (`inference`). It needs a valid CI run and an independent exact-head review. Its PR body still names `6addad0b` as head; the body is stale. |
| #2543 guide Article JSON-LD | Draft, `dirty` | **Superseded by #2561** (draft, head `f1984e9d0c52dad712cc46b7ae7a3514840da45e`), which carries #2543 plus the beta-page noindex fix from #2549. Coordinate with #2561, not #2543. |
| #2549, #2597 | Draft | Overlapping public-SEO noindex work; #2561 says #2549's hunks become no-ops after either merges. |
| Quick Log structured data | No open PR found by `is:open seo` search | #2259's evidence doc names Quick Log a Claude handoff blocked on owners of `staticPublicSeoDocuments.ts`. Not started here. |

Nothing in this receipt implements or duplicates any of those PRs.

## Reproduce

Ahrefs MCP, read-only:

- `management-projects` (no arguments)
- `site-audit-projects` (no arguments)
- `gsc-performance-history` `{project_id: 10225273, date_from: "2026-07-29", date_to: "2026-10-28", history_grouping: "daily", search_type: "web"}`
- `gsc-pages` and `gsc-keywords` `{project_id: 10225273, date_from: "2026-07-29", date_to: "2026-10-27", search_type: "web", limit: 100}`

Re-run `gsc-performance-history` after the owner checks the connection. The receipt is superseded
when a row dated on or after 2026-10-02 appears.
