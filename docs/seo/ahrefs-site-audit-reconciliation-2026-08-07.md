# Ahrefs-class site audit reconciliation — public surface

**Document type:** live + repository reconciliation (docs only)  
**Audit window referenced:** 2026-08-07 lighting / SEO gate work in-repo  
**Live re-probe date:** 2026-08-12  
**Production host:** `https://verdantgrowdiary.com`  
**Production identity at re-probe:** `/version.json` reported
`commit: 8fe3c3551b20…`, `buildTime: 2026-08-12T07:02:35.575Z`,
`dirty: true`, `ref: "__orphan__"` (`practical observation` — point-in-time)

> **Honesty about Ahrefs:** this repository does **not** contain an exported
> Ahrefs Site Audit CSV/JSON for 2026-08-07. No row here claims “Ahrefs said X
> with issue ID Y.” Instead this document reconciles the **issue classes** that
> the 2026-08-07 public-surface / lighting audit and the standing SEO matrix
> care about (soft-200 SPA shells, redirect fidelity, index/noindex, sitemap
> parity, analytics darkness) against **what the live host actually returns**
> on 2026-08-12, plus repository intent.

Statuses: `PASS`, `FAIL`, `DRIFT`, `BLOCKED`, `NOT_MEASURED`, `NO_BASELINE`.

---

## 1. Executive verdict

The public surface is **partially healthy**: many acquisition URLs return rich
self-canonical documents; robots and sitemap exist; checkout returns are
correctly `noindex`. The dominant crawl risk is **soft-200 SPA shell behavior**
for private paths and for aliases that `vercel.json` claims are permanent
redirects but **live host currently answers HTTP 200** with a generic shell.
Redirect rules in repo are therefore **not production-proven**. Analytics Day 0
remains **UNSET** after the 2026-08-07 dark-collection finding.

Do not treat a green Ahrefs “pages crawled” count as proof that private paths
are non-indexable: first HTML often says `index, follow` while `robots.txt`
Disallow is the real fence.

---

## 2. Evidence sources

| Source | Role |
| --- | --- |
| Live `GET` probes 2026-08-12 (this session) | Status, title, robots, canonical, body size |
| Live `robots.txt`, `sitemap.xml`, `version.json` | Crawl policy, URL set, release stamp |
| `docs/seo/route-indexation-matrix.md` | Intended index policy |
| `docs/seo/lighting-day0-gate-run-2026-08-07.md` | 2026-08-07 analytics / lighting gate |
| `docs/seo/seo-baseline.md` | Historical baseline (2026-07-30) |
| `vercel.json` redirects | Repository-intended host redirects |
| `src/components/RootEntry.tsx`, `Landing.tsx` | Apex vs `/welcome` behavior |
| `docs/seo/canonical-home-split-decision.md` | Locked home-split decision |

No authenticated GSC or Ahrefs API run was available (`BLOCKED`).

---

## 3. Issue-class reconciliation

### 3.1 Soft-200 / thin shell on private paths

**Intended:** authenticated and operator paths are robot-blocked and target
noindex; they must not become acquisition landings  
(`route-indexation-matrix.md`).

**Live 2026-08-12 (unauthenticated):**

| Path | HTTP | Title (first HTML) | robots meta | canonical |
| --- | --- | --- | --- | --- |
| `/dashboard` | 200 | Verdant Grow Diary | `index, follow` | absent |
| `/tents` | 200 | Verdant Grow Diary | `index, follow` | absent |
| `/plants` | 200 | Verdant Grow Diary | `index, follow` | absent |
| `/doctor` | 200 | Verdant Grow Diary | `index, follow` | absent |
| `/actions` | 200 | Verdant Grow Diary | `index, follow` | absent |
| `/settings` | 200 | Verdant Grow Diary | `index, follow` | absent |
| `/not-a-real-page-xyz` | 200 | Verdant Grow Diary | `index, follow` | absent |

**Verdict:** `DRIFT` / residual risk — HTTP is soft-200 by SPA design; first HTML
advertises `index, follow`. **Mitigation that does work:** `robots.txt` Disallow
prefixes for these paths (`PASS` for robots file presence).  
**Mitigation that does not work alone:** trusting status codes or HTML robots on
the shell.

**Ahrefs-class label:** “3XX/4XX expected but 200”, “duplicate titles”, “pages
without canonical” — expect these on private paths if the crawler ignores
robots.txt.

---

### 3.2 Permanent redirects declared in repo but not observed live

`vercel.json` declares permanent redirects for at least:

- `/features` → `/welcome`
- `/demo` → `/welcome`
- `/strains` → `/cultivars`
- `/terms-of-service` → `/terms`
- `/privacy-policy` → `/privacy`
- `/refunds`, `/refund-policy` → `/refund`

**Live 2026-08-12:** each of `/demo`, `/features`, `/strains`,
`/terms-of-service`, `/privacy-policy` returned **HTTP 200** with no
`Location` header (soft shell), not 301/308.

**Verdict:** `FAIL` against repository intent / `DRIFT` against live host.  
`inference`: production publish path (Lovable/Cloudflare) is **not** applying
this `vercel.json` redirect table, or a catch-all SPA rewrite wins first.  
`CURRENT_STATE` already lists retiring “stale pre-SSR `vercel.json`” as residual
owner work — this live result supports treating redirects as **unverified on
production** until re-probed after a publish that owns host rules.

**Ahrefs-class label:** “page has no outgoing links / thin content” on alias
URLs; missing redirect chains.

---

### 3.3 Indexable acquisition URLs

| Path | HTTP | Self-canonical in first HTML | robots | Verdict |
| --- | --- | --- | --- | --- |
| `/welcome` | 200 | yes → `/welcome` | index, follow | `PASS` |
| `/pricing` | 200 | yes → `/pricing` | index, follow | `PASS` |
| `/founder` | 200 | yes → `/founder` | index, follow | `PASS` |
| `/guides` | 200 | yes → `/guides` | index, follow | `PASS` |
| `/quick-log` | 200 | yes → `/quick-log` | index, follow | `PASS` |
| `/glossary` | 200 | yes → `/glossary` | index, follow | `PASS` |
| `/docs/mcp-api` | 200 | yes → `/docs/mcp-api` | index, follow | `PASS` |
| `/` | 200 | **absent** in first HTML | index, follow | `DRIFT` vs ideal first-byte SEO (see home-split decision) |

---

### 3.4 Transactional noindex

| Path | robots meta | Verdict |
| --- | --- | --- |
| `/checkout/success` | `noindex, follow` | `PASS` |
| `/checkout/cancel` | `noindex, follow` | `PASS` |

---

### 3.5 robots.txt and sitemap

**robots.txt:** `PASS` — HTTP 200; Googlebot/Bingbot/* groups repeat Disallow for
auth and private prefixes; sitemap declared; social bots Allow `/`.

**sitemap.xml:** `PASS` (existence) — HTTP 200; **56** `<loc>` entries on
2026-08-12 (repo `public/sitemap.xml` counted 56 at this tip). Includes both
`/` and `/welcome`. Older CURRENT_STATE rows that say “51” or lighting-day0
“55” are **stale counts** and must not be copied forward without re-count.

**Stale sitemap comment:** `public/sitemap.xml` still claims apex “renders the
authenticated Dashboard shell” as an open decision. **Code truth** is signed-out
Landing at `/` via `RootEntry` (`DRIFT` in comment only; see home-split decision).
Fixing that comment is a one-line docs hygiene follow-up, not a product change.

**Matrix note:** `/glossary`, `/breeder-beta`, `/docs/mcp-api` are indexable and
live with self-canonicals; matrix says some of these are “not in sitemap by
deliberate configuration.” Live sitemap should be re-checked against the matrix
when next editing either file (`NOT_MEASURED` full parity table in this session).

---

### 3.6 Analytics / measurement (2026-08-07 gate, not re-broken here)

From `docs/seo/lighting-day0-gate-run-2026-08-07.md` (`source claim` of that
doc’s measurements):

| Gate | Recorded result |
| --- | --- |
| Non-transmitting nav matrix | RAN — FAIL (dark collection via Array `dataLayer.push`) |
| Enhanced Measurement history | NOT MEASURABLE while dark |
| GA4 / GSC authenticated baselines | BLOCKED |
| Day 0 | **UNSET** |

This reconciliation **does not** re-run the Playwright matrix (`NOT_MEASURED`
for 2026-08-12 collection behavior). Operating state must keep Day 0 unset
until the loader contract and owner EM change are re-proven.

---

### 3.7 Auth / credential surfaces

| Path | robots.txt | First HTML robots | Notes |
| --- | --- | --- | --- |
| `/auth` | Disallow | `index, follow` shell | Rely on robots Disallow; HTML meta is not the fence |
| `/.lovable/oauth/consent` | Disallow `/.lovable/` | SPA shell | Consent protocol page; not acquisition |

---

## 4. What an Ahrefs (or similar) crawl is likely to report

If a commercial crawler **respects robots.txt**:

- Private prefixes should be skipped → fewer false “thin page” tickets.
- Acquisition set should look largely fine (titles, canonicals on `/welcome`+).

If a crawler **does not** fully honor robots.txt (or is configured to ignore it):

- Large cluster of soft-200 titles “Verdant Grow Diary” without canonical.
- Alias URLs (`/demo`, `/features`, …) look like duplicate thin shells.
- Apex `/` may look under-optimized vs `/welcome` on first HTML.

Neither outcome is proof of Search Console indexation (`NO_BASELINE`).

---

## 5. Recommended owner / engineering follow-ups (not authorized here)

Ordered by crawl honesty, not by product ambition:

1. **Prove or replace host redirects** on the actual production edge so
   `vercel.json` (or Lovable equivalent) 301s match live behavior — then
   re-probe `/demo`, `/features`, `/strains*`.
2. **First-byte `/` head parity** with `/welcome` (static head / prerender)
   without reintroducing the React canonical crash on `/`.
3. **Optional:** emit `noindex` on authenticated shell HTML for private routes
   even when soft-200, as defense-in-depth beyond robots.txt (product/engineering
   slice; test carefully).
4. **Analytics:** ship Arguments-style `dataLayer` fix if still dark; re-run
   lighting matrix; owner disables EM history page views; then Day 0.
5. **GSC:** authenticated coverage export to replace this issue-class doc with
   URL-level `PASS`/`FAIL` against Search.

---

## 6. What this document does **not** claim

- It does not claim an Ahrefs subscription was used in this session.
- It does not claim index counts, rankings, or CTR.
- It does not authorize deploy, redirect-host changes, or analytics code edits.
- It does not retire `vercel.json` — it only records that live redirects failed.

---

## 7. Calibrated confidence

| Topic | Confidence |
| --- | --- |
| Live soft-200 + shell meta on private paths | high |
| Live missing permanent redirects for declared aliases | high |
| Live healthy self-canonical on major acquisition URLs | high |
| Root cause of missing redirects (platform vs config) | medium (`inference`) |
| Search indexation impact | low / `NO_BASELINE` |
