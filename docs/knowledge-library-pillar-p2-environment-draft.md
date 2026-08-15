# P2 pillar draft — Environment, climate, and light

**Editorial-workflow state:** `drafted`. This is an **Author-role draft** in
`editorial-workflow.md`'s sense — accountable for "accurate synthesis, claim map, original
asset, disclosures, and revision response." It has **not** passed `evidence_review`,
`cultivation_review`, `product_truth_review`, `technical_review`, or
`copy_accessibility_review`. Per that document's role table the author cannot be the sole
evidence or cultivation approver for R2 material. Treat every citation here as a starting
claim map, not a cleared source list.

> **Risk-class notice — read before routing this for review.** `roadmap-500.json` records
> `KL-002` as `claimRiskClass: R2`. **As drafted, this page is R3.** `content-standards.md`
> states that "a page inherits the highest risk of any material claim," and §4 and §8 of
> this draft make material claims about occupational CO2 exposure limits and HVAC failure
> behaviour — squarely inside R3's "electrical, fire, structural, HVAC refrigerant,
> compressed CO2, worker exposure" scope. It therefore **cannot pass on an R2 manifest, and
> an N/A receipt cannot be used to bypass the safety gate.** Two honest resolutions, for the
> managing editor rather than by author fiat:
>
> 1. **Ship it R3** — reclassify `KL-002`, and route it to the qualified reviewer alongside
>    its four R3 descendants (§11.5).
> 2. **Return it to R2** — move every material CO2 and HVAC claim out of §4 and §8 into
>    those descendants, leaving the pillar with referral language only ("this leaves the
>    pillar's authority; see `KL-202`") and no exposure limits or failure-mode assertions of
>    its own.
>
> Option 2 keeps the roadmap record accurate and the pillar shippable sooner; option 1 keeps
> the pillar self-contained for the reader. This draft is written the R3 way and does not
> silently assume either. Flagged in review of PR #994 and recorded here rather than
> resolved unilaterally, since changing a recorded risk class is a governance act.

**Target route:** `/guides/grow-room-environment-fundamentals` (roadmap `KL-002`, `pillar`
field `environment`, `pageFamily: pillar`, `routeStatus: planned`, `claimRiskClass: R2`,
`priorityLane: foundation`). Directly unblocks **1** `libraryReadiness: blocked_parent`
record — `KL-012 /guides/grow-room-vpd-tracker`, which is already **live** without a
published parent. See
[docs/knowledge-library-status-audit-and-scaling-plan.md](knowledge-library-status-audit-and-scaling-plan.md)
for the audit this draft grew out of, and §10 for three corrections to it.

**Not done here:** L1 cluster pages (this draft covers the pillar page only);
`roadmap-500.json` was not edited; no record's `briefStatus` was advanced; the four `R3`
records were scoped but not authored; `knowledge:validate` was not re-run against a
modified roadmap because nothing in the roadmap was modified.

---

## 1. Reader outcomes and scope

A grower using this page can, afterward:

- State, for any environmental number in front of them, **what was measured, where, when,
  by what instrument, and what was calculated from it** — and refuse to act on a number
  that cannot answer those five questions.
- Distinguish **air VPD from leaf VPD** as two different derived values with different
  inputs, and recognise that the same room at the same instant can read inside target on
  one basis and outside it on the other (§3 shows this arithmetically).
- Describe a room as a **spatial and temporal distribution**, not a single value — canopy
  versus wall, lights-on versus lights-off, top of canopy versus bottom.
- Estimate **peak dehumidification and cooling demand** well enough to know whether they
  are near a capacity limit, and recognise the point where a qualified designer is
  required rather than an estimate.
- Respond to drift, excursion, or equipment failure by **recording evidence and stabilising**,
  without drastic plant intervention or any device-control action.

**Explicit non-scope.** This page does not size HVAC or dehumidification equipment, does
not specify electrical or structural work, does not instruct on compressed-CO2 handling,
and does not issue universal setpoint prescriptions. V1 is indoor-first; greenhouse and
outdoor applicability is referenced only where a shared physical principle transfers, and
that transfer is labeled rather than assumed. Verdant reads environmental data and may
explain it; it does not and will not control equipment.

> After this page, the reader can classify every sampled canopy grow-room environment
> reading as usable, conditional, or untrusted and list the evidence missing before any
> setpoint or capacity discussion.

(That sentence is `KL-002`'s already-authored `readerOutcome`, quoted verbatim from
`roadmap-500.json` rather than reinvented — it already satisfies
`validateAuthoredBrief()`'s prefix, length, verb, and token-overlap rules.)

## 2. Mental model

The smallest accurate model has three layers, and most environmental mistakes come from
collapsing them.

**Layer 1 — what a sensor actually reports.** A probe reports the condition _at the probe_,
at the moment of sampling, subject to its own accuracy, its placement, and whatever
radiant, convective, or evaporative influence is local to it. It does not report "the
room."

**Layer 2 — what is derived from that.** VPD is **calculated, never measured**. Verdant
computes saturation vapour pressure as

```text
e°(T) = 0.6108 · exp[ 17.27·T / (T + 237.3) ]    kPa, T in °C
```

which is **FAO Irrigation and Drainage Paper 56, Equation 11** [FAO-56 §3]. That is the
formula version this pillar's acceptance gate demands, and it is already what
`src/lib/vpdCalculationRules.ts` implements — the file names it "the Tetens equation" and
cites no version (§9). _Air_ VPD subtracts actual vapour pressure from saturation at **air**
temperature. _Leaf_ VPD subtracts the same actual vapour pressure from saturation at
**leaf** temperature. They answer different questions and are not interchangeable.

**Layer 3 — what the plant experiences.** The leaf, not the air, is the evaporating surface.
A leaf-basis calculation without a _measured_ leaf temperature is not a leaf-basis
calculation; it is an air calculation with a guess bolted on.

The consequence worth internalising: **a number can be arithmetically correct and still
describe nothing the plant is experiencing.** Precision in the calculation does not import
accuracy from the inputs.

## 3. Measure before acting

### 3.1 The five questions

Every environmental value carries: **source** (live / manual / csv / demo / stale /
invalid — the six canonical labels, no others), **captured_at**, **placement**,
**instrument and its last verification**, and **whether the value is measured or derived**.
A value missing any of these is `conditional` at best. This is P3's territory; P2 consumes
it and must not restate it (§6 cross-links).

### 3.2 Worked example — uncertainty is a material fraction of the target band

Computed with FAO-56 Eq. 11, reproducible from the numbers below. Base state: **air
26.0 °C, RH 60%**.

| Case                     | Inputs       | Air VPD (kPa) | Δ from base |
| ------------------------ | ------------ | ------------: | ----------: |
| Base                     | 26.0 °C, 60% |     **1.345** |           — |
| Air temp −0.5 °C         | 25.5 °C, 60% |         1.305 |      −0.039 |
| Air temp +0.5 °C         | 26.5 °C, 60% |         1.385 |      +0.040 |
| RH −3%                   | 26.0 °C, 57% |         1.445 |      +0.101 |
| RH +3%                   | 26.0 °C, 63% |         1.244 |      −0.101 |
| Combined worst case, dry | 26.5 °C, 57% |         1.489 |      +0.144 |
| Combined worst case, wet | 25.5 °C, 63% |         1.207 |      −0.137 |

Two readings a reviewer should not skip:

1. **A ±3% RH error moves VPD roughly 2.5× as much as a ±0.5 °C temperature error.** For
   VPD purposes the humidity sensor is the one that matters most, and RH sensors are the
   ones that drift — which is why `content-standards.md` requires a verification at or
   above **75% RH** specifically, not a convenient mid-range check.
2. **Under the ±0.5 °C / ±3% RH error budget assumed above, the plausible range is
   1.207–1.489 kPa — a span of 0.282 kPa.** The shipped `mid_late_flower` band is
   1.1–1.5 kPa, i.e. 0.4 kPa wide. **That assumed uncertainty spans about 70% of the entire
   target band.** The error budget is an assumption of this worked example, not a sourced
   claim about any particular instrument — a reviewer should substitute the actual
   datasheet accuracy of the room's own sensors, which will move this number.
   Any page that tells a reader to chase a number inside that band, without stating this,
   is teaching false precision.

### 3.3 The same room, two verdicts

Same base state (air 26.0 °C, RH 60%), varying only the **measured leaf offset**:

| Leaf temperature basis          | Leaf VPD (kPa) | Against shipped `mid_late_flower` band (1.1–1.5) |
| ------------------------------- | -------------: | ------------------------------------------------ |
| No leaf measurement — air basis |          1.345 | **inside band**                                  |
| Leaf −1.0 °C (25.0 °C)          |          1.151 | inside band, near the floor                      |
| Leaf −2.0 °C (24.0 °C)          |      **0.967** | **below band**                                   |
| Leaf −3.0 °C (23.0 °C)          |          0.793 | well below band                                  |

The offsets above are **hypothetical measured inputs chosen to span a range, not expected
values** — §8 records that no acceptable cannabis-specific source for offset magnitude was
found, so this draft asserts none. What the arithmetic shows is conditional and does not
depend on any offset being typical: **if** a −2 °C offset is what you measured, then the
same room, at the same instant, reads "in target" on air basis and "below target" on leaf
basis. This is the single most
important thing this pillar exists to teach, and it is why the shipped calculator's refusal
to compare to a stage target without a contemporaneous leaf measurement (§9) is correct
behaviour rather than an inconvenience.

### 3.4 The averaging trap

Because `e°(T)` is convex, averaging temperature before computing vapour pressure
understates it. FAO-56 makes this explicit and requires the mean of `e°(Tmax)` and
`e°(Tmin)` rather than `e°(Tmean)` [FAO-56 Eq. 12]. Worked: a room at 28 °C lights-on and
22 °C lights-off, RH 60% throughout —

- `e°(25 °C)` = 3.168 kPa; mean of `e°(28)` and `e°(22)` = 3.212 kPa — **understated by
  0.044 kPa**;
- VPD from averaged temperature = 1.267 kPa; mean of the two true VPDs = 1.285 kPa.

Small here, and it grows with the day/night differential. The rule to publish: **compute
VPD per reading, then aggregate. Never aggregate the inputs and compute once.** Any daily-
average VPD chart built the wrong way is biased low by construction.

### 3.5 Leaf-temperature measurement, honestly bounded

Non-contact infrared thermometry is the practical method, and it carries method error that
must be disclosed rather than buried. Proxy-crop evidence (**not cannabis**): crop canopy
emissivity is approximately 0.98, single leaves of snap bean and tobacco measured 0.96 and
0.97, and dense alfalfa/sudangrass canopies fell between 0.97 and 0.98; instruments with an
8–13 µm band pass measured plant-surface temperature with errors of **0.1–0.3 °C**, while an
emissivity-determination error of order **0.01** should be expected even under careful
conditions [Leaf emissivity, proxy]. Record the instrument, the assumed emissivity, the
distance and spot size, the light state, and the number and location of samples — or the
offset is an anecdote.

## 4. Start paths

- **Beginner.** Place one probe at representative canopy height, shielded from direct
  fixture radiation and from local humidifier/dehumidifier/fan extremes. Record 24 hours
  including a full lights-on/lights-off cycle. Do not change a setpoint from this alone;
  the first deliverable is a baseline, not an adjustment.
- **Active problem (drift, excursion, condensation, unexplained humidity).** Record before
  intervening: what the sensor says, where it is, when it was last verified, what the
  equipment is doing, and what changed. Stabilise the environment; do not respond with
  defoliation, irrigation changes, or feeding changes. Environmental instability is
  diagnosed with environmental evidence.
- **Optimization.** Map before tuning. One probe is one point; a room with gradients needs
  a canopy map (§7) before any target discussion is meaningful. Change one variable, define
  the observation window, and define the rollback condition in advance.
- **Commercial-SOP.** Treat latent (moisture) and sensible (heat) load as separate problems
  with separate failure modes. The hazard case is **lights-off in late flower**: cooling
  demand falls while transpiration continues, so a system that dehumidifies only as a
  by-product of cooling loses moisture-removal capability exactly when condensation and
  _Botrytis_ risk peak [HVACD trade practice — Tier C, see §8]. Peak-load sizing is an
  ASHRAE-method engineering calculation, not a rule of thumb, and this pillar routes to a
  qualified designer rather than performing it.
- **Safety/professional referral — mandatory, not optional.** Compressed or generated
  **CO2**, electrical load, refrigerant, structural mounting, condensate drainage and
  standing water, and fire all leave this pillar's authority immediately. Occupational
  carbon-dioxide limits differ by authority, and the difference is material — **the
  federal enforceable limit has no short-term component at all**:

  | Authority            | 8-hour TWA              | Short-term              | Status                    |
  | -------------------- | ----------------------- | ----------------------- | ------------------------- |
  | **Federal OSHA PEL** | 5,000 ppm (9,000 mg/m³) | **none listed**         | Enforceable federal limit |
  | Cal/OSHA PEL         | 5,000 ppm               | 30,000 ppm (ST)         | Enforceable in California |
  | NIOSH REL            | 5,000 ppm               | 30,000 ppm (ST, 15-min) | Recommendation, not law   |
  | ACGIH TLV            | 5,000 ppm               | 30,000 ppm (ST)         | Consensus guideline       |

  Source: OSHA Annotated PELs, Table Z-1, CAS 124-38-9. A page that attributes the
  30,000 ppm short-term value to federal OSHA is citing the wrong authority, and the
  alarm/escalation card in §7 must carry the jurisdiction with each number rather than a
  single blended limit. Enrichment setpoints commonly discussed in horticulture
  (1,000–1,500 ppm) sit below every limit above, **but the hazard is not the setpoint
  — it is the failure mode**: a stuck valve, a regulator failure, or an unventilated room
  can reach the occupational limit and beyond. These pages teach monitoring, alarm, egress,
  and escalation only. Zero product CTA (§10).

Each of the five paths above reaches a useful answer without a dead end, per the shared
pillar acceptance gate.

## 5. Failure modes

- **Reading a room average as a plant condition.** The average of a room with a 4 °C
  vertical gradient describes no plant in it.
- **Calling derived VPD "sensor data."** VPD has a derivation record; a direct reading does
  not. Presenting one as the other is a source-truth violation, not a wording preference.
- **Applying an assumed leaf offset.** A guessed offset produces a number with a leaf label
  and no leaf evidence. §3.3 shows it can invert the verdict.
- **Chasing a target inside the noise band.** §3.2: ordinary uncertainty spans ~70% of the
  shipped band width. Tuning inside that is chasing instrument error.
- **Averaging inputs before deriving.** §3.4 — biased low by construction.
- **Treating a controller setpoint as a measurement.** The setpoint is what was asked for.
  The sensor is what happened. They disagree constantly, and the disagreement is the
  signal.
- **Sizing dehumidification from lights-on conditions.** The binding constraint is usually
  lights-off in late flower, when sensible load collapses and latent load does not.
- **Chasing humidity down without checking surface temperature.** Condensation is governed
  by surface temperature relative to dew point, not by room RH alone. A cold wall, a duct,
  or a fixture housing can be at risk while the room reads acceptable.
- **Treating a single stale reading as current.** Stale is one of the six canonical source
  labels precisely so it never renders as healthy.

## 6. Deep topic map

The full L1→L2→L3 breakdown is already authored in `pillar-pages.md`'s P2 section
(governance artifact — not duplicated here). The six L1 collections and why each earns a
visit:

1. **Thermal and humidity fundamentals** — air versus leaf temperature, RH, dew point
   context, canopy versus room average.
2. **VPD and leaf basis** — saturation vapour pressure, air/leaf VPD, leaf-temperature
   offset, formula version, uncertainty propagation. §3 is this collection's spine.
3. **Airflow, CO2, and microclimates** — boundary layer, dead zones, canopy maps, CO2
   context and its safety boundary.
4. **Capacity and transitions** — transpiration load, HVAC/dehumidification capacity and
   margin, lights-on/off transitions, recovery time, condensate.
5. **Lighting and photobiology** — PPFD, DLI, photoperiod, spectrum context, and
   **uniformity, not only an average** (the acceptance gate is explicit on this).
6. **Drift and failure response** — setpoint versus measured state, alarm evidence, stale
   sensors, outage and overshoot, condensation and mould risk.

**Cross-pillar hand-offs (required, and each is a real boundary rather than a courtesy
link):** P3 owns calibration, provenance, and freshness — P2 consumes them and must not
restate the rules. P4/P5 own transpiration's root-zone and nutritional consequences. P6
owns mould and pathogen risk once environment becomes a health event. P8 owns the
photosynthesis and transpiration physiology this pillar only gestures at. P9 owns the dry
room as its own controlled environment. P10 owns the equipment and its installation
boundaries.

## 7. Original field assets (sketched, not finished)

Per `pillar-pages.md`'s required-assets list for P2. Each needs a cultivation reviewer and
an evidence editor before it is real; the two marked **†** additionally need the qualified
R3 reviewer.

- **Canopy sensor-placement diagram** — representative height, radiant shielding, distance
  from equipment extremes, and the explicit statement that one probe describes one point.
- **Leaf-offset method card** — instrument, assumed emissivity, distance and spot size,
  light state, sample count and locations, air temperature captured at the same instant,
  computed offset, and disclosed method error (§3.5).
- **VPD input/uncertainty worksheet** — the §3.2 table as a fill-in form: each input with
  its instrument accuracy, the resulting VPD range, and the band width for comparison. Its
  output is a **range**, never a single value.
- **Airflow and microclimate map** — a grid the grower walks, recording position, height,
  temperature, RH, and a simple observable airflow indicator; output identifies stagnant
  pockets rather than producing an average.
- **PPFD mapping grid** — measurement positions, height, time, instrument, and both mean
  **and** uniformity (min/mean or min/max), because the gate requires uniformity, not only
  an average.
- **Peak-load planning worksheet †** — inputs only (irrigation volume as the transpiration
  proxy, lights-on/off state, room envelope observations, recovery times observed), framed
  explicitly as _evidence to hand a qualified designer_, never as a sizing output.
- **Lights-off transition timeline** — a recording template for the 60–120 minutes after
  lights-off: temperature, RH, dew point context, surface-temperature spot checks, and
  equipment state.
- **CO2 monitoring and escalation card †** — alarm thresholds referenced to the
  occupational limits in §4, sensor placement, egress, and who to call. No enrichment
  procedure.

## 8. Sources and review

Claim map — author's initial pass. Each row needs an evidence-editor role assignment per
`content-standards.md` (`supports` / `limits` / `defines_method` / `controls_requirement`).

| Claim                                                                                                                                                                                                                                                                            | Source                                                                                                                                                                                                                                                             | Tier / role                                                                | Applicability note                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saturation vapour pressure `e°(T) = 0.6108·exp[17.27T/(T+237.3)]` kPa, T in °C; mean saturation vapour pressure must be computed as the mean of `e°(Tmax)` and `e°(Tmin)` rather than `e°(Tmean)` because the curve is non-linear                                                | FAO Irrigation and Drainage Paper 56, _Crop evapotranspiration_, Ch. 3, Eq. 11 and Eq. 12, <https://www.fao.org/4/x0490e/x0490e07.htm>                                                                                                                             | A — `defines_method`                                                       | Domain-general physics; directly governs §2, §3.2, §3.4, and matches the shipped implementation exactly (§9)                                                                                                                                                                                                                                                                             |
| Indoor cannabis inflorescence yield increased **linearly from 116 to 519 g·m⁻² (4.5×) as canopy PPFD rose from 120 to 1,800 µmol·m⁻²·s⁻¹** across an 81-day flowering stage, with no saturation plateau; **no treatment effect on the potency of any measured cannabinoid**      | Rodriguez-Morrison, V., Llewellyn, D. & Zheng, Y., "Cannabis Yield, Potency, and Leaf Photosynthesis Respond Differently to Increasing Light Levels in an Indoor Environment," _Frontiers in Plant Science_ 12:646020, 2021, doi:10.3389/fpls.2021.646020          | A — `supports`, `limits`                                                   | Cannabis-specific, indoor, deep-water culture. Supports "measure light, and measure uniformity"; **limits** any claim that light intensity raises potency                                                                                                                                                                                                                                |
| Cannabis grown at **78–98% RH** (VPD 0.05 kPa vegetative / 0.25 kPa flowering) versus **37–58% RH** (VPD 1.29 / 0.92 kPa) showed **total CBD reduced 4.6-fold**, flowering onset **delayed ~3 weeks**, and **total dry biomass 2.71× lower**; flower biomass fell 71%            | Corredor-Perilla, I.C., Kwon, T.-H. & Park, S.-H., "Elevated relative humidity significantly decreases cannabinoid concentrations while delaying flowering development in _Cannabis sativa_ L.," _Frontiers in Plant Science_, 2025, doi:10.3389/fpls.2025.1678142 | A — `supports`, `limits`                                                   | Cannabis-specific. **Authors' own stated limitation: single CBD-dominant genotype ("Cherry Berry"), n=10 per treatment, controlled growth chambers.** Establishes the _direction_ of a severe-humidity effect; **licenses no kPa target** and does not test the mid-range where the shipped bands sit                                                                                    |
| Carbon dioxide occupational limits **differ by authority**: federal OSHA PEL is **5,000 ppm 8-hour TWA with no short-term limit listed**; Cal/OSHA, NIOSH, and ACGIH each add a **30,000 ppm short-term** value (NIOSH's is a 15-minute ST)                                      | OSHA Annotated PELs, Table Z-1 (CAS 124-38-9), <https://www.osha.gov/annotated-pels/table-z-1> — the four authority columns read separately                                                                                                                        | A — `controls_requirement`                                                 | Governs §4's referral boundary and the R3 CO2 records. **The annotated table places four authorities in adjacent columns; any summary that merges them wrongly attributes the 30,000 ppm short-term value to federal OSHA. An earlier revision of this draft made exactly that error — corrected 2026-08-15 after review.** Publish each number with its jurisdiction and enforceability |
| NIOSH IDLH for carbon dioxide is **40,000 ppm**                                                                                                                                                                                                                                  | NIOSH IDLH documentation, CAS 124-38-9, <https://www.cdc.gov/niosh/idlh/124389.html>                                                                                                                                                                               | A — `controls_requirement`                                                 | **VERIFICATION INCOMPLETE.** The CDC page returned HTTP 403 to this author; the value is reported from search-result summaries, not read at source. The evidence editor must open the page directly before this number is published                                                                                                                                                      |
| _Botrytis cinerea_ infection is favoured by cool temperatures (**65–75 °F**), high relative humidity, and free water on plant surfaces; extension guidance recommends holding greenhouse RH **below 50%** and improving airflow                                                  | Utah State University Extension, "Bud Rot" (hemp IPM note), <https://extension.usu.edu/planthealth/ipm/notes_ag/hemp-bud-rot>; corroborating: Oregon State University Extension gray-mold-in-hemp series                                                           | A (extension) — `supports`                                                 | **Hemp-focused**, greenhouse-framed. Transfers to indoor cannabis as a risk-direction claim, not as an indoor RH prescription. The OSU pages returned 403 to this author and are cited from search summaries — evidence editor must read them directly                                                                                                                                   |
| Crop canopy emissivity ≈ 0.98; single leaves of snap bean and tobacco 0.96 and 0.97; dense alfalfa/sudangrass canopies 0.97–0.98; 8–13 µm band-pass instruments achieve **0.1–0.3 °C** error; emissivity-determination error of order **0.01** expected under careful conditions | Leaf-emissivity infrared thermometry literature (López et al., _Determining the Leaf Emissivity of Three Crops by Infrared Thermometry_, PMC4481894; and related horticultural-crop emissivity work)                                                               | A — `limits` (**proxy crop**)                                              | **Not cannabis.** Bounds the leaf-offset method's uncertainty in §3.5. Label as proxy per `content-standards.md`; seek a cannabis-specific emissivity figure before publication                                                                                                                                                                                                          |
| Cannabis transpires the large majority of applied irrigation water back into room air, so latent load persists after lights-off when sensible load collapses; peak dehumidification sizing follows ASHRAE load methods                                                           | Cannabis HVAC/HVACD trade literature (HPAC Engineering; NCIA committee blog; Resource Innovation Institute guidance), with ASHRAE Handbook as the controlling method reference                                                                                     | **C — trade press**, plus B (ASHRAE) named but **not read for this draft** | **Weakest row in this table.** Trade publications are not an evidence tier under `content-standards.md`. The mechanism is physically sound and uncontroversial, but **no quantitative load figure from this row may be published.** The R3 reviewer for `KL-102`/`KL-382` must supply the controlling source                                                                             |

**Missing evidence, explicit:**

1. **No source, anywhere, for Verdant's shipped stage VPD bands.** See §9 — this is the
   central finding of this draft.
2. **No peer-reviewed cannabis-specific leaf-temperature-offset magnitude was found.** The
   commonly repeated "leaves run 3–5 °F cooler than air" appears only in vendor and
   retailer copy, which `content-standards.md` explicitly excludes from the evidence tiers.
   This draft therefore states offsets only as _measured inputs_, never as expected values.
3. **No cannabis-specific study establishing a mid-range VPD optimum was found.** The 2025
   humidity study tests a severe contrast (0.05–0.25 vs 0.92–1.29 kPa); it cannot
   adjudicate between, say, 1.1 and 1.4 kPa.
4. Three sources in the table (CDC IDLH, both OSU extension pages) returned **HTTP 403** to
   this author and are cited from search-result summaries. They are flagged in-row rather
   than silently presented as read.

**Reviewers required before this advances past `drafted`:** evidence editor; cultivation
reviewer; **qualified R3 reviewer** — required for this pillar, unlike P7 (§11);
product-truth reviewer (must verify every §9 claim against shipped behaviour at the
then-current deploy tip); SEO/technical editor; copy/accessibility editor.

## 9. The shipped VPD stack — what's real, what's uncited

This is P2's load-bearing product-truth finding, and it is the mirror image of P7's.
Verified against the deploy branch at `0522eefb1`.

**What is already right, and should be pointed at rather than rebuilt.** Verdant ships a
substantial, careful environment layer — roughly forty `src/lib/*` modules covering VPD
calculation, stage targets, drift, trust status, and alerting. Three behaviours are exactly
what this pillar would ask for if they did not already exist:

- `src/lib/publicVpdCalculatorRules.ts` exposes `canCompareToStageTarget`, and its shipped
  `PUBLIC_VPD_SAFETY_NOTE` states that Verdant "unlocks a stage-target claim only for
  calibrated temperature and RH evidence plus a contemporaneous canopy-level
  leaf-temperature measurement." **The product already refuses the §3.3 mistake.**
- `PUBLIC_VPD_SOURCE_NOTE` — "Manual inputs · calculated locally · not live telemetry.
  Nothing is uploaded or saved" — is a truthful CTA promise that matches `KL-002`'s own
  `conversionPromise` discipline.
- `src/lib/defaultEnvironmentThresholds.ts` documents that an **unknown stage produces no
  VPD alert** rather than a default-healthy one, and that **CO2 is deliberately not
  evaluated** ("CO2 stays context-only in v1"). Both are correct fail-closed choices and
  should be described as such, not treated as gaps.

**What is genuinely missing.** `src/constants/vpdTargets.ts` ships six canonical stage bands
(`seedling` 0.4–0.8 through `ripening` 1.2–1.6 kPa) plus four legacy keys. The file honestly
self-describes them as "conservative defaults." But:

- **no source, method, reviewer, or date is recorded for any band**, in the constant or
  anywhere else in the repository;
- the `vpd_targets` table (migration `20260604063855`) has columns for `stage`,
  `vpd_low_kpa`, `vpd_high_kpa`, `user_id`, and timestamps — and **no provenance column at
  all**, so a seeded global row cannot carry a citation even in principle;
- `content-standards.md` classifies environmental targets as **R2**, requiring "at least one
  Tier A source and one independent corroborating A/B source; claim map";
- `pillar-pages.md`'s P2 high-risk rule is explicit: "Numeric ranges must never be universal
  prescriptions detached from stage, method, facility, cultivar, or light context." The
  bands _are_ stage-bounded — which is the hard half — but they are unbounded by method,
  facility, cultivar, and light, and uncited.

**This is not a defect in the code.** As product behaviour, conservative fail-closed
defaults are the right call, and the alerting layer treats them cautiously. The finding is
narrower and sharper: **the moment a published P2 page states those bands as guidance, it
inherits an R2 evidence requirement that nothing in the repository currently satisfies.**

**Three options for the managing editor — I did not pick one by assumption:**

1. **Cite them.** Commission the evidence work, add a provenance column to `vpd_targets`,
   and record source, method, and reviewer per band. Highest cost, only option that lets a
   page state the bands as guidance.
2. **Reframe them.** Publish the bands as _Verdant's shipped conservative alerting
   defaults_ — a truthful product-behaviour claim (R0) rather than a cultivation claim
   (R2) — and have the pillar teach the _method_ (§3) rather than the numbers.
3. **Omit them.** The pillar teaches measurement, uncertainty, and basis, and never
   reproduces a band at all.

Option 2 is the smallest honest step and is what §3 of this draft is written to support —
note that §3.2 and §3.3 reference the shipped `mid_late_flower` band only as _the thing
being measured against_, never as a recommendation. **A product-truth reviewer should
confirm that framing survives review before anything here is published.**

**What I did NOT do:** I did not invent a source for the bands, did not adjust them, and
did not write any VPD, temperature, humidity, or PPFD target of my own. Producing a
plausible-looking citation for numbers whose origin I cannot trace is precisely the
"uncited material quantitative claim" that `content-standards.md` lists under automatic
rejection.

## 10. Put it into practice

**Non-product next step (required, and useful without Verdant).** `KL-002`'s authored
`nonProductNextStep`, verbatim:

> Next, collect a 24-hour canopy-level environment record with temperature and humidity,
> document leaf-temperature basis and sensor positions, and make no control change from
> unverified values.

**Optional product CTA — one, and only after product-truth approval.** Open
`/tools/vpd-calculator`, whose shipped source and safety notes are quoted in §9. The
allow-list in `content-standards.md` permits it; the CTA must carry the calculator's own
truthful promise (nothing uploaded or saved) and must not imply Verdant validates the
inputs.

**Zero product CTA on the CO2 and HVAC-failure descendants** (`KL-202`, `KL-212`,
`KL-102`, `KL-382`) — `content-standards.md` requires urgent CO2 and fire/electrical safety
content to default to no product CTA until the hazard and escalation route are complete.

## 11. Corrections to the scaling-plan audit, and the R3 resourcing gate

Four things verified against `roadmap-500.json` at `0522eefb1` that the audit either got
wrong or did not surface. Recorded here because they change how the remaining pillars
should be planned, not just this one.

**11.1 — `pillarRank` is a within-pillar rank, not the pillar number.** The P7 draft states
its record has "`pillarRank: 7`." It does not: `KL-007` has `pillarRank: 1`, and so does
`KL-002`. Every pillar's own pillar-page record is rank 1 within its 50. Minor, but it is
the kind of detail a reader would reasonably rely on when locating records.

**11.2 — P2 has no L1 cluster records in the roadmap at all.** All 49 planned P2 records
carry `parentPath: "/guides/grow-room-environment-fundamentals"` — the pillar itself. The
audit's caution that "shipping the pillar page does not automatically unblock every one of
its 50 records; L1 clusters are their own separately reviewed gate" is a statement about
`site-map.md`'s _design_, but for P2 the intermediate cluster pages **do not exist as
roadmap records**. Whoever sequences P2 must decide whether to create them or to let the
pillar parent 49 children directly. This is a real structural decision, not a detail.

**11.3 — the P2 pillar record is further along than "no drafts."** The audit's "Not done"
line lists P2 among pillars with "no drafts, no research, no worktree work yet." In fact
`KL-002` already carries `briefStatus: draft`, `linkBriefStatus: draft`, and
`searchBriefStatus: draft`, with a fully authored `brief` (decision, applicability,
informationGain, assetMethod, assetInputs, assetOutput) and a real `searchBrief` including
a `competingCanonical` pointing at `/guides/grow-room-vpd-tracker` with relationship
`differentiate`. Its 49 children are at `needs_editorial_brief`; the pillar record is not.
The page-content draft was missing — that is what this document supplies.

**11.4 — `KL-002` has an unresolved intent collision.** `collisionResolution:
needs_review`, `collisionWith: ["KL-109"]` — _Dry-room environment fundamentals_, a P9
record which reciprocally names `KL-002`. Both are environmental-fundamentals pages for
different rooms. Under the shared acceptance gate, this must be resolved before either
publishes; it cannot be resolved by writing both and hoping the titles diverge. A
recommended boundary, for the managing editor rather than by fiat: **P2 owns the living
canopy; P9 owns the harvested biomass**, including the fact that a drying room's latent
load has a different and finite source. Neither page restates the other's measurement
discipline.

**11.5 — the R3 gate is real and this pillar cannot ship without it.** Four P2 records are
pre-classified `R3` with `sourceRoles: ["official_code_or_authority",
"qualified_professional_review"]`:

| Record   | Path                                                                      | Risk domain   |
| -------- | ------------------------------------------------------------------------- | ------------- |
| `KL-102` | `/guides/hvac-sizing-questions-for-an-indoor-grow-room`                   | `hvac_safety` |
| `KL-202` | `/guides/grow-room-co2-measurement-and-safety-context`                    | `co2_safety`  |
| `KL-212` | `/guides/co2-enrichment-prerequisites-and-professional-safety-boundaries` | `co2_safety`  |
| `KL-382` | `/guides/hvac-failure-grow-room-triage-checklist`                         | `hvac_safety` |

`editorial-workflow.md` names that reviewer's scope as "electrical, fire, structural, HVAC,
compressed CO2, pesticide, laboratory, or legal," **explicitly a qualified human, not an
agent**. This is the concrete difference between P2 and P7: P7 had zero R3 records and
could be moved by spec-first authoring alone. **P2 cannot.**

And the gate reaches further than those four descendants. **As drafted, the pillar page
itself is R3** — see the risk-class notice at the top of this document. §4's occupational
CO2 limits and §8's HVAC failure-behaviour row are material claims inside R3's declared
scope, and `content-standards.md` makes a page inherit the highest risk of any material
claim it carries. So either the pillar goes to the qualified reviewer too (option 1), or
those claims move out to the descendants and the pillar keeps referral language only
(option 2). **What is not available is publishing the pillar on its recorded R2 manifest
while it still states exposure limits.** Either way this is a resourcing decision only
Cheek can make, independent of the GA4/GSC blocker.

**A note on sequencing, offered rather than assumed.** The audit ranked P2 fifth by
unlock-per-effort (1 record unlocked, highest R3 density). That ranking is defensible on
its own terms, but it undercounts one thing: **`/guides/grow-room-vpd-tracker` is already
live, already carrying most of this pillar's acceptance-gate discipline in its own copy,
and already parentless.** P2 is the pillar whose absence is currently visible to real
readers. Whether that outweighs P5's or P6's larger unlock counts is Cheek's call, not
mine — but it belongs in the decision.

---

**Handoff.** This draft is ready for evidence-editor and cultivation-reviewer assignment.
Four items need a decision before authoring resumes: the **risk-class question at the top
of this document** (ship the pillar R3, or move its CO2/HVAC claims out and keep it R2),
the §9 VPD-band option (1, 2, or 3), the §11.2 L1-cluster structural question, and the
§11.5 R3 reviewer resourcing. The
`KL-002` search brief is already at `draft` and needs no GA4/GSC access to stay there —
only advancing it to `validated` does.
