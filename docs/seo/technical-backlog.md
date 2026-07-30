# Verdant technical SEO backlog

**Baseline:** 2026-07-30, repository commit `1c40c21f2`.<br>
Priority means user-data and crawl risk first; it does not imply a live Search Console verdict.

## P0 — confirmed blockers

No confirmed P0 issue was found in the static audit. Protected paths are covered by robots-prefix tests and are excluded from the sitemap. Live Search Console verification remains **NO_BASELINE**.

## P1 — fix in the current safe slice

| Finding                                           | Why it matters                                                                                              | Safe implementation                                                                                                             | Proof of done                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Checkout success/cancel can emit `index, follow`  | Transactional return pages should never become search landing pages.                                        | Client `noindex` plus route-local static noindex head documents; keep them out of sitemap.                                      | Focused head tests and built static documents show one `noindex, follow` robots tag and self-canonical. |
| Public aliases rely on client redirects           | Non-JS/first-pass crawlers can receive a 200 root-canonical shell instead of a permanent redirect.          | Add host redirects only for simple fixed public aliases; leave query-transforming/private aliases unchanged.                    | Focused `vercel.json` contract test confirms the six safe redirects and targets.                        |
| GSC monitor sees only first 15 of 47 sitemap URLs | Important public URLs, including a never-allowlisted guide, are never inspected by the scheduled live pass. | Use the existing hard cap of 50 as the default while the sitemap is below that count; label the workflow accurately as post-CI. | Workflow/static test plus monitoring script tests.                                                      |

## P1 — blocked or requires a separate decision

| Finding                                                              | Blocker or decision                                                                                                       | Next action                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracked GSC-finding verification is inert                            | `config/seo-last-gsc-finding.json` is intentionally a placeholder. Inventing a finding would be false.                    | GSC owner supplies one real finding, affected public URLs, and expected resolution; then run authenticated inspection.                                                                                                                      |
| “Post-deploy” cannot be proven from CI completion                    | The publisher is outside this workflow; CI also runs for PRs.                                                             | Keep the workflow accurately named post-CI. Have the production publisher manually dispatch the workflow with deployed URL and commit after publish, or add a real deployment-success trigger only when the publisher integration is known. |
| Article `datePublished`/`dateModified` uses a shared historical date | There is no per-guide content provenance field to support truthful dates.                                                 | Add a reviewed per-guide provenance field, or omit unverified Article dates. Do not copy sitemap `lastmod` values into schema without evidence.                                                                                             |
| Dynamic pheno comparison/showcase routes can read owner-scoped data  | The routes are public topology and robot-blocked, but need explicit noindex policy review independent of access behavior. | Add a tested noindex route policy before any discovery promotion; do not make grow data public.                                                                                                                                             |

## P2 — next sprint

| Finding                                                                   | Recommendation                                                                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture pheno previews are static-index candidates but are not in sitemap | Make an owner decision: acquisition demo with a clear product path, or noindex fixture-only preview. Do not leave the purpose ambiguous.              |
| `/docs/mcp-api` is static-only and unsitemapped                           | Keep it out of sitemap unless documentation acquisition is a deliberate goal; otherwise explicitly noindex it.                                        |
| Static public aliases beyond the fixed set                                | Audit query-preservation semantics and add host redirects/noindex aliases case by case.                                                               |
| `docs/lighthouse-ci.md` has an older sitemap-count statement              | Refresh it with the current count and pin the local LHCI path if local reproducibility is required.                                                   |
| Analytics consent behavior                                                | Make consent/opt-out policy explicit before adding any new content events.                                                                            |
| Branded nutrient guide duplication and Cronk disclosure                   | Resolve on the branch that owns the shared guide registry after PR #560 lands; retain a visible material-relationship disclosure before distribution. |

## P3 — experiments and optimization

| Idea                                           | Guardrail                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Search-console-based title/snippet experiments | Run only after an authenticated baseline establishes impressions and query intent.                                |
| Sitemap-priority or lastmod refinements        | Change only from verified publication dates, not convenient timestamps.                                           |
| Lighthouse optimization                        | Use production median results and fix the highest-impact resource/layout issue rather than broad bundle rewrites. |
| FAQ rich-result review                         | FAQPage must exactly match visible questions and answers; do not add it only to chase a SERP treatment.           |
