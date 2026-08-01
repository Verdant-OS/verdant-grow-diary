# Internal-linking contract

Internal links are a reader-routing system, not an SEO decoration. Every live edge must help a grower understand a prerequisite, compare a plausible alternative, complete the next safe step, or reach a truthful Verdant capability.

## Publishable knowledge-edge eligibility

A breadcrumb, prerequisite, contextual-lateral, next-step, or differential knowledge edge may render only when both endpoints are:

- present in the canonical page registry;
- `published`, indexable, locale-compatible, and allowed for the current audience;
- served with HTTP `200` at their canonical paths;
- outside an active correction, withdrawal, or embargo state; and
- semantically supported by an approved graph edge.

Draft and planned edges remain in the editorial graph but never render publicly. A redirect is not an eligible destination: the source must be repointed directly to the final canonical path before publication.

Predeployment validation evaluates the proposed post-release graph. A parent and one or more `ready` children in the same atomic cohort may satisfy each other's parent/child publication gates only when the release manifest contains every endpoint, all endpoints independently pass their gates, and the built output is deployed or rolled back as one unit. Co-release edges never render against the current live registry before that release succeeds.

Two governed link classes use different eligibility rules and never enter the contextual-link candidate pool:

- **Product action:** the destination must be a currently shipped route available to the stated audience, and the promise, entitlement, write behavior, and privacy boundary must pass product-truth review. It need not be an indexable knowledge page.
- **Version or correction history:** a current page may link to a governed `noindex` archive when that archive is HTTP `200`, visibly historical, outside withdrawal/embargo, and points back to current guidance. An archive cannot fill a breadcrumb, prerequisite, lateral, next-step, differential, or product slot.

## Required page slots

| Slot                   | Purpose                                        | Requirement                                                                                                                                         |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breadcrumb             | Establish hierarchy                            | Exactly one visible path from library root to the canonical parent; the `/guides` root is explicitly exempt                                         |
| Prerequisite           | Supply knowledge required first                | One only when knowledge/procedure is genuinely required first; library root and pillars are explicitly exempt                                       |
| Collection child       | Expose owned browse paths                      | Required for library root, pillar, and cluster collections; uses authored child/navigation order rather than pretending children are lateral links  |
| Contextual lateral     | Answer the next adjacent question              | Two distinct, graph-backed links for instructional and entity pages; collection, governance, and profile pages follow the applicability rules below |
| Authored/reviewed work | Establish profile authority and accountability | One or more on author/reviewer profiles; never counted as a contextual lateral link                                                                 |
| Next step              | Turn understanding into an observable action   | Exactly one non-product procedure, checklist, record, verification, correction, or page-family-appropriate navigation step                          |
| Differential           | Prevent premature diagnosis                    | At least three distinct reviewed alternatives on diagnostic and condition pages; non-diagnostic families record N/A when the slot does not apply    |
| Product action         | Offer a shipped Verdant capability             | Zero or one; never required on urgent safety content                                                                                                |
| Evidence               | Support the claim at point of use              | Claim-level external citations; not counted as internal links                                                                                       |

The required slots are semantic roles, not repeated card grids. One destination may not satisfy two mandatory slots unless the editor records why it genuinely performs both jobs.

### Page-family slot applicability

| Page family                    | Required slot treatment                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Library root                   | No breadcrumb or prerequisite. Requires published collection children and one truthful browse/navigation next step; contextual lateral is not applicable.                                                                                                                                                                                                                                                                      |
| Pillar collection              | Requires breadcrumb, published collection children (or independently `ready` children in the same atomic release cohort), and one next step. Its prerequisite slot is always `not_applicable`: a pillar establishes the domain foundation rather than depending on a sibling page. Children never masquerade as laterals. Contextual lateral may be `not_applicable` when the collection map already answers navigation needs. |
| Cluster collection             | Requires breadcrumb, published collection children (or independently `ready` children in the same atomic release cohort), and one next step. A prerequisite is required only for a real knowledge or safety dependency; otherwise the slot carries a reviewed N/A receipt. Children never masquerade as laterals. Contextual lateral may be `not_applicable` when the collection map already answers navigation needs.         |
| Instructional reference/entity | Uses breadcrumb, any real prerequisite, two contextual laterals, one next step, and differential when applicable.                                                                                                                                                                                                                                                                                                              |
| Diagnostic/condition           | Same as instructional plus at least three distinct reviewed differentials; this safety requirement is not waivable through N/A.                                                                                                                                                                                                                                                                                                |
| Protocol/checklist/tool        | Uses breadcrumb, prerequisites required for safe execution, contextual laterals, and a verification/follow-up next step.                                                                                                                                                                                                                                                                                                       |
| Author/reviewer profile        | Uses breadcrumb, one or more authored/reviewed-work links, and a verification/correction or reviewed-work navigation next step. Contextual lateral and prerequisite may be `not_applicable`; do not synthesize `related_to` filler.                                                                                                                                                                                            |
| Governance/method/policy       | Uses breadcrumb, one next step, and only genuine prerequisites/laterals. A conditional slot may be `not_applicable` with page revision, reason, reviewer, and review date.                                                                                                                                                                                                                                                     |

Only the page-family exceptions declared above or an approved revision-specific applicability receipt may satisfy a missing conditional slot. The automated gate validates the applicable slot set, not one universal count.

### Slot-to-edge eligibility

Candidate selection is scoped by slot before scoring. An edge that is valid elsewhere in the graph cannot fill an unrelated page slot merely because it has a higher score.

| Slot                   | Eligible active relationship                                                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breadcrumb             | The single inbound `parent_of` edge from the canonical parent. It is registry-controlled and is not scored.                                                                                                                                                                                          |
| Prerequisite           | Outgoing `requires` only.                                                                                                                                                                                                                                                                            |
| Collection child       | Outgoing `parent_of` to published child pages, or independently `ready` children in the same atomic cohort during predeploy validation; rendered in authored collection order only after release succeeds and never scored as a lateral candidate.                                                   |
| Contextual lateral     | The narrowest approved page-resolving domain edge, or `related_to` only when no narrower relation applies. Reserved hierarchy, evidence, review, version, and conversion edges are ineligible.                                                                                                       |
| Authored/reviewed work | Incoming `authored_by` or `reviewed_by` from a published page to the current profile identity; `profileSubjectId` equals the person `nodeId`, and the edge set exactly matches the page's named author/signoff reviewers. Rendered in a dedicated accountability module and never scored as lateral. |
| Next step              | Outgoing `next_step` only.                                                                                                                                                                                                                                                                           |
| Differential           | Outgoing `differential_of`, or `mimics` when the symmetric condition relationship itself is the reviewed reason for the link.                                                                                                                                                                        |
| Product action         | Outgoing `next_action` to a product-action registry entry that passes shipped-route and audience eligibility. `logged_as` alone does not authorize a CTA.                                                                                                                                            |
| Evidence               | `supported_by` at claim level to an external source record; never selected as an internal page link.                                                                                                                                                                                                 |

For contextual lateral links, the reserved relationships are `parent_of`, `requires`, `next_step`, `differential_of`, `mimics`, `supported_by`, `authored_by`, `reviewed_by`, `logged_as`, `next_action`, and `supersedes`. Collection navigation owns outgoing `parent_of`, profile accountability owns incoming `authored_by`/`reviewed_by`, and version history owns `supersedes` separately.

## Deterministic selection algorithm

1. Filter candidates through the publishable-edge eligibility rules.
2. Remove the current page, canonical aliases, duplicate destinations, any destination already selected for another mandatory slot, and any candidate whose anchor would misstate the destination. Reuse across mandatory slots is allowed only through the reviewed override receipt described below.
3. Keep only candidates joined by an eligible edge type for the specific unfilled slot in the matrix above.
4. Score each candidate:

| Signal                                          | Points |
| ----------------------------------------------- | -----: |
| Explicit `requires` prerequisite                |    100 |
| Explicit `next_step` protocol or verification   |     90 |
| Explicit `differential_of` or look-alike        |     85 |
| Same entity or measured variable                |     70 |
| Same parent and complementary canonical intent  |     55 |
| Adjacent lifecycle stage                        |     45 |
| Same pillar only                                |     25 |
| Intent overlap without a documented distinction |   -100 |

5. Score and select independently inside each unfilled slot's eligible candidate set; never compare candidates across slots.
6. Break ties by canonical path in ascending byte order, then stable edge ID. Mutable roadmap priority, traffic, commercial value, and affiliate value never affect deterministic link selection.
7. Persist the selected edge and reason in the page manifest so rebuilds are reproducible.

Selection must be implemented as pure logic against the page registry and graph snapshot. Editors may override a result—including allowing one destination to fill two mandatory slots—only with a written reason, reviewer, affected slots, and expiry or permanent justification.

## Template-specific routes

- **Cultivar:** provenance fundamentals -> lineage claim -> immutable screening/quarantine history and scoped current disposition -> phenotype evidence -> matched stage/structure guidance -> relevant health/environment risk -> pheno comparison -> cultivar library.
- **Sensor:** metric definition -> placement -> calibration -> freshness/confidence -> unit handling -> valid derivation -> anomaly response -> equipment/integration status.
- **Deficiency or condition:** observed pattern -> competing causes -> confirmation procedure -> root-zone/environment evidence -> cautious response -> follow-up -> prevention.
- **Equipment:** measured/controlled variable -> selection criteria -> professional safety boundary -> installation -> calibration/maintenance -> failure mode -> verified Verdant capability.
- **Protocol or checklist:** prerequisite -> required evidence/materials -> procedure -> stop conditions -> verification -> record template -> follow-up.
- **Pillar:** scope map -> highest-risk foundations -> task clusters -> diagnostics -> tools/templates -> adjacent pillars.

## Anchor contract

- Describe the destination and reader benefit in natural language.
- Use cultivar, metric, condition, stage, or procedure names only when the destination actually owns that intent.
- Do not use generic anchors such as “click here,” “learn more,” or “read this.”
- Do not repeat the same exact-match anchor more than twice on one page.
- Do not use symptom language to imply that a linked diagnosis has been confirmed.
- Product anchors state the action honestly: for example, “record this observation in Quick Log,” not “let Verdant fix it.”

## Link budgets and placement

- Maximum 12 contextual internal links in the main body, excluding breadcrumb, references, and a single end-of-page related module.
- Maximum 6 destinations in the related module.
- At least one required contextual link appears before the final third of the article.
- Do not place a product CTA before the page has delivered the primary reader outcome.
- Diagnostic and urgent-safety procedures keep their critical steps uninterrupted by promotional modules.

These are default ceilings. A glossary or reference index may exceed them only when its page type explicitly declares an index role.

## Canonical, alias, facet, and archive behavior

- Each canonical intent has one indexable canonical path.
- Aliases and retired slugs redirect once to that path; no chains or loops.
- Search, sort, filter, and faceted combinations are non-canonical unless an editor approves a stable collection page with unique value.
- Paginated collection pages use stable unique URLs, self-canonicalize, remain `index,follow`, and expose crawlable sequential `<a href>` links. Page 2+ never canonicalizes to page 1 and click-only controls are not the sole discovery path.
- Query parameters never create alternate canonical intent owners.
- A merged page inherits useful inbound edges from the retired page after an editor verifies contextual fit.
- A withdrawn page returns `410` only when retaining it is unsafe or unlawful; otherwise it preserves a governed `noindex` notice. It must not redirect merely to preserve traffic.
- Archived historical pages remain accessible only when their historical value is explicit and current guidance is clearly linked, but they are `noindex` and excluded from public collections and sitemaps. They may be reached from the current page's version or change history, not selected for ordinary contextual-link slots.

## Lifecycle recalculation

Recompute affected edges when a page is published, repathed, consolidated, withdrawn, archived, or changes canonical intent. The publication transaction fails if recalculation leaves a required slot empty. Rebuilds record the graph version, page-registry version, link-algorithm version, any override receipts, and the link-selection result.

## Automated publication gates

The live graph must meet all of these:

| Gate                                                | Threshold |
| --------------------------------------------------- | --------: |
| Broken internal destinations                        |         0 |
| Links terminating at redirects                      |         0 |
| Canonical/redirect loops                            |         0 |
| Published orphan pages other than the library root  |         0 |
| Published pages missing a required slot             |         0 |
| Planned or draft destinations rendered publicly     |         0 |
| Pages deeper than three clicks from a pillar        |         0 |
| Pages deeper than four clicks from the library root |         0 |
| Duplicate destinations within one related module    |         0 |
| Unreviewed intent-overlap pairs                     |         0 |

CI validates registry targets, status, canonical parity, edge vocabulary, slot coverage, deterministic ordering, redirect behavior, and reachability from the library root. A crawl validates the built output; a JSON check alone is not sufficient evidence.

## Health reporting

Report monthly by pillar:

- orphan and dead-end count;
- broken links and redirect hops;
- median and 95th-percentile crawl depth;
- required-slot completion rate;
- contextual-link click-through rate by slot, excluding bots;
- successful next-step navigation rate;
- pages receiving or losing meaningful inbound links; and
- unresolved canonical-intent collisions.

Link click-through is a diagnostic signal, not a reason to replace a more relevant safety or prerequisite link with a commercially stronger destination.

## Safety constraints

- A generic guide never proves the current plant's condition.
- Links never imply that public content writes data, runs AI Doctor, creates an Action Queue item, changes entitlements, or controls equipment.
- Action Queue remains approval-required; no page link is an approval or device command.
- Bad, stale, manual, demo, or unknown telemetry is never relabeled as healthy live evidence through anchor copy.
- External redirects are reviewed against the intended source and archived where licensing permits; they are never followed blindly during automated replacement.
