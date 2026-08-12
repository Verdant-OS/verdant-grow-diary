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
| 1 | Status | First response is **301 or 308** (not 200, not client-only) |
| 2 | Location | `Location` is the **https** canonical on `verdantgrowdiary.com` |
| 3 | Hop count | One redirect hop (or two max if www→apex is separate and already approved) |
| 4 | Body | Redirect response is not a full SPA HTML shell with `index, follow` |
| 5 | Final | Followed target is the intended public document (e.g. `/welcome`) |
| 6 | Regression | `bunx vitest run src/test/public-legacy-host-redirects.test.ts` still green |

Repo-only green tests are **not** production proof.

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

Keep this block as the redirects + SPA rewrite contract. On Vercel, **`redirects`
run before `rewrites`** — do not fold aliases into the catch-all rewrite or they
will soft-200 as the SPA shell.

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

Notes:

- Paths are **path-only** (`/demo`), not full URLs. Vercel issues the redirect on the
  request host (production apex should be `verdantgrowdiary.com`).
- `"permanent": true` → **308** on modern Vercel (treat 301 or 308 as PASS in probes).
- The rewrite is the SPA fallback for real app routes; it must **not** absorb the
  sources listed under `redirects`.
- If you edit this table, also update `src/test/public-legacy-host-redirects.test.ts`
  for any new **static** public legacy row (the `:slug` strain rule is outside that
  test’s `it.each` list today).

Full file context (framework/build settings, security headers) remains in repo-root
`vercel.json` — only the redirect/rewrite pair above is required for this defect.

---

## 3. Likely failure modes (diagnose before editing)

| Hypothesis | How to confirm | Fix direction |
| --- | --- | --- |
| **A. Production is not Vercel** (or not this `vercel.json`) | Dashboard shows Lovable/Cloudflare origin; no Vercel project linked to apex | Apply the **same** rules on the **actual** edge (Lovable redirects, Cloudflare Redirect Rules, or move DNS to Vercel) |
| **B. Catch-all rewrite wins before redirects** | `rewrites` SPA fallback runs for alias paths | Ensure platform evaluates **redirects before rewrites**; on Vercel this is default — if not Vercel, order rules explicitly |
| **C. Stale / ignored `vercel.json`** | Deploy logs never mention config; `CURRENT_STATE` residual “retire pre-SSR vercel.json” | Either wire Vercel deploys to this repo file or delete the fiction and document the real host config |
| **D. CDN cache of old 200 shells** | `cf-cache-status: HIT` on 200; purge restores 301 | Purge path cache after rules ship; re-probe with cache-bust |
| **E. Only client router redirects** | 200 HTML + JS navigate later | Not acceptable for SEO — must be **HTTP** redirect |

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
   that shadow the file). Paste/compare against the snippet — every `source` must
   appear exactly once with `"permanent": true`.
4. Confirm no conflicting **Rewrites** in the UI that map aliases to `/` before
   redirects. The only catch-all should match:
   `"source": "/((?!assets/).*)", "destination": "/"`.
5. Trigger a **Production** redeploy of a commit that includes the intended
   `vercel.json` (empty commit is fine only if the file is already correct).
6. After deploy, run §5 probe script — all aliases must 301/308.

### Step 2B — If production is **Cloudflare** (proxy / Pages / Worker)

1. Prefer **Redirect Rules** (or Bulk Redirects) at the zone, **before** the SPA
   worker/pages fallback.
2. Mirror §2.1 as absolute HTTPS destinations, e.g.:
   - `/features` → `https://verdantgrowdiary.com/welcome` (301)
   - `/demo` → `https://verdantgrowdiary.com/welcome` (301)
   - `/strains` → `https://verdantgrowdiary.com/cultivars` (301)
   - `/strains/*` → `https://verdantgrowdiary.com/cultivars/$1` (or platform equivalent)
   - `/refunds` and `/refund-policy` → `https://verdantgrowdiary.com/refund`
   - `/terms-of-service` → `https://verdantgrowdiary.com/terms`
   - `/privacy-policy` → `https://verdantgrowdiary.com/privacy`
3. Place SPA “serve index.html for unknown paths” **after** redirects.
4. Purge cache for the alias paths; re-probe §5.
5. Keep repo `vercel.json` §2.1 in sync so the next Vercel-capable deploy does not
   regress, **or** document Cloudflare as SoT in CURRENT_STATE if Vercel is retired.

### Step 2C — If production is **Lovable publish** (or similar)

1. Find Lovable / platform **redirects** or **custom headers** settings for the
   published app (not only repo files).
2. Enter the same map as §2.1 as **server** redirects (path → path or full HTTPS URL
   per platform UI).
3. If the platform **cannot** do HTTP redirects, stop and escalate — client-only
   router redirects are **not** a fix for this crawl defect.
4. Optional medium-term: publish the static/edge host through Vercel so the
   §2.1 `vercel.json` snippet becomes authoritative (separate infra decision).

### Step 3 — Repo hygiene (after live redirects work)

1. Keep `vercel.json` redirects identical to the live host map (single source of
   truth in git **or** a short note in this file naming the external dashboard as
   SoT — never two silent sources).
2. Extend `src/test/public-legacy-host-redirects.test.ts` if you add static rows.
3. Optionally add a **live probe** script/CI job (owner-approved network) that fails
   when production returns 200 for `/demo` — do not invent credentials.
4. Update `docs/agents/CURRENT_STATE.md` Public surface row from `FAIL` → `PASS`
   only with dated probe output.

### Step 4 — Explicit non-goals

- Do not “fix” soft-200 private app paths with host redirects to `/welcome`.
- Do not noindex `/welcome` or collapse the home split here.
- Do not commit secrets, API tokens, or dashboard session cookies.

---

## 5. Production probe commands (after any publish)

Run from any machine with egress (record date + `/version.json` stamp):

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

**Pass example:**

```text
HTTP/2 308
location: https://verdantgrowdiary.com/welcome
```

(301 is also PASS.)

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
- [ ] Rules applied on that platform for every §2 / §2.1 row
- [ ] §5 probes show 301/308 + correct `Location` for each static alias
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
| Cloudflare rules | Disable/delete the Redirect Rules; purge cache |
| Lovable dashboard | Remove added redirects; republish prior config |
| Docs | Revert this runbook only if the procedure is wrong — keep the defect record in the reconciliation doc |

---

## 8. Owner vs agent split

| Actor | Can do |
| --- | --- |
| Agent | Keep `vercel.json` + tests accurate; write/update this runbook; probe live if egress works; report PASS/FAIL |
| Owner | Dashboard DNS/deploy/redirect UI; choose platform; approve production publish; purge CDN; stamp CURRENT_STATE after live PASS |

Agents must not claim production redirects are fixed from repository tests alone.
