# Quick Log and cultivar structured-data repair

Task: SEO-10225273-SCHEMA. Author: Codex, directly assigned by Matthew on
2026-10-19. Stay draft; no merge, deployment, Search Console work or content
expansion. Independent acceptance route: Critical Mass (shared library and tests).

## Evidence and bounded scope

The Ahrefs project 10225273 crawl dated 2026-10-14 01:20 UTC reported 19
Quick Log rich-result URLs (the canonical and 18 canonicalized UTM variants)
and ten intentionally noindexed cultivar URLs. Its API did not identify the
invalid cultivar properties; those are reproduced independently below.

The initial workspace was clean on `work` at
`9e5c7a1ab1ff0955eb9cb3fc95c5129bf47cd12d`. Authenticated GitHub access and
`git fetch origin verdant-grow-diary` succeeded. This task branch,
`codex/seo-10225273-schema`, starts from deploy tip
`c0ce65cb37498d346f46ec5d0a5a6c2f21a8da9a`.

Public captures on 2026-10-19 at 22:32 UTC bracketed by `/version.json` both
reported that same SHA. Quick Log and all ten cultivar URLs returned HTTP 200.
The canonical and a synthetic representative UTM variant had equivalent parsed
JSON-LD and canonicalized to `/quick-log`; the synthetic URL is not claimed to
be one of the exact 18 Ahrefs URLs. No UTM values appeared in their JSON-LD.
All ten cultivar pages retained self canonicals and `noindex, follow`.
Raw captures and extracted JSON-LD: `/tmp/verdant-seo-live/` (local evidence,
not a durable repository artifact). Page responses did not expose immutable
per-response revision headers; the bracketing version samples cannot rule
out mixed serving. The live defect matches this crawl category, but the
undisclosed October 14 property cannot be attributed definitively to it.

The affected cultivar slugs are `blue-cookies`, `sour-stomper`,
`lemon-cherry-gelato`, `sour-diesel`, `do-si-dos`, `gg4`, `blue-dream`,
`jack-herer`, `oreoz` and `og-kush`.

Each live cultivar CollectionPage emits `about.@type = Thing` with
`about.additionalProperty` containing PropertyValue entries. The same path is
produced by `buildCultivarCollectionJsonLd` in `src/lib/seoStructuredData.ts`.
The [additionalProperty domain](https://schema.org/additionalProperty) excludes
bare Thing. [CreativeWork.about](https://schema.org/about) accepts Thing,
and [PropertyValue](https://schema.org/PropertyValue) is a Thing subtype.
Prediction: moving the existing trait nodes into the page's `about` array,
alongside the cultivar Thing, removes this domain mismatch while preserving
all reported values and the reference-page model.

The production allowlist is only `src/lib/seoStructuredData.ts`. New regression
files and this receipt are allowed. Existing tests and
`scripts/validate-jsonld-rich-results.mjs` are protected and remain unchanged.
The current validator accepts the invalid nested property, so its pass alone
does not prove schema.org domain validity. The repair preserves every trait
as a topic of the reference page; it does not assert custom property edges
from the cultivar Thing or promise Google rich-result eligibility.

## Ownership and Quick Log handoff

An authenticated inventory inspected 89 open PRs before edits. No observed PR
changes the shared `seoStructuredData.ts`. This is inspected-scope evidence;
the shared fleet registry was unavailable in this environment.

Claude owns these open branches; this task does not edit or push them:

- [#2023](https://github.com/Verdant-OS/verdant-grow-diary/pull/2023),
  `cursor/welcome-home-redirect-05d3`, observed head
  `7d9ea580b9f728685770a34859a1d9fcee87f972`.
- [#2028](https://github.com/Verdant-OS/verdant-grow-diary/pull/2028),
  `cursor/stop-selling-founder-lifetime-0628`, observed head
  `40041ace366420499adfc972c255242d0fc9e7d5`.

Both touch `src/lib/build/staticPublicSeoDocuments.ts`; #2023 also touches
`src/lib/cultivarDetailSeo.ts` and `src/pages/CultivarPage.tsx`. Those files,
their branches, sitemaps and owned tests are excluded from this task's edits.
The shared builder repair reaches their existing callers without editing
them or changing verification status, noindex, descriptions or quality holds.

Quick Log currently has a route-local SoftwareApplication with no offers,
aggregateRating or review, plus the shared site SoftwareApplication with offers
but no aggregateRating/review. These are schema.org-valid nodes with unmet
[Google software-app rich-result requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app):
`offers.price` and either `aggregateRating` or `review` are required along with
name. This does not justify fabricated reviews, ratings, prices or eligibility
claims. The 19 crawl URLs describe one canonical page rather than 19 repairs.

Owner action for Claude: reconcile the route-local SoftwareApplication in
`staticPublicSeoDocuments.ts` with the hydrated app script in
`src/pages/QuickLogStarter.tsx`. A WebPage description already exists for the
route. Consider removing the redundant route-local app node from both paths
while preserving the visible FAQ, canonical and local-only draft truth. Decide
the shared site app separately: removing only the local node does not make the
remaining site app eligible. Do not add ratings or reviews without real,
visible evidence. This packet is a handoff, not a competing implementation.

Proposed nonoverlapping new regression:
`src/test/public-quick-log-rich-result-contract.test.tsx`, subject to a fresh
owner collision check. Exercise both resolved static metadata and the hydrated
QuickLogStarter head; check a single canonical WebPage, FAQ/visible-copy parity,
no duplicate local app identity after navigation, no invented review/rating or
price, UTM-free schema and unchanged browser-local draft behavior. Include
the root site schema in the inspection so an app node remaining there is not
silently counted as repaired.

Existing protected `src/test/static-public-seo-documents.test.ts` explicitly
expects SoftwareApplication on `/quick-log`. Updating that assertion needs
specific owner approval. No unlock or edit is performed by this task.

## Implementation and validation

Draft [#2259](https://github.com/Verdant-OS/verdant-grow-diary/pull/2259) was
opened at documentation-only commit
`bf606435a69ceed5fc65bf7acf4cf7a0273e252f` before implementation. The only
production change is the shared builder's `about` value: cultivar Thing first,
followed by the existing filtered PropertyValue entries. Both static metadata
and the client effect already use it; neither caller was edited.

New `src/test/cultivar-schema-domain-regression.test.tsx` exercises every one
of the ten affected static and hydrated outputs, exact trait/alias parity,
canonical/noindex holds, effect cleanup, blank traits, empty evidence,
determinism and safe serialization. No tracked test or validator was edited
or unlocked. The old shape fails the new domain assertion, not a setup error.

- Baseline at `c0ce65cb3`: 4 existing files, 36 PASS / 0 FAIL.
- RED at `bf606435a` before the production edit: 23 FAIL / 0 PASS.
- GREEN with the repaired builder: 23 PASS / 0 FAIL / 0 SKIP.
- Related suite: 9 files, 103 PASS / 0 FAIL / 0 SKIP, including the new 23,
  existing cultivar static/client metadata, validator, app offer-truth and
  public Quick Log safety coverage.
- Scoped ESLint, strict scorer report and diff whitespace check: PASS.
- Full `bun run typecheck`: PASS (exit 0).
- Production build/postbuild validators: NOT_MEASURED, pending committed tree.
- Full repository suite: NOT_MEASURED; the bounded related suite is reported.
- Codex peer review: no findings; not independent acceptance.
- Hosted final-head CI and Critical Mass acceptance: NOT_MEASURED.

Local receipts: `/tmp/verdant-seo-{baseline,red,green,focused}.log`; machine
results `/tmp/verdant-seo-{red,green,focused}.json`. Production SHA-256 before:
`586bb55fa59c75758bfb094b60690e946d67abddd030e92c3a23c681e5c9a343`;
after: `c2385da97aceecc820eb898e558ab40eec29af7099a0a873461f91e17f65cc1a`.
The RED and GREEN receipts use the same test assertions; later Prettier changes
only format the new test. Exact final-head checks belong in the draft PR body.

Status: cultivar source repair verified locally; Quick Log handed to Claude.
Next owner: Critical Mass for acceptance via normal routing; Claude for the
Quick Log decision and protected-test approval. No live repair, production
browser validation, complete Google Rich Results Test or Ahrefs re-crawl has
been measured. No merge, ready, enqueue, publish or deployment is authorized.
Rollback is a normal reviewed revert of the shared builder change; it restores
the known invalid property and therefore is not recommended as a fix.
