# Knowledge graph contract

The Knowledge Library graph is an editorial evidence graph, not a diagnosis engine. It makes identity, provenance, applicability, and useful navigation machine-readable while preserving the rule that the grower's current plant record is stronger evidence than a generic reference page.

## Identity and alias rules

Every node has one immutable, globally unique ID in the form `<type-prefix>:<stable-key>`. The prefix is lowercase kebab/snake-safe text; the stable key may contain lowercase letters, digits, `.`, `_`, `-`, and `:`. Examples: `topic:sensor-truth`, `cultivar:oreoz`, `claim:oreoz:lineage-1`, `method:leaf-temperature-offset:v1`, and `unit:kilopascal`.

- IDs are identifiers, not display copy, URLs, database row IDs, or grower-owned IDs.
- Renaming a page or label does not change its node ID. Use `supersedes` only when the concept or method changes materially.
- `aliases` are search/display labels. An alias never proves identity and cannot be an edge endpoint.
- Alias matching is normalized for lookup, but canonical resolution must remain explicit when two nodes share an alias.
- Personally identifying grower, plant, tent, facility, and run names are never serialized into the public graph. Public `Run`, `Observation`, `Facility`, and `Phenotype` nodes use anonymized editorial IDs.

The V1 ontology contains 26 node types and 34 edge types. These counts are contract totals, not publishing targets; adding or removing a type requires the schema, endpoint table, validator, and regression tests to change together.

## Node types

| Node             | ID example                       | Required use                                                                                   |
| ---------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Topic`          | `topic:root-zone`                | Pillar, cluster, guide, protocol explainer, comparison, glossary, or other canonical page node |
| `Cultivar`       | `cultivar:oreoz`                 | Source-aware cultivar identity, aliases, release/source, and bounded lineage claims            |
| `Stage`          | `stage:flower-early`             | Canonical stage context and transitions                                                        |
| `Metric`         | `metric:vpd-air`                 | A measured or derived quantity independent of any one unit                                     |
| `Sensor`         | `sensor:ecowitt:wh31`            | Sensor class/model identity and measurement limits                                             |
| `Symptom`        | `symptom:interveinal-yellowing`  | An observable sign without an assigned cause                                                   |
| `Condition`      | `condition:magnesium-deficiency` | Candidate deficiency, toxicity, pest, pathogen, or abiotic condition                           |
| `Protocol`       | `protocol:high-rh-check:v1`      | Versioned calibration, scouting, sanitation, irrigation, harvest, or incident procedure        |
| `Equipment`      | `equipment:dehumidifier`         | Equipment class or source-qualified model and its inherent capabilities                        |
| `EvidenceSource` | `source:doe-2024-vpd`            | Stable citation record for research, standards, labels, manuals, or bounded field evidence     |
| `ProductAction`  | `product-action:quick-log`       | Allow-listed, shipped Verdant next step; never a device command                                |
| `Claim`          | `claim:vpd-guide:derived-1`      | One material assertion with evidence state, applicability, limitations, and source links       |
| `Author`         | `author:verdant-editor-1`        | Named content author with a real experience statement and disclosed credentials                |
| `Reviewer`       | `reviewer:cultivation-1`         | Named reviewer and review role/signoff; not an invented endorsement                            |
| `Method`         | `method:air-vpd-buck:v1`         | Versioned measurement, derivation, comparison, or analytical method                            |
| `Observation`    | `observation:run-42:day-28-1`    | An anonymized, time-bounded observation with method/run context                                |
| `Run`            | `run:anonymized-42`              | An anonymized cultivation or validation run defining the comparison context                    |
| `Phenotype`      | `phenotype:oreoz:sample-a`       | A source/run-scoped expression; never synonymous with the whole cultivar                       |
| `Trait`          | `trait:stretch-ratio`            | A defined observable or measured characteristic                                                |
| `Medium`         | `medium:coco-coir`               | Root-zone medium or substrate system                                                           |
| `Facility`       | `facility:indoor-sealed-room`    | Non-identifying facility/room class that bounds applicability                                  |
| `Unit`           | `unit:kilopascal`                | Canonical unit identity and conversion basis                                                   |
| `Outcome`        | `outcome:dry-yield-grade-a`      | An anonymized measured/graded result linked to method and run                                  |
| `Jurisdiction`   | `jurisdiction:us-ca`             | Legal, label, code, or professional-practice scope                                             |
| `Capability`     | `capability:export-csv`          | One bounded function of equipment, sensor, product, or integration                             |
| `Integration`    | `integration:ecowitt-read-only`  | Versioned data path with status, evidence, provenance, and explicit non-control boundary       |

`Claim`, `Method`, `Observation`, `Run`, `Phenotype`, `Trait`, `Unit`, and `Outcome` are separate because a sentence, procedure, observation context, expression, quantity, and result are not interchangeable evidence. `Capability` and `Integration` are separate from `Equipment` so native equipment functions cannot be mistaken for shipped Verdant functions.

Only `Topic`, `Cultivar`, `Sensor`, `Condition`, `Protocol`, `Equipment`, and `Method` are canonical page-owning node types. Every `pageManifest.graph.node` uses exactly one of those seven types. Supporting evidence nodes such as `Claim`, `Observation`, and `EvidenceSource` remain addressable graph records, but they do not independently own a public page manifest.

Author and reviewer profiles are identity views, not alternate owners of a cultivation page. Every `personRef` carries `profileSubjectId` equal to its `nodeId`. A page's one author is exactly reciprocal with its active page-level `authored_by` edge, and the set of named signoff reviewers is exactly reciprocal with its active page-level `reviewed_by` edges. Profile routes may render those incoming relationships, but cannot invent authorship or review from display names.

## Canonical sensor metric and unit identities

The sensor schema binds each serialization key to exactly one graph `Metric` and one canonical `Unit`. A key is an interchange field, not a second metric identity. A page cannot substitute a display unit, vendor label, or convenient graph ID for these tuples; conversions are separate, method-qualified claims.

| Sensor key          | Canonical metric ID                        | Canonical unit ID                            |
| ------------------- | ------------------------------------------ | -------------------------------------------- |
| `air_temp_c`        | `metric:air-temperature`                   | `unit:celsius`                               |
| `humidity_pct`      | `metric:relative-humidity`                 | `unit:percent-relative-humidity`             |
| `vpd_kpa`           | `metric:vpd-air`                           | `unit:kilopascal`                            |
| `leaf_temp_c`       | `metric:leaf-temperature`                  | `unit:celsius`                               |
| `leaf_vpd_kpa`      | `metric:vpd-leaf`                          | `unit:kilopascal`                            |
| `co2_ppm`           | `metric:carbon-dioxide-concentration`      | `unit:parts-per-million`                     |
| `soil_moisture_pct` | `metric:soil-moisture-relative`            | `unit:percent`                               |
| `soil_temp_c`       | `metric:soil-temperature`                  | `unit:celsius`                               |
| `soil_ec_mscm`      | `metric:soil-electrical-conductivity`      | `unit:millisiemens-per-centimeter`           |
| `reservoir_ph`      | `metric:reservoir-ph`                      | `unit:ph`                                    |
| `reservoir_ec_mscm` | `metric:reservoir-electrical-conductivity` | `unit:millisiemens-per-centimeter`           |
| `ppfd`              | `metric:ppfd`                              | `unit:micromole-per-square-meter-per-second` |

Every measurement owns exactly one active `uses_unit` edge. Direct metrics own a matching `measured_by` edge and no derivation record. Derived `Metric` nodes own exact reciprocal `derived_from` edges for every declared input and exactly one active `uses_method` edge to their serialized versioned method; they do not own a `measured_by` edge merely because a device displays the result.

## Sensor evidence, identity, and capability boundaries

- A derived measurement records its formula version, formula expression when Verdant computes it, computation time, input observation IDs, canonical metric/unit IDs, input timestamps, source/quality/freshness, maximum age and skew, uncertainty, and limitations. Vendor-derived values instead cite the vendor method source and remain vendor-derived.
- Calibration is an append-only verification history. Authoritative evaluation requires an explicit `asOf` time. The current verification ID must resolve to the latest applicable record at that time; the record must predate `asOf`, remain inside its due window, and carry canonical units plus a passing disposition for every required direct/input metric. Its method, reference instrument, checked date, as-found/as-left results, deviation, uncertainty, disposition, next due date, sources, reviewer, and supersession remain visible.
- The high-RH check is an actual comparison record, not a proposed procedure: target and reference RH are at least 75%, device as-found value and deviation are recorded, any adjustment and as-left result are explicit, and a non-pass disposition prevents authoritative VPD.
- Every VPD record carries a structured measured leaf-temperature basis. Air VPD labels it `context_only_for_air_vpd`; leaf VPD labels it `formula_input_for_leaf_vpd`. Method, reference instrument, measured air/leaf temperatures, offset, sample count, canopy locations, light state, timestamp, uncertainty, applications, evidence, and limitations remain visible.
- Device manufacturer/model/hardware identity, transport status, and capability ownership are separate. Native device capabilities attach to the `Sensor`; Verdant capabilities attach to a versioned `Integration`. Verdant integrations are evidence-qualified and read-only, `verdantMayInvoke` is false, and no sensor page implies control or a write path.

## Cultivar screening and quarantine history

Cultivar health evidence is append-only and subject-scoped. Each screening event names its accession, batch, or plant scope; sample; target; result; collection, result, and record dates; method; source; limitations; and recorder. A correction adds a new event with `supersedesEventId`; a retest adds an independent event with `retestOfEventIds`. Neither rewrites or deletes the earlier evidence, and discordant results remain visible.

Quarantine is an immutable event sequence (`open`, `release`, `dispose`, `reopen`, or explicit `override`) bound to the same subject and target. A normal release requires current, unsuperseded, scope-matching negative evidence collected on or after the latest open/reopen and recorded on or before the release; later evidence cannot justify an earlier decision. An override is visibly non-clearance. `currentHealthDisposition` is a deterministic projection of both histories. It may say `negative_scoped`, but never “clean” or “pathogen free,” and a batch result cannot silently clear a plant or accession.

## Claim and page risk contract

Every material claim and every page manifest declares one risk class:

| Class | Meaning                                                                                                                                                                                                                  | Typical examples                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R0`  | Navigational, definitional, or descriptive content with no plausible cultivation or safety consequence                                                                                                                   | glossary identity, page navigation, non-prescriptive definitions                                                                                     |
| `R1`  | Low-consequence observation or recordkeeping guidance that remains easy to reverse                                                                                                                                       | photo protocol, logging fields, cautious comparison setup                                                                                            |
| `R2`  | Guidance that may influence cultivation inputs, environment, plant handling, diagnosis, harvest, material selection, or crop biosecurity without a human/property/legal hazard                                           | irrigation interpretation, nutrient/context checks, training, sensor-derived decisions, routine pathogen/IPM screening and plant-containment records |
| `R3`  | High-consequence human safety, property, or legal boundary, including pesticide-label, worker exposure, electrical, fire, structural, HVAC/refrigerant, compressed CO2, or legally controlled containment/release claims | re-entry/pre-harvest constraints, electrical capacity, CO2 exposure safety, regulator-controlled release                                             |

A material claim is any assertion a reasonable grower could use to change an input, environment, diagnosis, safety decision, purchase, workflow, or interpretation of evidence. Breaking one paragraph into smaller claims never lowers its risk.

Every page manifest carries one or more controlled `contentDomains` drawn from the ten roadmap pillars: `fundamentals`, `environment`, `sensors`, `irrigation`, `nutrition`, `health`, `genetics`, `stages`, `harvest`, and `equipment`. Cross-pillar pages list every material content domain. These tags describe subject ownership and navigation; they are not a hazard classification or permission to infer across domains.

Every material claim and page manifest also carries one or more controlled `riskDomains`: `standard`, `pathogen`, `biosecurity`, `pesticide`, `electrical`, `fire_safety`, `hvac_safety`, `co2_safety`, and `chemical_safety`. These tags select evidence, safety-review, escalation, and conversion constraints. `standard` is the baseline lane when no specialized hazard domain applies; it does not mean risk-free. Content domains and risk domains are deliberately separate taxonomies—a page about equipment may be `contentDomains: [equipment]` while its claim is `riskDomains: [electrical]`.

The page `riskClass` is the maximum risk of all material claims on that page (`R3 > R2 > R1 > R0`), and page `riskDomains` must cover the specialized risk domains used by its material claims. The structural schema contract requires the fields and controlled vocabularies, but it cannot compute the maximum or set coverage across repository records. A future repository-semantic validator must reject a page whose declared class is below any material claim, reject missing claim risk domains at page level, and verify that all material prose is represented by a claim. Until that exists, editorial and safety review own these invariants; no current validation report may claim they are machine-proven.

Each claim owns its evidence relationship through `sourceLinks`. A source link records one source ID, one or more bounded roles (`supports`, `limits`, `contradicts`, `defines_method`, `controls_requirement`, or `documents_product`), and a claim-specific locator. A source record supplies version/date, stable-identifier, archive-locator, authorship, and access metadata; it never declares blanket support for every claim that cites it. Measured, supported, and source-reported claims require at least one source link. An approved claim also records its section, claim type, approved wording state/date, author, evidence reviewer, cultivation reviewer, invalidation triggers, and next review date.

Safety signoff may be `not_applicable` only for `R0`–`R2` pages and only with a recorded reason. An `R3` page can remain unpublished while safety review is pending, but publication requires an actual approved safety signoff; `not_applicable` can never satisfy the `R3` publication gate.

## Edge vocabulary and endpoint contract

Cardinality is stated as source-to-target. `M:N` does not waive page-level minimum-link requirements. Unless marked symmetric, an edge is directional and cannot be reversed by inference.

| Edge                 | Allowed source → target                                                                                         | Cardinality                                                   | Symmetric | Meaning                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `parent_of`          | `Topic` → `Topic`, `Cultivar`, `Sensor`, `Condition`, `Protocol`, `Equipment`, or `Method`                      | `1:N`; target has at most one active parent                   | no        | Taxonomic containment of a canonical page-owning node; active edges must be acyclic                  |
| `requires`           | `Topic`, `Cultivar`, `Sensor`, `Condition`, `Protocol`, `Equipment`, or `Method` → any of those seven types     | `M:N`                                                         | no        | Reader/procedure prerequisite between canonical pages, not proof of an outcome                       |
| `next_step`          | `Topic`, `Cultivar`, `Sensor`, `Condition`, `Protocol`, `Equipment`, or `Method` → any of those seven types     | `M:N`; every page declares at least one target                | no        | Directional editorial progression between canonical pages                                            |
| `measured_by`        | `Metric` → `Sensor`, `Equipment`, or `Method`                                                                   | `M:N`                                                         | no        | A supported measurement route, not endorsement                                                       |
| `uses_unit`          | `Metric`, `Claim`, `Observation`, or `Outcome` → `Unit`                                                         | `M:N`                                                         | no        | Unit identity for a quantity or claim                                                                |
| `derived_from`       | `Metric` → `Metric`                                                                                             | `M:N`; derived metric has one or more inputs                  | no        | Formula dependency; method and basis remain explicit                                                 |
| `observed_as`        | `Condition` → `Symptom`                                                                                         | `M:N`                                                         | no        | Possible manifestation; never diagnosis by itself                                                    |
| `mimics`             | `Condition` ↔ `Condition`                                                                                       | `M:N`                                                         | yes       | Symmetric biological or observational resemblance with no implied shared cause                       |
| `differential_of`    | `Topic` or `Condition` → `Condition`                                                                            | `M:N`                                                         | no        | Directional editorial differential route; it does not assert that the endpoints biologically mimic   |
| `confirmed_by`       | `Condition` → `Observation`, `Method`, `Protocol`, or `Claim`                                                   | `M:N`                                                         | no        | Evidence that can raise bounded confidence                                                           |
| `disconfirmed_by`    | `Condition` → `Observation`, `Method`, `Protocol`, or `Claim`                                                   | `M:N`                                                         | no        | Evidence that can lower bounded confidence                                                           |
| `managed_by`         | `Condition` → `Protocol`                                                                                        | `M:N`                                                         | no        | Cautious response path within stated scope                                                           |
| `occurs_during`      | `Topic`, `Condition`, `Observation`, or `Run` → `Stage`                                                         | `M:N`                                                         | no        | Stage context, never stage exclusivity unless a claim says so                                        |
| `affects`            | `Condition`, `Medium`, `Equipment`, or `Protocol` → `Metric`, `Trait`, or `Outcome`                             | `M:N`                                                         | no        | Claim-backed directional relationship, not causation by default                                      |
| `applies_to`         | `Protocol`, `Method`, `Equipment`, `Integration`, or `Claim` → `Medium`, `Stage`, `Facility`, or `Jurisdiction` | `M:N`                                                         | no        | Bounded applicability                                                                                |
| `has_lineage_claim`  | `Cultivar` or `Phenotype` → `Cultivar`                                                                          | `M:N`                                                         | no        | Source-reported pedigree relationship, never genotype proof                                          |
| `has_observed_trait` | `Cultivar` or `Phenotype` → `Trait`                                                                             | `M:N`                                                         | no        | Run/observation-scoped trait association                                                             |
| `supported_by`       | `Claim` → `EvidenceSource`                                                                                      | `M:N`; supported/measured claims require at least one source  | no        | Claim-level provenance                                                                               |
| `authored_by`        | `Topic`, `Cultivar`, `Sensor`, `Condition`, `Protocol`, `Equipment`, `Method`, or `Claim` → `Author`            | `M:N`                                                         | no        | Authorship identity for a canonical page or material claim                                           |
| `reviewed_by`        | `Topic`, `Cultivar`, `Sensor`, `Condition`, `Protocol`, `Equipment`, `Method`, or `Claim` → `Reviewer`          | `M:N`                                                         | no        | Review/signoff identity and role for a canonical page or material claim                              |
| `uses_method`        | `Metric`, `Observation`, `Outcome`, or `Claim` → `Method`                                                       | `M:N`                                                         | no        | Method used to derive a metric or create/interpret evidence                                          |
| `observed_in`        | `Observation`, `Outcome`, or `Phenotype` → `Run`                                                                | `N:1` per observation/outcome record                          | no        | Anonymized run context                                                                               |
| `observes`           | `Observation` → `Metric`, `Symptom`, `Trait`, or `Outcome`                                                      | `M:N`                                                         | no        | What was recorded, without assigning cause                                                           |
| `has_phenotype`      | `Cultivar` → `Phenotype`                                                                                        | `1:N`                                                         | no        | Source/run-scoped expression                                                                         |
| `grown_in`           | `Run` → `Medium` or `Facility`                                                                                  | `M:N`                                                         | no        | Non-identifying cultivation context                                                                  |
| `produced_outcome`   | `Run` → `Outcome`                                                                                               | `1:N`                                                         | no        | Measured/graded result from an anonymized run                                                        |
| `has_capability`     | `Equipment` or `Sensor` → `Capability`                                                                          | `M:N`                                                         | no        | Native, evidence-qualified capability                                                                |
| `exposes_capability` | `Integration` → `Capability`                                                                                    | `M:N`                                                         | no        | Capability actually exposed by a versioned integration                                               |
| `integrates_with`    | `Equipment` or `Sensor` → `Integration`                                                                         | `M:N`                                                         | no        | Supported data-path relationship with status and evidence                                            |
| `valid_in`           | `Claim`, `Protocol`, `Method`, or `Integration` → `Jurisdiction`                                                | `M:N`                                                         | no        | Jurisdictional scope; absence means scope is unknown, not universal                                  |
| `logged_as`          | `Observation` or `Outcome` → `ProductAction`                                                                    | `M:N`                                                         | no        | Optional shipped recording path; does not imply the record already exists                            |
| `next_action`        | `Topic`, `Cultivar`, `Sensor`, `Condition`, `Protocol`, `Equipment`, or `Method` → `ProductAction`              | `1:1` per edge; `0:1` active outgoing product action per page | no        | Contextual conversion path; ordinary non-product and safety-only pages may have zero product actions |
| `supersedes`         | node → earlier node of the same type                                                                            | `N:1` immediate predecessor                                   | no        | Version/concept replacement without rewriting history                                                |
| `related_to`         | any defined node type ↔ the same or another defined node type                                                   | `M:N`                                                         | yes       | Editorially useful relationship used only when no narrower edge applies                              |

There is deliberately no unconditional `caused_by` edge. There are no undefined `risk`, `environment`, `input`, `page`, `event`, or free-text endpoint types: use the canonical node types above.

## Edge provenance, time, and status

Every serialized edge contains:

- a stable edge ID;
- edge type plus source/target IDs and declared node types;
- declared cardinality and symmetry matching the table above;
- `status`: `proposed`, `active`, `disputed`, `deprecated`, or `retired`;
- nullable `effectiveFrom` and `effectiveThrough` dates; and
- provenance containing claim IDs, evidence-source IDs, reviewer IDs, and at least one limitation.

Empirical `active` edges require at least one claim and evidence source. Editorial taxonomy/navigation edges may use an editorial claim, but every active editorial edge still records at least one reviewer and one limitation. `effectiveThrough` cannot precede `effectiveFrom`. A disputed edge stays queryable with its status and cannot be promoted to an unqualified fact. Retiring an edge preserves it for audit; it is not deleted or silently rewritten.

Symmetric edges are serialized once, with the lexicographically smaller node ID as `sourceId`; query code expands both directions. Mirrored duplicate records are invalid. Every other edge is asymmetric unless the table says otherwise.

## Canonical serialization

Every node serializes with `id`, canonical `type`, human label, aliases, lifecycle status, and a bounded description. Each specialized page includes that node plus its page-local edges in `pageManifest.graph` from `common.schema.json`. A graph document uses explicit node and edge identities; it never relies on display strings:

```json
{
  "node": {
    "id": "topic:air-vpd",
    "type": "Topic",
    "label": "Air VPD",
    "aliases": ["air vapor pressure deficit"],
    "status": "active",
    "description": "Evidence-aware air VPD reference and calculation context."
  },
  "parentId": "topic:environment",
  "prerequisiteIds": ["topic:temperature-and-rh"],
  "lateralIds": ["topic:leaf-vpd", "topic:sensor-placement"],
  "nextStepIds": ["topic:leaf-vpd"],
  "differentialIds": [],
  "edges": [
    {
      "id": "edge:air-vpd:derived-from:air-temperature:1",
      "type": "derived_from",
      "sourceId": "metric:vpd-air",
      "sourceType": "Metric",
      "targetId": "metric:air-temperature",
      "targetType": "Metric",
      "cardinality": "many_to_many",
      "symmetric": false,
      "status": "active",
      "effectiveFrom": "2026-08-01",
      "effectiveThrough": null,
      "provenance": {
        "claimIds": ["claim:air-vpd:formula-inputs"],
        "sourceIds": ["source:ashrae-psychrometrics"],
        "reviewerIds": ["reviewer:evidence-1"],
        "limitations": ["The calculation basis and units must remain explicit."]
      }
    },
    {
      "id": "edge:air-vpd:next-step:leaf-vpd:1",
      "type": "next_step",
      "sourceId": "topic:air-vpd",
      "sourceType": "Topic",
      "targetId": "topic:leaf-vpd",
      "targetType": "Topic",
      "cardinality": "many_to_many",
      "symmetric": false,
      "status": "active",
      "effectiveFrom": "2026-08-01",
      "effectiveThrough": null,
      "provenance": {
        "claimIds": ["claim:air-vpd:editorial-next-step"],
        "sourceIds": [],
        "reviewerIds": ["reviewer:editorial-1"],
        "limitations": [
          "This is an editorial reading sequence, not evidence of a biological relationship."
        ]
      }
    }
  ]
}
```

`nextStepIds` and `differentialIds` are denormalized page-navigation slots backed by `next_step` and `differential_of` edges in the same graph. Every ID must have exactly one matching active outgoing edge of the corresponding type. A non-diagnostic page serializes an empty `differentialIds` array; a deficiency/diagnostic page supplies useful condition IDs and directional `differential_of` edges.

The schema and runtime edge validator enforce all 34 edge types' allowed endpoint types, declared cardinality, symmetry, and active-edge provenance class. The runtime validator additionally enforces same-type endpoints for `supersedes`. Repository-wide semantic validation must still prove node/edge uniqueness, endpoint existence and ID/type agreement, graph-wide cardinality counts, symmetric-edge ID ordering and duplicate prevention, date order, claim/source reciprocity, page-slot/edge reciprocity, published-target availability, and acyclic active `parent_of` edges. Those cross-record checks require a repository corpus and are not claimed by single-record schema validation.

## Publication and navigation rules

1. Every published specialized page has one parent pillar and at least one useful `next_step` target. `linkApplicability` determines whether prerequisites, contextual laterals, and differentials are required or `not_applicable`: required prerequisites need at least one node, required laterals need at least two, and required deficiency/diagnostic differentials need at least three. An N/A receipt requires a reason/reviewer/date and forces the corresponding ID array to remain empty, preventing filler links.
2. Draft edges do not become public links until both endpoints are published. Predeployment may validate independently `ready` endpoints in the same atomic cohort against the proposed post-release graph, but those edges never render before the complete release succeeds.
3. `parent_of` is acyclic. `mimics` and `related_to` may form cycles. Directional `next_step` and `differential_of` edges are never implicitly reversed.
4. Related-page selection follows the versioned, slot-scoped deterministic algorithm in `internal-linking.md`; mutable roadmap priority and commercial value never break ties.
5. Product edges are optional and allow-listed. Every page chooses zero or one product CTA and always provides a non-product next step. Ordinary zero-product pages use `non_product_only`; a safety-critical page may use the stricter `safety_only` exception with a required safety reason.
6. Product edges cannot claim a write, integration, entitlement, analysis, automation, or device-control behavior that shipped code does not provide.

## Non-inference query rules

Graph traversal returns evidence candidates, not conclusions. Implementations must apply all of these rules:

- **Symptom query:** `Symptom <- observed_as - Condition` returns candidate conditions plus confirming/disconfirming paths. It never returns “the cause” and never ranks from one symptom or photo alone.
- **Differential query:** `differential_of` returns an editorially selected comparison route, not a diagnosis or proof of biological resemblance. Only a separately reviewed symmetric `mimics` edge represents documented resemblance, and neither edge assigns the cause of a current plant symptom.
- **VPD query:** traverse exact reciprocal `derived_from`, `uses_unit`, and `uses_method` edges; never report VPD as directly measured. Every VPD record exposes structured input observations with canonical metric/unit identities, capture times, source, quality, freshness, age/skew limits, formula or vendor-method provenance, uncertainty, and limitations. An authoritative query supplies `asOf`, resolves the latest applicable verification, rejects future or overdue evidence, and requires canonical units plus passing results for every input. Both air and leaf VPD require a passing current high-RH verification record at or above 75% RH plus a structured measured leaf-temperature basis; air VPD uses that basis as context, while leaf VPD uses it as a formula input. Missing, stale, invalid, mismatched, or unverified inputs prevent authoritative output.
- **Cultivar query:** `has_lineage_claim` and `has_observed_trait` return source/run-scoped claims. Screening and quarantine queries return immutable subject-scoped events plus their derived current disposition; corrections and retests preserve the prior record, contradictory results remain visible, and only qualifying post-open evidence can support a release. A name, alias, lineage claim, or scoped negative result never proves genotype, potency, finish time, phenotype behavior, universal cleanliness, or pathogen-free status.
- **Equipment query:** compatibility requires an active `integrates_with` edge, versioned `Integration`, evidence-qualified `Capability`, and current effective dates. Its `allowedSources` field is only the nonempty subset of canonical source labels substantiated for that specific path; the global six-label vocabulary is not a claim that every equipment page supports live, manual, CSV, demo, stale, and invalid inputs. Native equipment control capability never becomes Verdant device-control capability.
- **Absence query:** no edge or observation means “unknown/not recorded,” not “negative,” “safe,” or “unsupported.”
- **Association query:** `affects`, `observed_in`, and `produced_outcome` do not establish causation. Matched conditions, method, replication, and limitations remain visible.
- **Jurisdiction query:** missing `valid_in` scope is unknown scope. It cannot be treated as globally legal, label-compliant, or professionally authorized.
- **Current-plant query:** generic library evidence is always weaker than the grower's current RLS-scoped timeline, source-labeled telemetry, photos, and recorded actions. Library content cannot raise the confidence of stale or invalid telemetry.
- **Next-step query:** `next_step` advances through library content or a method; `next_action` points to an optional verified Verdant product action. Neither relationship creates an Action Queue item, writes data, executes a device command, or authorizes automation. `logged_as` likewise describes only an optional grower-controlled recording path.

All query responses preserve claim evidence state, applicability, limitations, edge status/effective dates, and source provenance. Filtering those fields out is not a valid “simplification.”
