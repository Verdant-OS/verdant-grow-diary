# Decision spec — canonical home split (`/` vs `/welcome`)

**Status:** DECIDED (repository + live product behavior)  
**Date:** 2026-08-12  
**Scope:** public acquisition apex only — no auth, schema, or deploy change  
**Evidence date for live probes:** 2026-08-12 (this session)  
**Repo sources:** `src/components/RootEntry.tsx`, `src/pages/Landing.tsx`,
`src/routes/index.tsx`, `docs/architecture.md`, `docs/seo/route-indexation-matrix.md`,
`AGENTS.md` (signed-out root description), `public/sitemap.xml`

Every claim is labeled: `established fact`, `source claim`, `practical observation`,
`inference`, `uncertainty`, or `missing evidence`.

---

## 1. Decision (one sentence)

**Keep both URLs.** Signed-out `/` and `/welcome` intentionally render the same public
Landing component with **distinct self-canonicals** (`/` and `/welcome`). Signed-in `/`
remains the grower Dashboard. Do **not** collapse to a single URL without a separate
product + SEO decision and a redirect plan.

---

## 2. Why the split exists

| URL | Role | Audience | Canonical path |
| --- | --- | --- | --- |
| `/` | Session-aware **apex** | Signed-out → public Landing; signed-in → Dashboard | Landing uses `canonicalPath="/"` |
| `/welcome` | Stable **acquisition / marketing** URL | Always public Landing (signed-out or signed-in may still see marketing chrome) | Landing default `canonicalPath="/welcome"` |

`established fact` from `RootEntry`:

- Apex is session-aware: after hydration, unauthenticated visitors get
  `<Landing canonicalPath="/" />`; authenticated growers get `AppShell` + `Dashboard`.
- There is **no** hard redirect of signed-out `/` → `/welcome`. Acquisition content is
  served **directly** at the apex so crawlers and humans do not need a hop through the
  private shell.

`established fact` from `Landing.tsx`:

- One component powers both surfaces; only `canonicalPath` and JSON-LD `pageUrl` differ.
- Title and description are shared when the Landing body is shown.
- Deep-link recovery still routes through `/welcome?redirectTo=…` when the private shell
  bounces a signed-out visitor (AppShell behavior, not the apex itself).

`established fact` from `src/routes/index.tsx`:

- Route `head()` deliberately **does not** emit a React-owned canonical on `/` (avoids a
  known hoistable-node crash with `usePageSeo`). Client `usePageSeo` owns the canonical
  after paint. First-byte HTML for `/` may therefore lack `<link rel="canonical">`
  until client head runs — measured live on 2026-08-12 (`canonical: null` in the
  initial HTML shell).

---

## 3. Live product truth (2026-08-12 probes)

Host: `https://verdantgrowdiary.com`

| Path | HTTP | Initial title (first HTML) | Initial robots | Initial canonical | Notes |
| --- | --- | --- | --- | --- | --- |
| `/` | 200 | `Verdant Grow Diary` (shell) | `index, follow` | **absent** in first HTML | Client Landing owns SEO after paint for signed-out |
| `/welcome` | 200 | `Grow Diary & Grow Room Tracking App \| Verdant Grow Diary` | `index, follow` | `https://verdantgrowdiary.com/welcome` | Large static-ish document (~52KB HTML) |

`practical observation`: `/welcome` is the stronger first-byte SEO document today. `/`
depends on client head ownership for a correct self-canonical and marketing title.

Both URLs appear in the live sitemap (`/` priority 1.0, `/welcome` priority 0.9) —
`established fact` from `GET /sitemap.xml` (56 `<loc>` entries on 2026-08-12).

---

## 4. Intended SEO policy (locked by this decision)

1. **Both may stay indexable** under current product policy
   (`docs/seo/route-indexation-matrix.md` row for `/` and `/welcome`).
2. **Canonicals must not cross-link.** `/` must self-canonicalize to `/` when Landing
   paints; `/welcome` must self-canonicalize to `/welcome`. Never make `/` point at
   `/welcome` or vice versa without an explicit “single home” decision.
3. **Same visible Landing body is allowed** on both URLs. Duplicate-content risk is
   accepted for now because roles differ (apex vs stable campaign/marketing URL) and
   each has its own self-canonical. Revisit only with GSC evidence of cannibalization
   (`missing evidence` — GSC baseline still `BLOCKED` in operating state).
4. **Signed-in `/` is not an acquisition page.** Dashboard content must never be
   indexable as the public home. Robots + app auth remain the controls; soft-200 SPA
   behavior for private paths is documented separately in the Ahrefs reconciliation.
5. **Campaign and content CTAs may prefer `/welcome`** when a stable, non-session URL
   is needed (email, ads, guide CTAs). The apex remains valid for direct brand entry.

---

## 5. Rejected alternatives (and why)

| Alternative | Verdict | Rationale |
| --- | --- | --- |
| 301 `/welcome` → `/` | **REJECT** (current phase) | Breaks stable marketing URL and deep-link `redirectTo` habits; `/welcome` has stronger first-byte metadata today |
| 301 `/` → `/welcome` for signed-out | **REJECT** (current phase) | Adds a hop; contradicts `RootEntry` “public landing directly at `/`” and `AGENTS.md` |
| Drop `/` from sitemap | **HOLD** | Would silence an intentional apex entry; only reconsider if GSC shows pure thin/soft-shell indexing of `/` with no Landing body |
| Make `/welcome` noindex | **REJECT** | Primary acquisition document with self-canonical and rich static head |

---

## 6. Implementation constraints (do not violate casually)

- Keep `LandingProps.canonicalPath: "/" | "/welcome"` — do not invent a third home path.
- Do not add a route-level React canonical on `/` without re-reading
  `src/test/page-seo-head-ownership.test.tsx` and the crash note in `src/routes/index.tsx`.
- Do not serve signed-in dashboard HTML to anonymous crawlers as the only body for `/`.
- Any future “single home” change needs: (a) Cheek product sign-off, (b) redirect map,
  (c) sitemap + internal-link updates, (d) GSC URL inspection plan.

---

## 7. Open follow-ups (not authorized by this doc)

1. Improve first-byte `/` head parity with `/welcome` (static document / prerender) so
   non-JS crawlers see the marketing title and self-canonical without waiting for
   `usePageSeo` — **implementation slice, not decided here**.
2. Refresh the stale HTML comment in `public/sitemap.xml` that still describes apex as
   authenticated-only (code has moved on; see reconciliation doc).
3. Authenticated GSC comparison of `/` vs `/welcome` impressions once baselines exist.

---

## 8. Calibrated confidence

- Product/runtime split behavior: **high** (`established fact` in source + live 200s).
- SEO outcome of dual indexable homes: **medium** — policy is intentional; ranking
  interaction is `missing evidence` without GSC.
- First-byte `/` SEO quality: **known gap** (shell title, no initial canonical).
