# Vercel code and config removal inventory — 2026-10-10

**Status:** inventory only. No code, config, workflow, header, CSP, redirect,
env, package, lockfile, `vercel.json`, or test file was changed on this branch.

**Owner direction (Matthew Cheek, 2026-10-10):** production runs on Cloudflare
Workers at https://verdantgrowdiary.com. Docs and governance text for that fact
land on draft #1971 (`canopy/constitution-clash-fixes`). This branch is the
separate review of code and config hits. Anything that could change production
behavior stays listed as **needs owner yes**. Scorer-locked files were not
opened for edit.

No hit below was clearly dead. Each one still participates in headers, routing,
build stamping, telemetry, a live safety guard, a lockfile, or a locked check.

## Needs owner yes — do not change without an explicit yes

| File | What the hit is | Risk if changed |
| --- | --- | --- |
| `vercel.json` | Redirects, rewrite, response headers (including nosniff, frame, referrer, HSTS), `bunVersion`, `installCommand`, `buildCommand`, git deployment flag | Headers, CSP-adjacent policy, redirects, and the build. Production behavior. |
| `public/_headers` | Header rules ported from `vercel.json` for the Workers assets binding | Live response headers on Cloudflare Workers. |
| `src/lib/cloudflareHostRoutingRules.ts` | Host routing and header comments that describe the Cloudflare port of the old `vercel.json` rules | Live routing and headers. |
| `src/routes/__root.tsx` | Mounts `ConsentGatedVercelAnalytics` | Removes or changes production telemetry if the import or mount moves. |
| `src/components/ConsentGatedVercelTelemetry.tsx` | Consent-gated Vercel Analytics and Speed Insights | Production telemetry. |
| `package.json` | `@vercel/analytics` and `@vercel/speed-insights` | Dependency surface for that telemetry. Lockfiles are off-limits without owner approval. |
| `bun.lock` | Locked `@vercel/*` package entries | Lockfile. Off-limits. |
| `package-lock.json` | Locked `@vercel/*` package entries | Lockfile. Off-limits. |
| `scripts/stamp-version.mjs` | `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, and `.vercel/**` / `vercel.json` dirty-check excludes | Build stamp and `/version.json`. |
| `scripts/lib/serverBundleEntryProbe.mjs` | Looks for the Vercel Nitro output tree under `.vercel/output/` | Server-bundle detection used by build and SEO checks. |
| `scripts/lib/tree-hash.mjs` | Comment that npm consumers (Vercel/preview) use `package-lock.json` | Version tree-hash inputs. A comment edit can still move a pinned check. |
| `scripts/run-postbuild-seo.mjs` | Comment and path about the Nitro/Vercel server bundle | Postbuild SEO gate. Scorer-locked (`run-` judge) and build-related. |
| `scripts/validate-og-image-urls.mjs` | Comment naming Vercel as one static host | SEO validator. Scorer-locked (`validate` judge). |
| `scripts/audit-subscriber-growth-live-parity.mjs` | Reads `x-vercel-id` as one deployment-id header | Live parity probe. Scorer-locked (`audit` judge). |
| `scripts/assert-vitest-batched-workflow-safety.mjs` | Refuses a `vercel deploy` / `vercel --prod` pattern in workflow text | CI safety judge. Scorer-locked (`assert` judge). |
| `scripts/lib/testEstateRules.mjs` | Historical comment naming a Vercel reviewer on #1221 | Test-estate rules. A comment edit can move pinned checks. |
| `src/lib/build/staticPublicSeoDocuments.ts` | Comment that redirect aliases follow `vercel.json` redirects | Public SEO documents. Comment text is pinned by tests. |
| `src/integrations/lovable/index.ts` | Comment that Vercel hosts hop `/~oauth/*` via `vercel.json` | OAuth hop comment next to live integration code. |
| `config/dependency-lockfile-transition.json` | Reason string says `vercel.json` pins Bun install and build | Gate config. Tests pin the reason text. |
| `plugins/verdant-claude-mods/verdant-guard/hooks/rules.ts` | Refuses the `vercel` CLI and Vercel MCP promote, rollback, and deploy tools | Live safety guard. Not dead. Do not weaken it. |

## Scorer-locked — stopped, not edited

These files match `SCORER_PATH_RULES` (`src/test/`, `e2e/`, or a `*.test.ts` /
`*.spec.ts` file). This branch does not unlock them.

- `e2e/settings-account-consent-proof.spec.ts`
- `e2e/core-link-form-census.spec.ts`
- `plugins/verdant-claude-mods/verdant-guard/hooks/rules.test.ts`
- `src/test/transactional-email-trust-boundary.test.ts`
- `src/test/google-analytics-static-safety.test.ts`
- `src/test/server-bundle-entry-probe.test.ts`
- `src/test/public-legacy-host-redirects.test.ts`
- `src/test/vercel-telemetry-consent.test.tsx`
- `src/test/cursor-sdk-production-isolation-fence.test.ts`
- `src/test/vercel-oauth-hop-static.test.ts`
- `src/test/static-public-seo-documents.test.ts`
- `src/test/seo-postbuild-ssr-snapshot-wiring.test.ts`
- `src/test/measure-test-estate-rules.test.ts`
- `src/test/cloudflare-host-routing-rules.test.ts`
- `src/test/test-execution-manifest.test.ts`
- `src/test/check-bun-lockfile-policy.test.ts`
- `src/test/version-stamp-resilience.test.ts`
- `src/test/founder-static-social-build-contract.test.ts`
- `src/test/subscriber-growth-live-parity-script.test.ts`

Judge scripts in the needs-yes table that are also scorer-locked:
`scripts/run-postbuild-seo.mjs`, `scripts/validate-og-image-urls.mjs`,
`scripts/audit-subscriber-growth-live-parity.mjs`,
`scripts/assert-vitest-batched-workflow-safety.mjs`.

## Not found

No `.github/workflows` file matched `vercel`, `vercel.app`, or `VERCEL_`
on deploy tip `61c865aa569acac5d906123d65dfb7ad27b71135`.
