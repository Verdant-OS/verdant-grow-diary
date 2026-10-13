# Route and indexation matrix

**Source of truth:** `src/lib/appRouteManifest.ts` in this commit, checked against the mounted route modules by `src/test/helpers/routeManifestSyncHarness.ts`.<br>
**Live index status:** **NOT_MEASURED.** This file records repository metadata, `public/sitemap.xml`, and `public/robots.txt`. It is not a Search Console measurement and it does not claim what `https://verdantgrowdiary.com` returns.<br>
**Coverage:** 144 of 144 manifest routes — 42 public, 46 authenticated, 32 operator, 6 internal, and 18 redirects.

## Reading the matrix

- **SSR head** means a route module calls `staticRouteHead` (`src/lib/build/staticRouteHead.ts`). That function reads `STATIC_PUBLIC_OUTPUT_DOCUMENTS`. When a document omits `metadata.robots`, the head uses `index, follow`. The canonical link is `metadata.url`.
- **Build artifacts** from `scripts/generate-seo-artifacts.ts` are `dist/seo-manifest.json` and per-route Open Graph PNGs. That script does not write per-route `index.html` files. There is no root `index.html` in this repository. `fileName` on each document is retained metadata.
- **Client head** means `usePageSeo` (`src/hooks/usePageSeo.ts`). The default is `index, follow` and a self-canonical. `noindex: true` emits `noindex, follow`. It runs after hydration.
- **Root shell** is `src/routes/__root.tsx`: `robots` `index, follow`, no canonical link, and sitewide Organization, WebSite, and SoftwareApplication JSON-LD. A route with no `head()` keeps that shell until a client head replaces it.
- **Sitemap** means a concrete `<loc>` in `public/sitemap.xml` (52 URLs, all on `https://verdantgrowdiary.com`). Pattern routes are not sitemap URLs.
- **robots.txt** crawl rules are separate from meta robots. `src/test/robots-private-route-coverage.test.ts` treats a rule as matching when the path equals it or starts with it. Whether a live crawler fetches a URL is **NOT_MEASURED**.
- Production runs on Cloudflare Workers at https://verdantgrowdiary.com (Matthew Cheek, 2026-10-10). `vercel.json` redirects and the `/unsubscribe` `X-Robots-Tag` header are historical repository configuration from an earlier host. They are not the live host's configuration. Whether the Cloudflare host serves the same redirects and headers is **NOT_MEASURED** in this file.

`SITEMAP_ONLY_ROUTES` in `scripts/public-route-parity.config.mjs` still names `/`. `/` also has a static document and `staticRouteHead` in `src/routes/index.tsx`. `STATIC_ONLY_ROUTES` names only `/breeder-beta`.

## Concrete static-document inventory

One line per `STATIC_PUBLIC_OUTPUT_DOCUMENTS` entry. `sitemap yes` means that exact path is a `<loc>`. Canonical is the pathname of `metadata.url`.

- `/founder` — robots `index, follow`; sitemap yes; canonical `/founder`
- `/` — robots `index, follow`; sitemap yes; canonical `/`
- `/welcome` — robots `index, follow`; sitemap yes; canonical `/welcome`
- `/pricing` — robots `index, follow`; sitemap yes; canonical `/pricing`
- `/guides/grow-stage-care-guide` — robots `index, follow`; sitemap yes; canonical `/guides/grow-stage-care-guide`
- `/tools/blueprint-targets` — robots `index, follow`; sitemap yes; canonical `/tools/blueprint-targets`
- `/tools/grow-help-toolkit` — robots `index, follow`; sitemap yes; canonical `/tools/grow-help-toolkit`
- `/tools/vpd-calculator` — robots `index, follow`; sitemap yes; canonical `/tools/vpd-calculator`
- `/hardware-integrations` — robots `index, follow`; sitemap yes; canonical `/hardware-integrations`
- `/how-ai-doctor-works` — robots `index, follow`; sitemap yes; canonical `/how-ai-doctor-works`
- `/ai-doctor-readiness-check` — robots `index, follow`; sitemap yes; canonical `/ai-doctor-readiness-check`
- `/quick-log` — robots `index, follow`; sitemap yes; canonical `/quick-log`
- `/glossary` — robots `index, follow`; sitemap yes; canonical `/glossary`
- `/creator-beta` — robots `index, follow`; sitemap yes; canonical `/creator-beta`
- `/breeder-beta` — robots `index, follow`; sitemap no; canonical `/creator-beta`
- `/pheno-comparison` — robots `index, follow`; sitemap yes; canonical `/pheno-comparison`
- `/pheno-expression-showcase` — robots `index, follow`; sitemap yes; canonical `/pheno-expression-showcase`
- `/privacy` — robots `index, follow`; sitemap yes; canonical `/privacy`
- `/terms` — robots `index, follow`; sitemap yes; canonical `/terms`
- `/refund` — robots `index, follow`; sitemap yes; canonical `/refund`
- `/feedback` — robots `index, follow`; sitemap yes; canonical `/feedback`
- `/contact` — robots `index, follow`; sitemap yes; canonical `/contact`
- `/docs/mcp-api` — robots `index, follow`; sitemap yes; canonical `/docs/mcp-api`
- `/guides` — robots `index, follow`; sitemap yes; canonical `/guides`
- `/guides/grow-diary-app` — robots `index, follow`; sitemap yes; canonical `/guides/grow-diary-app`
- `/guides/grow-log-app-vs-grow-journal` — robots `index, follow`; sitemap yes; canonical `/guides/grow-log-app-vs-grow-journal`
- `/guides/grow-room-vpd-tracker` — robots `index, follow`; sitemap yes; canonical `/guides/grow-room-vpd-tracker`
- `/guides/ac-infinity-data-logging` — robots `index, follow`; sitemap yes; canonical `/guides/ac-infinity-data-logging`
- `/guides/spider-farmer-data-logging` — robots `index, follow`; sitemap yes; canonical `/guides/spider-farmer-data-logging`
- `/guides/sensor-truth-grow-room` — robots `index, follow`; sitemap yes; canonical `/guides/sensor-truth-grow-room`
- `/guides/ai-grow-doctor` — robots `index, follow`; sitemap yes; canonical `/guides/ai-grow-doctor`
- `/guides/cannabis-plant-care` — robots `index, follow`; sitemap yes; canonical `/guides/cannabis-plant-care`
- `/guides/how-to-start-a-grow-journal` — robots `index, follow`; sitemap yes; canonical `/guides/how-to-start-a-grow-journal`
- `/guides/what-to-log-in-a-grow-journal` — robots `index, follow`; sitemap yes; canonical `/guides/what-to-log-in-a-grow-journal`
- `/guides/grow-journal-template` — robots `index, follow`; sitemap yes; canonical `/guides/grow-journal-template`
- `/guides/plant-watering-log` — robots `index, follow`; sitemap yes; canonical `/guides/plant-watering-log`
- `/guides/grow-journal-app-without-account` — robots `index, follow`; sitemap yes; canonical `/guides/grow-journal-app-without-account`
- `/guides/daily-grow-log-checklist` — robots `index, follow`; sitemap yes; canonical `/guides/daily-grow-log-checklist`
- `/guides/cronk-nutrients-grow-diary` — robots `index, follow`; sitemap yes; canonical `/guides/cronk-nutrients-grow-diary`
- `/guides/athena-nutrients-grow-diary` — robots `index, follow`; sitemap yes; canonical `/guides/athena-nutrients-grow-diary`
- `/guides/jacks-nutrients-grow-diary` — robots `index, follow`; sitemap yes; canonical `/guides/jacks-nutrients-grow-diary`
- `/guides/house-and-garden-nutrients-grow-diary` — robots `index, follow`; sitemap yes; canonical `/guides/house-and-garden-nutrients-grow-diary`
- `/guides/canna-nutrients-grow-diary` — robots `index, follow`; sitemap yes; canonical `/guides/canna-nutrients-grow-diary`
- `/guides/bud-rot-prevention-identification` — robots `index, follow`; sitemap yes; canonical `/guides/bud-rot-prevention-identification`
- `/guides/cannabis-nutrient-schedule` — robots `index, follow`; sitemap yes; canonical `/guides/cannabis-nutrient-schedule`
- `/guides/cannabis-grow-light-distance-and-schedule` — robots `index, follow`; sitemap yes; canonical `/guides/cannabis-grow-light-distance-and-schedule`
- `/guides/cannabis-light-stress-light-burn-bleaching-or-heat` — robots `index, follow`; sitemap yes; canonical `/guides/cannabis-light-stress-light-burn-bleaching-or-heat`
- `/guides/oreoz-vs-gelonade-comparison` — robots `index, follow`; sitemap yes; canonical `/guides/oreoz-vs-gelonade-comparison`
- `/guides/cannabis-leaf-symptoms` — robots `index, follow`; sitemap yes; canonical `/guides/cannabis-leaf-symptoms`
- `/guides/cannabis-leaves-turning-yellow` — robots `index, follow`; sitemap yes; canonical `/guides/cannabis-leaves-turning-yellow`
- `/guides/cannabis-leaf-spots-lesions` — robots `index, follow`; sitemap yes; canonical `/guides/cannabis-leaf-spots-lesions`
- `/guides/cannabis-burnt-crispy-leaf-tips` — robots `index, follow`; sitemap yes; canonical `/guides/cannabis-burnt-crispy-leaf-tips`
- `/cultivars` — robots `index, follow`; sitemap yes; canonical `/cultivars`
- `/customer/guide/oreoz-vs-gelonade-comparison` — robots `noindex, follow`; sitemap no; canonical `/customer/guide/oreoz-vs-gelonade-comparison`
- `/cultivars/sour-diesel` — robots `noindex, follow`; sitemap no; canonical `/cultivars/sour-diesel`
- `/cultivars/og-kush` — robots `noindex, follow`; sitemap no; canonical `/cultivars/og-kush`
- `/cultivars/blue-dream` — robots `noindex, follow`; sitemap no; canonical `/cultivars/blue-dream`
- `/cultivars/gg4` — robots `noindex, follow`; sitemap no; canonical `/cultivars/gg4`
- `/cultivars/lemon-cherry-gelato` — robots `noindex, follow`; sitemap no; canonical `/cultivars/lemon-cherry-gelato`
- `/cultivars/oreoz` — robots `noindex, follow`; sitemap no; canonical `/cultivars/oreoz`
- `/cultivars/do-si-dos` — robots `noindex, follow`; sitemap no; canonical `/cultivars/do-si-dos`
- `/cultivars/blue-cookies` — robots `noindex, follow`; sitemap no; canonical `/cultivars/blue-cookies`
- `/cultivars/jack-herer` — robots `noindex, follow`; sitemap no; canonical `/cultivars/jack-herer`
- `/cultivars/sour-stomper` — robots `noindex, follow`; sitemap no; canonical `/cultivars/sour-stomper`
- `/checkout/success` — robots `noindex, follow`; sitemap no; canonical `/checkout/success`
- `/checkout/cancel` — robots `noindex, follow`; sitemap no; canonical `/checkout/cancel`
- `/strains` — robots `noindex, follow`; sitemap no; canonical `/cultivars`
- `/strains/sour-diesel` — robots `noindex, follow`; sitemap no; canonical `/cultivars/sour-diesel`
- `/strains/og-kush` — robots `noindex, follow`; sitemap no; canonical `/cultivars/og-kush`
- `/strains/blue-dream` — robots `noindex, follow`; sitemap no; canonical `/cultivars/blue-dream`
- `/strains/gg4` — robots `noindex, follow`; sitemap no; canonical `/cultivars/gg4`
- `/strains/lemon-cherry-gelato` — robots `noindex, follow`; sitemap no; canonical `/cultivars/lemon-cherry-gelato`
- `/strains/oreoz` — robots `noindex, follow`; sitemap no; canonical `/cultivars/oreoz`
- `/strains/do-si-dos` — robots `noindex, follow`; sitemap no; canonical `/cultivars/do-si-dos`
- `/strains/blue-cookies` — robots `noindex, follow`; sitemap no; canonical `/cultivars/blue-cookies`
- `/strains/jack-herer` — robots `noindex, follow`; sitemap no; canonical `/cultivars/jack-herer`
- `/strains/sour-stomper` — robots `noindex, follow`; sitemap no; canonical `/cultivars/sour-stomper`

`/cultivars` is the hub. It is `index, follow` and a sitemap URL. Each `/cultivars/<slug>` document takes its robots from `cultivarDetailRobots(cultivar.verificationStatus)` in `src/lib/cultivarDetailSeo.ts`. `cultivarVerificationIsSearchIndexable` returns true only for `reviewed` and `verified`. `sample` and `community` return false, and any other value at runtime fails closed to false, which gives `noindex, follow`. Indexable slugs go into `STATIC_PUBLIC_SEO_DOCUMENTS`. The other slugs go into `STATIC_CULTIVAR_NOINDEX_DOCUMENTS`, which is still part of `STATIC_PUBLIC_OUTPUT_DOCUMENTS`, so each keeps a self-canonical static head. `src/pages/CultivarPage.tsx` passes `noindex` to `usePageSeo` from the same gate. `public/sitemap.xml` lists no `/cultivars/<slug>` URL; its comment says only reviewed and verified profiles belong there. Today all ten `VERDANT_CULTIVARS` entries are `sample`, so all ten slugs are `noindex, follow` and not in the sitemap. A slug becomes indexable and sitemap-eligible only when its status moves to `reviewed` or `verified` and its `<loc>` is added.

`/docs/mcp-api` is in `public/sitemap.xml` and is not in `STATIC_ONLY_ROUTES`. A comment above that document in `src/lib/build/staticPublicSeoDocuments.ts` still says the route is static-only and absent from the sitemap. This inventory follows the document array, the allowlist, and `public/sitemap.xml`.

`/breeder-beta` stays `index, follow` and points its canonical at `/creator-beta` (`crossCanonicalDocument` and `usePageSeo({ canonicalPath: "/creator-beta" })` in `src/pages/BreederBeta.tsx`). It is the only `STATIC_ONLY_ROUTES` entry, so it is not a sitemap URL.

`/pheno-comparison` and `/pheno-expression-showcase` are `index, follow` static documents and sitemap URLs. Their pages call `usePageSeo` without `noindex`.

## Schema on indexable documents

- Guide documents (`buildStaticGuideJsonLd`) emit WebPage, FAQPage, and BreadcrumbList. Article is added only when `publishedOn` is set. These 7 guides set it: `/guides/cannabis-grow-light-distance-and-schedule`, `/guides/cannabis-light-stress-light-burn-bleaching-or-heat`, `/guides/oreoz-vs-gelonade-comparison`, `/guides/cannabis-leaf-symptoms`, `/guides/cannabis-leaves-turning-yellow`, `/guides/cannabis-leaf-spots-lesions`, `/guides/cannabis-burnt-crispy-leaf-tips`.
- No cultivar detail document is indexable today. `buildStaticCultivarJsonLd` still gives each `/cultivars/<slug>` document WebPage, a cultivar collection node, FAQPage, BreadcrumbList, and Article, but all ten are `noindex, follow` (see the inventory), so that schema is not on an indexable document. It would be once a slug reaches `reviewed` or `verified`. The `/cultivars` hub document is indexable and uses the default WebPage node.
- `/guides` emits WebPage, FAQPage, and BreadcrumbList. `/guides/:slug` is the manifest pattern for `VERDANT_SEO_GUIDES` (28 slugs). `/guides/grow-stage-care-guide` is its own manifest route and its own document.
- `/tools/blueprint-targets` emits WebPage, FAQPage, and BreadcrumbList. `/quick-log` emits WebPage, SoftwareApplication, and FAQPage. Other acquisition documents in the inventory use the default WebPage node unless the row above says otherwise.
- `/cultivars` with a non-empty query string is a client `noindex, follow` variant (`buildCultivarsIndexSeo` in `src/lib/cultivarIndexSeoRules.ts`). The canonical stays `/cultivars`. Those query URLs are not sitemap locs. The clean `/cultivars` document stays `index, follow`.

## Public routes with no static document

These manifest paths are public and are not in `STATIC_PUBLIC_OUTPUT_DOCUMENTS`.

| Route                                        | SSR / route head                                           | Client head                                                                                               | Sitemap | robots.txt                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `*`                                          | None. Root shell `index, follow`.                          | `src/pages/NotFound.tsx` sets `noindex: true` (`noindex, follow`) and a canonical for the requested path. | No      | No matching Disallow in `public/robots.txt`.                                                                                                                  |
| `/.lovable/oauth/consent`                    | `src/routes/[.]lovable.oauth.consent.tsx` has no `head()`. | `src/pages/OAuthConsent.tsx` does not call `usePageSeo`.                                                  | No      | `Disallow: /.lovable/`                                                                                                                                        |
| `/auth`                                      | No route `head()`.                                         | `src/pages/Auth.tsx` sets `noindex: true`.                                                                | No      | `Disallow: /auth`                                                                                                                                             |
| `/reset-password`                            | No route `head()`.                                         | `src/pages/ResetPassword.tsx` sets `noindex: true`.                                                       | No      | `Disallow: /reset-password`                                                                                                                                   |
| `/unsubscribe`                               | No route `head()`.                                         | `src/pages/Unsubscribe.tsx` sets `noindex: true`.                                                         | No      | `Disallow: /unsubscribe`. Historical `vercel.json` (earlier host, not the live Cloudflare configuration) also sets `X-Robots-Tag` to `noindex, nofollow, noarchive` for this path. Live response headers are **NOT_MEASURED**. |
| `/partners/csv-preview`                      | No route `head()`.                                         | `src/pages/PartnerCsvPreviewLanding.tsx` sets `noindex: true` and path `/partners/csv-preview`.           | No      | Allowed by `Allow: /`.                                                                                                                                        |
| `/sensors/csv-preview`                       | No route `head()`.                                         | `src/pages/SensorCsvPreview.tsx` sets `noindex: true` and path `/sensors/csv-preview`.                    | No      | `Allow: /sensors/csv-preview` before `Disallow: /sensors`.                                                                                                    |
| `/pheno-hunts/:id/compare`                   | `src/routes/pheno-hunts.$id.compare.tsx` has no `head()`.  | `src/pages/PhenoHuntCompare.tsx` does not call `usePageSeo`.                                              | No      | `Disallow: /pheno-hunts`                                                                                                                                      |
| `/pheno-hunts/:id/showcase`                  | `src/routes/pheno-hunts.$id.showcase.tsx` has no `head()`. | `src/pages/PhenoHuntShowcase.tsx` does not call `usePageSeo`.                                             | No      | `Disallow: /pheno-hunts`                                                                                                                                      |
| `/internal/demo-proof-walkthrough`           | Route `head()` meta `noindex, nofollow`.                   | Page module has no `usePageSeo` call.                                                                     | No      | `Disallow: /internal/`                                                                                                                                        |
| `/internal/contextual-pheno-comparison-demo` | No route `head()`.                                         | `src/pages/ContextualPhenoComparisonDemo.tsx` does not call `usePageSeo`.                                 | No      | `Disallow: /internal/`                                                                                                                                        |
| `/internal/pheno-hunt-demo`                  | No route `head()`.                                         | `src/pages/PhenoHuntDemo.tsx` does not call `usePageSeo`.                                                 | No      | `Disallow: /internal/`                                                                                                                                        |

`/checkout/success` and `/checkout/cancel` are in the inventory (`noindex, follow`, not in the sitemap) and their pages also set `noindex: true`. `public/robots.txt` does not disallow `/checkout`.

`/customer/guide/oreoz-vs-gelonade-comparison` is in the inventory (`noindex, follow`, not in the sitemap). `src/pages/CustomerOreozGelonadeGuide.tsx` also sets `noindex: true`. `Disallow: /customer/` covers the path. This is the only manifest path under `/customer/`.

Every public manifest path, with or without a static document. `/cultivars/:slug` and `/guides/:slug` are patterns; their concrete paths are inventory lines.

Manifest paths (`access: "public"`, 42):

`*`; `/`; `/.lovable/oauth/consent`; `/ai-doctor-readiness-check`; `/auth`; `/breeder-beta`; `/checkout/cancel`; `/checkout/success`; `/contact`; `/creator-beta`; `/cultivars`; `/cultivars/:slug`; `/customer/guide/oreoz-vs-gelonade-comparison`; `/docs/mcp-api`; `/feedback`; `/founder`; `/glossary`; `/guides`; `/guides/:slug`; `/guides/grow-stage-care-guide`; `/hardware-integrations`; `/how-ai-doctor-works`; `/internal/contextual-pheno-comparison-demo`; `/internal/demo-proof-walkthrough`; `/internal/pheno-hunt-demo`; `/partners/csv-preview`; `/pheno-comparison`; `/pheno-expression-showcase`; `/pheno-hunts/:id/compare`; `/pheno-hunts/:id/showcase`; `/pricing`; `/privacy`; `/quick-log`; `/refund`; `/reset-password`; `/sensors/csv-preview`; `/terms`; `/tools/blueprint-targets`; `/tools/grow-help-toolkit`; `/tools/vpd-calculator`; `/unsubscribe`; `/welcome`.

## Authenticated routes — sitemap excluded, robots.txt disallowed

`public/robots.txt` disallows these prefixes for `Googlebot`, `Bingbot`, and `*`: `/onboarding`, `/start-room`, `/dashboard`, `/daily-check`, `/tents`, `/plants`, `/sensors` (with the public CSV allow above), `/timeline`, `/alerts`, `/doctor`, `/actions`, `/grow-lineage`, `/genetics`, `/breeding`, `/grows`, `/pheno-hunts`, `/reports`, `/diary`, `/settings`, `/account/preferences`, `/invite`, `/health`. None of these paths are sitemap `<loc>` values.

Route-level robots meta on authenticated routes:

- `/settings/analytics` — `src/routes/_app/settings_.analytics.tsx` sets `robots` to `noindex` (that string only; it does not say `follow`).
- `/settings/agent-integrations` — `src/pages/AgentIntegrations.tsx` sets `noindex: true` (`noindex, follow` after hydration).
- `/diary/pheno-expression-comparison` — `src/pages/OreozGelonadeDiaryComparison.tsx` sets `noindex: true`.
- `/diary/strains/:slug` — `src/pages/CultivarDiaryProfile.tsx` sets `noindex: true`. `requiredFeature` is `pheno_tracker`.

Other authenticated routes have no route `head()` robots meta and no `noindex: true` in the page module found for that route. Their first head is the root shell `index, follow`. robots.txt still disallows them. Live crawl behavior is **NOT_MEASURED**.

Manifest paths (`access: "auth"`, 46):

`/account/preferences`; `/actions`; `/actions/:actionId`; `/alerts`; `/alerts/:alertId`; `/breeding`; `/breeding/:programId`; `/breeding/log/new`; `/breeding/new`; `/daily-check`; `/dashboard`; `/diary/environment-summary`; `/diary/pheno-expression-comparison`; `/diary/strains/:slug`; `/doctor`; `/doctor/sessions`; `/doctor/sessions/:sessionId`; `/genetics`; `/genetics/accessions/:id`; `/genetics/batches/:id`; `/genetics/health/:kind/:id`; `/genetics/trace/:kind/:id`; `/grow-lineage`; `/grows`; `/grows/:growId`; `/grows/:growId/learning`; `/health`; `/invite`; `/onboarding`; `/pheno-hunts`; `/pheno-hunts/:id/keepers`; `/pheno-hunts/:id/workspace`; `/pheno-hunts/new`; `/plants`; `/plants/:id`; `/reports`; `/reports/diary-range`; `/reports/post-grow/:growId`; `/sensors`; `/settings`; `/settings/agent-integrations`; `/settings/analytics`; `/start-room`; `/tents`; `/tents/:id`; `/timeline`.

`/pheno-hunts`, `/pheno-hunts/new`, `/pheno-hunts/:id/keepers`, and `/pheno-hunts/:id/workspace` declare `requiredFeature: "pheno_tracker"`.

## Operator routes — sitemap excluded, robots.txt disallowed

`Disallow: /operator/`, `Disallow: /diagnostics`, `Disallow: /demo/one-tent-live-proof`, `Disallow: /one-tent-loop-proof`, `Disallow: /pi-ingest-status`, `Disallow: /ingest-inspector`, and `Disallow: /sensors` cover this group. `/diagnostics-lighting-measurement` and `/diagnostics-seo-artifacts` start with the `/diagnostics` rule string, which is how the private-route test counts them. They also set their own route head.

Route-level robots meta:

- `/diagnostics-lighting-measurement` — `noindex, nofollow` in `src/routes/_app/_operator/diagnostics-lighting-measurement.tsx`.
- `/diagnostics-seo-artifacts` — `noindex, nofollow` in `src/routes/_app/_operator/diagnostics-seo-artifacts.tsx`.
- `/operator/mode` — `src/pages/OperatorMode.tsx` sets `noindex: true`.
- `/operator/edge-alerts` — `src/pages/OperatorEdgeAlerts.tsx` sets `noindex: true`.
- `/operator/edge-metrics` — `src/pages/OperatorEdgeMetrics.tsx` sets `noindex: true`.
- `/operator/credits-audit` — `src/pages/OperatorCreditsAudit.tsx` sets `noindex: true`.
- `/operator/schema-audit` — `src/pages/OperatorSchemaAudit.tsx` sets `noindex: true`.
- `/operator/support-inbox` — `src/pages/OperatorSupportInbox.tsx` sets `noindex: true`.

`/diagnostics/quicklog` has no route `head()` and `src/pages/QuicklogDiagnostics.tsx` does not set `noindex`. The other operator pages in this list have no `noindex: true`. First head for those routes is the root shell `index, follow`. Live crawl behavior is **NOT_MEASURED**.

Manifest paths (`access: "operator"`, 32):

`/demo/one-tent-live-proof`; `/diagnostics`; `/diagnostics-lighting-measurement`; `/diagnostics-seo-artifacts`; `/diagnostics/quicklog`; `/ingest-inspector`; `/one-tent-loop-proof`; `/operator/ai-doctor-phase1`; `/operator/billing-entitlement-resolution`; `/operator/billing-subscription-updates`; `/operator/credits-audit`; `/operator/demo-preview`; `/operator/ecowitt`; `/operator/ecowitt-bridge-debug`; `/operator/ecowitt-bridge-status`; `/operator/ecowitt-live-bringup`; `/operator/ecowitt-tent-preview`; `/operator/edge-alerts`; `/operator/edge-metrics`; `/operator/mode`; `/operator/one-tent-live-proof`; `/operator/one-tent-loop-smoke-test`; `/operator/one-tent-proof-record`; `/operator/paddle-processing-audit`; `/operator/post-grow-reflection-dry-run`; `/operator/release-readiness`; `/operator/schema-audit`; `/operator/subscriber-growth`; `/operator/support-inbox`; `/pi-ingest-status`; `/sensors/ecowitt-audit`; `/sensors/ingest-normalizer`.

## Internal routes — sitemap excluded, robots.txt disallowed

`Disallow: /admin/`, `Disallow: /internal/`, and `Disallow: /leads`. No route `head()` robots meta was found on these six modules beyond the public `/internal/*` demos already listed above. Those public demos are `access: "public"` in the manifest, not `internal`.

Manifest paths (`access: "internal"`, 6):

`/admin/leads`; `/internal/ai-doctor-confidence-audit`; `/internal/ai-doctor-phase1-preview`; `/internal/one-tent-loop-proof`; `/internal/sensor-truth-audit`; `/leads`.

## Redirect aliases

These 18 manifest paths are `access: "redirect"`. They are not sitemap `<loc>` values. They have no independent index document except the strain aliases in the inventory, which are `noindex, follow` and canonical to the cultivar URL.

Permanent `vercel.json` redirects (historical repository config from the earlier Vercel host; production is Cloudflare Workers at https://verdantgrowdiary.com; live application **NOT_MEASURED**):

- `/features` and `/demo` to `/welcome`
- `/refunds` and `/refund-policy` to `/refund`
- `/terms-of-service` to `/terms`
- `/privacy-policy` to `/privacy`
- `/strains` to `/cultivars`
- `/strains/:slug` to `/cultivars/:slug`

Client redirects in route modules:

- `/features`, `/demo`, `/refunds`, `/refund-policy`, `/terms-of-service`, `/privacy-policy`, `/login` (`/auth`), `/register` and `/signup` (`/auth?mode=signup`), `/logs` (`/timeline`), `/action-queue` and `/tasks` (`/actions`), `/ai-doctor` (`/doctor`), `/grow-room` (`/`), `/strains` (`/cultivars`) use `RouteAliasRedirect`.
- `/strains/:slug` renders `LegacyStrainSlugRedirect` and also calls `staticRouteHead` for the alias document.
- `/billing/:plan` renders `LegacyBillingRedirect` (`/pricing` with a canonical plan query).
- `/upgrade` renders `LegacyUpgradeRedirect` (`/pricing` with allow-listed plan, acquisition, and return intent).

`Disallow` lines also name `/login`, `/signup`, `/register`, `/logs`, `/tasks`, `/action-queue`, and `/billing/`.

Manifest paths (`access: "redirect"`, 18):

`/action-queue`; `/ai-doctor`; `/billing/:plan`; `/demo`; `/features`; `/grow-room`; `/login`; `/logs`; `/privacy-policy`; `/refund-policy`; `/refunds`; `/register`; `/signup`; `/strains`; `/strains/:slug`; `/tasks`; `/terms-of-service`; `/upgrade`.

## Retired routes

`/customer/:shareId` and `/customer/:shareId/cannabis-care` are not manifest paths and are not mounted. `src/test/customer-mode-route-retirement.test.ts` pins that. `src/pages/CustomerModeGuide.tsx` and `src/pages/CustomerModeCannabisCareFaq.tsx` are not imported by a route module. A request for those paths matches `*`.

## What stays unmeasured

Search Console coverage, indexed-page counts, and the HTML or headers served by `https://verdantgrowdiary.com` for any row above are **NOT_MEASURED**.
