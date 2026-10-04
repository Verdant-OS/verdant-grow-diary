# Hosting failover plan (contingency only)

Status: a contingency map. **Nothing in this document has been executed.** Any host move,
DNS change, project creation or publisher switch is **Matthew's decision** under the
existing publish hold. Agents don't promote, publish, repoint DNS or move hosts. Handoff
item 6. Owner: Grok. Reviewer seat: Critical Mass.

Facts below come from the deploy tip source (`cf929cf7`) and the merged release docs:
`docs/specs/release-topology-specification.md` (#1725) and
`docs/agents/RUNBOOK_VERCEL_PROMOTE.md` (#1780). Anything not read from those is marked
`NOT_MEASURED` or listed as an owner question.

## 1. How the build is host-neutral today

- `vite.config.ts` uses `defineConfig` from `@lovable.dev/vite-tanstack-config`
  (`^2.8.5`), with `tanstackStart.server.entry = "server"` (`src/server.ts`).
- That config adds the Nitro plugin with `defaultPreset: "cloudflare-module"`. Nitro's
  provider auto-detection overrides the default only when it detects a provider. On Vercel
  it emits Build Output API files under `.vercel/output/`. Elsewhere (and always inside a
  Lovable sandbox, where the preset is forced to `cloudflare-module` with
  `dist/`, `dist/server`, `dist/client`) it emits a Cloudflare Workers module.
- `scripts/lib/serverBundleEntryProbe.mjs` already finds the server entry in either layout
  (`.output/server/index.mjs`, `<dist>/server/index.mjs`, `.vercel/output/...`,
  including `wrangler.json` and `nitro.json` locations). Post-build checks don't need a
  rewrite for a Cloudflare target.
- `nitro` is pinned at `3.0.260603-beta`, the first version the Lovable config needs for
  `defaultPreset` (older versions log a warning and may target Node).

## 2. `vercel.json` inventory and equivalents

Counted from `vercel.json`: **9 redirects, 1 rewrite, 3 header rules** (5 + 3 + 1 = 9
headers), plus `cleanUrls: true`, `installCommand`, `buildCommand`, `bunVersion` and
`git.deploymentEnabled` (main/master off).

### Redirects (9)

| #   | Source              | Destination                                                                     | Type      |
| --- | ------------------- | ------------------------------------------------------------------------------- | --------- |
| 1   | `/~oauth/:path*`    | `https://66255e7b-892c-4be5-8686-ab1cfc3666db.lovableproject.com/~oauth/:path*` | temporary |
| 2   | `/strains`          | `/cultivars`                                                                    | permanent |
| 3   | `/strains/:slug`    | `/cultivars/:slug`                                                              | permanent |
| 4   | `/features`         | `/welcome`                                                                      | permanent |
| 5   | `/demo`             | `/welcome`                                                                      | permanent |
| 6   | `/refunds`          | `/refund`                                                                       | permanent |
| 7   | `/refund-policy`    | `/refund`                                                                       | permanent |
| 8   | `/terms-of-service` | `/terms`                                                                        | permanent |
| 9   | `/privacy-policy`   | `/privacy`                                                                      | permanent |

Equivalents (pick one mechanism; don't use both):

- **Nitro `routeRules`** (host-neutral, in source): `{ "/strains": { redirect: { to: "/cultivars", statusCode: 308 } }, "/strains/**": … }`,
  passed through the Lovable config's `nitro: { … }` option. Note that setting any
  `nitro` option must keep `cloudflare-module` behavior. Verify on a preview build before
  relying on it.
- **Cloudflare Workers static assets**: a `_redirects` file in the client output dir
  (`/strains /cultivars 308`, `/strains/:slug /cultivars/:slug 308`, …). Applies only
  to asset-served paths; SSR paths need the Worker or `routeRules`.
- **Redirect 1 (`/~oauth`)** exists only because a non-Lovable host must hop Google SSO to
  the Lovable project host (`src/integrations/lovable/index.ts` comment). On Lovable hosting
  `/~oauth` is expected to be served natively. On plain Cloudflare it must stay a
  temporary redirect to the same Lovable project host. Owner question 3.
- `src/lib/build/staticPublicSeoDocuments.ts` (~line 808) builds noindex documents for the
  legacy redirect sources, so redirect parity is also an SEO contract. After a move,
  `/strains` and `/strains/<slug>` must still answer 308 to `/cultivars...`.

### Rewrite (1)

`/((?!assets/|~oauth).*)` → `/` (everything except assets and `~oauth`). Under TanStack
Start SSR the Nitro server handles routing itself. Whether this rewrite still does anything
on Vercel's Nitro output is **NOT_MEASURED**. On Cloudflare, don't port it: the Worker
serves SSR routes, and a catch-all rewrite to `/` would mask real 404s. Verify on a preview.

### Header rules (3)

| Source         | Headers                                                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/(.*)`        | `X-Content-Type-Options: nosniff`; `X-Frame-Options: SAMEORIGIN`; `Referrer-Policy: strict-origin-when-cross-origin`; `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`; `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()` |
| `/unsubscribe` | `Cache-Control: no-store`; `Referrer-Policy: no-referrer`; `X-Robots-Tag: noindex, nofollow, noarchive`                                                                                                                                                                     |
| `/assets/(.*)` | `Cache-Control: public, max-age=31536000, immutable`                                                                                                                                                                                                                        |

Equivalents: Nitro `routeRules` `headers` (`"/**"`, `"/unsubscribe"`, `"/assets/**"`),
which apply to SSR responses, and/or a Cloudflare `_headers` file for static assets. The
security headers must cover SSR HTML responses, not only static files. Check them on the
target with `curl -sI https://<host>/ /unsubscribe /assets/<file>`. HSTS `preload` is
domain-wide: keep it identical, never weaker. The more specific `/unsubscribe`
`Referrer-Policy: no-referrer` must win over the global one.

### Build settings

- `installCommand: bun install --frozen-lockfile` and `buildCommand: bun run build` stay the
  same on any host that supports Bun 1.x. `cleanUrls` has no SSR equivalent need (routes
  are extensionless).
- `git.deploymentEnabled` (main/master off) is Vercel-only. On a new host, configure the
  production branch as `verdant-grow-diary` only.

## 3. Vercel-specific code and telemetry

- `src/components/ConsentGatedVercelTelemetry.tsx` mounts `@vercel/analytics` and
  `@vercel/speed-insights` (both in `package.json`) only when analytics consent is
  `granted`, and re-checks consent per event (`beforeSend`). Off Vercel, the scripts'
  ingestion endpoints don't exist on the new host. Options are owner decisions: remove the
  two components, or keep them as no-ops. Either way consent gating must be kept for any
  replacement analytics. No new tracking without the same gate.
- `scripts/stamp-version.mjs`: `isVercelBuildEnvironment()` (`VERCEL=1` or `VERCEL_ENV`)
  excludes `.vercel/**` and `vercel.json` from the dirty check, and takes the branch from
  `VERCEL_GIT_COMMIT_REF`. Off Vercel it falls back to git, so `/version.json` keeps working.
  Confirm the new host's builder has a git checkout (not a tarball) so `sha` and `dirty`
  are real.
- `scripts/audit-subscriber-growth-live-parity.mjs` reads `x-deployment-id` or
  `x-vercel-id` response headers for identity. On another host this reads `null`, and the
  audit should rely on `/version.json` instead.
- Runbooks to supersede on a move: `docs/agents/RUNBOOK_VERCEL_PROMOTE.md` (#1780:
  Deployment Checks, Rolling Releases, manual promotion/rollback, "verify every production
  hostname") and the promotion paths in `docs/specs/release-topology-specification.md`
  (#1725: Vercel Rolling Releases as the fifth path). A move needs equivalent
  promote/rollback/verify sections for the new host before go-live.

## 4. DNS (apex and www)

- Recorded topology: the apex `verdantgrowdiary.com` and `www` are bound to the Vercel
  project `verdant-grow-diary` (release-topology spec and promote runbook). In the recorded
  measurement, the DNS records themselves were not re-resolved: **NOT_MEASURED**.
- The topology spec also records a second publisher: the Lovable project `66255e7b-…`
  reports `is_published: true` for the same branch, at a URL the tool didn't return
  (**NOT_MEASURED**). A failover to Lovable hosting may therefore be a domain re-binding,
  not a new deploy. Owner question 1.
- A cutover must move apex and `www` together, keep HSTS identical, and be followed by the
  runbook's per-hostname `/version.json` check. Lower the TTL ahead of time if the registrar
  allows it. The values are owner-side.

## 5. Owner questions (do not guess)

1. Which target, if any: Lovable hosting (re-bind the domain to the already-published
   Lovable project) or Cloudflare Workers directly? Who holds the Cloudflare account?
2. **Is any server-side secret or environment variable set only in the Vercel dashboard?**
   The source read found no SSR `process.env` secret consumer in `src/` other than
   `src/lib/mcp/tools/_supabase.ts`, which is bundled into the `mcp` edge function.
   Dashboard-only variables can't be read from the repo: list them before any move.
3. On the chosen host, does `/~oauth/*` need the redirect to the Lovable project host, or
   is it served natively?
4. Keep or remove `@vercel/analytics` / `@vercel/speed-insights` off Vercel? Is there a
   consent-gated replacement?
5. DNS provider/registrar for `verdantgrowdiary.com` and the current apex/`www` records
   (A/ALIAS/CNAME), plus who can change them.
6. Supabase Auth redirect URLs and OAuth allowed origins: do they list only
   `verdantgrowdiary.com`, or also a Vercel or Lovable host that a move would change?

## 6. What a move would require (not authorized here)

In order, each step an owner action: answer the questions above → port redirects/headers
as `routeRules` on a branch (draft PR, independent review) → preview build on the target
with header/redirect `curl` checks → owner promotion → DNS cutover for apex + `www` →
per-hostname `/version.json` + header verification → run
`docs/release/go-live-checklist-after-402.md` (handoff item 5) against the new host. The
publish hold stays until Matthew lifts it.

## Rollback

Docs only; revert this file. No host, DNS, project or deployment was touched.
