# Vercel cleanup inventory — 2026-10-10

**Status:** inventory only. No code, config, workflow, header, CSP, redirect,
env, package, lockfile, `vercel.json`, or test file was changed on this branch.

**Owner direction (Matthew Cheek, 2026-10-10):** production runs on Cloudflare
Workers at https://verdantgrowdiary.com. Do not investigate the "Vercel Account
is blocked" status (Matthew Cheek, 2026-10-01). This file only sorts the
proposed cleanup. Nothing below was edited.

**Measured on deploy tip** `61c865aa569acac5d906123d65dfb7ad27b71135`.
No `.github/workflows` file matched `vercel`, `vercel.app`, or `VERCEL_`.

Every row needs Matthew's per-item yes. A yes on one row does not approve
another row. This pull request does not apply any of them.

Draft #1971 proposes wording for many documentation files. This branch does
not edit those files and does not retarget or merge #1971.

## Counts

| Section | Items |
| --- | ---: |
| 1. Documentation (docs text only) | 21 |
| 2. Telemetry | 7 |
| 3. Hosting and security | 32 |
| Total proposed cleanup | 60 |

Three historical files are listed under section 1 and are not in the 21.
The proposed change for those three is to leave the dated text.

## 1. Documentation — docs text only (21)

Wording only. No code or config. Scorer-locked: no, for every row in this
section. Each row needs Matthew's per-item yes.

| File | What it references | Proposed change | Risk | Scorer-locked | Owner yes |
| --- | --- | --- | --- | --- | --- |
| `docs/seo/technical-backlog.md` | Public aliases and a `vercel.json` redirect contract | Say production redirects are the Cloudflare host rules. Keep the dated note. | A reader treats `vercel.json` as the live redirect list. | no | Needs Matthew's per-item yes |
| `docs/seo/route-indexation-matrix.md` | `vercel.json` redirects and the `/unsubscribe` `X-Robots-Tag` | Point indexation notes at the live host. Mark old `vercel.json` lines as repository history. | Indexation advice follows a file the current host may not apply. | no | Needs Matthew's per-item yes |
| `docs/seo/analytics-owner-setup-checklist.md` | Instruction to keep Vercel and alternate domains out of the production analytics stream | Keep the exclusion. Name Cloudflare Workers at https://verdantgrowdiary.com as the production host. | The production stream is aimed at the wrong host. | no | Needs Matthew's per-item yes |
| `docs/seo/lighting-launch-verification.md` | Six `vercel.json` redirects measured as HTTP 200 with no `Location` on an older host | Mark that measurement historical. Do not delete it. | A current host check is reported from an old publisher. | no | Needs Matthew's per-item yes |
| `docs/specs/release-topology-specification.md` | Dated Vercel publisher, domain, and deployment reads, including `verdant-grow-diary.vercel.app` | Banner the dated reads as history. State the current publisher only where a later measurement supports it. | Deleting a dated read hides why an old conclusion was withdrawn. | no | Needs Matthew's per-item yes |
| `docs/dependency-lockfile-transition-review-2026-09-25.md` | `vercel.json` pins Bun install and build | Mark the pin as a historical host setting. | The review is read as a current build instruction. | no | Needs Matthew's per-item yes |
| `docs/dependency-lockfile-transition-review-2026-10-03.md` | `vercel.json` still pins `bun install --frozen-lockfile` and `bun run build` | Same as the 2026-09-25 review: historical pin, not a new build change. | Same risk: the note is treated as the live build command. | no | Needs Matthew's per-item yes |
| `docs/dependency-lockfile-transition-review-2026-10-10.md` | Same Bun install and build pin in `vercel.json` | Same historical-pin wording. | Same risk. | no | Needs Matthew's per-item yes |
| `docs/release/hosting-failover-plan.md` | Contingency to wait for Vercel, and `RUNBOOK_VERCEL_PROMOTE.md` | Say the live host is Cloudflare Workers. Keep the old contingency as history. | Someone waits on Vercel instead of the current host. | no | Needs Matthew's per-item yes |
| `docs/release/go-live-checklist-after-402.md` | Go-live sequence for when the Vercel 402 clears | Mark the checklist historical. Do not use it as the current publish path. | A publish is attempted against the blocked Vercel account. | no | Needs Matthew's per-item yes |
| `docs/codebase-map.md` | `vercel.json` redirects such as `/strains` to `/cultivars` | Attribute those redirects to the repository file, not to the live host, unless a live check says otherwise. | The map sends operators to a host file that is not the publisher. | no | Needs Matthew's per-item yes |
| `docs/architecture-contract.md` | `vercel.json` governs only when the measured publisher applies it; `@vercel/analytics` is not publisher evidence | Keep that rule. Name the measured publisher from current evidence, not from the file's presence. | Contract text and the live host disagree. | no | Needs Matthew's per-item yes |
| `docs/agents/PUBLISH_READINESS_2026-09-28.md` | `X-Vercel-Cache` and a Vercel commit status on that date | Leave the 2026-09-28 table as a dated receipt. Do not treat the status as current. | An old cache header is read as today's publish proof. | no | Needs Matthew's per-item yes |
| `docs/agents/CURRENT_STATE.md` | Operating notes that the Vercel "Account is blocked" status is not a required check, plus dated status rows | Keep the don't-investigate instruction. Update only a live publisher sentence, and leave dated rows. | Shift notes and historical receipts get rewritten together. | no | Needs Matthew's per-item yes |
| `docs/agents/RUNBOOK_VERCEL_PROMOTE.md` | Vercel production promotion and rollback | Mark the runbook historical. Publish stays with Matthew. Do not add a new promote command. | An agent runs a Vercel promote or rollback. | no | Needs Matthew's per-item yes |
| `docs/agents/OWNERSHIP.md` | Vercel Deployment Checks and promotion by the Vercel team owner | Say promotion is Matthew's decision on the measured publisher. Do not name a new merge or publish actor. | Ownership text still assigns publish to Vercel. | no | Needs Matthew's per-item yes |
| `docs/testing/ci-suite-consolidation-proposal.md` | Vercel Deployment Checks called `NOT_MEASURED` | Keep the `NOT_MEASURED` label. Do not turn it into a pass or a required check. | A Vercel status is counted among the 35 required checks. | no | Needs Matthew's per-item yes |
| `docs/preview-deployment-verification.md` | Prior Vite/Vercel project settings called historical | Keep the historical label. Do not revive that preview project. | A retired preview project is treated as a smoke target. | no | Needs Matthew's per-item yes |
| `plugins/verdant-claude-mods/README.md` | The guard refuses Vercel deploy, promote, and rollback | Docs text only: keep the refusal description. The guard code is in section 3. | The README says the guard allows a Vercel deploy. | no | Needs Matthew's per-item yes |
| `CLAUDE.md` | Do not assume `vercel.json` is the production publisher | Wording only, and only with the sentinel parity bump if that file changes. | Governance files drift, or `vercel.json` is read as live host config. | no | Needs Matthew's per-item yes |
| `.agents/skills/verdant-exact-sha-review/SKILL.md` | The Vercel "Account is blocked" status is not a required check | Keep that sentence. Do not add the status to the 35 required checks. | A blocked Vercel status is treated as a merge blocker or as proof of production. | no | Needs Matthew's per-item yes |

Left as history, not in the 21. Proposed change: leave the text. Each still
needs Matthew's per-item yes before any edit. Scorer-locked: no.

- `docs/agents/HANDOFF_LOG.md` — dated handoff rows mention Vercel statuses.
- `docs/agents/CURRENT_STATE_ARCHIVE.md` — archived shift notes mention Vercel.
- `docs/audits/architecture-audit-adjudication-2026-08-21.md` — dated audit mentions `vercel.json` and the Vercel AI SDK.

## 2. Telemetry (7)

Consent-gated Vercel Analytics and Speed Insights, the root mount, the
packages, and the tests that pin that wiring. `package.json` is here because
its Vercel hits are those two packages. The lockfiles that pin them are in
section 3.

| File | What it references | Proposed change | Risk | Scorer-locked | Owner yes |
| --- | --- | --- | --- | --- | --- |
| `src/components/ConsentGatedVercelTelemetry.tsx` | Consent-gated Vercel Analytics and Speed Insights | Remove or replace the Vercel telemetry component only after a yes. Do not change consent behavior in this pull request. | Production telemetry loads, or consent stops gating it. | no | Needs Matthew's per-item yes |
| `src/routes/__root.tsx` | Mounts `ConsentGatedVercelAnalytics` | Unmount that component only together with the component change. | The root document gains or loses a production script. | no | Needs Matthew's per-item yes |
| `package.json` | `@vercel/analytics` and `@vercel/speed-insights` | Drop those two dependencies only with the component and the lockfiles. | The app imports a package that is no longer declared, or a package remains with no mount. | no | Needs Matthew's per-item yes |
| `src/test/vercel-telemetry-consent.test.tsx` | Consent gating of the Vercel telemetry component | Update the pin only in the same change as the component. | The consent fence goes green while the mount is wrong, or red while the mount is unchanged. | yes | Needs Matthew's per-item yes |
| `src/test/google-analytics-static-safety.test.ts` | `ConsentGatedVercelTelemetry.tsx` and the `__root.tsx` mount; root must not import `@vercel/analytics` or `@vercel/speed-insights` directly | Update the pin only with the mount. Keep the direct-import refusal. | Analytics can mount outside the consent gate. | yes | Needs Matthew's per-item yes |
| `e2e/settings-account-consent-proof.spec.ts` | `vercel-insights.com`, `vercel-analytics.com`, and `/_vercel/insights` or `/_vercel/speed-insights` | Update the consent proof only with the telemetry change. | A consent proof allows a Vercel script the product no longer loads, or blocks a script it still loads. | yes | Needs Matthew's per-item yes |
| `e2e/core-link-form-census.spec.ts` | `https://va.vercel-scripts.com/v1/script.debug.js` | Update the census expectation only with the telemetry change. | The census treats a Vercel script as a product link, or misses a script that still loads. | yes | Needs Matthew's per-item yes |

## 3. Hosting and security (32)

`vercel.json`, response headers, host routing, build and SEO scripts,
lockfiles, and the guard. Four judge scripts are scorer-locked as well as
host-related. Do not weaken a refusal.

| File | What it references | Proposed change | Risk | Scorer-locked | Owner yes |
| --- | --- | --- | --- | --- | --- |
| `vercel.json` | Redirects, rewrite, headers (nosniff, frame, referrer, HSTS), Bun install and build, git deployment flag | Remove only a rule that the live Cloudflare host already enforces, after a yes. Do not delete the file in this pull request. | Redirects, security headers, or the build change. | no | Needs Matthew's per-item yes |
| `public/_headers` | Header rules ported from `vercel.json` for the Workers assets binding | Change a header only to match a reviewed Cloudflare rule. | Live response headers, including nosniff, frame, referrer, and HSTS. | no | Needs Matthew's per-item yes |
| `src/lib/cloudflareHostRoutingRules.ts` | Cloudflare port of the old host-routing and header rules | Edit a route only with a live host check. Do not copy a stale `vercel.json` rule forward. | Live routing and headers. | no | Needs Matthew's per-item yes |
| `bun.lock` | Locked `@vercel/*` entries for the telemetry packages | Regenerate only in the same change as `package.json`. Lockfiles stay off-limits until that yes. | Install resolves a different tree. | no | Needs Matthew's per-item yes |
| `package-lock.json` | Locked `@vercel/*` entries | Same as `bun.lock`. Compatibility lock only, still off-limits until a yes. | npm and bun locks disagree. | no | Needs Matthew's per-item yes |
| `scripts/stamp-version.mjs` | `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, and dirty excludes for `.vercel/**` and `vercel.json` | Change the stamp only with a build check that `/version.json` still identifies the commit. | The live version stamp is wrong or dirty. | no | Needs Matthew's per-item yes |
| `scripts/lib/serverBundleEntryProbe.mjs` | Nitro output under `.vercel/output/` | Point the probe at the current server bundle only after a build shows that path. | SEO and bundle checks look in the wrong directory. | no | Needs Matthew's per-item yes |
| `scripts/lib/tree-hash.mjs` | Comment that npm consumers use `package-lock.json` | Comment text only, if a yes says the consumer name is stale. | A comment edit moves a pinned tree-hash check. | no | Needs Matthew's per-item yes |
| `scripts/run-postbuild-seo.mjs` | Nitro/Vercel server-bundle comment and path | Comment or path only with the bundle probe. | Postbuild SEO validates the wrong bundle. | yes | Needs Matthew's per-item yes |
| `scripts/validate-og-image-urls.mjs` | Comment naming Vercel as a static host | Comment text only. | The OG check is read as proof a Vercel host serves the images. | yes | Needs Matthew's per-item yes |
| `scripts/audit-subscriber-growth-live-parity.mjs` | Reads `x-vercel-id` as one deployment-id header | Stop treating that header as production identity only after a yes. | The parity probe accepts or rejects the wrong deployment. | yes | Needs Matthew's per-item yes |
| `scripts/assert-vitest-batched-workflow-safety.mjs` | Refuses `vercel deploy` and `vercel --prod` in workflow text | Keep the refusal. Do not weaken it. | A workflow can deploy with the Vercel CLI. | yes | Needs Matthew's per-item yes |
| `scripts/lib/testEstateRules.mjs` | Historical comment naming a Vercel reviewer on #1221 | Leave the historical name unless a yes asks for a comment edit. | A comment edit moves a pinned test-estate check. | no | Needs Matthew's per-item yes |
| `src/lib/build/staticPublicSeoDocuments.ts` | Comment that redirect aliases follow `vercel.json` | Comment text only, and only with the test that pins it. | Public SEO aliases change, or the pin breaks. | no | Needs Matthew's per-item yes |
| `src/integrations/lovable/index.ts` | Comment that Vercel hosts hop `/~oauth/*` via `vercel.json` | Comment text only. Do not change the OAuth hop. | OAuth routing changes because a comment edit is applied as behavior. | no | Needs Matthew's per-item yes |
| `config/dependency-lockfile-transition.json` | Reason string says `vercel.json` pins Bun install and build | Reason text only. Tests pin that string. | The lockfile-transition gate fails or changes meaning. | no | Needs Matthew's per-item yes |
| `plugins/verdant-claude-mods/verdant-guard/hooks/rules.ts` | Refuses the `vercel` CLI and Vercel MCP promote, rollback, and deploy | Keep the refusal. Do not weaken it. | An agent can promote, roll back, or deploy through Vercel. | no | Needs Matthew's per-item yes |
| `src/test/transactional-email-trust-boundary.test.ts` | `vercel.json` headers for `/unsubscribe` | Update the pin only with the header change. | Unsubscribe security headers drift from the test. | yes | Needs Matthew's per-item yes |
| `src/test/server-bundle-entry-probe.test.ts` | `.vercel/output/` Nitro layout | Update the pin only with the probe. | Bundle detection passes against the wrong tree. | yes | Needs Matthew's per-item yes |
| `src/test/public-legacy-host-redirects.test.ts` | Redirects read from `vercel.json` | Update the pin only with the redirect change. | Public aliases move without a matching test. | yes | Needs Matthew's per-item yes |
| `src/test/cursor-sdk-production-isolation-fence.test.ts` | The refused command `vercel deploy` | Keep the refusal pin. | The fence allows a Vercel deploy command. | yes | Needs Matthew's per-item yes |
| `src/test/vercel-oauth-hop-static.test.ts` | `/~oauth/*` hop attributed to `vercel.json` | Update the pin only with the comment or hop it guards. | The OAuth hop test no longer matches the integration. | yes | Needs Matthew's per-item yes |
| `src/test/static-public-seo-documents.test.ts` | Comment and redirect aliases tied to `vercel.json` | Update the pin only with `staticPublicSeoDocuments.ts`. | Public SEO documents and the test disagree. | yes | Needs Matthew's per-item yes |
| `src/test/seo-postbuild-ssr-snapshot-wiring.test.ts` | Postbuild SEO wiring that names the Vercel server bundle | Update the pin only with `run-postbuild-seo.mjs`. | The SEO postbuild gate checks the wrong snapshot. | yes | Needs Matthew's per-item yes |
| `src/test/measure-test-estate-rules.test.ts` | Historical "Codex + Vercel, #1221" label on Playwright lane discovery | Leave the historical label unless a yes asks for a comment edit. | A label edit fails a pinned estate test. | yes | Needs Matthew's per-item yes |
| `src/test/cloudflare-host-routing-rules.test.ts` | Host-routing rules ported from the old Vercel config | Update the pin only with `cloudflareHostRoutingRules.ts`. | Live host routing and the test disagree. | yes | Needs Matthew's per-item yes |
| `src/test/test-execution-manifest.test.ts` | Historical "Codex + Vercel, #1221" label | Leave the historical label unless a yes asks for a comment edit. | A label edit fails the manifest pin. | yes | Needs Matthew's per-item yes |
| `src/test/version-stamp-resilience.test.ts` | `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, and dirty excludes | Update the pin only with `stamp-version.mjs`. | `/version.json` tests no longer match the stamp. | yes | Needs Matthew's per-item yes |
| `src/test/check-bun-lockfile-policy.test.ts` | `vercel.json` must not reintroduce illegal `projectSettings`; Bun pin | Update the pin only with `vercel.json` or the lockfile policy. | The lockfile policy accepts a host setting it currently rejects. | yes | Needs Matthew's per-item yes |
| `src/test/founder-static-social-build-contract.test.ts` | `vercel.json` `cleanUrls` and rewrites | Update the pin only with those `vercel.json` fields. | Static social routes and rewrites change unnoticed. | yes | Needs Matthew's per-item yes |
| `src/test/subscriber-growth-live-parity-script.test.ts` | Fixture header `x-vercel-id` | Update the fixture only with the parity script. | The probe treats a Vercel id as the production deployment. | yes | Needs Matthew's per-item yes |
| `plugins/verdant-claude-mods/verdant-guard/hooks/rules.test.ts` | Refused commands such as `vercel --prod` and `vercel promote` | Keep the refusal pins. | The guard test allows promote, rollback, or deploy. | yes | Needs Matthew's per-item yes |
