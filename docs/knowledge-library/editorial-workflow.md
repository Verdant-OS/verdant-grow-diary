# Editorial workflow and publication control

The workflow is an auditable state machine. A page does not become true because it has polished copy, and “published” is not the end of its evidence lifecycle.

## Accountable roles

| Role                      | Accountable for                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Managing editor           | roadmap, canonical intent, brief quality, assignments, publication and withdrawal decisions                         |
| Author                    | accurate synthesis, claim map, original asset, disclosures, and revision response                                   |
| Evidence editor           | source identity, source role, claim alignment, methods, units, uncertainty, retraction status                       |
| Cultivation reviewer      | horticultural applicability, confounders, practical observation, and cautious intervention boundaries               |
| Qualified safety reviewer | electrical, fire, structural, HVAC, compressed CO2, pesticide, laboratory, or legal scope when R3 claims require it |
| Product-truth reviewer    | shipped routes, capabilities, entitlements, sensor labels, integration status, CTA promises                         |
| SEO/technical editor      | intent collision, canonical/robots/sitemap, structured data, static rendering, graph integrity                      |
| Copy/accessibility editor | clarity, semantics, keyboard/screen-reader use, mobile readability, alt text                                        |
| Maintainer                | monitoring, source/product drift, corrections, consolidation, archive and review dates                              |

Every person has a stable identity, role, relevant credential/experience statement, and conflict disclosure. One person may hold several roles on low-risk content, but the author cannot be the sole evidence, cultivation, or qualified-safety approver for R2/R3 material.

## Canonical artifacts

Every page revision is backed by:

- page manifest and stable page/revision IDs;
- canonical intent, query family, parent, and graph edges;
- reproducible search-research receipt and intent status;
- brief and observable reader outcome;
- page-family block-applicability decisions and any revision-specific N/A receipts;
- claim map with source roles and applicability;
- source archive/locator and license record;
- original-asset method and provenance;
- append-only sensor verification or cultivar screening/quarantine histories when the page owns those records, plus a deterministic current projection;
- author/reviewer assignments, credentials, conflicts, and approvals;
- structured-data, accessibility, product-truth, and link-check receipts;
- AI-assistance disclosure when applicable;
- publication, correction, and withdrawal ledger; and
- performance and review-trigger record.

Artifacts are append-only by revision. A new revision supersedes an old one; it does not erase who approved or changed the previous version.

## State-transition contract

| From -> to                                      | Owner                          | Required entry artifacts                                                      | Exit proof                                                                                                                      | Rejection route                                                        |
| ----------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `idea -> triaged`                               | Managing editor                | audience problem, proposed path, pillar                                       | usefulness/risk score and owner                                                                                                 | `rejected` with reason                                                 |
| `triaged -> briefed`                            | Managing editor                | collision search, parent, page type                                           | unique canonical intent, reader outcome, graph slots, conversion and measurement plan                                           | `blocked` or consolidate into existing page                            |
| `briefed -> sourced`                            | Evidence editor                | claim outline, risk class                                                     | minimum source mix, source roles, applicability, retraction/license checks                                                      | `blocked_evidence`                                                     |
| `sourced -> drafted`                            | Author                         | approved brief and claim map                                                  | complete draft, original asset, limitations, non-product next step, disclosures                                                 | return to `sourced`                                                    |
| `blocked_evidence -> sourced`                   | Evidence editor                | resolved source, license, method, or applicability blocker                    | source set and claim map updated; blocker receipt closed                                                                        | remain `blocked_evidence` with owner and review date                   |
| `drafted -> evidence_review`                    | Evidence editor                | immutable draft revision                                                      | every material claim mapped; methods/units/uncertainty verified                                                                 | `revision_required`                                                    |
| `evidence_review -> cultivation_review`         | Cultivation reviewer           | evidence approval                                                             | practical applicability, differentials, what-not-to-do, follow-up verified                                                      | `revision_required`                                                    |
| `cultivation_review -> safety_review`           | Qualified reviewer             | one or more R3 claims                                                         | controlling source and escalation boundary approved                                                                             | `revision_required`; this transition cannot be skipped for R3          |
| `cultivation_review -> product_truth_review`    | Product-truth reviewer         | R0–R2 maximum claim risk; no R3 claim; qualified-safety N/A receipt recorded  | shipped-behavior verification completed against current code/tests; every Verdant or integration claim is verified or absent    | `revision_required`; route to `safety_review` if any R3 claim is found |
| `safety_review -> product_truth_review`         | Product-truth reviewer         | capability/CTA manifest                                                       | every Verdant and integration claim matches shipped tests                                                                       | `revision_required`                                                    |
| `product_truth_review -> technical_review`      | SEO/technical editor           | canonical/graph/schema manifest                                               | intent, link, schema, metadata, sitemap, robots, and static-render checks pass                                                  | `revision_required`                                                    |
| `technical_review -> copy_accessibility_review` | Copy/accessibility editor      | rendered candidate                                                            | copy and WCAG 2.2 AA review receipts                                                                                            | `revision_required`                                                    |
| `copy_accessibility_review -> ready`            | Managing editor                | all approvals and automated receipts                                          | definition-of-ready complete; no unresolved blocker                                                                             | `blocked`                                                              |
| `ready -> published`                            | Publisher separate from author | exact approved revision                                                       | deployment receipt, HTTP/canonical/robots/schema/link smoke, ledger entry                                                       | rollback to previous revision                                          |
| `published -> monitored`                        | Maintainer                     | live verification                                                             | search/index, usefulness, conversion, correction and source-drift telemetry active                                              | `corrected`, `withdrawn`, or `refresh_due`                             |
| `monitored -> refresh_due`                      | Maintainer                     | scheduled/event trigger                                                       | scoped refresh brief and assigned reviewers                                                                                     | remain monitored with reason/next date                                 |
| `refresh_due -> briefed`                        | Managing editor                | retained revision history                                                     | new revision scope and invalidated claims identified                                                                            | `withdrawn` if unsafe                                                  |
| `published/monitored -> corrected`              | Managing editor                | confirmed error report                                                        | visible correction note, changed claims, re-approval, revision ledger                                                           | `withdrawn` if not safely correctable                                  |
| `corrected -> monitored`                        | Maintainer                     | exact corrected revision and deployment receipt                               | live HTTP/canonical/robots/schema/link checks pass and correction/source-drift monitoring is active                             | rollback or `withdrawn`                                                |
| `revision_required -> drafted`                  | Author                         | review findings and affected-receipt list                                     | new immutable draft revision addresses each finding; all affected and downstream receipts are invalidated                       | remain `revision_required` or return to `sourced` if evidence changed  |
| `blocked -> triaged`                            | Managing editor                | blocker-resolution receipt                                                    | audience problem, owner, risk, and proposed path are re-evaluated against the current registry                                  | remain `blocked` or `rejected`                                         |
| `published/monitored -> withdrawn`              | Managing editor                | safety/legal/evidence reason                                                  | visible `noindex` notice, or `410` only when retention is unsafe or unlawful; links repointed and sitemap updated               | restore only through full approval                                     |
| `withdrawn -> triaged`                          | Managing editor                | restoration request, retained withdrawal evidence, and current registry check | new owner/risk/path decision recorded; prior approvals remain invalid                                                           | remain `withdrawn` or `rejected`                                       |
| `monitored -> archived`                         | Managing editor                | historical-value decision                                                     | clear `noindex` historical label and current replacement; a gone response requires the separate unsafe/unlawful withdrawal rule | `withdrawn`                                                            |

Optional skip transitions must be encoded, not assumed. Only the `safety_review` transition may be skipped, and only for an R0–R2 page whose manifest proves it contains no R3 claim and records the qualified review lane as not applicable with a reason. R3 pages require an approved safety review. No state can approve itself through an automated check alone.

A revision never resumes at the failed review with the same draft identity. `revision_required` creates a new immutable draft revision, invalidates the failed receipt and every downstream receipt, and re-enters the sequence at `evidence_review`; if the claim map or sources changed, it returns to `sourced` first. This conservative replay is deliberate: later reviewers never approve text that differs from the revision they inspected.

## Cohort planning

1. Select a maximum of 20 pages using grower impact, risk reduction, measured search demand when available, product relevance, evidence feasibility, canonical-parent readiness, and cannibalization risk. Missing demand remains explicit `unknown`; safety, prerequisite, and correction work may outrank demand with a recorded reason.
2. Preserve prerequisite order. A child cannot publish before its live parent and required prerequisite, except when an independently approved parent and child ship in the same atomic cohort. That cohort is validated against the proposed post-release graph and must deploy or roll back as one unit; no co-release edge renders early.
3. Keep at least 70% evergreen/reference work and no more than 30% vendor/comparison work per cohort.
4. Search the live registry, roadmap, redirects, and active drafts for intent collision before assignment.
5. Assign authors and reviewers before drafting; disclose conflicts before source selection.
6. Freeze the brief revision used for review so later edits invalidate the affected receipts.

The first 500 roadmap is a v1 coverage allocation, not a permanent quota. Future cohorts follow measured grower usefulness and evidence readiness while maintaining minimum coverage floors for every safety-critical pillar.

## Search-research receipt

Roadmap intent starts `provisional`; it is a hypothesis, not proof of current demand or SERP fit. Before a page becomes `ready`, an editor records a reproducible receipt containing:

- query family and the exact source/tool used;
- collection date, language, country/region, and device context;
- observed result-page intent, dominant page types, useful SERP features, and materially different interpretations;
- current Verdant and external canonical competitors, with the collision decision;
- demand metric, time window, and source when available, or explicit `unknown` with no invented proxy;
- the page's distinct information gain, original asset, and reason a new canonical is warranted; and
- consolidation trigger, researcher identity, and receipt version.

`roadmap-500.json` is an immutable v1 identity/allocation baseline and therefore remains provisional. It is never rewritten to pretend later research happened. `intent-research-registry.json` stores append-only lifecycle events and receipts outside that baseline. Its derived state becomes `researched` only when the receipt above exists. Post-publication query/task evidence may advance it to `validated`; later intent drift appends a `superseded` or return-to-`provisional` event. Search demand is a prioritization signal, never evidence for a cultivation claim and never grounds for delaying urgent safety, prerequisite, or correction work.

## Review gates

### Evidence review

- source identities, versions, DOI/stable locators, licenses, corrections, and retractions verified;
- claim-to-source roles and external validity complete;
- numeric methods, units, context, and derivations reproducible;
- contradictory evidence and uncertainty visible; and
- AI output used only as disclosed assistance, never evidence.

### Cultivation review

- stage, medium, cultivar, facility, root-zone, and environmental applicability bounded;
- diagnosis uses differentials and converging evidence;
- intervention is proportionate and includes stop/follow-up conditions; and
- high-stress, off-label, bro-science, and unsupported universal claims absent.

### Product-truth review

- route exists and is available to the stated audience;
- saved, manual, demo, stale, invalid, and live states are described accurately;
- plan/entitlement and integration status are server-truthful;
- AI Doctor remains suggest-only and Action Queue approval-required; and
- no page implies device control or hidden writes.

Every page enters this gate, including R0–R2 pages that skipped qualified-safety review with a documented N/A receipt. That receipt is only an entry guard; it never substitutes for product-truth review. The product-truth reviewer records the exact shipped code, test, route, or explicit no-product-claim result used for the approved revision.

### Technical and copy review

- canonical intent and path are unique;
- the search-research receipt is current, reproducible, and at least `researched`;
- schema, visible copy, dates, author, breadcrumb, and JSON-LD agree;
- internal edges resolve directly to published canonical endpoints, or to independently approved `ready` endpoints in the same atomic cohort when technical review validates the proposed post-release graph;
- sitemap/robots/static output and mobile/keyboard/screen-reader checks pass; and
- title, headings, anchors, alt text, tables, and source list are useful without keyword stuffing.

## Automated gate suite

Publication is blocked unless the exact revision passes:

- page-schema and roadmap-manifest validation;
- sensor metric/unit, derivation-input, calibration, high-RH, leaf-temperature, graph-reciprocity, device-identity, transport, and read-only capability semantics;
- cultivar screening/quarantine event semantics, exact-scope release evidence, deterministic current disposition, and append-only history comparison against the previously published revision;
- conditional content-block applicability and N/A-receipt validation;
- unique ID, slug, canonical path, and canonical intent;
- search-research receipt completeness, intent status, locale/date/tool provenance, and collision decision;
- graph vocabulary, target existence, reachability, required slots, and no public planned links;
- claim/source completeness and minimum source mix by risk;
- source URL, DOI/version, retraction/correction, and license checks;
- forbidden-claim, fabricated-experience, capability-truth, and secret/PII scans;
- canonical/robots/sitemap/JSON-LD parity and static render;
- heading, link-name, image-alt, contrast, keyboard, and critical WCAG checks;
- plagiarism/license review and recorded AI assistance; and
- rendered-page smoke at desktop and narrow mobile widths.

A check may be waived only by the accountable reviewer with a reason, scope, expiry, and compensating control. R2/R3 evidence, capability truth, licensing, secrets/PII, canonical integrity, and critical accessibility checks are not waivable.

## Corrections, emergency hotfixes, and withdrawal

Anyone can file a correction with page, claim, evidence, severity, and contact option. Triage separates copy errors, material evidence errors, product drift, safety hazards, legal/licensing issues, and malicious reports.

- **Imminent safety or severe misinformation:** transition immediately to `withdrawn`, remove the affected guidance, and render only the governed `noindex` stop/withdrawal notice when retention is safe and lawful; otherwise return `410`. Preserve evidence and begin independent review. Speed does not permit an untracked banner state or silent rewriting.
- **Material error:** correct the affected claim, publish a dated note explaining impact, rerun dependent reviews, and identify downstream pages needing review.
- **Minor clarity error:** correct through the normal revision ledger; do not fake a new freshness date.
- **Retraction, code/label change, or lost license:** block the claim/asset until a valid replacement is approved.
- **No safe equivalent:** preserve a visible `noindex` withdrawal/archive notice when the historical record can remain safely and lawfully. Return `410` only when retaining the content is itself unsafe or unlawful. In either case, remove it from the sitemap, repair inbound links, and never redirect unsafe content to an unrelated commercial page.

Restoration requires a new revision and the same gates as first publication. The correction ledger remains public even after restoration.

## Monitoring and service levels

| Trigger                                              |                         Triage target | Required response                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------- |
| Safety-critical report                               |                             Immediate | stop notice or withdrawal, independent review                                                                                          |
| Broken source, route, or integration drift           |                       2 business days | qualify/remove claim and repair path                                                                                                   |
| Retraction, pesticide label, code, or law change     |        1 business day after detection | block affected claim and reopen R3 review                                                                                              |
| High-change vendor/equipment page                    |                         Every 90 days | reverify versioned capability and availability                                                                                         |
| Diagnostic, sensor, nutrition, environment reference |                        Every 180 days | source, method, applicability, link review; a new verification/supersession event triggers sensor review sooner                        |
| Stable glossary/fundamental                          |                        Every 365 days | intent, source, link, accessibility review                                                                                             |
| Cultivar profile                                     | Every 365 days or event-driven sooner | any screening, correction, retest, quarantine, release, reopen, disposal, or override event triggers provenance and disposition review |

Dates change only for material revisions. Event triggers override calendar intervals.

Before a revised sensor or cultivar profile can publish, automation compares the proposed record with the last published revision. `validateSensorVerificationHistoryAppendOnly` and `validateCultivarHistoryAppendOnly` must pass: prior events stay present, byte-equivalent, and in order; corrections, retests, releases, and supersessions are appended as new evidence. The derived current projection may change only when the preserved history supports it.

## Definition of ready

- reader, problem, unique canonical intent, parent, and page type fixed;
- search intent is at least `researched` with a reproducible receipt; demand may remain `unknown`;
- parent/prerequisite and required graph edges are live, or every not-yet-live endpoint is independently `ready` in the same approved atomic cohort;
- risk class, claim map, source roles, and applicability complete;
- page-specific original asset and reproducible method complete;
- universal limitations and what-not-to-conclude guidance are complete; each conditional procedure/comparison, differential/confounder, and stop/follow-up block is either complete or has an approved page-revision-specific `not_applicable` receipt;
- non-product next step and zero-or-one truthful CTA chosen;
- named author, independent reviewers, qualifications, and conflicts recorded;
- schema type, canonical route, robots/sitemap behavior, and update trigger set;
- all required human approvals and automated receipts match the exact revision; and
- no unresolved correction, collision, licensing, privacy, accessibility, or capability-truth blocker.

## Measurement and learning

Each page records a baseline, target, attribution window, owner, and review cadence for the metrics appropriate to its job:

- claim/source completeness and source freshness;
- correction severity and time to correction;
- index coverage and query-family fit;
- meaningful engaged reading (active time plus depth, not idle tab time);
- successful next-step navigation;
- return-to-reference use;
- internal-link success by semantic slot;
- Quick Log or tool start and completion, when the page truthfully supports it;
- assisted signup without claiming causation; and
- support/search refinements showing an unanswered reader job.

Use cohort holdbacks or clearly documented before/after windows for product experiments. Never optimize a diagnostic or safety statement for click-through. The managing editor reviews cohort results before expanding production, consolidates cannibalizing pages, and records why roadmap priorities changed.
