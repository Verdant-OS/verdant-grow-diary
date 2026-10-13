# Hosting failover plan (contingency only)

Historical as of 2026-10-10 (Matthew Cheek). Production runs on Cloudflare Workers
at https://verdantgrowdiary.com. This plan describes an earlier Vercel-hosted period.
Do not use it as the current deploy procedure. The Vercel "Account is blocked." status
is an owner-side account issue. Do not investigate it, rerun it, re-trigger it, or
work around it. Do not change deploy settings.

Status: a contingency map. **Nothing in this document has been executed.** Any host move,
DNS change, project creation or publisher switch is **Matthew's decision** under the
existing publish hold. Agents don't promote, publish, repoint DNS or move hosts. Handoff
item 6. Owner: Grok. Reviewer seat: Critical Mass.

Facts below come from the deploy tip source (read at `cf929cf7`; the tip is now `5ea8f1f7`,
and that delta touches no file cited here) and the merged release docs:
`docs/specs/release-topology-specification.md` (#1725) and
`docs/agents/RUNBOOK_VERCEL_PROMOTE.md` (#1780). Anything not read from those is marked
`NOT_MEASURED` or listed as an owner question.

## 0. Trigger criteria (when failover would even be considered)

This doc is a contingency map, not a standing plan. The default is to **wait for Vercel to
clear the 402** (payment expected 2026-10-06). Failover is considered only when the owner
decides it, and only if at least one of these holds:

- The 402 isn't cleared after the expected payment date, and Vercel support gives no
  restoration date the owner accepts.
- Vercel restores the account but production stays down or degraded (wrong SHA, failing
  hostnames) for longer than the owner accepts. The threshold is the owner's to set; this doc
  doesn't pick a number.
- Vercel ends or suspends the account or project.

**Who calls it:** Matthew only. An agent can report that a trigger condition is observed,
with evidence, but never starts a move.

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

Equivalents. On the new host, pick one mechanism and don't use both. While Vercel still
builds the same source (§6 step 2), merged `routeRules` and the `vercel.json` redirects/headers
both apply on Vercel, so the two sets must be **identical** until `vercel.json` is retired:

- **Nitro `routeRules`** (host-neutral, in source): `{ "/strains": { redirect: { to: "/cultivars", statusCode: 308 } }, "/strains/**": … }`,
  passed through the Lovable config's `nitro: { … }` option. Note that setting any
  `nitro` option must keep `cloudflare-module` behavior. Verify it on a preview build on the
  hypothetical new host before relying on it. That preview doesn't exist today, and
  acceptance stays production-only (`docs/production-only-verification-runbook.md`).
- **Cloudflare Workers static assets**: a `_redirects` file in the client output dir
  (`/strains /cultivars 308`, `/strains/:slug /cultivars/:slug 308`, …). Whether it applies
  only to asset-served paths (so SSR paths need the Worker or `routeRules`) is
  **NOT_MEASURED**.
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
serves SSR routes, and a catch-all rewrite to `/` would mask real 404s. Verify on a preview on
the hypothetical new host (not an existing environment). Acceptance stays production-only.

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
  Confirm the new host's builder has a git checkout (not a tarball) so the `commit` and
  `dirty` fields are real (`stamp-version.mjs:276` writes `commit`, and
  `wait-for-deployed-sha` reads `body.commit`).
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
  runbook's per-hostname `/version.json` check. Lower the TTL (if the registrar allows it) at
  least **one old-TTL period before** the cutover, so resolvers have already dropped the old
  long TTL. Keep it low through the whole rollback window, otherwise a rollback waits out the
  old TTL, not the lowered one. The values are owner-side.

## 5. Owner questions (do not guess)

1. Which target, if any: Lovable hosting (re-bind the domain to the already-published
   Lovable project) or Cloudflare Workers directly? Who holds the Cloudflare account?
2. **Is any server-side secret or environment variable set only in the Vercel dashboard?**
   Server-side `process.env` readers in `src/` at `cf929cf7`:
   - `src/integrations/supabase/client.server.ts:36-37` reads `SUPABASE_URL` and
     **`SUPABASE_SERVICE_ROLE_KEY`**. It's a generated service-role admin client ("Load inside
     server handlers") with **no product importer** today (only tests reference it).
   - `src/integrations/supabase/auth-middleware.ts:36-37` reads `SUPABASE_URL` and
     `SUPABASE_PUBLISHABLE_KEY`. It also has no product importer.
   - `src/lib/mcp/tools/_supabase.ts` reads only `SUPABASE_URL` and the publishable/anon key
     (not secrets).

   Any future server function that imports `client.server` needs `SUPABASE_SERVICE_ROLE_KEY`
   set on the new host. That makes this question more pressing, not less. Dashboard-only
   variables can't be read from the repo: list them before any move.

3. On the chosen host, does `/~oauth/*` need the redirect to the Lovable project host, or
   is it served natively?
4. Keep or remove `@vercel/analytics` / `@vercel/speed-insights` off Vercel? Is there a
   consent-gated replacement?
5. DNS provider/registrar for `verdantgrowdiary.com` and the current apex/`www` records
   (A/ALIAS/CNAME), plus who can change them.
6. Supabase Auth redirect URLs and OAuth allowed origins: do they list only
   `verdantgrowdiary.com`, or also a Vercel or Lovable host that a move would change?

## 6. What a move would require (not authorized here)

Each step is an owner action. The publish hold stays until Matthew lifts it. Each rollback
ends with the same verification: `/version.json` (`commit`, `dirty:false`) and `curl -sI`
headers on **both** apex and `www`.

**A rollback to Vercel needs an active, unblocked Vercel account.** That holds only under
§0's second trigger (account restored but production degraded). Under the first trigger
(402 not cleared: deployments are disabled, "Account is blocked.") and the third (account or
project ended/suspended), there is **no Vercel fallback**. Re-promoting is impossible, and
re-pointing DNS or restoring the domain binding returns the site to a 402 or to nothing. In
those cases the fallback is **Matthew's call**, from:

- **fix forward** on the new host,
- **switch to the other candidate**, e.g. re-bind the domain to the already-published Lovable
  publisher (§4, owner question 1), or
- **accept downtime** until the new host or Vercel is fixed.

The "Rollback back to Vercel" column below applies only while the Vercel account is active and
unblocked.

| #   | Step                                                                                                                                                                                                                   | Rollback back to Vercel (active, unblocked account only)                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Answer the owner questions in §5.                                                                                                                                                                                      | none needed                                                                                                                                                                                                                                                                                                                                                   |
| 2   | Port redirects/headers as Nitro `routeRules` on a branch (draft PR, independent review). Merge only on a clean PASS.                                                                                                   | Revert the merged PR with a normal revert PR. Confirm the Vercel build still serves all 9 redirects and the 9 headers (`vercel.json` stays in place, identical to the `routeRules`, so Vercel keeps working). Not checkable while Vercel serves a 402.                                                                                                        |
| 3   | Preview build on the hypothetical new host, with header/redirect `curl` checks. Not an existing environment; acceptance stays production-only.                                                                         | Delete or ignore the preview. Nothing in production changed.                                                                                                                                                                                                                                                                                                  |
| 4   | Owner promotion of the tip on the new host.                                                                                                                                                                            | Before DNS moves, production is still wherever Vercel serves it (under §0 trigger 1 that is a 402, so there's nothing to protect). If DNS has already moved and the account is active, re-promote the known-good deployment on Vercel (`RUNBOOK_VERCEL_PROMOTE.md`, "Rollback — Matthew only") and continue with step 5's rollback.                           |
| 5   | DNS cutover of apex **and** `www` together. Lower the TTL at least one old-TTL period before, and keep it low through the rollback window. Keep HSTS identical.                                                        | Re-point apex and `www` to the Vercel records recorded before the cutover (capture them in §5 Q5 first). Restore the Vercel project's domain binding for both hostnames. Wait out the (lowered) TTL, then run the per-hostname check above. With a blocked or ended account, this returns the site to a 402 or nothing: use the owner fallback above instead. |
| 6   | Supabase Auth redirect URLs / OAuth allowed origins (§5 Q6), only if the move changes a listed host.                                                                                                                   | Restore the exact prior lists (capture them before editing). Re-test Google SSO through `/~oauth` on the production domain.                                                                                                                                                                                                                                   |
| 7   | Per-hostname `/version.json` + header verification on the new host.                                                                                                                                                    | If any hostname fails: run the rollbacks for steps 6, 5 and 4, in that order.                                                                                                                                                                                                                                                                                 |
| 8   | Run `docs/release/go-live-checklist-after-402.md` (handoff item 5, #1895). Its workflows refuse any `E2E_BASE_URL` other than `https://verdantgrowdiary.com`, so this works only after the cutover on the same domain. | Its stop conditions apply. A red result after cutover is a trigger for the step 6 → 5 → 4 rollbacks, on the owner's call.                                                                                                                                                                                                                                     |

#1895 step 0.1 cites the Vercel promote runbook. On a new host, §3's "equivalent
promote/rollback/verify sections" must exist before step 4.

## Rollback (this document)

Docs only; revert this file. No host, DNS, project or deployment was touched. The
operational rollback for each move step is in the §6 table.
