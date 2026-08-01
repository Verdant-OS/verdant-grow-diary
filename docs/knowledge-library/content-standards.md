# Content, evidence, and E-E-A-T standard

Verdant publishes for a tired grower making a real decision, not for a word-count target. Every section must do at least one of five jobs: teach a mechanism, qualify a claim, prevent a mistake, route a safe next step, or explain a truthful product capability. Delete everything else.

## Audience and scope

The first 500 pages are indoor-first and cannabis-specific where direct evidence exists. Greenhouse, outdoor, regulated commercial operations, and other crops appear only when the page declares their applicability. Proxy-crop evidence is useful but must never be silently presented as cannabis evidence.

Every page opens with:

> After this page, the reader can …

The promised outcome must be observable and achievable from the page. The page must then supply the evidence, procedure, boundaries, and next observation needed to do it.

## Claim-risk classes

| Class                          | Typical claims                                                                                               | Minimum evidence and review                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| R0 — navigation                | Definitions, route descriptions, shipped product behavior                                                    | Current canonical source or product test; product-truth review for Verdant claims                                                    |
| R1 — low-risk cultivation      | Descriptive morphology, general workflow, recordkeeping                                                      | Two independent credible sources or one authoritative synthesis plus clearly labeled field context; cultivation review               |
| R2 — consequential cultivation | Environmental targets, irrigation/nutrition response, diagnosis, pathogen/IPM, post-harvest quality          | At least one Tier A source and one independent corroborating A/B source; claim map; cultivation and evidence approval                |
| R3 — life/property/legal       | Electrical, fire, structural, HVAC refrigerant, compressed CO2, pesticide label, worker exposure, compliance | Controlling code/label/agency source plus qualified independent reviewer; no DIY instructions beyond safe observation and escalation |

A page inherits the highest risk of any material claim. Missing qualifying evidence lowers the claim or blocks publication; it never lowers the recorded risk class.

## Evidence tiers and source roles

| Tier | Sources                                                                                                                            | Proper role                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A    | peer-reviewed primary research; law/regulation; standards; government or extension guidance; pesticide label; official safety code | Direct findings, controlling requirements, validated methods, and bounded quantitative claims          |
| B    | systematic review; meta-analysis; university handbook; accredited lab method; manufacturer technical manual                        | Evidence synthesis, method context, and the manufacturer's own specifications or maintenance procedure |
| C    | breeder/source records; versioned vendor documentation; named expert field protocol                                                | Attributed provenance, capability, or practice claim within the source's demonstrated scope            |
| D    | anonymized grow records; replicated Verdant observations; community reports                                                        | Experience signal, failure pattern, and hypothesis generation—never universal proof                    |

Authority depends on claim type. A current systematic review may outrank a single primary study for a synthesis; a pesticide label controls legal use; a manufacturer manual is authoritative only for its own device. Popularity, domain rating, retailer copy, and AI summaries are not evidence tiers.

Each material source is assigned one or more roles: `supports`, `limits`, `contradicts`, `defines_method`, `controls_requirement`, or `documents_product`. A bibliography without claim-to-source mapping does not pass review.

## Claim-map record

Each material claim records:

- stable claim ID and exact page section;
- risk class and claim type;
- bounded claim text and required wording state;
- source IDs, source roles, and quoted-page locator without copied prose;
- population/species/cultivar, medium, stage, facility type, method, units, and date;
- direct cannabis evidence, proxy evidence, or field observation;
- applicability, known confounders, uncertainty, and what must not be concluded;
- author, evidence reviewer, cultivation reviewer, and approval date; and
- invalidation trigger and next review date.

Numeric ranges also require the measurement method, instrument basis, operating conditions, and whether the value is measured, adjusted, or derived.

## Applicability and external validity

Every scientific or field claim declares:

- species and cultivar population;
- growth stage and propagation method;
- medium/root-zone system;
- indoor, greenhouse, outdoor, laboratory, or post-harvest setting;
- relevant temperature, humidity, light, CO2, irrigation, and pathogen context;
- sample size and replication when reported; and
- limits on transferring the finding to a different grow.

When using a proxy crop or controlled-chamber result, state the inference explicitly and provide a grower-verifiable observation before any recommendation. Cultivar names alone never prove phenotype behavior.

## Required claim language

| Evidence state           | Required framing                                                             |
| ------------------------ | ---------------------------------------------------------------------------- |
| Directly measured        | “Measured … using … under …”                                                 |
| Derived                  | “Calculated from … using …; valid only when …”                               |
| Supported across sources | “Evidence indicates … within …”                                              |
| Source-reported          | “The breeder/manufacturer/source reports …”                                  |
| Field tendency           | “Grow records describe …; verify in the current run.”                        |
| Hypothesis               | “One possibility is …; confirm with … before changing …”                     |
| Unknown or disputed      | “Evidence is limited or conflicting; Verdant does not assign a fixed value.” |

Never use “proven” without a defined proof standard, “live” without validated provenance/freshness/quality, “safe” without scope, or “best” without comparison criteria.

## Sensor and VPD truth

VPD is calculated, not directly measured. Every direct or derived sensor claim uses the canonical metric/unit tuple in `knowledge-graph.md`, identifies the device and canopy placement, and keeps the observation source, quality, capture time, freshness, and uncertainty visible.

Any VPD claim must identify:

- the exact air-temperature, RH, and—when calculating leaf VPD—leaf-temperature input observation IDs, canonical units, capture times, source/quality states, freshness ages, allowed age/skew, and any invalid or missing input;
- a versioned method and formula; Verdant-computed values expose the formula expression, while vendor-derived values cite the vendor method source and remain labeled vendor-derived;
- a current calibration/verification record in an append-only history, including method, reference instrument, checked date, as-found result, any adjustment, as-left result, deviation, uncertainty, disposition, next due date, sources, reviewer, and superseded verification;
- an actual high-RH comparison at operating conditions for every VPD page—even a VPD-only page—with target and reference at or above 75% RH, device as-found value, calculated deviation, adjustment/as-left evidence when applicable, acceptance criteria, and a passing disposition before the result may be authoritative;
- a structured, measured leaf-temperature basis with method, reference instrument, measured air and leaf temperatures, offset, sample count, canopy locations, light state, time, uncertainty, applications, evidence, and limitations; air VPD labels this context-only, while leaf VPD uses it as a formula input; and
- reciprocal `uses_unit`, `uses_method`, and `derived_from` graph edges matching the serialized evidence; a derived `Metric` owns the `uses_method` edge for its versioned calculation method.

Unverified, misplaced, stale, implausible, older, mismatched, or failed-verification sensors receive lower confidence and cannot drive authoritative VPD. Authoritative evaluation always supplies an explicit `asOf` time, resolves the latest applicable current verification, confirms canonical units and passing dispositions for every required direct/input metric, and rejects future-dated evidence. A direct reading has no derivation record; a VPD value has a derivation record and is never labeled direct telemetry. Values at 0% or 100% RH, implausible units, stale inputs, excessive timestamp skew, failed high-RH evidence, or missing leaf-temperature basis cannot drive confident guidance.

Native device capabilities and Verdant integration capabilities are separate claims. A Verdant sensor integration must disclose version/status/evidence and remain read-only: no page may imply that Verdant can invoke a native capability, write to the device, or control equipment unless a later independently approved product contract explicitly ships that behavior.

## Genetics, pathogen, and quarantine truth

- Every screening claim names the exact accession, batch, or plant scope; sample; target; result; collection/result/record dates; laboratory when applicable; method; source locator; recorder; and limitations. `not_tested` is an explicit state, not missing data disguised as a negative.
- Screening and quarantine records are immutable events. A correction adds a later event that supersedes the original and states why; a retest adds independent evidence and retains both results. Conflicting or discordant results remain visible.
- A negative result is always `negative_scoped`: it applies only to the recorded subject, sample, target, method, and time. Public copy must never widen it to “clean,” “pathogen free,” or proof about related batches, plants, accessions, or future material.
- Quarantine uses explicit `open`, `release`, `dispose`, `reopen`, and `override` events. Normal release requires current, unsuperseded, scope-matching negative evidence collected on or after the latest open/reopen and recorded no later than the release event; evidence learned later cannot justify an earlier release. Contradictory evidence available at release blocks release. An override is labeled as an override and never presented as laboratory clearance.
- Current health disposition is derived from the append-only screening and quarantine histories. Editors cannot directly edit the projection to manufacture clearance, erase discordance, or hide an earlier event.

## Cultivation and public-safety boundaries

- Diagnose from converging evidence, not one leaf, photo, reading, or cultivar label.
- Prioritize environmental stability, root-zone correctness, nutrient moderation, and low-stress recovery.
- Do not prescribe pesticide use outside the label or jurisdiction. Surface PPE, re-entry interval, pre-harvest interval, disposal, and qualified-professional requirements.
- Electrical, HVAC, structural, compressed-CO2, and fire-safety pages teach inspection and planning boundaries, then route to the controlling code and qualified professional.
- Do not make medical, therapeutic, consumption, potency-guarantee, impairment, or legal-evasion claims.
- No blind automation or device control. Verdant may explain and suggest; the grower decides.

## Experience, expertise, authority, and trust

- **Experience:** publish original calibration records, annotated observations, diagrams, checklists, anonymized run examples, or failure analyses. State what was observed and what was not tested.
- **Expertise:** show real author and reviewer identities, relevant experience, scope of competence, and conflicts. Each profile reference carries the same stable subject identity used by reciprocal `authored_by` or `reviewed_by` graph edges. Never invent endorsements, affiliations, or hands-on use.
- **Authority:** earn topic depth through stable canonical intent ownership, primary-source work, transparent methods, and useful original assets.
- **Trust:** expose sources, methods, limitations, dates, corrections, funding, affiliate relationships, product boundaries, and meaningful revision history. Trust overrides conversion.

High-risk pages require an independent reviewer qualified for the claim domain. Cannabis cultivation experience does not substitute for an electrician, industrial hygienist, pesticide label, laboratory method, or legal authority.

Google's people-first guidance is an operating input, not a substitute for reader value: <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>.

## Original-value standard

Every page brief names a unique, page-specific asset and its method before drafting. Acceptable assets include a calculation with worked inputs, decision table, annotated procedure, differential matrix, source comparison, calibration worksheet, original diagram, or de-identified record analysis.

“Field example or decision table” is not an asset specification. The brief must say what is compared, which inputs are used, how it was produced, and what decision it supports. Original data must include consent/provenance, de-identification, method, limitations, and reproducibility notes.

## Page-block applicability

Every page must deliver its reader job without manufacturing empty sections. Core blocks are universal; conditional blocks are required only when the page's claims or page family create that need.

| Block                                                             | Applicability contract                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observable reader outcome                                         | Core for every indexable page.                                                                                                                                                                                                                            |
| Scope, applicability, and exclusions                              | Core for every indexable page.                                                                                                                                                                                                                            |
| Concise answer, identity, or decision boundary                    | Core. A profile or policy answers who/what governs the record rather than inventing a cultivation decision.                                                                                                                                               |
| Evidence and measurement method                                   | Core for every material factual claim. Governance pages identify policy authority and revision method; profiles identify verification method.                                                                                                             |
| Observable procedure or comparison                                | Required for protocols, tools, checklists, comparisons, calibration/method pages, and pages that tell the reader to perform or choose something. Otherwise record `not_applicable` with reason and reviewer.                                              |
| Confounders, differentials, and common mistakes                   | Required for diagnostic, causal, comparative, and consequential cultivation claims; diagnostic/condition pages carry at least three distinct reviewed differentials. Otherwise record `not_applicable` with reason and reviewer.                          |
| What not to conclude or do                                        | Core wherever the page interprets evidence or could cause a consequential action; pure navigation/profile/policy pages satisfy it through explicit scope exclusions.                                                                                      |
| Next observation, stop condition, and follow-up interval          | Required for diagnostics, protocols, interventions, troubleshooting, and operational checklists. Otherwise record `not_applicable` with reason and reviewer.                                                                                              |
| Graph-backed prerequisites and related paths                      | Core; an absent prerequisite is an explicit graph state, not a filler link.                                                                                                                                                                               |
| Claim-level sources                                               | Core for every material claim; internal policy assertions point to the governing versioned policy record.                                                                                                                                                 |
| Page-specific value artifact and method                           | Core, but matched to page family: instructional pages use a reproducible worksheet/diagram/table/example; collections use an authored scope map; profiles use a verification/disclosure record; governance pages use a versioned policy or change matrix. |
| Author, reviewers, conflicts, dates, version, and correction link | Core.                                                                                                                                                                                                                                                     |
| Non-product next step                                             | Core and useful without Verdant. For a profile, collection, or policy this may be truthful navigation or a verification/correction action.                                                                                                                |
| Contextual product action                                         | Optional, zero or one, and only within shipped capability.                                                                                                                                                                                                |

Only `procedureOrComparison`, `confoundersOrDifferentials`, and `stopAndFollowUp` may be `not_applicable`. Each N/A decision records the page revision, exact block ID, reason, reviewer, and review date. R2/R3 claims cannot use N/A to evade a differential, safety, stop-condition, or follow-up requirement. Boilerplate inserted solely to avoid N/A is filler and fails review.

## Search, accessibility, and structured data

- One canonical intent and one descriptive H1 per page. Consolidate rather than create doorway variants.
- Record the query family, competing canonical page, distinct information gain, and consolidation trigger in the brief.
- Titles summarize the task without sensational language or unqualified superlatives.
- Visible breadcrumbs match `BreadcrumbList` markup: <https://developers.google.com/search/docs/appearance/structured-data/breadcrumb>.
- Use `Article` only for genuine articles and product markup only for actual products. Do not plan `HowTo` or `FAQPage` as Google rich-result features for Verdant: Google removed HowTo rich-result support and limits FAQ rich results to well-known, authoritative government and health sites. `FAQPage` may be serialized only for a named alternate consumer when the page stores a current-documentation source ID, verification date, consumer purpose/version, visible question IDs, limitations, and `googleRichResultExpected: false`. Recheck Google's [supported Search features](https://developers.google.com/search/docs/appearance/structured-data/search-gallery) and [documentation updates](https://developers.google.com/search/updates) before each template release; never add markup solely to chase a rich result.
- Publication/modification dates and author/reviewer identities must be real. Cosmetic freshness changes are forbidden.
- Static crawler-ready metadata, canonical parity, sitemap membership, robots status, and JSON-LD IDs must agree.
- Meet [WCAG 2.2](https://www.w3.org/TR/WCAG22/) AA: semantic headings, keyboard operation, visible focus, meaningful link text, text alternatives, table captions/headers, no color-only meaning, and readable mobile layouts.
- Images carry alt text, source, license, capture method, and uncertainty-safe annotation.

## Source integrity, licensing, and AI assistance

- Store source title, publisher, author, publication/version date, access date, DOI or stable identifier, URL, license, and an archived locator when lawful.
- Monitor retractions, corrections, label/code revisions, changed vendor documentation, and dead links. A retracted or superseded source triggers claim review.
- Paraphrase independently; do not copy source structure or substitute near-verbatim text. Record image/data licenses and attribution requirements.
- AI may assist with discovery, organization, or copy editing, but it is never an author, evidence source, or reviewer. Record model/tool, date, task, human verifier, and material changes.
- Unreviewed AI output, fabricated citations, synthetic first-hand experience, or undisclosed generated media automatically blocks publication.

## Conversion contract

Every page has a non-product next step. It may also choose zero or one product action from the current allow-list: `/quick-log`, `/tools/vpd-calculator`, `/cultivars`, `/guides`, or `/pricing`.

The CTA records a truthful promise explaining exactly what happens next. It cannot imply that Verdant uploads, saves, analyzes, diagnoses, approves, queues, or controls anything unless the shipped, tested capability actually does so. Product truth review is mandatory after any route, entitlement, or capability change.

Urgent electrical, fire, CO2, pesticide-exposure, pathogen-containment, and similar safety content defaults to zero product CTA until the hazard and escalation route are complete. Conversion experiments may never interrupt a critical procedure or weaken uncertainty language.

Conversion measurement uses consent-respecting aggregate events. Do not place sensor values, notes, cultivar names, photo URLs, diagnosis text, or other grower content in analytics payloads.

## Automatic rejection

Reject publication for any of the following:

- fabricated experience, credential, endorsement, citation, or scarcity;
- uncited material quantitative claim or missing unit/method/context;
- guaranteed yield, potency, cure, safety, diagnosis, or result;
- medical, legal-evasion, off-label pesticide, or unsafe DIY instruction;
- unsupported cultivar, vendor, integration, or device compatibility claim;
- copied or unlicensed text, image, data, or structure;
- false freshness date or hidden commercial conflict;
- unreviewed AI output or synthetic evidence;
- CTA beyond shipped capability or analytics containing grower content;
- diagnostic conclusion without differentials and confirmation evidence; or
- a section that adds no reader job, qualification, risk prevention, safe routing, or truthful next step.

## Content quality service levels

Before publication, each cohort must achieve:

- 100% material claims mapped to sources and applicability;
- 100% R2/R3 claims with required independent approvals;
- 100% pages with unique canonical intent and page-specific original asset;
- 0 broken citations, fabricated sources, unresolved intent collisions, or capability-truth failures;
- 0 accessibility-critical findings in the rendered page; and
- 0 unresolved correction, retraction, or licensing blockers.

After publication, track correction rate, source freshness, meaningful engaged reading, successful next-step navigation, search-query fit, and CTA-assisted activation. Traffic without reader success is not a quality win.
