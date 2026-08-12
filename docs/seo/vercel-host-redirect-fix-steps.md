# Vercel host-redirect fix steps

**Status:** RUNBOOK (docs only — does not change production)  
**Problem:** Repo `vercel.json` declares permanent redirects for public legacy
aliases, but live `https://verdantgrowdiary.com` returned **HTTP 200 soft SPA
shells** on 2026-08-12 for those same paths (no `Location` header).  
**Evidence:** [`ahrefs-site-audit-reconciliation-2026-08-07.md`](./ahrefs-site-audit-reconciliation-2026-08-07.md) §3.2  
**Contract tests (repo only):** `src/test/public-legacy-host-redirects.test.ts`  
**Does not authorize:** deploy, Cloudflare/Lovable dashboard edits, or DNS changes
without separate explicit owner approval.

---

## 1. What “fixed” means

A path is **fixed** only when **all** of the following pass on production:

| # | Check | Pass criteria |
| --- | --- | --- |
| 1 | Status | First response is a **permanent** redirect: **308** (Vercel default for `"permanent": true`) or **301** (Cloudflare/Bulk Redirects common) — not 200, not client-only |
| 2 | Location | `Location` is the **https** canonical on `verdantgrowdiary.com` |
| 3 | Hop count | One redirect hop (or two max if www→apex is separate and already approved) |
| 4 | Body | Redirect response is not a full SPA HTML shell with `index, follow` |
| 5 | Final | Followed target is the intended public document (e.g. `/welcome`) |
| 6 | Regression | `bunx vitest run src/test/public-legacy-host-redirects.test.ts` still green |

Repo-only green tests are **not** production proof.

### 1.1 Status-code contract (do not confuse)

| Platform / knob | Expected status | Notes |
| --- | --- | --- |
| Vercel `vercel.json` `"permanent": true` | **308** Permanent Redirect | Platform default for permanent in-app redirects (method/body preserved). Search engines treat 308 as a permanent redirect. |
| Vercel `"permanent": false` | **307** Temporary Redirect | Not used for this table. |
| Vercel explicit `"statusCode": 301` | **301** | Only if you opt in; **not** in current repo snippet — leave default 308 unless SEO tooling requires 301. |
| Cloudflare Redirect Rules / Bulk Redirects “permanent” | Usually **301** | Accept 301 as PASS on Cloudflare; still require correct `Location`. |

Probe PASS = **301 or 308** with correct `Location`. FAIL = **200** (current defect) or wrong destination.

---

## 2. Declared redirect table (must stay in sync)

Source of truth in repo: `vercel.json` → `redirects[]`.

| Source | Destination | permanent |
| --- | --- | --- |
| `/strains` | `/cultivars` | true |
| `/strains/:slug` | `/cultivars/:slug` | true |
| `/features` | `/welcome` | true |
| `/demo` | `/welcome` | true |
| `/refunds` | `/refund` | true |
| `/refund-policy` | `/refund` | true |
| `/terms-of-service` | `/terms` | true |
| `/privacy-policy` | `/privacy` | true |

Safe subset pinned by unit test (no `:slug`):

`/features`, `/demo`, `/refunds`, `/refund-policy`, `/terms-of-service`, `/privacy-policy`

Do **not** add host redirects for query-transforming or auth-sensitive aliases
(`/login`→`/auth`, `/billing/:plan`→`/pricing?…`, etc.) without a separate review —
those are router aliases, not this table.

### 2.1 Authoritative `vercel.json` snippet (copy from repo)

```json
{
  "redirects": [
    { "source": "/strains", "destination": "/cultivars", "permanent": true },
    { "source": "/strains/:slug", "destination": "/cultivars/:slug", "permanent": true },
    { "source": "/features", "destination": "/welcome", "permanent": true },
    { "source": "/demo", "destination": "/welcome", "permanent": true },
    { "source": "/refunds", "destination": "/refund", "permanent": true },
    { "source": "/refund-policy", "destination": "/refund", "permanent": true },
    { "source": "/terms-of-service", "destination": "/terms", "permanent": true },
    { "source": "/privacy-policy", "destination": "/privacy", "permanent": true }
  ],
  "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/" }]
}
```

### 2.2 Redirects **before** rewrites (required)

| Rule | Detail |
| --- | --- |
| Vercel evaluation order | **`redirects` are always applied before `rewrites`**, independent of JSON key order. Do not rely on rearranging keys to “fix” soft-200. |
| What breaks | If an alias is **missing** from `redirects` (or the live host ignores `vercel.json`), the SPA **rewrite** serves `/` as HTTP 200 soft shell — the 2026-08-12 failure mode. |
| What not to do | Do not move `/demo`, `/features`, etc. into `rewrites`. Do not replace permanent redirects with client-router navigations. |
| UI overrides | Vercel project UI Redirects/Rewrites must not map these sources to `/` before the file-based redirects apply. |

### 2.3 Snippet notes

- Paths are **path-only** (`/demo`), not full URLs. Vercel issues the redirect on the
  request host (production apex should be `verdantgrowdiary.com`).
- `"permanent": true` → **308** on Vercel (see §1.1). Do not document this as “301 only.”
- The rewrite is the SPA fallback for real app routes; it must **not** absorb the
  sources listed under `redirects`.
- If you edit this table, also update `src/test/public-legacy-host-redirects.test.ts`
  for any new **static** public legacy row (the `:slug` strain rule is outside that
  test’s `it.each` list today).

Full file context (framework/build settings, security headers) remains in repo-root
`vercel.json` — only the redirect/rewrite pair above is required for this defect.

### 2.4 Cloudflare absolute-URL mirror of the same map

When the live edge is Cloudflare (proxy / Redirect Rules / Bulk Redirects), mirror
§2.1 with **absolute HTTPS** destinations. Source paths stay path-shaped; targets
must be full URLs on the production host.

**Static rows (Bulk Redirect list / one rule each):**

| Source URL (or path match) | Target URL | Status |
| --- | --- | --- |
| `https://verdantgrowdiary.com/features` | `https://verdantgrowdiary.com/welcome` | 301 |
| `https://verdantgrowdiary.com/demo` | `https://verdantgrowdiary.com/welcome` | 301 |
| `https://verdantgrowdiary.com/strains` | `https://verdantgrowdiary.com/cultivars` | 301 |
| `https://verdantgrowdiary.com/refunds` | `https://verdantgrowdiary.com/refund` | 301 |
| `https://verdantgrowdiary.com/refund-policy` | `https://verdantgrowdiary.com/refund` | 301 |
| `https://verdantgrowdiary.com/terms-of-service` | `https://verdantgrowdiary.com/terms` | 301 |
| `https://verdantgrowdiary.com/privacy-policy` | `https://verdantgrowdiary.com/privacy` | 301 |

**Dynamic slug row:**

| Match | Target | Status |
| --- | --- | --- |
| `https://verdantgrowdiary.com/strains/*` | `https://verdantgrowdiary.com/cultivars/$1` (or Cloudflare dynamic equivalent) | 301 |

**Bulk Redirect CSV sketch** (import into Cloudflare Bulk Redirects; adjust column
headers to the UI of the day):

```csv
source_url,target_url,status_code,preserve_query_string,subpath_matching,preserve_path_suffix
https://verdantgrowdiary.com/features,https://verdantgrowdiary.com/welcome,301,true,false,false
https://verdantgrowdiary.com/demo,https://verdantgrowdiary.com/welcome,301,true,false,false
https://verdantgrowdiary.com/strains,https://verdantgrowdiary.com/cultivars,301,true,false,false
https://verdantgrowdiary.com/refunds,https://verdantgrowdiary.com/refund,301,true,false,false
https://verdantgrowdiary.com/refund-policy,https://verdantgrowdiary.com/refund,301,true,false,false
https://verdantgrowdiary.com/terms-of-service,https://verdantgrowdiary.com/terms,301,true,false,false
https://verdantgrowdiary.com/privacy-policy,https://verdantgrowdiary.com/privacy,301,true,false,false
```

Add the `/strains/*` dynamic rule separately if the CSV importer does not support
wildcard subpath → `$1` rewrite in your plan.

**Order on Cloudflare:** these Redirect Rules / Bulk Redirects must run **before**
any “serve SPA `/` for unknown paths” Worker or Pages fallback. After changes,
purge cache for the source paths (soft-200 shells may be cached).

Keep repo `vercel.json` §2.1 in sync with this mirror so a future Vercel-capable
deploy does not disagree with Cloudflare.

---

## 3. Likely failure modes (diagnose before editing)

| Hypothesis | How to confirm | Fix direction |
| --- | --- | --- |
| **A. Production is not Vercel** (or not this `vercel.json`) | Dashboard shows Lovable/Cloudflare origin; no Vercel project linked to apex | Apply §2.4 absolute-URL mirror on the **actual** edge, or move DNS to Vercel so §2.1 applies |
| **B. Catch-all rewrite wins because redirects never ran** | Alias missing from live redirect config; 200 SPA shell | Ensure redirects exist on the serving platform **before** SPA fallback (§2.2 / §2.4) |
| **C. Stale / ignored `vercel.json`** | Deploy logs never mention config; residual “retire pre-SSR vercel.json” | Wire Vercel deploys to this file **or** treat Cloudflare/Lovable as SoT and stop claiming `vercel.json` is live |
| **D. CDN cache of old 200 shells** | `cf-cache-status: HIT` on 200; purge restores 301/308 | Purge path cache after rules ship; re-probe with cache-bust |
| **E. Only client router redirects** | 200 HTML + JS navigate later | Not acceptable for SEO — must be **HTTP** 301/308 |

2026-08-12 probes were consistent with **A or C** (Cloudflare in front, soft-200 shell, no `Location`). Treat “edit vercel.json and hope” as insufficient until the **serving platform** is identified.

---

## 4. Fix steps (ordered)

### Step 0 — Freeze scope

1. Work only the table in §2 (plus `/strains/:slug` if you can test a real slug).
2. Do **not** change `/` ↔ `/welcome` policy (see
   [`canonical-home-split-decision.md`](./canonical-home-split-decision.md)).
3. Do **not** add write tools, auth changes, or sitemap rewrites in the same PR.

### Step 1 — Identify who serves host rules

Owner checklist (dashboard access required — agent often `BLOCKED`):

1. Open DNS for `verdantgrowdiary.com` — note apex target (Vercel / Cloudflare / Lovable).
2. Open the production deploy provider for the current `/version.json` publish.
3. Answer in one line: **“Host redirects are applied by: ____.”**
4. If the answer is **not** Vercel, skip Step 2A and use Step 2B/2C.

### Step 2A — If production **is** Vercel

1. Confirm project Root Directory contains this repo’s `vercel.json`.
2. Confirm Production branch is the deploy branch that carries the redirect table
   (`verdant-grow-diary`, not divergent `main`, unless intentionally unified).
3. Confirm **Redirects** in the Vercel project UI match §2.1 (or clear UI overrides
   that shadow the file). Every `source` once, `"permanent": true` (expect **308**).
4. Confirm no conflicting **Rewrites** in the UI that map aliases to `/`. The only
   catch-all should match:
   `"source": "/((?!assets/).*)", "destination": "/"`.
5. Remember: **redirects always run before rewrites** on Vercel (§2.2) — if you still
   see 200 after a clean Production deploy of §2.1, you are not on this project/domain.
6. Trigger a **Production** redeploy of a commit that includes the intended
   `vercel.json`.
7. After deploy, run §5 — expect **308** + correct `Location` (301 also PASS).

### Step 2B — If production is **Cloudflare** (proxy / Pages / Worker)

1. Prefer **Redirect Rules** or **Bulk Redirects** at the zone **before** SPA fallback.
2. Apply the **§2.4 absolute-URL mirror** (301 to full `https://verdantgrowdiary.com/…`
   targets). Do not use path-only destinations if the UI requires absolute URLs.
3. Add the `/strains/*` → `/cultivars/$1` dynamic rule.
4. Purge cache for alias paths; re-probe §5 (expect **301**).
5. Keep repo §2.1 in sync, **or** document Cloudflare as SoT in CURRENT_STATE.

### Step 2C — If production is **Lovable publish** (or similar)

1. Find Lovable / platform **redirects** settings for the published app.
2. Enter the same map as §2.1 / §2.4 as **server** redirects.
3. If the platform **cannot** do HTTP 301/308, stop and escalate — client-only
   router redirects are **not** a fix.
4. Optional medium-term: publish via Vercel so §2.1 becomes authoritative.

### Step 3 — Repo hygiene (after live redirects work)

1. Keep `vercel.json` redirects identical to the live host map (single SoT).
2. Extend `src/test/public-legacy-host-redirects.test.ts` if you add static rows.
3. Optionally add a live probe CI job (owner-approved network).
4. Update `docs/agents/CURRENT_STATE.md` Public surface row `FAIL` → `PASS` only
   with dated probe output (record whether 301 or 308).

### Step 4 — Explicit non-goals

- Do not “fix” soft-200 private app paths with host redirects to `/welcome`.
- Do not noindex `/welcome` or collapse the home split here.
- Do not commit secrets, API tokens, or dashboard session cookies.

---

## 5. Production probe commands (after any publish)

```bash
HOST=https://verdantgrowdiary.com
curl -sS "$HOST/version.json" | tee /tmp/verdant-version.json

probe() {
  path="$1"
  echo "==== $path ===="
  curl -sS -D - -o /dev/null --max-time 15 -A "VerdantRedirectProbe/1.0" "$HOST$path" \
    | tr -d '\r' | grep -iE '^(HTTP/|location:)'
}

probe /demo
probe /features
probe /strains
probe /refunds
probe /refund-policy
probe /terms-of-service
probe /privacy-policy
# optional dynamic:
# probe /strains/oreoz
```

**Pass examples:**

```text
HTTP/2 308
location: https://verdantgrowdiary.com/welcome
```

```text
HTTP/2 301
location: https://verdantgrowdiary.com/welcome
```

**Fail example (current defect):**

```text
HTTP/2 200
```

Follow-through (optional):

```bash
curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" -L --max-redirs 3 \
  -A "VerdantRedirectProbe/1.0" "$HOST/demo"
# expect final URL .../welcome and no error
```

Repo contract (always, does not prove live):

```bash
bunx vitest run src/test/public-legacy-host-redirects.test.ts
```

---

## 6. Acceptance checklist (copy into PR / CURRENT_STATE)

- [ ] Serving platform named (Vercel / Cloudflare / Lovable / other)
- [ ] Rules applied on that platform for every §2 / §2.1 row (or §2.4 mirror)
- [ ] Redirects confirmed **before** SPA rewrite/fallback on that platform
- [ ] §5 probes show **301 or 308** + correct `Location` for each static alias
- [ ] Status code matches platform expectation (Vercel ≈ 308, Cloudflare ≈ 301)
- [ ] `/version.json` stamp recorded next to the probe date
- [ ] Cache purge performed if CDN intermediate
- [ ] Unit test still passes
- [ ] `CURRENT_STATE` Public surface redirect row updated with evidence
- [ ] No change to `/` vs `/welcome` decision

---

## 7. Rollback

| Layer | Rollback |
| --- | --- |
| Vercel file | Revert the `vercel.json` commit; redeploy previous Production |
| Cloudflare rules | Disable/delete the Redirect Rules / Bulk list; purge cache |
| Lovable dashboard | Remove added redirects; republish prior config |
| Docs | Revert this runbook only if the procedure is wrong — keep the defect record in the reconciliation doc |

---

## 8. Owner vs agent split

| Actor | Can do |
| --- | --- |
| Agent | Keep `vercel.json` + tests accurate; write/update this runbook; probe live if egress works; report PASS/FAIL |
| Owner | Dashboard DNS/deploy/redirect UI; choose platform; approve production publish; purge CDN; stamp CURRENT_STATE after live PASS |

Agents must not claim production redirects are fixed from repository tests alone.
