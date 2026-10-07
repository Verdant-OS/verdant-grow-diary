# Docs and Indexation Audit 2026-10-03

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

# Billing docs truth, indexation matrix drift and knowledge library pillar readiness, audited at the deploy tip

Three read-only audits from the agent prompt deck (prompts 30, 31 and 32), run against the deploy branch on 2026-10-03. Every row cites the file it was read from. No code, documentation, sitemap or draft was changed. Claude's findings are peer observations; Grok supplies the independent verdict. Fourth page in the series; the others are linked in the footer.

- **Branch and tip:** verdant-grow-diary at `80176ba` (#1864)
- **Method:** Source and documentation reads, byte counts, route and sitemap greps. No Search Console, GA4 or live site access.
- **Status vocabulary:** PASS · FAIL · HOLD · NOT_MEASURED · OBSERVATION
- **Legend:** In Audit 30, the Mark column holds document-currency marks, not status words. The marks are CURRENT, CURRENT HEADER, CURRENT DATED, SUPERSEDED IN PART, DESIGN ONLY, SANDBOX PREMISE and SANDBOX-ONLY, which answer prompt 30's "current, superseded or sandbox-only". REJECT is the third verdict that prompt 32 allows (PASS, HOLD or REJECT), and it means do not proceed.
- **Legend (NO_BASELINE):** `docs/seo/route-indexation-matrix.md` uses NO_BASELINE to mean no Search Console baseline exists. This page quotes the word but reports the status as NOT_MEASURED.
- **Locks in force:** HOLD #1250, production database lock, publishing stop. Unchanged.

> **Calibrated verdict.** The billing documentation set is one current page scattered across ten files, four of which still carry a sandbox-only premise the 2026-08-25 standing directive retired. The indexation matrix is stale by three public routes and an unresolvable tip stamp, a documentation defect with no production effect. _Superseded in part, see index §4 errata: the tip stamp resolves (#558) and is about two months stale._ Both pillar drafts are HOLD for the same reason: they wait on independent evidence review an author cannot supply, not on more writing. REJECT applies to neither.

## Audit 30 · Billing documentation truth table

> **Prompt.** List every file matching docs/billing*.md, docs/ai-credit-*.md and docs/runbook-ai-doctor-credits-live.md. Mark each current, superseded or sandbox-only, with the row in CURRENT_STATE.md that justifies the mark. Produce the one-page billing truth table a new agent needs before touching entitlements.

| Document | Bytes | Mark | Why, with the justifying row |
| --- | --- | --- | --- |
| `docs/billing.md` | 9,125 | **SUPERSEDED IN PART** | Header: “Status: sandbox / test mode only. No live charges are accepted.” CURRENT_STATE's standing directive (recorded 2026-08-25, "Payments intent: sandbox-only checkout as settled policy → live checkout is the goal") retired that premise. The compliance note and the 2026-07-16 canonical-chain paragraph remain current. |
| `docs/billing-entitlement-updater-rpc-design.md` | 14,919 | **DESIGN ONLY** | Dated 2026-06-21, self-labelled “Not implemented”. Proposes `public.apply_paddle_entitlement_update`, which appears in no migration. Keep as history or delete. |
| `docs/billing-level-two-launch-gate.md` | 5,608 | **SANDBOX PREMISE** | “Live mode remains explicitly blocked until a future, dedicated slice approves it.” Overtaken by the standing directive. The gate list itself still reads as a usable pre-live checklist. |
| `docs/billing-level-two-migration-apply-order.md` | 5,382 | **SANDBOX-ONLY** | Apply order for a non-production database. Production applies are owner-only under the database lock (CURRENT_STATE §11 Current locks); no agent uses this document. |
| `docs/billing-level-two-sandbox-operator-checklist.md` | 3,747 | **SANDBOX-ONLY** | Same disposition. |
| `docs/billing-level-two-supabase-sql-verification-checklist.md` | 6,345 | **SANDBOX-ONLY** | Read-only SQL checklist. Still usable by the owner against production; the header premise is stale. |
| `docs/billing-level-two-sandbox-verification-runbook.md` | 8,118 | **CURRENT HEADER** | Restamped 2026-09-28 with the production-only hosted verification policy. Its own procedure section is marked “superseded for hosted verification”. |
| `docs/billing-level-two-sandbox-migration-operator-runbook.md` | 5,661 | **CURRENT HEADER** | Same restamp, same split between current policy and historical body. |
| `docs/ai-credit-billing-environment-rollout.md` | 7,711 | **CURRENT** | Expand-then-contract plan for the service-only spend and refund overloads. Matches the signature revokes in migration `20260728090736` lines 392-408. |
| `docs/ai-credit-service-contract-effect-verification.md` | 8,184 | **CURRENT** | Five-field audit contract keyed on migration `20260727050000`; boolean null means unknown, never healthy. Script `verify-ai-credit-service-contract-effect.mjs` exists. |
| `docs/runbook-ai-doctor-credits-live.md` | 4,336 | **CURRENT, DATED** | Written 2026-08-12 against real production. Its “22 spends ever, none since 2026-07-03” row is a point-in-time fact and is NOT_MEASURED today. |

One-page truth for a new agent.

1. `public.subscriptions` is the only entitlement source. `profiles.tier` and `billing_subscriptions` grant nothing.
2. Live rows entitle; sandbox rows entitle only when the server explicitly expects sandbox. Database gates consider live rows only.
3. The standing directive makes production the reference database and live checkout the goal. Every “sandbox-only” header above is a historical premise, not a current fence.
4. Publishing is stopped by owner order while the live-payments-token finding (recorded 2026-08-21, severity corrected 2026-08-22) stands.
5. Free 3 AI credits per grow; Pro and Founder 100 per UTC month; Craft 300. Spend and refund are service-only RPCs; refunds are append-only reversal rows.
6. Production database changes, spend ceiling, publish gates and the publish decision remain Matthew's.

Consolidation proposal, docs only: one current `docs/billing.md` rewritten from the six points above, the two restamped runbooks kept, and the five Level Two files plus the updater design moved to an archive folder with a one-line disposition each.

## Audit 31 · Indexation matrix versus manifest versus mounted tree

> **Prompt.** Cross-check docs/seo/route-indexation-matrix.md against src/lib/appRouteManifest.ts and the mounted routes. For every public route list index state, canonical, and whether JSON-LD is emitted from __root.tsx or the page. Report drift between matrix, manifest and tree as FAIL rows.

| Check | Status | Evidence |
| --- | --- | --- |
| Matrix pinned to the current manifest | **FAIL** | Header cites manifest tip `1c40c21f2`, which is not an object in this clone, and counts 134 routes: 39 public, 42 auth, 29 operator, 6 internal, 18 redirects. The manifest today (`src/lib/appRouteManifest.ts`) has 144 routes: 42 public, 46 auth, 32 operator, 6 internal, 18 redirects. Corrected on re-verification: the matrix was last changed in `16a575129` (#685, 2026-08-02) and the manifest in `816894ba9` (#1141, 2026-08-26), so the manifest gained rows after the matrix was last refreshed. The earlier `a695f5d` attribution was a shallow-clone artifact. _Superseded, see index §4 errata: `1c40c21f2` exists (#558, 2026-07-29); the stamp is about two months stale._ |
| Public routes missing from the matrix | **FAIL** | `/tools/blueprint-targets` and `/tools/grow-help-toolkit` are public in the manifest (`src/lib/appRouteManifest.ts:512, 517`) and present in `public/sitemap.xml`, but appear in no matrix row. `/customer/guide/oreoz-vs-gelonade-comparison` is public, described in the manifest as noindex (`src/lib/appRouteManifest.ts:124-127`), and also absent. It is also listed in `public/sitemap.xml`. Three routes with no recorded index policy. |
| Mounted tree versus manifest | **PASS** | Every public file under `src/routes/` has a manifest row. The alias files (`strains.*`, `login`, `register`, `signup`, `features`, `demo`, the legal aliases, `upgrade`, `billing.$plan`) are marked `redirect`. `strains.index.tsx` renders a static noindex head plus `RouteAliasRedirect`, matching the matrix's redirect row. |
| Canonical and JSON-LD emission | **PASS** by source | Static heads from `src/lib/build/staticRouteHead` at build time; client heads from `usePageSeo`; sitewide Organization and WebSite schema from `src/routes/__root.tsx`. Matches the matrix's “static plus client head, self-canonical” description. |
| Manifest-versus-tree test exists | **PASS** | `src/test/helpers/routeManifestSyncHarness.ts`, consumed by three tests including `verdant-seo-guides-public-links.test.tsx`. |
| Sitemap and robots parity | **NOT_MEASURED** | `scripts/check-sitemap-robots-parity.mjs` exists; not run in this pass. |
| Live index status | **NOT_MEASURED** | No baseline exists; the matrix records NO_BASELINE for every row. No Search Console read was attempted. |

Fix is docs-only: refresh the header stamp to the current tip, add three rows with their intended index state, and recount the coverage line. No code.

## Audit 32 · Knowledge library pillar review

> **Prompt.** Review the P2 environment and P7 genetics pillar drafts against the page-type contract: evidence and uncertainty sections, claim labels, internal links, review cadence, thin-content rejection criteria. Issue PASS, HOLD or REJECT per draft with the failing criterion quoted.

| Draft | Verdict | Failing criterion | What is already in place |
| --- | --- | --- | --- |
| P2 Environment, climate and light `docs/knowledge-library-pillar-p2-environment-draft.md`, 89,863 bytes | **HOLD** | Self-declared pre-`drafted`. Entry artifact missing: “KL-002's brief is at draft, not reviewed, and no evidence editor has approved §8.” Five evidence blockers stand open: C05 single-source, C04b conflicted, C08 trade press only on an R3 claim, C04a and C10 unread sources. | All eight original assets built under `knowledge-library/assets/p2-environment/`. Eleven-row source register led by FAO 56 and peer-reviewed cannabis studies. Uncertainty addressed in thirteen places. 24 KL cross-references and six concrete guide and tool links. §9 product-truth section verified against the deploy branch. Reviewer fields deliberately unfilled because an author cannot self-approve R2 and R3 material. |
| P7 Genetics, cultivars and propagation `docs/knowledge-library-pillar-p7-genetics-draft.md`, 20,141 bytes | **HOLD** | Self-declared `drafted` with zero reviews passed: “has not passed evidence_review, cultivation_review, product_truth_review, technical_review, or copy_accessibility_review.” Claim map is an author's first pass of eight rows; the trial-design citation is a flagged proxy; search-research receipt BLOCKED on GA4 and GSC; original assets “sketched, not finished”. | Correctly refuses to assert any commercial cultivar lineage and says so explicitly. Sources are extension and PMC primary literature. Target route and roadmap record are named. Publishing would unlock eleven `blocked_parent` records, which raises the cost of a premature clear. |

### Notes for the reviewer

- **Thin-content test:** neither draft fails it. Both exceed the standard pillar anatomy in `docs/knowledge-library/pillar-pages.md` and its ten shared acceptance gates.
- **Claim labels:** neither uses AGENTS.md's inline labels (established fact, source claim, inference). Both carry a claim map with risk class R0 to R3 and source role, which is the library's own contract in `content-standards.md`. That is acceptable. The two standards should state the equivalence once, so future reviewers stop flagging it.
- **Review cadence:** P2 names invalidation triggers and next-review slots; P7 does not yet. Both are blank by design until an evidence editor fills them.
- **Blocking resource:** both drafts are waiting on the same seat, an independent evidence editor for R2 and R3 claims. That is a staffing decision for Matthew, not an authoring task.

## Independent review checklist for Grok

1. Confirm the six-point billing truth above against `unionEntitlementLookup.ts`, `ai_credit_allowance` and CURRENT_STATE's standing directive. Correct any point you can falsify from source.
2. Approve or reject the consolidation of the five Level Two files and the updater design into an archive folder. Docs-only; no Sentinel bump since none of the twelve governance files is touched.
3. Verify the manifest counts (144 total, 42 public) with your own grep and confirm the three missing matrix routes.
4. Run `scripts/check-sitemap-robots-parity.mjs` if you have a build; Claude did not.
5. Second the two HOLD verdicts or overturn them with the criterion that clears each draft. Neither can move without an evidence editor; advise Matthew on filling that seat.
6. Record your verdict at this exact tip, `80176ba`. Claude touched this audit and cannot give it an independent PASS.

---

Prepared by Claude as peer observations on 2026-10-03 against verdant-grow-diary at 80176ba (#1864). Companion pages: [Billing Truth Audit](https://claude.ai/artifact/JvzUc1Fg1Gj72EcYqwwU3A), [Pricing Copy Audit](https://claude.ai/artifact/XjfJ5cE4SWNiZYyUoapgVx), [Checkout and Credits Audit](https://claude.ai/artifact/Qzv8sCRPdbkJyUWCL1hpc5). Sources: the eleven billing and credit documents named above, docs/agents/CURRENT_STATE.md (standing directive, live-token finding, §11 locks), docs/seo/route-indexation-matrix.md, src/lib/appRouteManifest.ts, src/routes/, public/sitemap.xml, src/test/helpers/routeManifestSyncHarness.ts, docs/knowledge-library/pillar-pages.md and content-standards.md, and the two pillar drafts. No Publish, SQL apply, charge, role change, device control or Action Queue operation is authorized by this page.
