# Pillar-page requirements

## Pillar contract

Each pillar is a maintained navigation and teaching surface, not a list of links. It defines the domain, establishes the measurement and evidence model, routes readers by job, exposes high-risk misunderstandings, and offers a truthful practical next step. V1 is indoor-first; greenhouse and outdoor applicability is deferred unless a reviewed page explicitly bounds shared principles for those environments.

Every instructional or entity descendant has exactly one canonical parent and exactly one pillar ancestry. A reviewed L1 cluster may be the direct parent; the pillar remains the ancestor rather than a second `parent_of` edge. Each pillar has `/guides` as its canonical parent, while the `/guides` library root has no parent. Cross-cutting concepts use graph links to the owning page rather than duplicate articles. The site map controls canonical ownership; this document controls teaching depth and pillar acceptance.

## Page-family vocabulary

Each L3 topic is implemented with the smallest page family that completely serves the reader job:

| Page family      | Required teaching function                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pillar`         | Define the domain, mental model, start paths, risks, topic map, and next steps.                                                         |
| `cluster`        | Teach a coherent subdomain and route to prerequisites, tasks, differentials, and entities.                                              |
| `reference`      | Define a concept, metric, unit, mechanism, stage, or bounded evidence state.                                                            |
| `protocol`       | State prerequisites, materials, method, stop conditions, verification, record shape, and revision.                                      |
| `diagnostic`     | Begin with observable evidence; compare plausible causes, confirmation/disconfirmation, risk, and follow-up without claiming certainty. |
| `comparison`     | Compare declared criteria, applicability, trade-offs, and evidence without unsupported “best” claims.                                   |
| `worked-example` | Show a bounded, anonymized calculation or record with method, inputs, outcome, and limits; never universalize one run.                  |
| `entity`         | Describe a cultivar, sensor, equipment item, source, or other graph entity with provenance and versioned claims.                        |
| `glossary`       | Resolve one durable term or abbreviation and link to the full method/context.                                                           |

Thin variants, calendar-only advice, strain-name-only advice, copied vendor pages, and pages distinguished only by a keyword modifier are rejected.

## Standard pillar anatomy

1. **Reader outcomes and scope** — intended grower jobs, facility context, and explicit non-scope.
2. **Mental model** — the smallest accurate causal or measurement model the reader needs.
3. **Measure before acting** — observations, method, units, timestamps, placement, provenance, and uncertainty.
4. **Start paths** — beginner, active-problem, optimization, commercial-SOP, and safety/professional-referral routes where applicable.
5. **Failure modes** — common misreadings, confounders, look-alikes, and unsafe shortcuts.
6. **Deep topic map** — L1→L2→L3 paths with a one-line reason to visit each cluster.
7. **Original field assets** — diagrams, decision trees, checklists, worksheets, comparison matrices, or anonymized worked records.
8. **Sources and review** — claim-level citations, named reviewers, dates, applicability, limitations, conflicts, and change history.
9. **Put it into practice** — at most one verified Verdant action plus a non-product alternative; urgent safety content may use only the non-product path.

## Shared pillar acceptance gates

A pillar cannot launch until:

- every L1 label below is registered as non-routable grouping metadata until a separately reviewed cluster page is approved; the pillar itself has no prerequisite, while a future cluster prerequisite is required only when a real knowledge or safety dependency exists, otherwise the slot carries a reviewed N/A receipt;
- the beginner, active-problem, optimization, and commercial-SOP paths each reach a useful answer without a dead end;
- every metric-bearing path links to method, unit, placement, provenance, freshness, and uncertainty guidance;
- every diagnostic path contains competing explanations, confirmation and disconfirmation evidence, stop conditions, and follow-up;
- all original assets have method, source/license, accessibility text, revision, and a non-image equivalent;
- graph validation finds the page-family-appropriate canonical parent/root exemption, no `parent_of` cycle or unexplained orphan, and every applicable collection, prerequisite, lateral, profile-work, differential, and next-step slot; conditional omissions require reviewed N/A receipts;
- high-risk pages have distinct cultivation and evidence approvers and the applicable label/code/professional boundary;
- every page has a useful non-product next step, every optional product CTA has current product-truth approval, and urgent safety pages default to zero product CTAs;
- canonical, structured data, static metadata, internal links, sitemap parity, accessibility, and representative reader-job checks pass; and
- all omissions and deferred greenhouse/outdoor applicability are visible rather than implied complete.

## P1. Grow fundamentals, records, and operations

**Reader jobs**

- Create an unambiguous grow, tent/room, batch, and plant record with explicit unknowns.
- Complete a fast daily walk and record what changed, who observed or changed it, and what was affected.
- Preserve photos, irrigation, feeding, work, and handoff evidence without implying causality.
- Review a cycle and distinguish a measured comparison from hindsight or memory.
- Understand ownership, privacy, retention, and export boundaries before recording sensitive grow data.

| L1 collection                  | L2 subtopics                                                                                                                           | L3 page families and required examples                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grow identity and setup        | Grow/tent/room/batch/plant hierarchy; naming; accession and batch identity; stage and medium; explicit unknown/unassigned state        | `reference`: identity hierarchy and scope; `protocol`: start a grow record; `comparison`: individual-plant versus batch records; `glossary`: grow, room, tent, batch, plant                            |
| Daily room walk                | Walk order; canopy/root-zone/environment observations; exception-first review; time and operator identity; interrupted walks           | `protocol`: 60-second and full room walks; `reference`: observation versus interpretation; `worked-example`: one complete walk record; `comparison`: checklist versus free text                        |
| Evidence capture               | Structured observation language; photo method; watering/feed log fields; room work; symptom location; before/after evidence            | `protocol`: photo evidence and repeatable framing; `reference`: minimum watering and feeding record; `worked-example`: observation with known/unknown fields; `diagnostic`: incomplete evidence triage |
| Attribution and timeline       | Event chronology; change owner; affected scope; baseline; one-change-at-a-time practice; correlation versus cause; conflicting records | `reference`: event and evidence model; `protocol`: attributable change record; `worked-example`: before/change/follow-up sequence; `diagnostic`: reconcile conflicting operator entries                |
| Team operations                | Shift handoff; assignments; SOP versioning; room turn; exception escalation; emergency record; accountability and audit trail          | `protocol`: shift handoff and room-turn close-out; `reference`: SOP version and effective date; `worked-example`: exception escalation; `comparison`: task completion versus verified close-out        |
| Cycle learning and stewardship | Cycle close-out; matched comparisons; missing-data disclosure; privacy; data ownership; retention; export; correction history          | `protocol`: cycle review and data export review; `reference`: privacy/data ownership; `worked-example`: matched-cycle comparison; `diagnostic`: insufficient evidence for a causal conclusion          |

**Required original assets:** 60-second room-walk checklist; full room-walk worksheet; structured observation word bank; photo-framing diagram; attributable-change record; handoff template; anonymized cycle-review example.

**Required cross-pillar links:** P2 environment/light evidence; P3 sensor truth; P4/P5 watering and feeding event fields; P6 symptom/scouting evidence; P7 identity/lineage; P9 run review; P10 export and integration limits.

**High-risk review:** privacy, data retention/export, worker handoff, emergency procedure, and any product-action claim require the relevant product, privacy, safety, or operational reviewer. Records never prove causality by themselves.

**Pillar-specific acceptance gate:** a representative grower must be able to create an identity structure, complete a walk, log an attributable change, hand off an exception, and review a cycle from the topic paths without being required to invent a value or treat a missing field as zero.

**Required non-product next step:** use the room-walk record. **Optional product CTA:** use a current verified Quick Log action when available and product-truth approved.

## P2. Environment, climate, and light

**Reader jobs**

- Measure temperature, RH, leaf temperature, CO2, airflow, and light at the correct location and time.
- Understand air versus leaf VPD as derived values and identify when inputs are not authoritative.
- Map canopy microclimates and light/airflow nonuniformity rather than trusting one room-average reading.
- Estimate peak HVAC and dehumidification demand and recognize when a qualified designer is required.
- Respond to environmental drift or equipment failure without drastic plant or device-control advice.

| L1 collection                     | L2 subtopics                                                                                                                        | L3 page families and required examples                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thermal and humidity fundamentals | Air/leaf temperature; RH; absolute moisture/dew point context; sensible/latent relationships; canopy versus room average            | `reference`: temperature and RH measurement; `reference`: dew point limitations; `worked-example`: canopy versus wall reading; `diagnostic`: implausible thermal/humidity combination        |
| VPD and leaf basis                | Saturation vapor pressure; air VPD; leaf VPD; leaf-temperature offset; formula version; uncertainty and error propagation           | `reference`: VPD is calculated, not directly measured; `protocol`: measure leaf offset; `worked-example`: air/leaf VPD calculation; `diagnostic`: missing or stale input                     |
| Airflow, CO2, and microclimates   | Horizontal/vertical airflow; boundary layer; dead zones; CO2 measurement/context; canopy maps; door/light-cycle effects             | `protocol`: canopy airflow/microclimate map; `reference`: CO2 context and limits; `comparison`: circulation patterns; `diagnostic`: localized RH or temperature drift                        |
| Capacity and transitions          | Transpiration load; HVAC/dehumidification capacity; safety margin; redundancy; lights-on/off transitions; recovery time; condensate | `reference`: peak-load inputs; `protocol`: transition audit; `worked-example`: bounded load worksheet; `diagnostic`: late-flower humidity recovery failure                                   |
| Lighting and photobiology         | PPFD; DLI; photoperiod; spectrum context; uniformity; mapping grid; distance; dimming; measurement uncertainty                      | `reference`: PPFD versus DLI; `protocol`: canopy light map; `comparison`: average versus uniformity; `worked-example`: DLI from measured PPFD/time; `diagnostic`: light-stress evidence path |
| Drift and failure response        | Setpoint versus measured state; alarm evidence; stale sensors; outage/overshoot; condensation/mold risk; contingency documentation  | `protocol`: environmental incident record; `diagnostic`: drift triage; `comparison`: observation threshold versus control setpoint; `worked-example`: recovery timeline                      |

**Required original assets:** canopy sensor-placement diagram; leaf-offset method card; VPD input/uncertainty worksheet; airflow and microclimate map; PPFD mapping grid; peak-load planning worksheet; lights-off transition timeline.

**Required cross-pillar links:** P3 calibration/provenance/freshness; P4/P5 transpiration and root-zone response; P6 environmental look-alikes and mold risk; P8 photosynthesis/transpiration/stage response; P9 dry-room environment; P10 HVAC/dehumidification/lighting equipment.

**High-risk review:** CO2, electrical load, HVAC, dehumidification, condensate, structural installation, fire, and mold guidance requires safety/professional boundaries. Numeric ranges must never be universal prescriptions detached from stage, method, facility, cultivar, or light context.

**Pillar-specific acceptance gate:** air/leaf VPD pages must identify inputs, basis, formula version, leaf-temperature evidence, source quality, uncertainty, and invalid/stale behavior; light pages must distinguish measurement from target selection and provide uniformity, not only an average.

**Required non-product next step:** use the calculation or mapping worksheet. **Optional product CTA:** open the currently shipped VPD calculator only when its inputs, limitations, and route match the guide.

## P3. Sensors, measurement, and data truth

**Reader jobs**

- Decide whether a reading is fit for the decision at hand.
- Calibrate or verify a sensor against an appropriate reference at operating conditions and preserve the record.
- Detect stale, impossible, unit-mismatched, misplaced, stuck, or transport-corrupted readings.
- Distinguish manual, CSV, read-only live transport, and derived data without confusing connectivity with truth.
- Understand how cautious human or AI reasoning must downgrade weak evidence.

| L1 collection                 | L2 subtopics                                                                                                                              | L3 page families and required examples                                                                                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provenance and identity       | Device/model/channel identity; source; raw record; timestamp; tent/plant scope; operator; transport; explicit unknown                     | `reference`: six canonical source labels; `protocol`: sensor inventory; `worked-example`: source-labeled snapshot; `diagnostic`: unknown provenance                                                                                             |
| Calibration and validation    | Reference selection; operating-condition comparison; multi-point checks; as-found/as-left values; adjustment; calibration date/history    | `protocol`: temperature verification; `protocol`: documented RH verification at or above 75% plus relevant operating-point checks; `protocol`: leaf-offset measurement; `worked-example`: calibration record; `diagnostic`: failed verification |
| Placement and time            | Canopy height; shielding; radiant heat; airflow; root-zone placement; sampling interval; clock/time zone; freshness window                | `reference`: representative placement; `protocol`: placement audit; `comparison`: canopy versus wall/ceiling; `diagnostic`: placement artifact or clock drift                                                                                   |
| Metrology and units           | Accuracy; precision; resolution; repeatability; uncertainty; unit families; conversions; significant digits; method limits                | `reference`: accuracy versus precision; `protocol`: unit validation; `worked-example`: µS/cm to mS/cm; `diagnostic`: Celsius/Fahrenheit or EC unit mismatch                                                                                     |
| Ingest and transport truth    | Manual; CSV; demo; read-only live path; packet delay; duplicate; missing channel; mapping; raw-payload safety                             | `reference`: transport does not prove live quality; `protocol`: import review; `comparison`: manual/CSV/live evidence; `diagnostic`: duplicate or delayed ingest                                                                                |
| Derived metrics and anomalies | Formula/version; required inputs; air/leaf basis; stuck 0/100; impossible pH/EC; abrupt jumps; confidence downgrade                       | `reference`: derived metric contract; `protocol`: anomaly review; `worked-example`: VPD with uncertainty; `diagnostic`: stale input presented as current                                                                                        |
| Evidence use and maintenance  | Confidence for current decision; calibration expiry; maintenance; replacement; evidence supplied to cautious AI; no confidence laundering | `protocol`: monthly sensor-trust review; `reference`: confidence versus certainty; `comparison`: authoritative versus limited evidence; `diagnostic`: recommendation based on weak telemetry                                                    |

**Required original assets:** sensor-trust decision tree; canopy placement diagram; calibration record with as-found/as-left values; unit-conversion card; stuck-sensor pattern examples; source/freshness/confidence matrix.

**Required cross-pillar links:** every metric-bearing pillar; especially P2 environment/light, P4 substrate/root-zone measurements, P5 EC/pH, P9 dry/cure conditions, and P10 device/transport capability.

**High-risk review:** sensor guidance cannot call unverified data healthy or live. The only canonical source labels are `live`, `manual`, `csv`, `demo`, `stale`, and `invalid`; unrecognized transport labels render as unverified source rather than live. Credential-like payload fields and grower identifiers never appear in public examples.

**Pillar-specific acceptance gate:** test fixtures must prove stale, invalid, impossible, unit-mismatched, uncalibrated, and unknown-source data cannot satisfy authoritative-evidence language; every derived metric path identifies and validates all inputs.

**Required non-product next step:** use the calibration/verification worksheet. **Optional product CTA:** review current sensor-truth guidance or record a manual measurement only when shipped behavior and product-truth review support it.

## P4. Root zone and irrigation

**Reader jobs**

- Reconstruct irrigation volume, timing, frequency, distribution, input/runoff measurements, and crop response.
- Choose measurement methods appropriate to the medium, container, and irrigation system.
- Understand dryback or substrate-weight evidence without treating one percentage as a universal target.
- Verify drainage, oxygenation, and emitter uniformity before changing nutrition or irrigation strategy.
- Separate root-zone evidence from above-ground look-alikes and make one attributable change at a time.

| L1 collection                             | L2 subtopics                                                                                                                      | L3 page families and required examples                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Media and container system                | Water-holding/air-filled behavior; particle/fiber properties; buffering; biological context; container geometry; fill consistency | `reference`: medium property model; `comparison`: common media systems by measurement need; `protocol`: container/media baseline; `diagnostic`: compaction or channeling evidence                          |
| Irrigation event design                   | Volume; frequency; pulse; timing; delivery rate; plant/batch scope; event history; lights-on context                              | `reference`: minimum irrigation-event fields; `protocol`: measure delivered volume; `worked-example`: event series; `comparison`: one event versus multiple pulses without declaring a universal winner    |
| Dryback and water status                  | Substrate weight; water-content sensors; field/cup capacity context; interval; plant uptake; evaporation; uncertainty             | `protocol`: gravimetric container check; `reference`: dryback calculation and limits; `worked-example`: weight curve; `diagnostic`: apparent dryback caused by missing/delayed readings                    |
| Input and runoff evidence                 | EC; pH; temperature; sample timing/location; runoff fraction; composite versus point sample; interpretation limits                | `protocol`: input/runoff sampling; `worked-example`: paired record; `comparison`: runoff versus root-zone extraction methods; `diagnostic`: misleading first/late runoff sample                            |
| Drainage, oxygen, and temperature         | Drain path; perched/saturated zones; dissolved oxygen context; root-zone temperature; algae/biofilm; standing water               | `protocol`: drainage audit; `reference`: oxygenation limits; `diagnostic`: waterlogging versus drought evidence; `worked-example`: drain/recovery timeline                                                 |
| Delivery uniformity                       | Emitters; pressure; clogging; filtration; line length; catch test; distribution uniformity; maintenance evidence                  | `protocol`: emitter catch test; `reference`: distribution-uniformity calculation; `comparison`: delivery hardware by verification method; `diagnostic`: edge/zone underdelivery                            |
| Root-zone differential and change control | Root appearance; odor; plant posture; environment/nutrition confounders; baseline; one change; follow-up                          | `diagnostic`: root-zone versus environment/nutrition look-alikes; `protocol`: cautious correction record; `worked-example`: evidence/change/follow-up; `reference`: what not to conclude from runoff alone |

**Required original assets:** irrigation-event worksheet; container/media baseline card; substrate-weight example; input/runoff sampling diagram; drainage path diagram; emitter-uniformity worksheet; root-zone differential matrix.

**Required cross-pillar links:** P1 event history; P2 transpiration/environment; P3 substrate/EC/pH sensor truth; P5 solution chemistry; P6 root-zone symptom differentials; P8 plant water movement; P10 irrigation hardware.

**High-risk review:** pages must not prescribe aggressive irrigation changes from one leaf, runoff sample, weight, or sensor reading. Electrical/pump, sanitation/chemical, and water-treatment guidance requires applicable safety and professional boundaries.

**Pillar-specific acceptance gate:** a reader can reconstruct a complete event and its measurement uncertainty; every target/range is bounded by medium, container, method, stage, environment, and current-plant evidence; no page treats free-text watering as a serious-room event history.

**Required non-product next step:** use the irrigation-event worksheet. **Optional product CTA:** log a watering event only through a current verified and product-truth-approved path.

## P5. Nutrition and solution management

**Reader jobs**

- Characterize source water and record a repeatable solution with actual measured EC, pH, temperature, volume, and method.
- Mix and version a nutrient program without turning a label or anecdote into universal dosage guidance.
- Distinguish deficiency, lockout, toxicity, irrigation, environment, and measurement problems through converging evidence.
- Interpret input/runoff/root-zone evidence with sampling limitations.
- Make one attributable adjustment and define the observation window and rollback condition.

| L1 collection                         | L2 subtopics                                                                                                                   | L3 page families and required examples                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source water                          | Alkalinity; hardness; EC; pH; ions/lab report; disinfectant context; temperature; seasonal variability; treatment evidence     | `reference`: source-water evidence; `protocol`: collect/read a water report; `worked-example`: bounded water profile; `diagnostic`: source-water change                          |
| Concentration and units               | EC; conductivity units; concentration conventions; dilution; volume; temperature compensation; significant digits              | `reference`: EC/unit basis; `protocol`: meter verification; `worked-example`: dilution/conversion; `diagnostic`: unit or temperature-compensation error                          |
| Mixing and stock solutions            | Mixing order; concentrate incompatibility; dissolution; sanitation; stock strength/version; batch identity; label requirements | `protocol`: documented mix sequence; `reference`: incompatibility/precipitation evidence; `worked-example`: solution-mixing record; `diagnostic`: mixing or measurement artifact |
| pH and alkalinity                     | pH meaning; alkalinity effect; method; probe care; drift; media context; adjustment records                                    | `reference`: pH versus alkalinity; `protocol`: pH measurement; `worked-example`: measured adjustment record; `diagnostic`: probe drift versus solution change                    |
| Program and recipe records            | Product/source attribution; label version; recipe version; stage/context; actual amounts; deviations; operator; response       | `reference`: program record schema; `protocol`: recipe change control; `comparison`: label schedule versus measured record; `worked-example`: versioned feed event               |
| Input/runoff/root-zone interpretation | Sample timing; EC/pH; runoff limitations; extraction methods; accumulation; irrigation/environment confounders                 | `protocol`: paired sampling; `comparison`: evidence methods; `diagnostic`: accumulation/uptake/measurement look-alikes; `worked-example`: trend with missing data                |
| Crop response and differentials       | Observable signs; tissue/lab context; deficiency; toxicity; lockout; root/environment/pest look-alikes; follow-up              | `diagnostic`: nutrient condition differential; `protocol`: one-change follow-up; `reference`: what one leaf cannot prove; `worked-example`: hypothesis and disconfirmation       |

**Required original assets:** source-water worksheet; unit/mixing-order card; versioned solution-mixing record; pH/alkalinity mental-model diagram; paired input/runoff example; nutrient/root/environment differential matrix.

**Required cross-pillar links:** P1 feeding records; P2 environment/transpiration; P3 EC/pH calibration and units; P4 irrigation/root-zone evidence; P6 symptoms/conditions; P8 stage/physiology; P10 meters, dosing, water-treatment, and safety.

**High-risk review:** no uncited dosage, guaranteed response, product endorsement, or universal EC/pH target. Chemical handling, source-water treatment, sanitation, and label claims require safety/source review. Cronk or any other nutrient line is recorded as a source/program, never used to invent dosage claims.

**Pillar-specific acceptance gate:** every quantitative example is method-, unit-, source-, stage-, medium-, and context-bounded; differential pages require root-zone and environment evidence before a nutrient conclusion; program pages preserve actual inputs and deviations.

**Required non-product next step:** use the versioned solution-mixing record. **Optional product CTA:** log a feeding event only through a current verified and product-truth-approved path.

## P6. Plant health, IPM, and biosecurity

**Reader jobs**

- Describe an observable sign precisely without naming a cause prematurely.
- Compare abiotic, nutritional, pest, pathogen, and measurement look-alikes and collect confirming/disconfirming evidence.
- Establish quarantine and room-entry practices that protect unaffected or scope-verified stock and preserve traceability without claiming universal health status.
- Run scheduled scouting with thresholds and records rather than relying on reactive memory.
- Document a label-compliant response, re-entry/pre-harvest limits, follow-up scouting, and evidence-based close-out.

| L1 collection                       | L2 subtopics                                                                                                                                | L3 page families and required examples                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Symptom observation                 | Color/pattern; location; distribution; tissue age; progression; plant/batch scope; photos; timeline; explicit unknown                       | `reference`: symptom vocabulary; `protocol`: symptom photo/record; `worked-example`: observation without diagnosis; `comparison`: localized versus systemic pattern                   |
| Differential method                 | Candidate set; prerequisites; environment/root/nutrition evidence; pest/pathogen evidence; confirmation/disconfirmation; stop/escalate      | `reference`: differential reasoning; `diagnostic`: yellowing, spots/lesions, tip damage, wilt, distortion; `protocol`: evidence checklist; `worked-example`: competing hypotheses     |
| Abiotic/nutritional conditions      | Light/heat/cold/water stress; physical injury; deficiency; toxicity; lockout; spray/contact injury; senescence                              | `diagnostic`: condition pages with look-alikes; `comparison`: deficiency versus lockout/toxicity; `reference`: stage/media context; `protocol`: follow-up observation                 |
| Pests and beneficial context        | Identification evidence; life stage; damage; monitoring; thresholds; beneficial compatibility; containment                                  | `entity`: pest/beneficial profiles; `protocol`: inspection/sticky-card count; `diagnostic`: pest versus abiotic damage; `worked-example`: trend record                                |
| Pathogens and testing               | Fungal/bacterial/viral/viroid risk; symptoms; sampling; test method; false result limits; quarantine/traceback                              | `entity`: condition/pathogen profiles; `protocol`: sample and chain-of-custody questions; `diagnostic`: symptom versus test evidence; `comparison`: screening versus diagnostic tests |
| Quarantine and biosecurity          | Intake; zones; dedicated tools/clothing; traffic; donor/mother risk; sanitation; waste; release criteria                                    | `protocol`: intake quarantine, entry/exit, tool sanitation, room turn; `reference`: scoped-negative/unknown/positive status; `worked-example`: exposure traceback                     |
| Scouting and thresholds             | Schedule; representative sample; sticky cards; location; count; trend; trigger; operator; exception; follow-up                              | `protocol`: room scouting; `reference`: threshold versus presence; `worked-example`: card/count trend; `diagnostic`: missing/biased sample                                            |
| Treatment record and label boundary | Product/label/jurisdiction; target; method; PPE; re-entry; pre-harvest; disposal; affected scope; no efficacy guarantee                     | `protocol`: treatment record and label verification; `reference`: REI/PHI meaning; `worked-example`: bounded record; `diagnostic`: adverse response/escalation                        |
| Close-out and prevention            | Follow-up scouting; negative/positive evidence; containment release; sanitation verification; root cause hypothesis; prevention; recurrence | `protocol`: incident close-out; `worked-example`: open-to-closed evidence; `comparison`: symptom improvement versus verified resolution; `reference`: recurrence review               |

**Required original assets:** symptom-to-evidence matrix; symptom photo-framing card; differential decision tree; quarantine-zone map; scouting/sticky-card sheet; chain-of-custody checklist; treatment/REI/PHI record; incident close-out packet.

**Required cross-pillar links:** P1 observation/audit history; P2 environment/light look-alikes; P3 telemetry truth; P4/P5 root/nutrient differentials; P7 accession/quarantine/pathogen history; P8 stage/senescence/physiology; P9 post-harvest contamination; P10 sanitation/testing/scouting equipment.

**High-risk review:** pesticide, biological, pathogen, CO2, worker-safety, disposal, and legal claims require current governing authority. Pages never prescribe off-label use, imply a photo proves a diagnosis, or replace a licensed lab, crop adviser, physician, veterinarian, electrician, or other required professional.

**Pillar-specific acceptance gate:** every diagnostic begins with signs, exposes at least two plausible competing causes when evidence supports them, states missing evidence and stop conditions, and provides a timed follow-up; every response page includes label/jurisdiction checks and close-out evidence.

**Required non-product next step:** use the symptom evidence or scouting record. **Optional product CTA:** add an observation/photo only through a current verified and product-truth-approved path. No page auto-creates an Action Queue item.

## P7. Genetics, cultivars, and propagation

**Reader jobs**

- Record a source claim, accession, seed lot, generation, mother/donor, clone batch, tissue-culture batch, acquisition date, and explicit unknowns.
- Trace a plant or pathogen risk backward to source material and forward to affected production plants.
- Design a pheno hunt that preserves identity and reduces environmental, positional, and selection bias.
- Compare phenotypes under matched conditions and separate observed traits from breeder or cultivar-name claims.
- Preserve or reject material using explicit criteria, health status, evidence, and disposition history.

| L1 collection                 | L2 subtopics                                                                                                                                       | L3 page families and required examples                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provenance and identity       | Breeder/source; acquisition; accession; aliases; release; seed lot; generation; explicit unknown; claim versus verification                        | `reference`: genetics identity schema; `protocol`: intake/accession record; `worked-example`: source-attributed claim; `diagnostic`: ambiguous or duplicate identity                    |
| Lineage and propagation chain | Mother/donor; clone batch; production plant; seed parentage claim; tissue-culture batch; generation; merge/disposition; backward/forward trace     | `reference`: lineage graph; `protocol`: clone-batch record; `worked-example`: mother→batch→plant trace; `diagnostic`: broken link or mixed batch                                        |
| Propagation methods           | Seed germination; cutting; rooting; mother maintenance; tissue-culture context; batch uniformity; transplant; failure record                       | `protocol`: method-specific records; `comparison`: propagation methods by evidence/operational need; `worked-example`: batch outcome; `diagnostic`: rooting/identity failure            |
| Health status and quarantine  | Source risk; intake quarantine; pathogen screen; sample/method/lab; result date; positive/negative/unknown; release; retest                        | `protocol`: genetics intake; `reference`: test/status semantics; `worked-example`: status history; `diagnostic`: discordant test or exposure                                            |
| Phenotype evidence            | Trait definition; measurement method; stage; location; environment/input context; replicate; photo/lab/sensory evidence; stability                 | `reference`: phenotype versus cultivar; `protocol`: trait measurement; `worked-example`: observed trait with run context; `comparison`: matched phenotype records                       |
| Pheno-hunt design             | Population; hypothesis; randomization/position; identifiers; evaluation windows; criteria/weights; missing data; cull/keep; rerun                  | `protocol`: hunt plan and blind scoring where practical; `comparison`: within-run versus across-run evidence; `worked-example`: selection ledger; `diagnostic`: bias/confounding review |
| Cultivar reference            | Canonical/source-aware name; aliases; lineage claims; release/source; variability; source-reported traits; observed aggregate; no fixed guarantees | `entity`: cultivar profile; `reference`: claim language; `comparison`: source claim versus matched observation; `diagnostic`: conflicting lineage claims                                |
| Preservation and disposition  | Mother/clone maintenance; health retest; redundancy; identity verification; retirement; cull reason; sample/seed disposition                       | `protocol`: preserve/retire decision record; `worked-example`: disposition chain; `comparison`: evidence strength for keep/cull; `reference`: superseded accession                      |

**Required original assets:** accession/provenance form; lineage graph; clone-batch traveler; pathogen-status timeline; phenotype measurement dictionary; pheno-hunt design worksheet; bias checklist; keep/cull decision ledger.

**Required cross-pillar links:** P1 identity/audit records; P2/P3 matched environment and measurement; P4/P5 matched inputs; P6 quarantine/pathogen/biosecurity; P8 stage/morphology; P9 yield/lab/sensory outcomes; P10 testing/labeling equipment.

**High-risk review:** cultivar names and lineage are not genotype proof; chemistry, morphology, timing, yield, potency, and disease response remain source/sample/run scoped. Pathogen testing pages disclose method and false-result limits. No private breeder practice, endorsement, or fabricated expert voice is attributed.

**Pillar-specific acceptance gate:** every entity supports explicit unknown states and source attribution; a mother→batch→plant graph can be traced in both directions; pheno comparisons require matched context, defined traits, missing-data handling, and a visible bias/confounder section.

**Required non-product next step:** use the accession, lineage, or pheno-hunt worksheet. **Optional product CTA:** browse current cultivar profiles when available and product-truth approved. No cultivar claim becomes a diagnosis or guaranteed outcome.

## P8. Plant physiology, growth stages, and canopy work

**Reader jobs**

- Use a small accurate model of photosynthesis, respiration, transpiration, water/nutrient movement, and source/sink relationships to frame observations.
- Identify stage from plant evidence and records rather than calendar alone.
- Understand how environment, root zone, nutrition, genetics, and canopy interventions interact without claiming a single cause.
- Plan and document low-stress canopy work, stop conditions, and recovery observations.
- Recognize when plant vigor or stage makes an intervention inappropriate.

| L1 collection                      | L2 subtopics                                                                                                                                    | L3 page families and required examples                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plant structure and function       | Roots; stems; nodes/internodes; leaves; stomata; vascular transport; meristems; flowers; trichome context                                       | `reference`: anatomy/function pages; `worked-example`: observable structure record; `comparison`: structure versus inferred function; `glossary`: canonical anatomy terms      |
| Carbon, water, and energy          | Photosynthesis; respiration; transpiration; stomatal response; source/sink; water movement; environmental coupling; limits of simplified models | `reference`: bounded physiology models; `worked-example`: evidence chain; `diagnostic`: low-assimilation look-alikes; `comparison`: measurement versus inference               |
| Root/shoot and nutrient movement   | Uptake context; mass flow/diffusion concepts; transport; root-zone oxygen/temperature; growth allocation; stress response                       | `reference`: movement/response; `worked-example`: root/environment context; `diagnostic`: root versus shoot evidence; `comparison`: acute versus chronic observation           |
| Germination and seedling           | Germination evidence; emergence; early root/leaf development; moisture/light/environment; identity; transplant risk; loss record                | `reference`: stage evidence; `protocol`: gentle observation/record; `diagnostic`: stalled emergence/seedling look-alikes; `comparison`: calendar versus morphology             |
| Vegetative and transition          | Active growth evidence; node/root development; preflower/transition; stretch onset; stage change record; environmental/input shift              | `reference`: vegetative/transition criteria; `protocol`: stage-transition record; `worked-example`: evidence-based transition; `diagnostic`: expected stretch versus stress    |
| Flower development                 | Early/mid/late flower evidence; structure; support; senescence context; risk shifts; harvest linkage                                            | `reference`: flower phase evidence; `worked-example`: stage timeline; `diagnostic`: normal change versus health issue; `comparison`: calendar versus observed development      |
| Canopy architecture                | Spacing; branch structure; height; density; light/air uniformity; trellis/support; access; microclimate                                         | `protocol`: canopy map/support check; `comparison`: architecture by operational goal; `worked-example`: before/after map; `diagnostic`: dead zone or overcrowding evidence     |
| Training, pruning, and defoliation | Intent; plant condition; stage; low/high-stress distinction; cut/site record; stop conditions; recovery; repeated intervention                  | `protocol`: intervention record and recovery check; `reference`: evidence/risks; `comparison`: methods by goal and stress; `diagnostic`: poor recovery or inappropriate timing |

**Required original assets:** plant anatomy/transport diagram; physiology evidence ladder; stage-transition checklist; stage photo-evidence guide; canopy map; intervention record; recovery timeline; autoflower caution card.

**Required cross-pillar links:** P2 environment/light; P3 measurement truth; P4 root-zone water/oxygen; P5 nutrition; P6 health/senescence differentials; P7 genetics/phenotype; P9 harvest readiness; P10 lighting and measurement hardware.

**High-risk review:** simplified physiology is labeled as a model, not direct proof. Autoflower guidance avoids unnecessary transplant shock, heavy defoliation, high-stress recovery tactics, and calendar-only intervention. Weak plants receive stability/root-health/low-stress framing, not aggressive techniques.

**Pillar-specific acceptance gate:** stage pages list observable criteria and uncertainty; intervention pages require intent, prerequisites, stop conditions, affected scope, and recovery window; physiology pages distinguish measured observations from inferred mechanism.

**Required non-product next step:** use the stage/intervention observation record. **Optional product CTA:** open a current stage-care guide only when its route and content are product-truth approved.

## P9. Harvest and post-harvest

**Reader jobs**

- Build a harvest plan from plant, batch, facility, labor, and evidence constraints rather than one visual sign.
- Preserve batch identity and measure wet weight, dry weight, moisture/trim loss, grade, defects, and disposition consistently.
- Treat drying and cure rooms as controlled cultivation environments with source-labeled measurements and peak-load/failure planning.
- Record lab and sensory outcomes with method, sample, assessor, and claim limitations.
- Link yield and quality outcomes back to cultivar, room, environment, inputs, interventions, health, and uncertainty for the next run.

| L1 collection                  | L2 subtopics                                                                                                                                            | L3 page families and required examples                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Readiness and planning         | Multi-signal readiness; sampling; cultivar/stage context; room sequence; labor; sanitation; batch identity; contingency                                 | `reference`: readiness evidence; `protocol`: harvest plan; `worked-example`: bounded readiness record; `diagnostic`: conflicting signs or missing evidence                           |
| Harvest measurement            | Plant/batch scope; timestamp; wet weight; sample/whole batch; tare; scale method; trim state; chain of custody                                          | `protocol`: harvest-weight record; `reference`: measurement basis; `worked-example`: plant-to-batch rollup; `diagnostic`: mismatched scope/tare                                      |
| Drying environment             | Temperature; RH; airflow; load; placement; wet-bulb/dew point context; moisture loss; transition; outage/failure                                        | `protocol`: dry-room map and daily check; `worked-example`: source-labeled drying timeline; `diagnostic`: nonuniform/rapid/stalled dry; `comparison`: room average versus batch zone |
| Moisture and loss accounting   | Wet/dry/trim weight; sample basis; moisture loss; water activity/moisture-content context; method limits; missing data                                  | `reference`: loss calculations; `protocol`: representative sampling; `worked-example`: batch mass balance; `diagnostic`: impossible or incomparable weights                          |
| Trimming, grading, and defects | Trim method/state; grade criteria/version; mold/contamination/physical defects; affected scope; hold/reject/disposition                                 | `protocol`: grade/defect record; `reference`: observable defect language; `worked-example`: disposition trail; `diagnostic`: isolated versus batch-wide risk                         |
| Cure and storage               | Container/environment; exchange/opening record; temperature/RH; stability; packaging; light/oxygen context; degradation; inventory                      | `protocol`: cure/storage record; `worked-example`: condition history; `comparison`: methods by verification need; `diagnostic`: odor/moisture/quality drift                          |
| Lab and sensory evidence       | Sample identity; lab/method/date; result/LOQ/uncertainty; assessor/panel; rubric; blind/repeat context; no medical claim                                | `reference`: lab/sensory claim limits; `protocol`: sample/result record; `worked-example`: bounded sensory note; `diagnostic`: conflicting sample/result                             |
| Outcome and next-run learning  | Yield basis; grade distribution; quality; defects; health/pathogen history; cultivar/phenotype; environment/input/intervention correlation; uncertainty | `protocol`: run review; `comparison`: matched room/cycle/phenotype; `worked-example`: next-run hypothesis; `diagnostic`: insufficient causal evidence                                |

**Required original assets:** harvest-plan checklist; batch traveler; wet/dry/trim mass-balance worksheet; dry-room placement map; drying timeline; grade/defect rubric; cure record; lab/sensory evidence form; next-run review matrix.

**Required cross-pillar links:** P1 cycle/audit history; P2/P3 dry-room environment and sensor truth; P4/P5 final input history; P6 pathogen/contamination/intervals; P7 cultivar/phenotype; P8 stage/readiness; P10 scales, meters, HVAC/dehumidification, storage equipment.

**High-risk review:** post-harvest microbial/contamination, worker safety, facility, product testing, packaging, and jurisdiction claims require qualified review. No sensory or lab page makes medical, therapeutic, impairment, legal-market, or guaranteed-quality claims.

**Pillar-specific acceptance gate:** every weight/yield figure states scope and basis; dry/cure guidance includes load, placement, provenance, freshness, and failure response; outcome comparisons disclose unmatched variables and cannot label correlation as cause.

**Required non-product next step:** use the post-harvest batch/run-review records. **Optional product CTA:** review a completed grow only through a current verified and product-truth-approved path.

## P10. Equipment and read-only integrations

**Reader jobs**

- Define the cultivation requirement and evidence needed before selecting a device or system.
- Verify manufacturer specifications, installation constraints, capacity, calibration, maintenance, and failure modes without treating marketing as field performance.
- Plan environmental, irrigation, lighting, sensing, power, and network redundancy with qualified-professional boundaries.
- Determine whether a Verdant data path is manual, CSV, read-only live, planned, blocked, or unsupported.
- Preserve maintenance and capability history and retire unreliable equipment without rewriting past evidence.

| L1 collection                            | L2 subtopics                                                                                                                                      | L3 page families and required examples                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Requirement and selection                | Measured/controlled variable; operating range; accuracy/capacity; room/load; environment rating; serviceability; budget/lifecycle; evidence       | `protocol`: requirement brief; `comparison`: classes by declared criteria; `reference`: specification versus verified performance; `diagnostic`: underspecified purchase decision    |
| Environmental systems                    | HVAC; dehumidification; humidification; circulation/exhaust; CO2 context; drainage/condensate; redundancy; peak load                              | `reference`: system roles and sizing inputs; `protocol`: professional planning checklist; `comparison`: redundancy patterns; `diagnostic`: capacity/recovery failure                 |
| Irrigation hardware                      | Reservoir; pump; filter; regulator; valve; line; emitter; drain; dosing context; pressure/flow; cleaning; failure                                 | `reference`: component roles; `protocol`: flow/uniformity check; `comparison`: hardware by verification need; `diagnostic`: clog/leak/pressure failure                               |
| Lighting hardware                        | Fixture specification; spectrum/PPF context; driver; dimming; mounting; electrical load; PPFD map; thermal management; degradation                | `reference`: spec/measurement distinction; `protocol`: installation questions and light map; `comparison`: fixtures by declared criteria; `diagnostic`: nonuniformity or degradation |
| Sensors and gateways                     | Metric/channel; range; accuracy; placement; calibration; sample interval; local clock; gateway; offline behavior; battery/power                   | `entity`: source-aware sensor profiles; `protocol`: commission/verify; `comparison`: models by measurement need; `diagnostic`: missing/stuck/delayed channel                         |
| Network and local reliability            | LAN/Wi-Fi; broker/gateway context; DNS/time; buffering; reconnect; duplicate; firewall; credentials; observability; no public forwarding          | `reference`: transport boundary; `protocol`: read-only reliability checklist; `worked-example`: redacted event flow; `diagnostic`: offline/backfill/clock issue                      |
| Maintenance, calibration, and retirement | Schedule; calibration; cleaning; parts; firmware/version; inspection; as-found state; failure; replacement; retirement                            | `protocol`: maintenance record; `worked-example`: service history; `comparison`: repair/recalibrate/retire criteria; `diagnostic`: recurring drift                                   |
| Exports and read-only integration status | Manual; CSV; verified read-only live; mapping; provenance; source vocabulary; supported/experimental/planned/blocked/retired; token scope; limits | `reference`: capability-state definitions; `entity`: vendor/model capability matrix; `protocol`: export/import verification; `diagnostic`: connected but untrusted data              |

**Required original assets:** requirement brief; capacity/redundancy checklist; capability-verification matrix; lighting-map worksheet; irrigation flow diagram; sensor commissioning card; redacted read-only data-flow diagram; maintenance/retirement record; integration-state legend.

**Required cross-pillar links:** P2 capacity/light/air relationships; P3 calibration/provenance/units; P4 irrigation uniformity; P5 meters/mixing safety; P6 sanitation/scouting/test equipment; P7 identity/testing tools; P9 dry/cure systems; P1 audit/export practice.

**High-risk review:** electrical, structural, HVAC, CO2, fire, water, chemical, network-security, and installation guidance states professional and jurisdiction boundaries. Credentials, tokens, private IPs, PASSKEYs, grower identifiers, and raw payload secrets never appear. Verdant never publishes device commands or blind automation guidance.

**Pillar-specific acceptance gate:** each equipment/entity page separates manufacturer claim, verified method, field observation, and unknown; each integration page proves its status against current shipped behavior and labels source/freshness truth; planned or experimental capability cannot be described as available.

**Required non-product next step:** use the requirement, commissioning, or maintenance records. **Optional product CTA:** review current supported data paths only after product-truth verification.
