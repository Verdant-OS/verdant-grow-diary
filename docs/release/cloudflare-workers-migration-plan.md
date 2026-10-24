# Cloudflare Workers migration plan

Status: **Phase 1 draft; no runtime change or deployment.** Matthew's current
migration request selects Workers and controls conflicts with the older
production-only and wait-for-Vercel defaults. Supabase stays exactly as it is.
Operational instructions below are proposed, not test-pinned implementation.

## Evidence and scope

- Repository: `Verdant-OS/verdant-grow-diary`; authoritative deploy/default branch:
  `verdant-grow-diary`; source inspected at
  `a980489ad5188e36eba89461117c2b60fc10f927`.
- Owner: Codex. Critical Mass reviews docs/config/CI; Durban Poison reviews
  app/runtime changes. Grok 91 owns protected merge-queue integration.
- All slices open as drafts. Every changed head needs full independent review:
  clean **PASS with zero P1/P2**, full head SHA, and **35/35 required checks
  SUCCESS at that SHA**. Missing/skipped/pending/failed checks do not count.
  Queue checks must also pass. No admin/API bypass, force-push or `--no-verify`.
- On 2026-10-04 at 6:09 PM CT (23:09 UTC), HTTPS GETs to apex and `www`
  returned 402 and `x-vercel-error: DEPLOYMENT_DISABLED`. The environment's
  outbound proxy reported `server: envoy`; it cannot establish the origin's
  server header. Final Cloudflare-header proof needs a direct vantage point.
- Google Public DNS at the same time confirmed Squarespace NS, apex
  `216.150.1.1`, `www` CNAME `526d96436dc18b4c.vercel-dns-017.com`, and the five
  MX records below. Web/MX TTLs were 14400; NS TTL was 21600. Registrar login,
  complete zone export, TXT values and DNSSEC state remain owner-confirmed facts
  from the request, not a complete independently measured zone inventory.
- Vercel's read-only env metadata listed three production names, all in the
  repository; no values were printed/decrypted. See inventory below.
- Actions check run `111511984438`, on another open PR, explicitly says:
  “The job was not started because your account is locked due to a billing
  issue.” Required CI for this draft remains BLOCKED until the lock clears.
  Branch-protection REST read returned 403; the requested 35-context contract is
  retained, not claimed as independently enumerated from that endpoint.
- Read [#1896](https://github.com/Verdant-OS/verdant-grow-diary/pull/1896)
  (`docs/release/hosting-failover-plan.md`) and the proposed #1895 go-live doc at
  `c380a4397507b7cfb755af1df9a596232f245f36`. #1896 is merged; #1895 is open.
  Their Supabase publish/migration steps are outside this migration and must
  **not** be executed as part of it. A hosting move does not prove backend release.
- Requested `/workspace/shared/handoffs/cloudflare-migration-readonly-audit.md`,
  `/workspace/shared/handoffs/vercel-exit-audit.md`, and the shared
  `context/fleet-locks.md` are absent here. Matthew could not identify an
  alternate location. Audit-dependent claims are NOT_MEASURED. Reconcile any
  later-supplied audits/locks before implementation; use the stricter known fence.
- Collision snapshot: 48 open PRs checked. #1895 owns its go-live doc;
  #1892 owns rollback-decision work. Neither file is edited here. #1866 and
  #1830 edit `docs/agents/HANDOFF_LOG.md`; do not compete on that path. This
  isolated new file carries the task block until its holder can add the link.

No `supabase/`, SQL/migrations, RLS, auth implementation/configuration, Edge
Functions, lockfiles, device control, Action Queue or production DB work is in
scope. Existing backend problems are reported separately, not repaired here.
The explicit request authorizes only fixture-owned smoke writes at the smoke gates.

## Exact slices, owners, gates and rollback

| Slice                                  | Closed scope / owner                                                                                                                                                                                                                | Measurable gate                                                                                                                                                                   | Rollback                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| PR 1, Phase 1                          | Codex: this plan only                                                                                                                                                                                                               | Critical Mass exact-head clean PASS; 35/35; protected queue merge                                                                                                                 | Reviewed revert of this document; no infrastructure effect                                                                        |
| PR 2A, Phase 2 configuration           | Codex: new `wrangler.jsonc`, `vite.config.ts`, host-neutral redirect/header policy and focused resolved-config/HTTP parity tests; existing `vercel.json` remains a reference                                                        | Explicit Nitro `cloudflare-module` output; Workers Assets; local Wrangler route/asset/header/404 matrix and limit evidence below; Critical Mass review                            | Reviewed config revert; no publish; preserve Vercel reference                                                                     |
| PR 2B, only if needed                  | Codex: smallest runtime compatibility fix and targeted tests, exact file list declared after PR 2A audit; no auth/Supabase changes                                                                                                  | Durban Poison exact-head PASS; same Wrangler route and resource gates                                                                                                             | Reviewed runtime revert; if limits still fail, stop Workers and propose Render                                                    |
| PR 3A, Phase 3 runtime coupling        | Codex: `ConsentGatedVercelTelemetry.tsx`, its caller and focused tests; remove Vercel tracking requests without adding replacement tracking                                                                                         | No Vercel telemetry/ingestion calls in browser network; existing consent behavior retained; Durban Poison review                                                                  | Reviewed revert; do not deploy Vercel components to Workers                                                                       |
| PR 3B, Phase 3 config/docs/CI coupling | Codex: retire `vercel.json`; Vercel reads in `scripts/stamp-version.mjs`; provider-dependent identity read in `scripts/audit-subscriber-growth-live-parity.mjs`; relevant tests, active scripts/CI/runbooks discovered by inventory | Git-based `/version.json` SHA/dirty identity preserved; active deployment path has no Vercel assumptions/status requirement; 35 required contexts unchanged; Critical Mass review | Reviewed revert restores config/scripts; historical receipts preserved, not rewritten                                             |
| Phase 4                                | Codex prepares pinned deployment packet; manual deploy only after Matthew grants scoped access and approves publish; Matthew configures Access/domain/settings                                                                      | Private hostname, valid TLS and signed-in smoke matrix PASS on exact merged SHA; Workers limits PASS                                                                              | Withdraw staging route via Matthew; preserve production DNS                                                                       |
| Phase 5                                | Matthew: zone preparation/delegation and later apex/www Custom Domain cutover, per numbered steps                                                                                                                                   | Complete DNS parity and mail preservation; active HTTPS for both; reviewed merged artifact ready; signed-in staging PASS                                                          | Matthew restores Squarespace NS; this restores the old 402 while Vercel is blocked, not service                                   |
| Phase 6                                | Codex: direct public and fixture-owned production verification                                                                                                                                                                      | Both hosts 200, valid TLS, Cloudflare headers, HSTS; deployed SHA clean and 35/35; signed-in smoke PASS; no Vercel response/browser headers or requests                           | Stop receipt; Matthew selects reviewed Workers rollback/fix-forward, approved Render fallback, or downtime; no automatic rollback |
| Phase 7                                | Matthew: disconnect Vercel publisher and CI provider; renewal decision                                                                                                                                                              | Integration readback disconnected; no Vercel deployment trigger; final receipt complete                                                                                           | Do not reconnect auto-deploy; any reactivation is a new owner decision                                                            |

PR 2A/2B and 3A/3B split the requested PR 2/3 phases so app/runtime and
config/docs/CI receive their respective reviews. Start each child only after its
predecessor gate. A mixed runtime/config change must receive both review lanes.
No extra slice starts solely to work around Actions billing. Any expanded file
list is collision-checked and declared before edits. Package removals that need
lockfile edits stay deferred pending Matthew naming that action; inactive SDK
packages alone do not create a deploy path. Any backend/auth gap stops its gate.

## Workers build and runtime acceptance

Use the existing Lovable preset (`^2.8.5`) and pinned Nitro
`3.0.260603-beta`; do not duplicate TanStack/Vite plugins. Explicitly select
`cloudflare-module` so provider auto-detection cannot silently emit Vercel output.
Declare an exact compatibility date in PR 2A; add only proven compatibility flags.
The final Wrangler `main`, assets directory and binding must match actual build
output, not a guessed path. Expect `dist/server` and `dist/client`; verify first.

Configuration must have `workers_dev = false`, `preview_urls = false`, and
`limits.cpu_ms = 50` (proposed ceiling). Workers Builds, Git auto-deploys, deploy
hooks and push-triggered publishing are disabled. Keep clean checkout/build
provenance and asset digest with the artifact. Manual deploys consume an exact
reviewed, merged commit and recorded Wrangler/toolchain versions. No mutable
branch name or stale artifact substitutes for that SHA.

Assets must not shadow SSR with generated per-route HTML or an index fallback.
Use worker-first routing where necessary; verify SSR, server functions, static
assets and a missing asset separately. Do **not** port Vercel's catch-all rewrite
that sends unknown routes to `/`; unknown pages must return a real 404.

`src/lib/seoBuildArtifacts.functions.ts` dynamically imports `node:fs` and
`node:path` and already reports BLOCKED without readable build files. Node
compatibility flags do not guarantee packaged `dist/` filesystem availability.
Probe this server function and SSR error wrapper explicitly. Preserve honest
BLOCKED diagnostic behavior; if app-critical server functions fail, use PR 2B
or stop for fallback. Do not silently substitute fabricated artifact evidence.

Local verification uses the repo's existing mocked browser routes/specs with
network writes blocked and fixture data, under `wrangler dev` on loopback.
Existing hosted specs/workflows enforce the apex production URL; do not repoint
those workflows, relax their fixture fences, or dispatch them at staging. Use a
separate narrowly reviewed staging runner or manual fixture-owned browser smoke
under the request's staging authorization. If login needs an auth allowlist
change, report BLOCKED; modifying Supabase/auth is outside scope.

Record Wrangler dry-run upload sizes (compressed and uncompressed, assets
separate), Worker initialization/startup measurement, isolate peak memory and
per-route CPU observations. Requested hard gates: **128 MB memory, 64 MiB script,
1 second startup**; any stricter account/upload limit also applies. Provider
limits documentation was inaccessible from this environment, so the compressed
upload limit and exact unit definitions require confirmation before PR 2A
acceptance. Memory is isolate memory, not whole Node/Wrangler process RSS; startup
is Worker initialization, not Vite build time or request wall time. Local profiler
results must be labelled local estimates and corroborated by target validation.
Unavailable startup/peak-memory measurement is NOT_MEASURED and blocks the
resource gate. A dry-run alone does not establish memory/CPU success. Stop on
any limit violation and propose the **Render $7/month** fallback as a separate
reviewed decision; do not switch providers or approve spend automatically.

### HTTP policy to port

Retain all nine redirects. Temporary OAuth hop stays 307, with wildcard suffix
and query preserved, to the existing Lovable host from `vercel.json`.
Permanent redirects stay 308: `/strains` → `/cultivars`, `/strains/:slug` →
`/cultivars/:slug`, `/features` and `/demo` → `/welcome`, `/refunds` and
`/refund-policy` → `/refund`, `/terms-of-service` → `/terms`, and
`/privacy-policy` → `/privacy`. Port the redirect only; no auth implementation edit.

| Scope                                  | Required effective headers                                                                                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSR, static, redirects, errors and 404 | `X-Content-Type-Options: nosniff`; `X-Frame-Options: SAMEORIGIN`; `Referrer-Policy: strict-origin-when-cross-origin`; `Strict-Transport-Security: max-age=63072000; includeSubDomains`; `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()` |
| `/unsubscribe` override                | `Cache-Control: no-store`; `Referrer-Policy: no-referrer`; `X-Robots-Tag: noindex, nofollow, noarchive`                                                                                                                                                            |
| `/assets/*`                            | `Cache-Control: public, max-age=31536000, immutable`                                                                                                                                                                                                               |

The current config includes HSTS `preload`; Matthew's current request says add it
only if he says so. Proposed Workers policy omits that token until explicit
approval; never reduce the two-year duration or `includeSubDomains`. Omitting
the token does not remove a domain from a browser preload list. Phase 2 preserves
Vercel's file while porting this documented owner-directed difference.
Ensure these headers apply to Worker-generated SSR and errors as well as assets;
asset `_headers` alone does not prove Worker response coverage.

## Environment inventory — names only

This is the observed app/build inventory, not a claim about every backend secret.
Vercel metadata was read without decryption on 2026-10-04. Matthew must confirm
that the three names exhaust the project's production environment and supply
any dashboard-only names/values privately to the correct destination.

| Names                                                                                                                                                        | Observed source / role                                                                  | Target and owner action                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`                                                                             | Repo `.env`; same three production names in Vercel metadata                             | Build-time public configuration for the existing Supabase project; Matthew confirms parity without printing values   |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`                                                                                            | Repo `.env`; server/tool references for first two; project ID is configuration          | Supply only to reachable runtime readers; verify binding/env adapter behavior under Wrangler without editing auth    |
| `SUPABASE_ANON_KEY`                                                                                                                                          | Alternate server-tool key reader; not listed in Vercel metadata                         | Only if the reachable reader actually requires this fallback; never replace the publishable key blindly              |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                                                                                  | Generated admin-client reader; no product importer found; not listed in Vercel metadata | **Do not provision by default.** If needed, stop for explicit authorization; never expose through `VITE_*` or assets |
| `VITE_PAYMENTS_CLIENT_TOKEN`                                                                                                                                 | `.env.production`/`.env.development`; client checkout reader                            | Preserve current public token configuration via the normal build safeguards; no checkout/charge smoke                |
| `VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY`                                                                                                            | Repo `.env`; analytics constant                                                         | Preserve existing consent policy; this task adds no tracking or secret value                                         |
| `VITE_BETA_FEEDBACK_FORM_URL`, `VITE_CREATOR_BETA_FORM_URL`                                                                                                  | Optional public UI readers; absent from observed Vercel names                           | Matthew supplies only if currently configured; preserve optional missing behavior                                    |
| `VITE_PADDLE_ENVIRONMENT`, `VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_PRICE_PRO_MONTHLY`, `VITE_PADDLE_PRICE_PRO_ANNUAL`, `VITE_PADDLE_PRICE_FOUNDER_LIFETIME` | Legacy sandbox configuration readers and `.env.example`; not observed in Vercel         | Preserve existing unavailable behavior; do not invent values or change payment mode                                  |
| `SEO_DIST_DIR`, `NODE_ENV`                                                                                                                                   | Runtime diagnostic/default and standard execution mode                                  | Validate Workers behavior; no assumption that runtime filesystem matches builder                                     |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`                                                                                                              | Provider-only build identity reads                                                      | Retire in PR 3B; derive commit/branch from clean Git checkout                                                        |
| `GITHUB_SHA`, `GITHUB_REF_TYPE`, `GITHUB_REF_NAME`, `GITHUB_RUN_ID`, `GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`                                                | Existing build provenance metadata                                                      | Preserve truthful Git identity; no fake CI run metadata in manual builds                                             |
| `NITRO_PRESET`                                                                                                                                               | Proposed explicit build target control, if supported by resolved preset                 | Target `cloudflare-module`; verify effective output and pin in PR 2A                                                 |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`                                                                                                              | Deployment tooling only; Cloudflare access not provided here                            | Matthew grants scoped access privately; never bake into Worker/client artifacts                                      |
| `E2E_BASE_URL`, `E2E_GROW_1_PLANT_URL`, `E2E_EXPECTED_SHA`, `E2E_ALLOW_FIXTURE_BOOTSTRAP`                                                                    | Existing smoke configuration                                                            | Keep hosted production fences; disable bootstrap and use verified existing fixture                                   |
| Dashboard-only variables                                                                                                                                     | **None listed in observed Vercel metadata; owner confirmation pending**                 | Matthew supplies any additional names and values privately; receipt records names only                               |
| `PAYMENTS_ENVIRONMENT`                                                                                                                                       | Existing Supabase Edge configuration mentioned in #1895/#1869                           | Backend-owned and outside this migration; do not move, set or deploy it here                                         |

Never run `vercel env pull`, print dotenv contents, put values in PR/logs, or
provide the service-role key just because a generated module has a reader.
Binding adaptation, server-function reachability and build-time versus runtime
injection are Phase 2 measurements, not assumptions of compatibility.

## Cost and CPU plan — Matthew approval required

Propose Workers Paid at **$5/month base**, **50 ms CPU per request**, total monthly
Workers budget **$10**, warning at **$8 (80%)**, critical notification at **$10**.
These values are proposals, not account changes. Matthew approves the ceiling,
notifications and recipient; no agent changes billing, subscription or settings.
A billing alert is not a hard spend cap; request volume can still exceed the
budget. On an alert, report measured usage; Matthew decides whether to restrict
traffic, change the ceiling or withdraw the service.

Planning estimate pending current price confirmation: base includes 10 million
requests and 30 million CPU-ms; assumed overage $0.30/million requests and
$0.02/million CPU-ms. Formula:
`5 + 0.30 * max(0, requests_millions - 10) + 0.02 * max(0, cpu_ms_millions - 30)`.
At 10 million requests averaging 10 ms CPU, estimate $6.40/month; averaging
50 ms yields $14.40/month and exceeds the proposed budget. No measured traffic
or CPU baseline exists here. Confirm current rates, asset/logging charges and
account-wide versus Worker-specific billing before approval. Supabase costs
remain outside the hosting budget and its configuration stays untouched.
Record per-route median/p95/max CPU and CPU-limit errors in staging, including
SSR cold initialization, Quick Log server calls and upload forwarding. Wall
latency is not CPU. CPU failures at 50 ms stop the gate; increasing the ceiling
requires Matthew approval, or propose Render. Never raise a limit silently.

## Numbered MATTHEW STEPS — execute in this order, gated

1. **Clear GitHub Actions billing lock.** Resolve the account restriction through
   GitHub billing; disputed Vercel invoice stays untouched. Codex/Grok 91 then
   measure this draft's exact-head 35/35 and Critical Mass verdict before queue
   integration. No rerun/bypass substitutes for a working Actions account.
2. **Approve spend and confirm access.** Proposed Workers Paid base $5/month,
   50 ms/request CPU, $10/month budget, alerts at $8 and $10. Confirm current
   provider rates/limits first. Supply scoped Cloudflare access privately and
   confirm the three observed Vercel production env names; supply any missing
   dashboard-only variables privately. Decide explicitly whether to retain HSTS
   `preload`; default proposal omits it.
3. **Confirm fixture readiness and schedule decision.** The #1895 evidence says
   the configured write fixture is archived. Owner verifies/restores only the
   disposable fixture as needed outside this migration; no agent unarchive,
   reseed or bootstrap. Choose whether to pause `quicklog-smoke.yml`'s existing
   daily 4:17 AM CDT schedule through migration. Suggested choice: disable it
   until manual production acceptance; re-enable before any workflow dispatch
   that requires it. Record the choice; scheduled writes must not precede fixture
   ownership verification or obscure the migration smoke receipt.
4. **Lower web TTLs in Squarespace.** Apex A `216.150.1.1` and `www` CNAME
   `526d96436dc18b4c.vercel-dns-017.com`: set TTL **300**. Wait at least **4 hours
   from authoritative confirmation**, not merely clicking Save. Keep low TTLs
   through the rollback window. NS delegation caches can last longer (observed
   21600 seconds); four hours does not bound nameserver propagation.
5. **Export every Squarespace DNS record; prepare a free Cloudflare zone.**
   Zone name `verdantgrowdiary.com`. Copy all records with exact owners, values,
   priorities and relevant TTLs; do not trust import discovery alone. Keep web
   records **DNS-only** at their old Vercel values for zone preparation. Preserve
   all five MX records and both verification TXT values exactly; also preserve
   every other exported record, including any mail-related A/AAAA/CNAME/TXT,
   CAA and SRV entries. Do not invent missing verification values. Verify DNSSEC
   is still off and do not enable it during migration.
6. **Resolve the staging/delegation dependency, then switch NS yourself.**
   `workers_dev=false` plus a route at `migration.verdantgrowdiary.com` requires
   an active Cloudflare zone. Proposed adjustment: do the zone/delegation part
   of Phase 5 now, with production web records still DNS-only on Vercel; this
   enables Phase 4 without moving app traffic. Approve that ordering before
   acting. Set Squarespace's nameservers to the **exact two names assigned by
   Cloudflare for this zone**, then verify activation and full DNS parity.
   Assigned NS names are **BLOCKED / not yet allocated** and must be inserted
   into the cutover packet before execution; never use illustrative names.
   If this ordering is unacceptable, Phase 4 is BLOCKED until Matthew supplies
   an already-active Cloudflare zone for its private staging hostname. No
   workers.dev/public-preview workaround. Rollback NS are `nsa1.squarespacedns.com`,
   `nsa2.squarespacedns.com`, `nsa3.squarespacedns.com`, `nsa4.squarespacedns.com`.
7. **Prepare private staging and approve the pinned deployment.** On the active
   zone, use `migration.verdantgrowdiary.com/*` for the migration Worker and
   Cloudflare Access allow only Matthew and the disposable fixture identity;
   deny everyone else. Configure valid TLS and verify unauthenticated Access
   denial before the manual deploy. No Workers Builds, Git connection,
   auto-deploy or public preview. Approve the deployment packet's full merged
   SHA and artifact digest after all PR 2/3 gates. Matthew configures routes,
   Access and settings; Codex may manually deploy only under this grant.
8. **Hold apex/www cutover until staging and both certificates are ready.**
   Require signed-in staging PASS and all limits measured within bounds. Confirm
   the complete export/rollback copy, HTTPS certificate coverage and active
   certificate status for **both** `verdantgrowdiary.com` and
   `www.verdantgrowdiary.com`, CAA compatibility, and the pinned Worker artifact.
   Workers Custom Domains manage DNS/certificates, and issuance can be
   asynchronous: clicking Add is not a TLS gate. The actual account's safe
   certificate-preparation procedure must be verified before changing web
   records. If certificates cannot be active before traffic moves, cutover is
   **BLOCKED**; do not accept an HTTPS gap under two-year HSTS.
9. **Attach both Workers Custom Domains in the same approved cutover window.**
   Worker target is the exact reviewed Worker name recorded in the deployment
   packet; hostnames are `verdantgrowdiary.com` and
   `www.verdantgrowdiary.com`. Replace only their web-routing records through
   the Custom Domain flow; Cloudflare-generated targets are recorded from the
   account, never guessed or reused from Vercel. Do not alter MX/TXT/mail records.
   These two attachments are not presumed atomic: verify each immediately and
   abort/restore delegation if either TLS/routing check fails. Record CT time
   for each attachment and first successful probe. Keep Squarespace's saved
   records available for rollback; NS rollback can propagate slowly and returns
   to the known Vercel 402 until Vercel is restored.
10. **After production acceptance, remove Vercel's deploy connection.**
    Disconnect the GitHub integration for project `verdant-grow-diary` in team
    `verdantgrowdiary`, remove Vercel's GitHub CI-status integration, and verify
    no Git auto-deploy, deploy hook or required-status dependency remains. Do
    not remove any of the 35 required checks. If any publisher can race a manual
    deploy before this step, pause that publisher before cutover and record it.
    Decide whether `verdantgrowdiary.tech` should auto-renew; no automatic domain
    cancellation/deletion. Leave the disputed Vercel invoice alone. Restore the
    smoke schedule only according to Step 3's recorded decision and gate.

### Mail records to preserve exactly

| Owner | Type | Priority | Destination               |
| ----- | ---- | -------- | ------------------------- |
| apex  | MX   | 1        | `aspmx.l.google.com`      |
| apex  | MX   | 5        | `alt1.aspmx.l.google.com` |
| apex  | MX   | 5        | `alt2.aspmx.l.google.com` |
| apex  | MX   | 10       | `alt3.aspmx.l.google.com` |
| apex  | MX   | 10       | `alt4.aspmx.l.google.com` |

Preserve TXT `lovable_verification` and TXT `google-site-verification` at their
exported owners with their **exact complete values**. Full values are not known
here. SPF/DMARC/DKIM for `noreply@` and the missing `notify` sender domain remain
an optional separate docs PR and do not block hosting unless current DNS/cert
parity fails. Mail record changes are not part of this plan.

## Staging and production smoke / final receipt

Run read-only checks first; require `/version.json` to report the exact reviewed
merged SHA with `dirty:false` on every hostname. `/` and known SSR pages must
return 200 with rendered content and policy headers; verify all nine redirects,
`/unsubscribe`, a real asset, missing asset, and a unique unknown route (404).
Validate TLS hostname/chain/expiry independently; no `-k` acceptance.

Then use only `cheekhimself@gmail.com`, never KEEP or customer data. Verify
positive account identity and grow/tent/plant ownership before each write.
Login and dashboard must work; Quick Log must save a `[smoke <ISO timestamp>]`
record on that grow and reopen with matching content; upload a smoke-tagged
photo only to that grow/plant and reopen it; AI Doctor page must load without
starting a model call/credit spend. Preserve existing ownership and request
barriers. Stop on archived fixture, wrong account, missing ownership, failed
save/readback, auth configuration gap or any outside-scope write; no blind retry.

Production additionally needs both hosts serving from Cloudflare, direct
`server: cloudflare`/Cloudflare request-header evidence, expected HSTS, no
Vercel headers anywhere in the tested response chain and no Vercel browser
telemetry requests. Verify the exact deployed SHA's 35 required checks, manual
publisher identity and disconnected Vercel integration. A missing check or
unmeasured resource/smoke axis leaves the migration incomplete.

Receipt records full deployed SHA, PR/head review receipts and queue merge SHAs,
artifact digest, toolchain, all timestamps in **America/Chicago CT with UTC
offset** (UTC may supplement), hostname TLS/status/header results, startup,
compressed/uncompressed script bytes, isolate peak memory, per-route CPU,
fixture-scope classification/smoke tags/save-photo readbacks, current required
check count, DNS/export parity, Vercel disconnection and renewal decision.
List every BLOCKED/FAIL/NOT_MEASURED axis explicitly; never infer backend health
or deployed SQL/Edge versions from frontend identity.

## Phase 1 handoff and current validation

```text
TASK HOSTING-MIGRATION-PHASE1  priority: P1  status: OPEN
goal: Review the docs-only Workers migration plan before runtime implementation.
branch: codex/hosting-migration-phase1-plan
base: verdant-grow-diary at a980489ad5188e36eba89461117c2b60fc10f927
checkout: git fetch origin codex/hosting-migration-phase1-plan verdant-grow-diary; verify PR head against fetched branch before checking out; merge base normally only if needed
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/1904
head_sha: Read the PR current head; this document cannot embed its own resulting commit SHA.
state: Draft plan; infrastructure and runtime unchanged.
next_action: Critical Mass exact-head review; hosted required checks after billing lock clears.
files: docs/release/cloudflare-workers-migration-plan.md only
blockers: Actions billing lock; Cloudflare/Squarespace access; Workers Paid/budget approval; missing prior audits; TLS preparation/staging zone dependencies; archived write fixture.
artifacts: this plan and PR body; no secret or private fixture artifacts committed
reviewer_seat: Critical Mass
claimed_by: Codex, 2026-10-04 18:12 CT
last_updated: 2026-10-04 18:14 CT, by Codex
```

Before stopping, the PR body/chat handoff must record the resulting exact head,
local validation counts, and hosted check state. No GitHub claim/review comments
are posted without Matthew's approval. A shared HANDOFF_LOG update is deferred
because #1866/#1830 own overlapping edits; ask the holder to link this block
rather than opening a competing log change. Subsequent review or coverage must
confirm the live PR head and claim, not rely on the initial scaffold SHA.

Phase 1 local validation: scoped formatting and whitespace PASS; all three docs
safety scanner categories PASS; the existing docs-safety test file has **67 PASS,
0 FAIL, 0 SKIP**. These checks validate document safety, not the proposed hosting
behavior. No new test that
merely mirrors this plan is needed. App build/typecheck/full suite, Wrangler,
resource limits, signed-in smoke, production TLS/Cloudflare acceptance and
independent review are NOT_MEASURED in this docs-only phase. No deployment, DNS,
billing, Supabase or production write has occurred.
