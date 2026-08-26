# Verdant Knowledge Library

## Mission

Build the most useful, evidence-aware cannabis cultivation reference on the web: a library that helps a grower understand what changed, decide what to verify, and record the result. The model is closer to MDN or Wikipedia than a blog. Pages are durable reference nodes in a knowledge graph, not disposable keyword posts.

The library extends Verdant's product promise:

> Plant memory. Sensor truth. Better decisions.

## Audience and scope

The first release is an **indoor-first cultivation reference** for home growers, craft operators, and cultivation teams. It teaches transferable plant, environment, measurement, root-zone, health, genetics, harvest, and equipment principles while identifying where scale changes the procedure or review burden.

- Indoor rooms and tents are the canonical applicability context for v1 unless a page states a narrower context.
- Greenhouse and outdoor cultivation are explicit future expansions. A v1 page may explain a shared principle, but it must not imply that an indoor procedure, environmental range, pest program, equipment assumption, or legal constraint automatically applies outdoors or under glass.
- Jurisdiction-specific pesticide, worker-safety, electrical, building, environmental, and cannabis rules are not generalized. Pages identify the governing authority and direct the reader to the current label, code, regulator, or qualified professional.
- The library does not publish medical, therapeutic, consumption, impairment, legal-evasion, or device-control guidance.
- Cultivar tendencies, field records, and vendor specifications are bounded claims, not universal plant behavior or endorsements.

Every page records its audience, facility context, cultivation stage, medium or system when relevant, jurisdiction limits, and known non-applicability. Missing applicability evidence remains unknown.

## Definition of done

A library page is publishable only when it:

1. answers one clear grower job without requiring a second search;
2. distinguishes measured facts, source-reported tendencies, field observations, and unknowns;
3. shows prerequisites, confounders, and the evidence needed before acting;
4. cites primary or authoritative sources at the claim level;
5. receives cultivation, evidence, product-truth, technical, and copy review, plus qualified safety review when its risk class requires it; lower-risk pages record the safety-review skip as an entry guard, never as a substitute for product-truth review;
6. satisfies the page-family link contract for breadcrumb/parent, real prerequisites, contextual or collection/profile routes, differentials when applicable, and the next practical step; declared conditional omissions carry reviewed N/A receipts;
7. provides a useful non-product next step and offers no more than one contextual Verdant action, only when shipped product behavior supports the claim;
8. has a named owner, publication date, review date, applicability statement, and change history;
9. passes schema, graph, link, structured-data, accessibility, canonical, and sitemap gates; and
10. contains no autonomous-control, medical-effect, guaranteed-outcome, or fake-live claim.

Every page provides a non-product next step. A page may additionally offer zero or one product CTA. Urgent safety, pesticide-label, legal, electrical, HVAC, structural, fire, and CO2 pages default to zero product CTAs and direct the reader to the governing label, an isolation or measurement step, or a qualified professional as appropriate.

## Authority and public trust

Authority is matched to the claim; it is not a single universal source ranking.

1. **Law, label, and safety requirements:** the current jurisdictional authority, pesticide label, code, or adopted standard controls. A blog, field practice, or vendor summary cannot override it.
2. **Verdant capability claims:** shipped routes, server behavior, entitlement rules, and current product tests control. Roadmap intent and editorial drafts are never presented as available functionality.
3. **Measurement claims:** a disclosed method, calibrated instrument, unit, placement, timestamp, uncertainty, and raw or source record control. A derived value is labeled derived and does not outrank its inputs.
4. **Mechanism and cultivation claims:** cannabis-specific primary research, systematic evidence, extension guidance, and validated methods are preferred according to the question. Proxy-crop evidence is labeled and its transfer limits are stated.
5. **Entity and specification claims:** manufacturers and breeders are authoritative only for their own documented specifications, releases, and lineage claims. Those claims do not prove field performance, compatibility, genotype, or outcome.
6. **Experience claims:** named protocols and anonymized field records may show a bounded observation or generate a hypothesis. They never become universal proof without supporting evidence.

Public pages expose the author, domain reviewers, relevant qualifications or experience, conflicts and product relationships, source list, methods, publication and modification dates, review deadline, version, correction link, and material change history. Credentials and endorsements are verified rather than inferred. Corrections remain visible; dates are never refreshed for appearance.

## Library quality SLOs

These service-level objectives apply to the published corpus and are checked per release:

| Dimension                 | Publication SLO                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reader job                | 100% of pages name one testable reader outcome; before a pillar launch, at least 80% of a minimum five-person representative task sample completes the stated job without a second search.                                     |
| Claim traceability        | 100% of material factual and quantitative claims have a claim-level source or an explicit `unknown`, `disputed`, or `field observation` state.                                                                                 |
| Numeric truth             | 100% of numeric ranges state units, method or basis, applicability context, and source; derived metrics identify their inputs.                                                                                                 |
| Review independence       | 100% of high-risk pages have distinct cultivation and evidence approvers, neither of whom is the sole author.                                                                                                                  |
| Freshness                 | 100% of published pages have an owner and next-review date; overdue high-risk pages enter `refresh_due` and cannot receive cosmetic date changes.                                                                              |
| Graph health              | Zero published orphan pages, zero `parent_of` cycles, and every page satisfies its prerequisite, lateral, differential where applicable, and next-step edge contract.                                                          |
| Link integrity            | Zero broken or redirecting internal links in published content and zero public links to draft nodes.                                                                                                                           |
| Search integrity          | 100% of indexable pages have one self-consistent canonical, unique intent, crawler-ready metadata, sitemap membership, and structured data that matches visible content.                                                       |
| Accessibility             | Page templates meet WCAG 2.2 AA; every cohort passes automated checks and keyboard, heading, table, and meaningful-image manual review.                                                                                        |
| Product truth             | 100% of product CTAs are checked against the current shipped route and behavior; zero claims of automatic writes, device control, unverified integrations, fake live data, or unavailable entitlements.                        |
| Corrections               | Safety-critical corrections are triaged immediately; broken evidence and product-status drift are triaged within two business days; every material correction receives a public note and version change.                       |
| Usefulness and conversion | Every page records engaged reading and intended-next-step events. Cohort decisions use job completion, internal navigation success, correction rate, and truthful next-step conversion—not page count or keyword volume alone. |

Failure of a zero-tolerance SLO blocks publication. Outcome SLOs trigger research, usability, or content changes; they never justify weakening evidence, safety, accessibility, or product-truth gates.

## Canonical public architecture

- `/guides` remains the public library hub and owns general cultivation reference pages.
- `/guides/:slug` remains the canonical flat URL for durable pillars, clusters, guides, diagnostics, protocols, comparisons, glossaries, methods, and governance nodes. Taxonomy is expressed through metadata, breadcrumbs, collections, and graph edges rather than fragile URL nesting.
- `/cultivars` and `/cultivars/:slug` remain the canonical cultivar collection and entity pages.
- `/tools/*` contains interactive calculators and checklists; tools link back to the explanatory guide that defines their inputs and limitations.
- Authenticated product routes are action destinations, never canonical knowledge pages.
- Existing indexed URLs are preserved. Renames require a canonical and permanent redirect plan; archives never redirect to a merely related page.

The target information architecture is a publishing contract, not a claim that every planned page or route is already live. A route enters public copy only after product-truth review confirms its implementation.

## Artifact authority and inventory

| Artifact                                         | Authority                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                      | Mission, scope, quality SLOs, authority order, and artifact precedence.                                                                                                                                                                                                                                                      |
| `site-map.md`                                    | Canonical information architecture, route ownership, index/facet/archive rules, collections, and v1 allocation.                                                                                                                                                                                                              |
| `knowledge-graph.md`                             | Node and edge semantics, graph invariants, and retrieval boundaries.                                                                                                                                                                                                                                                         |
| `pillar-pages.md`                                | Pillar teaching contracts, deep subtopics, original assets, cross-links, review risk, and acceptance gates.                                                                                                                                                                                                                  |
| `internal-linking.md`                            | Published-link eligibility, placement, selection order, and link constraints.                                                                                                                                                                                                                                                |
| `content-standards.md`                           | Evidence, E-E-A-T, cultivation safety, SEO, accessibility, and conversion standards.                                                                                                                                                                                                                                         |
| `editorial-workflow.md`                          | Draft-to-publish states, roles, approvals, maintenance, correction, and measurement procedure.                                                                                                                                                                                                                               |
| `roadmap-500.json`                               | Page-level, priority-ordered v1 backlog with route/readiness truth and explicit product-behavior scope. Ten pillar records contain draft editorial/search/link briefs; 490 records deliberately remain metadata-only until an editor authors their briefs. It cannot override scope, evidence, safety, or publication rules. |
| `post-v1-public-route-cohorts.json`              | Separately approved public guide/cultivar cohorts intentionally outside the immutable v1 roadmap. Every cohort path must exist in the shipped registry and cannot duplicate roadmap ownership.                                                                                                                               |
| `intent-research-registry.json`                  | Mutable, append-only search-intent lifecycle receipts (`researched`, `validated`, `superseded`, or returned to `provisional`) keyed to the immutable roadmap identity digest. Research state never rewrites the v1 roadmap baseline.                                                                                         |
| `trust-infrastructure.json`                      | Machine-governed trust routes and 74 L1 grouping labels outside the first 500. Every entry is explicitly non-routable until separately briefed, reviewed, and released.                                                                                                                                                      |
| `schemas/common.schema.json`                     | Shared identity, provenance, applicability, review, citation, correction, and lifecycle fields inherited by entity templates.                                                                                                                                                                                                |
| `schemas/cultivar.schema.json`                   | Machine-readable cultivar identity, lineage/trait claims, subject-scoped append-only screening and quarantine histories, and derived current health disposition.                                                                                                                                                             |
| `schemas/sensor.schema.json`                     | Machine-readable canonical metric/unit identity, direct/derived evidence, append-only calibration, high-RH/leaf-temperature VPD basis, device identity, transport, freshness, and read-only capability ownership.                                                                                                            |
| `schemas/deficiency.schema.json`                 | Machine-readable observable-sign, differential, confirmation/disconfirmation, response, and follow-up template.                                                                                                                                                                                                              |
| `schemas/equipment.schema.json`                  | Machine-readable specification, installation, maintenance, safety, failure, and integration-status template.                                                                                                                                                                                                                 |
| `scripts/knowledge/validate-roadmap.mjs`         | Deterministic roadmap contract validator.                                                                                                                                                                                                                                                                                    |
| `scripts/knowledge/validate-roadmap.test.mjs`    | Regression tests for roadmap count, identity, ordering, linking, and safety contracts.                                                                                                                                                                                                                                       |
| `scripts/knowledge/validate-governance.mjs`      | Deterministic validator for mutable intent receipts, previous/current append-only intent comparison, monotonic roadmap brief transitions, and the non-roadmap/non-routable trust-infrastructure boundary.                                                                                                                    |
| `scripts/knowledge/validate-governance.test.mjs` | Lifecycle, immutability, route-overlap, and L1 grouping regression tests.                                                                                                                                                                                                                                                    |
| `scripts/knowledge/validate-schemas.mjs`         | Strict Draft 2020-12 plus formats compiler and cross-file structural/semantic validator, including sensor evidence reciprocity, cultivar health derivation, and append-only revision comparators.                                                                                                                            |
| `scripts/knowledge/validate-schemas.test.mjs`    | Negative mutation, instance, semantic, append-only, and documentation-parity tests for schema references, graph edges, evidence, sensor/VPD truth, scoped pathogen history, safety signoffs, and template wiring.                                                                                                            |

Corpus-validator foundation artifacts:

- `scripts/knowledge/validate-corpus.mjs` is a foundation-only pure semantic engine for future repository-corpus endpoint, graph-cycle, risk, claim-coverage, family-slot/edge, canonical source identity, rendered source/claim, and resolved-link reciprocity proofs. It is not a publication gate until an owner-approved, schema-valid canonical corpus exists.
- `scripts/knowledge/validate-corpus.test.mjs` supplies a connected, non-vacuous synthetic fixture plus adversarial mutations that prove the foundation engine rejects empty/partial corpora, identity drift, graph defects, uncovered claims, invalid family-slot waivers, stale digests, ungoverned rendered links, and rendered citations that diverge from evidence sources, page claims, or `supported_by` edges. Synthetic success is not editorial or production evidence.
- `scripts/knowledge/print-corpus-material.ts` is a read-only receipt helper that imports the resolved public guide registry and prints route-byte-sorted pages with prose hashes plus internal-link and canonical external-source locations in deterministic projection/render order for one approved post-v1 cohort. Related paths preserve render order. Its output labels editorial publication and rendered crawl status `NOT_MEASURED`.

When artifacts disagree, this README controls mission, scope, authority, and zero-tolerance quality; `site-map.md` controls canonical route ownership; `knowledge-graph.md` controls semantic relationships; the relevant schema controls record shape; and the stricter evidence or safety rule wins. Disagreements block publication until reconciled and tested.

Required CI exercises the corpus engine's synthetic adversarial suite so future semantic changes cannot silently weaken the proof logic. That suite deliberately does **not** create or infer a real corpus. Repository-wide endpoint existence, page-claim completeness, editorial publication status, rendered HTTP/redirect/canonical parity, and crawl depth therefore remain `NOT_MEASURED` until the relevant owner decisions are recorded, a strict canonical corpus schema and nonempty reviewed corpus are committed, and a separate built-output crawl supplies delivery evidence.

The roadmap's `stableIdentityFields` array is the exact immutable v1 identity/allocation contract: `id`, `path`, `priority`, `wave`, `pillar`, `pillarRank`, `parentPath`, and `pageFamily`. The pinned digest covers those values for all 500 records. Mutable research and operating metadata—including intent/search receipts, briefs, priority signals, collision review, route state, its derived priority lane, and library readiness—remain outside that digest and advance only through their separate governance rules. Aggregate status counts in validator output describe the current artifact; they are not an immutable snapshot. A candidate may advance from pending metadata to `draft` and then `reviewed` when its required authored brief, link brief, and validated search evidence satisfy the state contract. Once a brief, link brief, or search brief reaches its final reviewed/validated state, its evidence payload cannot be rewritten in place; a future change requires a separately governed append-only amendment contract.

Required CI runs `knowledge:validate` without a path-based skip. On pull requests and merge queues, the governance validator reads the exact target/base Git revision and rejects deleted intent entries, rewritten intent history, direct roadmap brief-state skips, and roadmap brief-state regressions. A missing intent registry or roadmap at that revision is accepted only as the initial library baseline; a tracked invalid artifact fails. Required CI also fails when its event provides no trusted base revision, so a manual dispatch cannot substitute a green current-state-only check. Editors can reproduce intent append-only comparison locally with `node scripts/knowledge/validate-governance.mjs --baseline-file <previous.json> --current-file <current.json>`; `--base-revision <full-object-id>` exercises both Git-history lanes. A normal local run without either option intentionally validates the current artifact without pretending to prove history.

## Publishing principle

The 500-page roadmap is a v1 coverage plan, not permission to mass-publish and not a permanent allocation ratio. It intentionally preserves 10 pillar candidates and 490 direct candidate children; it does not claim that the planned cluster, glossary, method, profile, or governance infrastructure already exists. Those routes and non-routable L1 groupings live in `trust-infrastructure.json` outside the first 500 until separately approved. Publish in evidence-complete cohorts of no more than 20 pages. A page cannot advance until its canonical parent, internal links, sources, reviewer assignments, mandatory non-product next step, optional zero-or-one product CTA decision, and measurement plan are ready. The validated v1 roadmap establishes broad initial coverage; coverage floors prevent neglected domains, while readiness, reader need, evidence availability, risk, and demonstrated usefulness determine publication order and allocation after v1.

## Current-registry reconciliation

`roadmap-500.json` distinguishes current route existence from Knowledge Library readiness. `routeStatus: live` means only that the path is present in Verdant's current public guide or cultivar registry. `libraryReadiness` separately records `unassessed`, `blocked_parent`, or `backlog`; none of those states grandfathers a live route through this editorial contract or equals the workflow's reviewed `published` state.

The v1 roadmap is not rewritten when a separately approved public route intentionally sits outside its fixed 500-record allocation. Such a route belongs in `post-v1-public-route-cohorts.json`, where validation requires a cohort identifier, its approving PR, a concrete rationale, a deterministic path list, a current public guide/cultivar registry match, and zero overlap with every immutable roadmap path. The effective current public registry is therefore **v1 live roadmap paths plus approved post-v1 cohort paths**. A route absent from both remains a validation failure; a private, stale, duplicated, or roadmap-owned overlay path is rejected.

Each roadmap record also declares `productTruthScope`. `shipped_behavior` means the page makes or routes through a current Verdant product behavior and therefore must require the `current_product_test_or_shipped_code` evidence role. `none` means the page carries no such product-behavior claim and must not request that role as filler. Route intent, planned features, or marketing preference cannot change this classification without current shipped code or tests.

At the 2026-08-01 baseline, 24 of the 35 existing public paths have a canonical parent pillar that is still planned. The roadmap marks those records `libraryReadiness: blocked_parent` and emits one `live_route_blocked_parent` warning for each. Pending records contain no invented lateral links; future parent relationships remain editorial-only and must not render on live pages. Before the Knowledge Library information architecture is declared live, each warning must be removed by publishing the reviewed canonical parent or by an approved reparenting decision—never by linking a public page to a draft destination or falsifying its route status.
