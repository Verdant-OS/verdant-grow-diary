# SEO Gate and Links Audit 2026-10-03

**Audited by:** Claude (Knowledge Library and Product Specification Architect), peer-observation capacity
**Measured against:** `verdant-grow-diary` deploy tip **`80176ba`** (#1864)
**Measurements taken:** 2026-10-03, read-only, in a Claude Code remote session
**Independent reviewer seat:** Grok (Claude touched this audit and cannot give its PASS)

This document is a **read-only peer audit**. It changes no product code, schema, policy, migration, or
governance file, and it carries no `Sentinel-Version` (it is not one of the twelve). Status words are
used literally: PASS, FAIL, BLOCKED, NOT_MEASURED, NOT_APPLICABLE, plus HOLD, GAP and OBSERVATION where
a page needed them. It was published first as a claude.ai page and committed here, unchanged in
substance, so the independent reviewer can read it from the repository.

---
_Verdant Grow Diary · peer audit by Claude · for independent review by Grok_

# Programmatic SEO gate, the guide link graph and public tools as acquisition, audited at the deploy tip

Three read-only audits from the agent prompt deck (prompts 33, 34 and 35), run against the deploy branch on 2026-10-03. The link graph was rebuilt from the guide registry in source, not from the committed link map. No code, content, sitemap or analytics configuration was changed. Claude's findings are peer observations; Grok supplies the independent verdict. Fifth page in the series; the others are linked in the footer.

- **Branch and tip:** verdant-grow-diary at `80176ba` (#1864)
- **Method:** Source reads, a graph rebuilt from `verdantSeoContent.ts`, sitemap and workflow greps. No GA4, Search Console or live site access.
- **Status vocabulary:** PASS · FAIL · HOLD · NOT_APPLICABLE · BLOCKED · OBSERVATION
- **Legend:** REJECT is the third verdict that prompt 33 allows (PASS, HOLD or REJECT), and it means do not build the template. NO_BASELINE in Audit 35 is quoted from `docs/seo/seo-baseline-2026-08-26.md`, and it means NOT_MEASURED.
- **Locks in force:** HOLD #1250, production database lock, publishing stop. Unchanged.

> **Calibrated verdict.** Cultivar pages are HOLD on governance alone: the data is careful and sourced, but every profile is hard-set to “sample” and indexed as if reviewed. Breeders have no eligible public source and are not a programmatic candidate today. The guide link graph is healthy at its core with seven orphans at the edge, fixable in content. The two public tools convert through honest paths, but the Quick Log starter is unmeasured and the database funnel cannot see signup source, so acquisition cannot be optimised until those two gaps close and an analytics read is authorised.

## Audit 33 · Programmatic SEO eligibility gate

> **Prompt.** Apply the programmatic eligibility gate to the strain and breeder/genetics page templates: unique useful data, distinct user need, trustworthy source and update path, human review, duplicate control, noindex for weak records, no private data, no unsupported strain, yield or diagnosis claims, genuine template differentiation. Issue PASS, HOLD or REJECT for each, with evidence.

- **Cultivars · /cultivars, 10 live slugs** **HOLD** Content and tone already pass. Governance does not: no profile has moved past the first rung of its own review ladder, and weak records are indexed identically to strong ones.
- **Breeders and genetics** **NOT_APPLICABLE** **REJECT if proposed** No public breeder template exists. `/breeder-beta` is one landing page; `/genetics/*` is auth-only and RLS-scoped. The library sets `breeder: null` where unverified, so a public index would fail the trustworthy-source gate before any template is written.

| Gate criterion (cultivars) | Status | Evidence |
| --- | --- | --- |
| Unique useful data | **PASS** | Lineage, flower weeks, stage environment ranges, reported tendencies with per-claim source keys, FAQ built from the same visible rows. `src/constants/strainReferenceLibrary.ts`: 10 seeds, 14 sources, 27 source-key references (the 27 is unverified). |
| Distinct user need | **PASS** | Each page answers “what should I expect from this cultivar and how sure is anyone”, framed as a starting hypothesis the grower's own logs override. |
| Trustworthy source and update path | **PASS** | `.github/workflows/strain-reference-library-v1-gate.yml` runs `scripts/verify-cultivar-sources.mjs` on push and PR: structural validation plus network reachability with a JSON report. The script never auto-elevates a source. Not one of the 35 required checks. |
| Human review defined | **FAIL** | `buildProfile` hard-sets every profile to `publicationStatus: "published"` and `verificationStatus: "sample"` (`src/constants/strainReferenceLibrary.ts:1019-1020`). The ladder sample → community → reviewed → verified exists in the type; no profile has climbed it, and no reviewer or review date is recorded anywhere. |
| Noindex for weak records | **FAIL** | The only noindex rule is for query-string variants of the index page (`src/lib/cultivarIndexSeoRules.ts:46`). A “sample” profile is indexed identically to a “verified” one; all 10 are in `public/sitemap.xml`. |
| Duplicate control | **PASS** | Unique slugs, aliases listed, `/strains/*` redirects to `/cultivars/*` with a static noindex head. |
| No private data | **PASS** | Public reference only. The P7 pillar draft correctly flags that per-accession screening history must never appear on these pages. |
| No unsupported strain, yield or diagnosis claims | **PASS** with caution | Lineage labelled “Reported lineage”; banner reads “Sample reference data — not plant-specific advice”; THC fields typed as reported and total. No certainty asserted. |
| Template differentiation | **PASS** | Sections, FAQ and sources differ per cultivar; P7's spot check of three found no invented lineage. |

### To reach PASS, as a spec

- Index and sitemap only profiles at `reviewed` or above; emit noindex, follow for `sample` and `community`. One rule in `cultivarDetailSeo.ts` and the static head builder, with test pins.
- Record reviewer and review date per profile in the seed, and let `buildProfile` derive `verificationStatus` from them instead of hard-setting it.
- Until then the 10 pages are honest but over-indexed. No content change is needed.

## Audit 34 · Internal link graph

> **Prompt.** Compare docs/seo/internal-link-map.md with the links actually rendered on public pages. Report orphans, circular pairs, pages exceeding the link bounds, and every article-to-product link into /quick-log and /tools/vpd-calculator. Linking serves readers; flag any anchor written for crawlers.

The committed map covers only the two lighting pages (28 pairs, floor of 20 enforced by `src/test/lighting-seo-cluster.test.ts`). The registry is wider, so the graph below was rebuilt from `src/constants/verdantSeoContent.ts` using each guide's `related` array plus every in-body link to another guide.

| Measure | Value | Reading |
| --- | --- | --- |
| Guides in the registry | 28 | Plus the separately routed stage-care guide, which is the one “dangling” target and not a defect. |
| Edges (related plus contextual) | 84 | About three per guide. |
| Reciprocal pairs | 19 | Mutual links between adjacent topics; none are keyword footers. |
| Related-array outbound per guide | 0 to 3 | Well within any sensible bound. Lighting pages carry 7 to 9 contextual links, the rest 3 to 6. |
| Orphans (zero inbound from any guide) | 7 | Reachable only from the `/guides` hub. Listed below. |
| Self-links | 0 |  |
| Hubs by inbound | 15 · 10 · 9 · 8 | sensor-truth-grow-room, what-to-log-in-a-grow-journal, daily-grow-log-checklist, grow-room-vpd-tracker. A healthy shape for a reference library. |
| Guides linking to /quick-log | 15 of 28 | Anchors read as decisions: “Draft the observation in Quick Log”, “Start a source-labeled Quick Log”. |
| Guides linking to /tools/vpd-calculator | 2 of 28 | Low given that four guides discuss VPD inputs directly. |
| Links from anonymous pages to protected routes | 0 | Matches the stated placement rule. |

### The seven orphans

- **Five brand nutrient diaries** (Cronk, Athena, Jacks, House and Garden, Canna): zero inbound and zero outbound. Candidates for one inbound each from `cannabis-nutrient-schedule` and a shared outbound to it.
- **oreoz-vs-gelonade-comparison**: links out to five guides, nothing links in. One inbound from the cultivar hub or the two cultivar pages it compares would close it.
- **grow-journal-app-without-account**: the natural home for an inbound is the Quick Log starter's own FAQ, which already describes the same promise.

Fix is content-only. Extend the link-map document from “lighting cluster” to the whole registry and generalise the orphan assertion in the cluster test so a new guide cannot land unlinked.

## Audit 35 · Public tools as acquisition

> **Prompt.** Audit /tools/vpd-calculator and /quick-log as credential-free entry points: what is the path from a completed calculation or local draft to signup, where is each step's funnel event recorded, and what is lost when the visitor leaves? Spec the smallest bridge that keeps drafts local until consent. Report any GA4 or GSC figure as BLOCKED unless an authorized export is attached.

| Surface | Status | Path to signup | Funnel visibility |
| --- | --- | --- | --- |
| `/tools/vpd-calculator` | **PASS** | Attributed signup and pricing links built with `source: "vpd_calculator"`; a signup CTA fires after a completed calculation. `src/pages/PublicVpdCalculator.tsx:41-42, 644` | Eight gtag events: page view, completed, reset, pricing clicked, signup clicked, share clicked, completed, failed (`src/lib/pricingAnalytics.ts:23-30`). Browser-side, consent-dependent. |
| `/quick-log` starter | **OBSERVATION** | Draft lives in localStorage only. One outbound CTA to `/auth?mode=signup&redirectTo=/onboarding` carrying only the five allow-listed UTMs (`src/lib/quickLogStarterLinks.ts:46-56`). After signup, `PublicQuickLogHandoffCard` offers “Continue your Quick Log” and seeds the real form; no background upload, the only mutation is clearing the local draft. | No event of any kind. The starter page emits nothing to gtag and nothing to the database sink. |
| Guides to tools | **PASS** | 15 guides route to the starter, 2 to the calculator, with `utm_source=organic_guide` and `utm_content=`. | Carried into the attributed URL; visible only if the destination records it. |
| Signup attribution | **OBSERVATION** | `verdant_signup_source` is written to auth metadata from the attributed URL (`src/lib/signupAcquisitionRules.ts:8, 67`). | The database funnel `signup` event records only `method` (`src/lib/funnelEventSchema.ts:35`). The sink writes only after consent and only for signed-in users, so the anonymous half of the funnel is invisible by design. |
| GA4 and Search Console figures | **BLOCKED** | `docs/seo/seo-baseline-2026-08-26.md`: NO_BASELINE / BLOCKED. No authorised export or read access exists in this session. No number is quoted on this page. |

### What is lost when the visitor leaves

- A completed VPD calculation is counted as an event but not kept. Correct for privacy; the share link is the only persistence.
- A starter draft is kept on the device but not counted. The product's best credential-free trial has no measured top of funnel.

### Smallest bridge, as a spec

- Add three gtag-only events to the starter through the existing `pricingAnalytics` allow-list, consent-gated exactly like the calculator's: `quick_log_starter_viewed`, `quick_log_starter_draft_saved`, `quick_log_starter_signup_clicked`. No draft content in any payload.
- Add `source` to the database `signup` event params, populated from `verdant_signup_source`, so the handoff can be measured server-side once the owner grants an analytics read. One schema entry, one sink call site, test pins.
- Both changes keep the draft local until the grower chooses to sign up. Nothing here needs a schema, RLS or Edge Function change.

## Independent review checklist for Grok

1. Confirm `buildProfile` hard-sets `verificationStatus: "sample"` for all 10 cultivars and that no noindex rule keys on that status. If so, second the HOLD and the two-step path to PASS.
2. Rule on the breeder question: is “no public breeder template, REJECT if proposed” the right standing answer, or should the gate document record it as deferred?
3. Re-run the orphan count with your own parse of `verdantSeoContent.ts`. Claude's first pass over-counted and was corrected; the seven listed are from the corrected pass.
4. Judge whether the starter should emit gtag events at all, given its “no server involved” promise. Claude's view: page-level events under the same consent gate as the calculator do not break that promise; the draft never leaves the browser.
5. Advise Matthew on authorising a GA4 or Search Console read for one agent, since every acquisition number on this page is BLOCKED without it.
6. Record your verdict at this exact tip, `80176ba`. Claude touched this audit and cannot give it an independent PASS.

---

Prepared by Claude as peer observations on 2026-10-03 against verdant-grow-diary at 80176ba (#1864). Companion pages: [Billing Truth Audit](https://claude.ai/artifact/JvzUc1Fg1Gj72EcYqwwU3A), [Pricing Copy Audit](https://claude.ai/artifact/XjfJ5cE4SWNiZYyUoapgVx), [Checkout and Credits Audit](https://claude.ai/artifact/Qzv8sCRPdbkJyUWCL1hpc5), [Docs and Indexation Audit](https://claude.ai/artifact/9pNNDMrdSTpTQFE6hSAK1Y). Sources: src/constants/strainReferenceLibrary.ts, src/lib/strainSourceVerification.ts, src/lib/cultivarIndexSeoRules.ts, src/pages/CultivarPage.tsx, scripts/verify-cultivar-sources.mjs, .github/workflows/strain-reference-library-v1-gate.yml, src/constants/verdantSeoContent.ts, docs/seo/internal-link-map.md, src/test/lighting-seo-cluster.test.ts, src/pages/PublicVpdCalculator.tsx, src/pages/QuickLogStarter.tsx, src/lib/quickLogStarterLinks.ts, src/components/PublicQuickLogHandoffCard.tsx, src/lib/pricingAnalytics.ts, src/lib/signupAcquisitionRules.ts, src/lib/funnelEventSchema.ts, src/lib/funnelEventDbSinkRules.ts, docs/seo/seo-baseline-2026-08-26.md, and the P7 pillar draft. No Publish, SQL apply, charge, role change, device control or Action Queue operation is authorized by this page.
