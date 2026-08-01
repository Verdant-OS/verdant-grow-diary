# Knowledge Library site map

## Status and scope

This document defines the target public information architecture. It is not evidence that every route or page is implemented. Publication requires route, registry, canonical, structured-data, sitemap, accessibility, and product-truth verification against shipped code.

V1 is indoor-first. Greenhouse and outdoor collections are deferred expansions, not silent variants of indoor content. Shared principles may link forward only after an applicability review confirms the content and labels its limits.

## Routable page-type and collection matrix

The flat guide route is deliberate: durable taxonomy lives in metadata, breadcrumbs, collections, and graph edges, while indexed URLs remain stable when a topic changes cluster.

| Surface or page type          | Canonical target              | Parent and navigation                                                  | Index rule                                                                                                       | Facet/query behavior                                                                                                                                                                         |
| ----------------------------- | ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library hub                   | `/guides`                     | Site navigation root for the library                                   | Index when it contains useful browse/search paths                                                                | Search, sort, and filter state is noncanonical. If the collection is paginated, every stable page URL is self-canonical and connected by crawlable sequential links.                         |
| Pillar collection             | `/guides/:slug`               | `/guides`; one of the ten canonical pillars below                      | Index after pillar acceptance gates pass                                                                         | Facets may filter cards in place; a durable distinct intent requires an authored child page.                                                                                                 |
| Cluster collection            | `/guides/:slug`               | Exactly one pillar; may surface cross-pillar graph links               | Index only when it teaches the cluster and is more than a link list                                              | Filter/sort states canonicalize to the collection URL and remain `noindex,follow`; stable pagination URLs self-canonicalize.                                                                 |
| Reference guide               | `/guides/:slug`               | One cluster and one pillar                                             | Index after full content review                                                                                  | No indexable parameter variants.                                                                                                                                                             |
| Diagnostic or differential    | `/guides/:slug`               | Plant health or another evidence-owning cluster                        | Index only with observable signs, competing causes, confirmation/disconfirmation, stop conditions, and follow-up | Symptom, stage, and medium filters are discovery aids, not diagnoses or canonicals.                                                                                                          |
| Protocol or SOP               | `/guides/:slug`               | Owning cluster plus version/supersession metadata                      | Index only when prerequisites, materials, steps, stop conditions, verification, and revision are complete        | Printable/downloadable variants canonicalize to the explanatory page.                                                                                                                        |
| Comparison                    | `/guides/:slug`               | Owning cluster                                                         | Index only for a real decision with declared criteria and evidence; never an unsupported “best” list             | Filtered tables remain part of the canonical page.                                                                                                                                           |
| Glossary or metric definition | `/guides/:slug`               | Owning pillar, reusable across the graph                               | Index when the term has a distinct grower job, measurement basis, and useful links                               | Embedded definitions canonicalize to the full term page.                                                                                                                                     |
| Method or evidence policy     | `/guides/:slug`               | `/guides/methods` or `/guides/about-the-library`                       | Index because it explains how evidence and measurements are produced                                             | Method versions remain visible and use supersession metadata.                                                                                                                                |
| Author/reviewer profile       | `/guides/:slug`               | `/guides/authors`                                                      | Index only with verified identity, relevant experience, role, disclosures, and reviewed pages                    | No autogenerated thin profile pages.                                                                                                                                                         |
| Corrections and change policy | `/guides/corrections`         | Governance collection                                                  | Index                                                                                                            | Individual page corrections remain on the affected page and link to this policy.                                                                                                             |
| Cultivar collection           | `/cultivars`                  | Site navigation and Genetics pillar                                    | Index                                                                                                            | Search/filter states are `noindex,follow` and canonicalize to `/cultivars`; stable pagination URLs self-canonicalize; a curated intent uses an authored guide.                               |
| Cultivar entity               | `/cultivars/:slug`            | `/cultivars` and Genetics pillar                                       | Index only after source/provenance review                                                                        | Aliases resolve to one source-aware canonical; aliases are not duplicate pages.                                                                                                              |
| Free tool                     | `/tools/:slug`                | Explanatory guide plus Tools surface                                   | Index after method, limits, unit tests, accessibility, and static metadata pass                                  | Tool state is not indexable; shared results contain no grower data.                                                                                                                          |
| Authenticated product action  | Current shipped product route | Optional contextual destination from a guide, never a knowledge parent | Not a knowledge canonical                                                                                        | Every page retains a non-product next step; zero or one product CTA may render only after product-truth review confirms the current route and behavior. Urgent safety pages default to zero. |

No page type receives an additional public URL family without route-manifest, redirect, canonical, sitemap, structured-data, mobile-navigation, and product-truth review.

## Canonical pillar and collection tree

Each pillar below is a teaching collection. Its L1 collections are expanded into L2 and L3 page families in `pillar-pages.md`; exact page records and sequencing live in `roadmap-500.json`.

### P1. Grow fundamentals, records, and operations

Canonical pillar: `/guides/grow-diary-app`

- Start and scope a grow record
- Daily room walk and structured observation language
- Photo, watering, feeding, and work evidence
- Change attribution and event history
- Team handoffs, SOPs, and cycle review
- Privacy, data ownership, retention, and exports

Primary jobs: establish plant memory, record a change quickly, understand what is worth logging, preserve who/what/when/why, and compare cycles without hindsight bias.

### P2. Environment, climate, and light

Canonical pillar: `/guides/grow-room-environment-fundamentals`

- Temperature, RH, dew point, and air/leaf VPD
- Leaf-temperature offset and canopy measurement
- CO2 context, airflow, and canopy microclimates
- HVAC/dehumidification peak-load sizing and redundancy
- Day/night transitions, drift, alarms, and failure response
- PPFD, DLI, spectrum, photoperiod, uniformity, and light mapping

Primary jobs: understand environmental and light relationships, measure at the canopy, detect drift without mistaking a number for truth, and verify capacity at peak transpiration.

### P3. Sensors, measurement, and data truth

Canonical pillar: `/guides/sensor-truth-grow-room`

- Provenance, source labels, identity, and raw evidence
- Calibration, validation, reference comparison, and calibration records
- Placement, sampling, timestamp, freshness, and confidence
- Units, conversion, resolution, accuracy, precision, and uncertainty
- Manual, CSV, import, read-only live transport, and integration boundaries
- Derived metrics, anomaly detection, stuck values, and implausible readings
- Evidence use by people and cautious AI

Primary jobs: determine whether a number can be trusted, preserve how it was captured, and stop invalid, stale, demo, manual, or unknown telemetry from becoming healthy live evidence.

### P4. Root zone and irrigation

Canonical pillar: `/guides/cannabis-root-zone-and-irrigation-fundamentals`

- Media properties and container geometry
- Irrigation volume, frequency, timing, and event history
- Dryback, substrate water content, and substrate weight
- Input/runoff EC and pH with method and limitations
- Drainage, oxygenation, channeling, and root-zone temperature
- Emitter selection, pressure, distribution, and uniformity testing
- Root-zone diagnostics and evidence-led correction

Primary jobs: reconstruct what the root zone did, compare irrigation strategies, verify distribution, and avoid reacting to a free-text “watered today.”

### P5. Nutrition and solution management

Canonical pillar: `/guides/cannabis-nutrition-and-solution-management-fundamentals`

- Source-water chemistry, alkalinity, and treatment context
- Concentration, units, EC, pH, temperature, and measurement
- Mixing order, stock solutions, compatibility, and sanitation
- Nutrient-program records and recipe versioning
- Input/runoff interpretation and sampling limits
- Crop response, deficiency/lockout/toxicity differentials
- One-change-at-a-time change control and follow-up

Primary jobs: record what was actually mixed, distinguish label directions from measured response, interpret solution evidence cautiously, and make attributable changes.

### P6. Plant health, IPM, and biosecurity

Canonical pillar: `/guides/cannabis-plant-health-and-ipm-fundamentals`

- Observable symptom language and photo evidence
- Differential diagnosis, confirmation, and disconfirmation
- Deficiencies, toxicities, and abiotic stresses
- Pests and beneficial-organism context
- Fungal, bacterial, viral, viroid, and testing context
- Quarantine, entry protocols, tools, clothing, and sanitation
- Scouting plans, thresholds, sticky-card records, and trend review
- Treatment records, label controls, PPE, re-entry and pre-harvest intervals
- Follow-up scouting, incident close-out, and prevention review

Primary jobs: describe what is observable, rule out look-alikes, protect controlled rooms and scope-verified material, follow governing labels, and close incidents with evidence rather than assumption.

### P7. Genetics, cultivars, and propagation

Canonical pillar: `/guides/cannabis-genetics-provenance-and-propagation-fundamentals`

- Breeder/source claims, acquisition, accession, and explicit unknowns
- Seed lot, generation, clone batch, mother, donor, and tissue-culture lineage
- Propagation methods and batch identity
- Quarantine, pathogen screening, test method, and status history
- Phenotype criteria, matched-run comparison, and kill/keep decisions
- Pheno-hunt experimental design, scoring limits, and selection bias
- Cultivar profiles, aliases, lineage claims, and observed variability
- Backward/forward traceability and problem containment

Primary jobs: know exactly what a plant is claimed to be, preserve unknowns, trace risk backward and forward, and compare phenotypes under matched conditions.

### P8. Plant physiology, growth stages, and canopy work

Canonical pillar: `/guides/grow-stage-care-guide`

- Plant anatomy, photosynthesis, respiration, transpiration, and source/sink relationships
- Root/shoot signaling, water movement, nutrient movement, and stress response
- Germination, seedling, vegetative growth, transition, and stage evidence
- Early, mid, and late flower development
- Stretch, morphology, architecture, and support requirements
- Training, pruning, trellising, defoliation, and recovery observation
- Stage transitions, stage-aware records, and calendar limitations

Primary jobs: connect observable plant behavior to a bounded physiological model, identify stage from evidence, and document canopy interventions without assuming a calendar or cultivar name proves response.

### P9. Harvest and post-harvest

Canonical pillar: `/guides/cannabis-harvest-and-post-harvest-fundamentals`

- Readiness evidence, sampling, and harvest planning
- Batch identity, wet weight, dry weight, moisture loss, and trim loss
- Dry-room temperature, RH, airflow, load, measurement, and failure response
- Trimming, grading, defects, contamination, and disposition
- Cure conditions, container practices, stability, and records
- Storage, packaging context, quality protection, and degradation
- Lab method/results, sensory records, and claim limits
- Yield/quality/run review linked back to genetics, environment, inputs, and decisions

Primary jobs: preserve quality after harvest, maintain batch truth, detect post-harvest drift, and explain outcomes without confusing correlation with cause.

### P10. Equipment and read-only integrations

Canonical pillar: `/guides/grow-room-equipment-and-integration-fundamentals`

- Requirement definition, selection criteria, specifications, and claim verification
- Environmental-control sizing, installation questions, redundancy, and maintenance
- Irrigation hardware, emitters, pumps, filtration, and distribution verification
- Lighting hardware, electrical load, PPFD mapping, and degradation checks
- Sensors, gateways, networking, local reliability, and time synchronization
- Calibration, preventive maintenance, failure modes, and retirement
- Manual/CSV exports, read-only ingest, provenance, and transport-versus-truth boundaries
- Vendor/model capability matrices and integration status without endorsement

Primary jobs: choose and verify gear, understand installation and professional boundaries, preserve maintenance evidence, and avoid confusing connectivity with trustworthy live data or control capability.

## Cross-cutting domain ownership

Cross-cutting topics have one canonical parent and explicit graph links rather than duplicate pages.

| Domain                    | Canonical owner                                                                                                                | Required cross-links                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Lighting/photobiology     | P2 owns light metrics and room-light relationships; P8 owns plant-response physiology; P10 owns hardware and mapping procedure | P3 measurement truth, P6 light-stress differentials, P9 quality/outcome review                                       |
| Plant physiology          | P8                                                                                                                             | P2 environment/light, P4 water movement/root zone, P5 nutrition, P6 condition differentials, P9 outcome learning     |
| Biosecurity               | P6                                                                                                                             | P7 source/quarantine lineage, P1 SOP/handoffs, P9 post-harvest sanitation, P10 dedicated tools/equipment             |
| Data truth                | P3                                                                                                                             | Every metric-bearing page, especially P2, P4, P5, P9, and P10                                                        |
| Record and audit practice | P1                                                                                                                             | Every protocol and product action; events remain evidence, not proof of causality                                    |
| Safety and jurisdiction   | Claim-specific owning pillar                                                                                                   | Governing label/code/regulator, relevant protocol, and professional referral; never genericized across jurisdictions |

## Cross-library utility and governance collections

These are planned teaching or trust nodes outside the immutable first-500 roadmap, not thin taxonomic archives. `trust-infrastructure.json` keeps them explicitly non-routable until each receives its own brief, review receipts, and atomic release. Listing a future path here does not assert that it exists today:

- `/guides/glossary` — terms that do not justify a separate reader job remain embedded; durable metric and cultivation definitions link to canonical pages.
- `/guides/protocols` — versioned procedures grouped by prerequisite and risk.
- `/guides/symptoms` — observable signs leading to multiple evidence paths, never one-click diagnoses.
- `/guides/metrics` — units, methods, uncertainty, placement, and derived relationships.
- `/guides/methods` — citation, measurement, field-record, comparison, and correction methods.
- `/guides/authors` — verified authors/reviewers and disclosures; no autogenerated thin profiles.
- `/guides/about-the-library` — scope, editorial independence, authority order, funding/product relationship, and content license.
- `/guides/evidence-policy` — claim language, source use, uncertainty, and cannabis/proxy evidence limits.
- `/guides/editorial-policy` — authorship, review, AI-assistance, conflicts, updates, and appeals.
- `/guides/corrections` — correction, withdrawal, archive, and material-change policy.

Calculators require an explanatory guide, formula/method version, unit tests, and a statement that derived values are not directly measured. Downloadable SOPs and checklists require a canonical explanatory page and revision number. Comparison pages compare declared criteria and evidence, not unsupported “best” claims.

## Canonical, facet, redirect, and archive rules

1. Every indexable page has exactly one self-referencing canonical that matches its public registry URL, structured data, and sitemap entry. Every page except the `/guides` library root also has a visible breadcrumb matching its canonical parent; the root has no parent or breadcrumb.
2. Search, sort, filter, share, and tracking parameters are not new content. They remain `noindex,follow`, canonicalize to the owning collection, and never appear in the sitemap.
3. A paginated sequence uses stable unique URLs such as `?page=n`; each page is `index,follow`, self-canonical, and linked to the next and previous page with crawlable `<a href>` links. Page 2+ never canonicalizes to page 1, and fragments or click-only JavaScript are never the only discovery path. A performant unpaginated view may replace the sequence only when it genuinely renders the complete collection.
4. A facet becomes indexable only when an editor approves a distinct reader job and publishes a complete authored page with a stable slug. The filtered UI state is never that page's canonical.
5. Slugs are globally unique within `/guides`. Aliases and spelling variants resolve to the canonical entity or a disambiguation page; they do not create duplicate content.
6. A rename or exact consolidation receives one permanent redirect, and all internal links are updated in the same release. Redirect chains and redirecting sitemap URLs fail publication.
7. Archive content redirects only to a genuinely equivalent replacement. If evidence is obsolete and no equivalent exists, preserve an explanatory, `noindex` archive notice with the reason and last valid version; use a gone response only when content cannot safely or lawfully remain.
8. Draft, blocked, withdrawn, superseded, redirected, archived, and `noindex` nodes are excluded from public collections and sitemaps. A superseded protocol remains discoverable from the current version's change history, not from search navigation.
9. Existing indexed URLs are immutable history. Taxonomy changes update metadata and graph edges rather than rewriting working canonicals.
10. Planned, draft, blocked, archived, and otherwise unpublished graph endpoints never render as public knowledge links. A relationship becomes a live knowledge link only when both canonical endpoints are published and eligible.

## Sitemap strategy

The v1 corpus remains in the existing public sitemap while the total is comfortably below search-engine limits. The build must include only canonical, indexable, published URLs—including stable indexable pagination URLs—and must use `lastmod` only for material reviewed changes. Every leaf guide/cultivar/tool URL remains directly listed so discovery never depends on traversing pagination alone.

Move to a sitemap index before any sitemap reaches 40,000 URLs or 40 MB uncompressed, or earlier when different update cadences justify separation. Stable partitions are:

- `sitemap-guides.xml` — pillars, clusters, reference, diagnostic, protocol, comparison, glossary, method, author, and governance pages;
- `sitemap-cultivars.xml` — source-aware cultivar entities;
- `sitemap-tools.xml` — reviewed calculators and checklists; and
- future environment-specific or locale partitions only after those collections are explicitly scoped and implemented.

Partition membership is deterministic by canonical page type, never page popularity. The sitemap index and every child are validated for canonical parity, duplicate URLs, index state, successful response, and material `lastmod` before publication.

## First-500 v1 allocation and coverage floors

The first 500 records are the validated v1 prioritized content-roadmap allocation: 50 records per pillar. The baseline contains 10 pillar candidates and 490 direct candidate children; it does **not** yet implement cluster, glossary, method, author-profile, or governance routes. The L1 labels in `pillar-pages.md` are non-routable metadata registered in `trust-infrastructure.json`, not hidden public pages or extra members of the 500. Cross-library trust routes are likewise outside the immutable first-500 roadmap and require separately governed additions. This is a broad-coverage planning baseline, not a requirement to publish pillars at equal speed and not a permanent allocation ratio. Cohort order follows readiness and usefulness. After v1, new records—and any documented replacement for a canceled v1 record—are allocated above the coverage floors according to reader need, evidence availability, graph gaps, search intent, risk, and product relevance.

| Pillar                                          | Coverage floor | Initial v1 allocation | Allocation rationale                                                                        |
| ----------------------------------------------- | -------------: | --------------------: | ------------------------------------------------------------------------------------------- |
| P1. Grow fundamentals, records, and operations  |             25 |                    50 | Core plant-memory and operating practice without duplicating domain-specific logs.          |
| P2. Environment, climate, and light             |             35 |                    50 | Environmental relationships, failure response, and explicit lighting/photobiology depth.    |
| P3. Sensors, measurement, and data truth        |             30 |                    50 | Verdant's sensor-truth differentiator and prerequisite for metric-bearing guidance.         |
| P4. Root zone and irrigation                    |             35 |                    50 | High operational frequency and strong cross-links to health and nutrition.                  |
| P5. Nutrition and solution management           |             30 |                    50 | Broad evidence needs while avoiding unsupported product/program variants.                   |
| P6. Plant health, IPM, and biosecurity          |             40 |                    50 | Differential, safety, quarantine, and incident-close-out coverage floor.                    |
| P7. Genetics, cultivars, and propagation        |             30 |                    50 | Provenance, propagation, pathogen, and pheno-hunt depth beyond cultivar entities.           |
| P8. Plant physiology, growth stages, and canopy |             30 |                    50 | First-class physiology plus stage and intervention evidence.                                |
| P9. Harvest and post-harvest                    |             25 |                    50 | Full harvest-to-outcome loop with post-harvest quality and safety.                          |
| P10. Equipment and read-only integrations       |             25 |                    50 | Requirement, maintenance, capability-truth, and failure guidance without thin vendor pages. |
| **Total**                                       |        **305** |               **500** | V1 establishes broad coverage; post-v1 allocation follows demonstrated usefulness.          |

No allocation authorizes publication. Pages ship only when their parent, evidence, graph edges, reviewers, original value, product truth, and measurement plan meet the library SLOs.
