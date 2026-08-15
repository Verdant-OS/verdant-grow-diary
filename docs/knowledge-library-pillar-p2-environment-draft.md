# P2 pillar draft — Environment, climate, and light

**Editorial-workflow state: pre-`drafted`.** This is an author working revision on the
`sourced → drafted` transition. It has **not** reached `drafted` and must not be routed to
`evidence_review` yet. `editorial-workflow.md`'s state table sets that transition's exit
proof as "complete draft, **original asset**, limitations, non-product next step,
disclosures" — and **§7's assets are specifications, not artifacts.** No diagram, grid,
card, or worksheet has been produced, so a reviewer cannot verify the methods, safety
boundaries, or outputs the page would render. The same row's _entry_ artifact ("approved
brief and claim map") is also unmet: `KL-002`'s brief is at `draft`, not `reviewed`, and no
evidence editor has approved §8.

An earlier revision of this document labelled itself `drafted`. That was wrong against the
contract above, and is corrected here. **Reaching `drafted` requires building all eight §7
assets** — real, scoped, separable work, not a labelling exercise.

A second correction, raised in review of PR #994: an earlier revision said the two **†**
assets needed qualified R3 approval _before_ an author should draw them. **That created a
deadlock and contradicted the workflow.** `safety_review` sits _after_ `drafted` in the
state table (`drafted → evidence_review → cultivation_review → safety_review`), so an asset
cannot be approved before it exists. The correct handling is the opposite: **the author
drafts all eight, the two † assets carry a visible pending-safety-approval marker, and they
are reviewed in the `safety_review` lane** where the contract puts them.

Treat every citation here as a starting claim map, not a cleared source list. Per
`editorial-workflow.md`'s role table the author cannot be the sole evidence or cultivation
approver for R2 material, and this document has passed no review lane.

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

**But the direction of that error is data-dependent, and the convexity term is the small
one.** Because `VPD = e°(T)·(1 − RH/100)`, temperature and humidity **covary**, and the
covariance dominates. Holding the same 28 °C / 22 °C samples and varying only how RH tracks
temperature:

| Case                                                 | Mean of true VPDs | VPD from averaged inputs | Error             |
| ---------------------------------------------------- | ----------------: | -----------------------: | ----------------- |
| Constant RH 60% (convexity only)                     |             1.285 |                    1.267 | low by 0.018      |
| RH rises with temperature (28 °C/80%, 22 °C/40%)     |             1.171 |                    1.267 | **high by 0.096** |
| RH falls as temperature rises (28 °C/40%, 22 °C/80%) |             1.398 |                    1.267 | low by 0.131      |

So averaging can bias the result **either way**, by roughly 5–7× the pure convexity effect.
The middle row is a genuine counterexample to any "always understates" claim. The last row
resembles the common indoor pattern — RH climbing as the room cools at lights-off — which
is why the error is _usually_ low in practice, but that is an empirical tendency of a
particular room's data, **not a property of the arithmetic**, and it inverts whenever
temperature and humidity move together.

The rule to publish is unchanged and does not depend on knowing the direction: **compute
VPD per reading, then aggregate. Never aggregate the inputs and compute once.** A
daily-average VPD chart built the wrong way is wrong by an amount and a sign you cannot
predict without inspecting the underlying pairs.

### 3.5 Leaf-temperature measurement, honestly bounded

Non-contact infrared thermometry is the practical method, and it carries method error that
must be disclosed rather than buried. Proxy-crop evidence (**not cannabis**), from two
independent studies covering twelve species between them:

- **Emissivity is tightly clustered and high.** Nine greenhouse horticultural crops gave
  upper-leaf emissivities of **0.973–0.985** — tomato 0.980 ± 0.010, green pepper
  0.978 ± 0.008, cucumber 0.983 ± 0.008, courgette 0.985 ± 0.007, aubergine 0.973 ± 0.007,
  melon 0.978 ± 0.006, watermelon 0.981 ± 0.009, green bean 0.983 ± 0.006, red bean
  0.983 ± 0.005 [S7b: López et al. 2012]. Three ornamental crops gave **0.978–0.985**
  (_Phalaenopsis_ mature 0.9809 / new 0.9783, _Paphiopedilum_ 0.9810, Malabar chestnut
  0.9848) [S7a: Chen 2015, Table 2]. **Neither contains a cannabis figure.**
- **Instrument accuracy, not emissivity guesswork, is the dominant error.** Chen's infrared
  thermometer operated over **6.0–14.0 µm** with a **post-calibration accuracy of 0.35 °C**,
  against 0.15 °C for the reference thermocouple [S7a, §2.5].

**This is a proxy observation that needs verification, not setup guidance.** Emissivity
clusters near 0.98 across the twelve species measured above; **neither study measured
cannabis**, so ~0.98 is a starting assumption to be checked, not an established cannabis
value.

An earlier revision of this section claimed instrument accuracy dominates emissivity
uncertainty. **That is wrong in a grow room, and the arithmetic shows why.** Emissivity
error converts to temperature error through the _reflected_ temperature — a hot fixture
overhead is exactly the case where the term stops being negligible. Using the standard
radiometric approximation `ΔT ≈ (Δε/ε)·(T⁴ₒᵦⱼ − T⁴ᵣₑ𝆑ₗ)/(4·T³ₒᵦⱼ)` in kelvin, for a leaf at
24 °C with Δε = 0.01 on ε = 0.98 (**author computation, not a sourced claim**):

| Reflected temperature | Temperature error from a 0.01 emissivity error |
| --------------------- | ---------------------------------------------: |
| 24 °C (no gradient)   |                                       0.000 °C |
| 30 °C                 |                                       0.063 °C |
| 40 °C                 |                                       0.177 °C |
| 50 °C                 |                                       0.302 °C |
| 60 °C                 |                                       0.440 °C |

So against Chen's 0.35 °C instrument accuracy, emissivity uncertainty is negligible in a
uniform room and **equal to or larger than the instrument** once a fixture or surface above
the canopy sits at 50–60 °C. Neither term dominates in general; **which one dominates is a
property of the room**, and a leaf-offset method card that ignores reflected temperature is
under-reporting its own error.

For scale: §3.3 shows a 1 °C change in leaf basis moves leaf VPD by roughly 0.19 kPa. The
leaf measurement is not a free input. Record the instrument, the assumed emissivity, **the
reflected/background temperature**, the distance and spot size, the light state, and the
number and location of samples — or the offset is an anecdote.

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

  **Each authority defines its own averaging period — they are not interchangeable:**

  | Authority            | Long-term limit         | Its averaging period                      | Short-term                                          | Status                    |
  | -------------------- | ----------------------- | ----------------------------------------- | --------------------------------------------------- | ------------------------- |
  | **Federal OSHA PEL** | 5,000 ppm (9,000 mg/m³) | 8-hour TWA                                | **none listed**                                     | Enforceable federal limit |
  | Cal/OSHA PEL         | 5,000 ppm               | 8-hour TWA                                | 30,000 ppm (STEL, 15-min)                           | Enforceable in California |
  | NIOSH REL            | 5,000 ppm               | **up to a 10-hour workday, 40-hour week** | 30,000 ppm (ST, 15-min)                             | Recommendation, not law   |
  | ACGIH TLV            | 5,000 ppm               | 8-hour TWA                                | 30,000 ppm — **period NOT VERIFIED for this draft** | Consensus guideline       |

  The concentrations coincide at 5,000 ppm; **the periods do not.** The ACGIH short-term period was not verified for this draft, so **that row must not be used in the §7 alarm card until the qualified reviewer supplies it** — a concentration without an exposure window cannot define an alarm. NIOSH defines its REL
  over a workday of up to 10 hours, so applying that number as an 8-hour average — or
  reading the four rows as one blended limit — misstates the exposure it governs. The
  alarm/escalation card in §7 must carry the authority, the period, and the enforceability
  with every number.

  Source: OSHA Annotated PELs, Table Z-1, CAS 124-38-9. A page that attributes the
  30,000 ppm short-term value to federal OSHA is citing the wrong authority, and the
  alarm/escalation card in §7 must carry the jurisdiction with each number rather than a
  single blended limit. **This pillar states no enrichment setpoint or range.** An earlier
  revision cited a common horticultural range here; it was removed rather than sourced,
  because a normal-operating enrichment concentration is a material quantitative
  cultivation claim that the occupational-limit table above cannot substantiate, and no
  mapped horticultural source for it exists in §8. Any range belongs on `KL-212` with its
  own source, operating conditions, and applicability bounds — not on the pillar.

  The reason the setpoint is not the interesting number anyway: **the hazard is the failure
  mode, not the target.** A stuck valve, a failed regulator, a burner fault, or an
  unventilated room can carry a space past the occupational limits above regardless of what
  the controller was asked for. These pages teach monitoring, alarm, egress, and escalation
  only. Zero product CTA (§10).

Each of the five paths above reaches a useful answer without a dead end, per the shared
pillar acceptance gate.

## 5. Failure modes

- **Reading a room average as a plant condition.** The average of a room with a 4 °C
  vertical gradient describes no plant in it.
- **Calling derived VPD "sensor data."** VPD has a derivation record; a direct reading does
  not. Presenting one as the other is a source-truth violation, not a wording preference.
- **Applying an assumed leaf offset.** A guessed offset produces a number with a leaf label
  and no leaf evidence. §3.3 shows it can invert the verdict.
- **Chasing a target change smaller than your own measurement uncertainty.** §3.2's worked
  example uses an _assumed_ ±0.5 °C / ±3% RH budget, under which the plausible range spans
  ~70% of the shipped band. That percentage is a property of that assumption, not a
  universal fact — a better instrument narrows it and a worse one widens it. The durable
  rule is the comparison, not the number: **compute your own sensors' budget from their
  datasheet accuracy and repeatability, and treat any adjustment smaller than that span as
  indistinguishable from measurement error** until a better instrument says otherwise.
- **Averaging inputs before deriving.** §3.4 — wrong by an unpredictable amount _and sign_.
- **Treating a controller setpoint as a measurement.** The setpoint is what was asked for.
  The sensor is what happened. They disagree constantly, and the disagreement is the
  signal.
- **Sizing dehumidification from lights-on conditions.** The binding constraint is usually
  lights-off in late flower, when sensible load collapses and latent load does not.
- **Treating sustained high humidity as only a mould risk.** It is also a direct
  developmental and chemical problem, stated as a bounded claim [C05]: cannabis held at
  **78–98% RH** (VPD 0.05 kPa vegetative, 0.25 kPa flowering) versus **37–58% RH** (VPD
  1.29 / 0.92 kPa) showed **total CBD reduced 4.6-fold, flowering onset delayed by roughly
  three weeks, and total dry biomass 2.71× lower** [Corredor-Perilla et al. 2025 — Results
  §3.4/Fig. 5B, §3.3/Fig. 4, and §3.2/Fig. 2A respectively]. The authors' own limits apply
  and matter: **one CBD-dominant genotype, n=10 per treatment, controlled growth chambers.**
  Read it as direction and severity, not as a target — it is a severe contrast and
  **cannot** adjudicate a mid-range kPa setpoint. **A search for independent corroboration
  found none: every result traced back to this same study, so this remains single-source
  evidence and is flagged as an evidence blocker in §8.5.** A room that only scouts for
  _Botrytis_ when RH climbs is watching one of several consequences.
- **Treating a high-humidity room as safe because it is cool.** _Botrytis cinerea_ is
  favoured by **cool** temperatures — 65–75 °F in extension guidance, with 68 °F cited as
  optimal — combined with high humidity and free water on plant surfaces, and extension
  advice is to hold greenhouse RH **below 50%** and improve airflow [C09; USU/OSU Extension].
  Two bounds that must travel with those numbers: this is **hemp, greenhouse-framed**, so
  "below 50%" is a greenhouse recommendation and **not** an indoor cannabis setpoint, and
  cool does not mean safe — the temperature band that feels comfortable is inside the band
  the pathogen prefers.
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
   **uniformity, not only an average** (the acceptance gate is explicit on this). The
   evidence for why uniformity is the measurement that matters, stated as a bounded claim
   [C04a]: cannabis inflorescence yield **increased linearly from 116 to 519 g·m⁻² (4.5×)
   as canopy PPFD rose from 120 to 1,800 µmol·m⁻²·s⁻¹** over an 81-day flowering stage
   [Rodriguez-Morrison et al. 2021, "Yield and Quality," Fig. 7A], and an **independent
   group** reported inflorescence dry-matter production likewise rising from 600 to
   1,200 µmol·m⁻²·s⁻¹ [Sae-Tang et al. 2024]. The consequence for this pillar: **a dim
   corner of the canopy is a proportional yield loss that a room-average PPFD number hides
   entirely** — which is exactly why the acceptance gate demands uniformity rather than a
   mean. Bounded to indoor trials, specific cultivars and media, and the tested ranges; no
   plateau was observed within them, which is not evidence that none exists beyond them.

   **What this page must NOT say [C04b]: that light intensity does or does not affect
   potency. The evidence is conflicting.** Rodriguez-Morrison et al. found **no** effect of
   PPFD on the potency of any measured cannabinoid across 120–1,800 µmol·m⁻²·s⁻¹
   ["Yield and Quality," Table 1], while Sae-Tang et al. reported cannabinoid and terpenoid
   **concentrations** rising ~60% and ~40% across 600–1,200 µmol·m⁻²·s⁻¹. Different
   cultivars, facilities, and intensity ranges; the conflict is unresolved here. Per
   `content-standards.md`'s required wording, this is an **"evidence is limited or
   conflicting; Verdant does not assign a fixed value"** claim — not a lever to recommend
   in either direction.

6. **Drift and failure response** — setpoint versus measured state, alarm evidence, stale
   sensors, outage and overshoot, condensation and mould risk.

**Cross-pillar hand-offs (required, and each is a real boundary rather than a courtesy
link):** P3 owns calibration, provenance, and freshness — P2 consumes them and must not
restate the rules. P4/P5 own transpiration's root-zone and nutritional consequences. P6
owns mould and pathogen risk once environment becomes a health event. P8 owns the
photosynthesis and transpiration physiology this pillar only gestures at. P9 owns the dry
room as its own controlled environment. P10 owns the equipment and its installation
boundaries.

## 7. Original field assets — SPECIFIED, NOT BUILT

**These are specifications for assets, not the assets.** Nothing below has been drawn,
built, or filled in. `editorial-workflow.md` makes a completed original asset part of the
`sourced → drafted` exit proof, which is why this document is **pre-`drafted`** (see the
state notice at the top): a reviewer cannot verify a method, a safety boundary, or an
output from a description of a worksheet.

Per `pillar-pages.md`'s required-assets list for P2. Each needs a cultivation reviewer and
an evidence editor before it is real. The two marked **†** sit inside the R3 boundary and
additionally require `safety_review` approval — **but that approval comes after drafting,
not before it.** All eight are author-buildable now; the two † assets must be drafted with
a visible _pending qualified-safety approval_ marker on their face, and must not be used
operationally until that lane clears them.

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

Structured per `content-standards.md`'s claim-map record (stable claim ID, exact section,
risk class and claim type, bounded claim text and required wording state, source IDs and
roles, applicability and confounders, reviewer fields, invalidation trigger, next review
date). Reviewer and approval fields are **deliberately unfilled** — the author cannot
self-approve R2/R3 material, so those slots exist to be completed at review rather than
pre-filled here.

### 8.1 Source register

| ID  | Source                                                                                                                                                                                                                                                                                                                                                                                                                        | Tier                                        | Retrieved  | Verification                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | FAO Irrigation and Drainage Paper 56, _Crop evapotranspiration_, Ch. 3, Eq. 11 and 12. <https://www.fao.org/4/x0490e/x0490e07.htm>                                                                                                                                                                                                                                                                                            | A (standard/method)                         | 2026-08-15 | Read at source                                                                                                                                              |
| S2  | Rodriguez-Morrison, V., Llewellyn, D. and Zheng, Y. "Cannabis Yield, Potency, and Leaf Photosynthesis Respond Differently to Increasing Light Levels in an Indoor Environment." _Front. Plant Sci._ 12:646020, 2021. doi:10.3389/fpls.2021.646020                                                                                                                                                                             | A (peer-reviewed)                           | 2026-08-15 | Read at source                                                                                                                                              |
| S3  | Corredor-Perilla, I.C., Kwon, T.-H. and Park, S.-H. "Elevated relative humidity significantly decreases cannabinoid concentrations while delaying flowering development in _Cannabis sativa_ L." _Front. Plant Sci._, 2025. doi:10.3389/fpls.2025.1678142                                                                                                                                                                     | A (peer-reviewed)                           | 2026-08-15 | Read at source                                                                                                                                              |
| S4  | OSHA Annotated PELs, Table Z-1, CAS 124-38-9. <https://www.osha.gov/annotated-pels/table-z-1>                                                                                                                                                                                                                                                                                                                                 | A (regulation)                              | 2026-08-15 | Read at source, four authority columns separated                                                                                                            |
| S6  | Utah State University Extension, "Bud Rot" (hemp IPM note); Oregon State University Extension gray-mold-in-hemp series                                                                                                                                                                                                                                                                                                        | A (extension)                               | 2026-08-15 | USU read; **OSU HTTP 403**                                                                                                                                  |
| S7a | Chen, Chiachung. "Determining the Leaf Emissivity of Three Crops by Infrared Thermometry." _Sensors (Basel)_ 15(5):11387–11401, 2015. doi:10.3390/s150511387                                                                                                                                                                                                                                                                  | A (peer-reviewed)                           | 2026-08-15 | Read at source. Locators: emissivity Table 2; instrument spec Table 1; post-calibration accuracy §2.5                                                       |
| S7b | López, A., Molina-Aiz, F.D., Valera, D.L. and Peña, A. "Determining the emissivity of the leaves of nine horticultural crops by means of infrared thermography." _Scientia Horticulturae_ 137:49–58, 2012                                                                                                                                                                                                                     | A (peer-reviewed)                           | 2026-08-15 | Publisher page HTTP 403; **per-crop values from the institutional-repository record and search summaries; full text NOT read, no page locator**             |
| S8  | Cannabis HVAC/HVACD trade literature (HPAC Engineering; NCIA committee blog; Resource Innovation Institute), with ASHRAE Handbook as the controlling method reference                                                                                                                                                                                                                                                         | **C (trade press)**; ASHRAE B, **not read** | 2026-08-15 | Below evidence tier — see C08                                                                                                                               |
| S9  | Sae-Tang, W., Heuvelink, E., Nicole, C.C.S., Kaiser, E., Sneeuw, K., Holweg, M.M.S.F., Carvalho, S., Kappers, I.F. and Marcelis, L.F.M. "High light intensity improves yield of specialized metabolites in medicinal cannabis (_Cannabis sativa_ L.), resulting from both higher inflorescence mass and concentrations of metabolites." _J. Appl. Res. Med. Aromat. Plants_ 43, Dec 2024 (Wageningen University and Research) | A (peer-reviewed)                           | 2026-08-15 | Publisher page returned HTTP 403; **bibliographic details and headline results from the WUR institutional record and search summaries, full text NOT read** |

### 8.2 Claims

| ID   | Section        | Bounded claim                                                                                                                                                                                                                                              | Risk   | Claim type              | Required wording state                                                                                | Sources (role)                                                                                                                                                                 | Evidence type                                                                       |
| ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| C01  | §2, §3.2, §3.4 | Saturation vapour pressure is `e°(T) = 0.6108·exp[17.27T/(T+237.3)]` kPa for T in °C; mean saturation vapour pressure is the mean of `e°(Tmax)` and `e°(Tmin)`, not `e°(Tmean)`                                                                            | R1     | method/formula          | Derived                                                                                               | S1 (`defines_method`)                                                                                                                                                          | Standard, domain-general                                                            |
| C02  | §3.4           | Averaging temperature and RH before deriving VPD produces an error whose **sign and magnitude are data-dependent**, driven mainly by T–RH covariance rather than convexity alone                                                                           | R1     | method/arithmetic       | Derived                                                                                               | S1 (`limits`) plus author computation                                                                                                                                          | Author-computed, reproducible                                                       |
| C03  | §3.2, §3.3     | The worked air/leaf VPD values, and the span produced by a ±0.5 °C / ±3% RH error budget, computed from C01                                                                                                                                                | R1     | worked example          | Derived                                                                                               | S1 (`defines_method`)                                                                                                                                                          | Author-computed; the error budget is a **stated assumption**, not a datasheet claim |
| C04a | §6             | Indoor cannabis inflorescence yield rose linearly 116→519 g·m⁻² (4.5×) as canopy PPFD rose 120→1,800 µmol·m⁻²·s⁻¹ over an 81-day flowering stage; an independent group reported inflorescence dry-matter production likewise rising 600→1,200 µmol·m⁻²·s⁻¹ | R2     | cultivation outcome     | Supported across sources                                                                              | S2 ("Yield and Quality", Fig. 7A — `supports`); S9 (`supports`, **independent group**)                                                                                         | **Direct cannabis, two independent groups**                                         |
| C04b | §6             | Whether PPFD affects cannabinoid **potency** (concentration) is **unresolved**                                                                                                                                                                             | R2     | cultivation outcome     | **Unknown or disputed** — "evidence is limited or conflicting; Verdant does not assign a fixed value" | S2 ("Yield and Quality", Table 1 — no effect across 120–1,800; `supports` no-effect); S9 (+60% cannabinoid / +40% terpenoid concentration across 600–1,200; **`contradicts`**) | **Direct cannabis, two independent groups in conflict**                             |
| C05  | §5             | Cannabis at 78–98% RH (VPD 0.05/0.25 kPa) versus 37–58% RH (VPD 1.29/0.92 kPa) showed total CBD reduced 4.6×, flowering delayed ~3 weeks, dry biomass 2.71× lower                                                                                          | R2     | cultivation outcome     | **Field tendency — single-source; cannot satisfy R2 corroboration (see 8.5)**                         | S3 only (Results §3.4/Fig. 5B, §3.3/Fig. 4, §3.2/Fig. 2A — `supports`, `limits`)                                                                                               | **Direct cannabis**                                                                 |
| C06  | §4, §7         | Federal OSHA PEL for CO2 is 5,000 ppm 8-hr TWA with **no** short-term limit listed; Cal/OSHA, NIOSH (15-min ST) and ACGIH each add 30,000 ppm short-term                                                                                                   | **R3** | controlling requirement | Controlling requirement                                                                               | S4 (`controls_requirement`)                                                                                                                                                    | Regulation                                                                          |
| C08  | §4             | Cannabis transpires most applied irrigation water into room air, so latent load persists after lights-off when sensible load collapses                                                                                                                     | **R3** | equipment/capacity      | Field tendency                                                                                        | S8 (`supports`)                                                                                                                                                                | **Trade press — below tier**                                                        |
| C09  | §5             | _Botrytis cinerea_ is favoured by cool temperatures (65–75 °F), high RH, and free water on plant surfaces; extension guidance recommends holding greenhouse RH below 50%                                                                                   | R2     | pathogen risk           | Source-reported                                                                                       | S6 (`supports`)                                                                                                                                                                | Hemp/greenhouse **proxy setting**                                                   |
| C10  | §3.5           | Leaf emissivity across twelve measured crop species clusters at **0.973–0.985**; a calibrated infrared thermometer over 6.0–14.0 µm achieved **0.35 °C** post-calibration accuracy against a 0.15 °C thermocouple reference                                | R1     | measurement method      | Directly measured                                                                                     | S7a (Table 2, §2.5 — `supports`, `limits`); S7b (nine-crop values — `supports`)                                                                                                | **Proxy crops — neither contains a cannabis figure**                                |
| C11  | §9             | Verdant's shipped VPD stage bands carry no recorded source, method, or reviewer, and `vpd_targets` has no provenance column                                                                                                                                | R0     | product truth           | Directly measured                                                                                     | Deploy branch `0522eefb1` (`documents_product`)                                                                                                                                | Repository inspection                                                               |

### 8.3 Applicability, confounders, and what must not be concluded

| ID   | Population / setting                                                                                                                                   | Units and method                                | Known confounders / uncertainty                                                                                                          | Must NOT be concluded                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01  | Domain-general physics                                                                                                                                 | kPa, °C                                         | None material within the stated range                                                                                                    | That a correct formula makes its inputs accurate                                                                                                              |
| C02  | Any room where T and RH both vary                                                                                                                      | kPa                                             | The sign flips with the sign of the T–RH correlation                                                                                     | That averaging "always understates" — it does not                                                                                                             |
| C03  | One illustrative room state                                                                                                                            | kPa; FAO-56 Eq. 11                              | Error budget assumed, not measured; real instruments differ                                                                              | That ±0.5 °C / ±3% RH describes any specific sensor                                                                                                           |
| C04a | Cannabis, indoor; DWC (S2) and a separate medicinal-cannabis system (S9); different cultivars                                                          | µmol·m⁻²·s⁻¹, g·m⁻²                             | Two facilities, two cultivars, non-overlapping intensity ranges; no plateau seen within either                                           | That yield keeps scaling past 1,800 µmol·m⁻²·s⁻¹, or that either trial's absolute g·m⁻² transfers to another room                                             |
| C04b | Same two trials                                                                                                                                        | Cannabinoid/terpenoid concentration (%, mg·g⁻¹) | **Direct conflict**: no effect across 120–1,800 (S2) versus +60%/+40% across 600–1,200 (S9); different cultivars, facilities, and ranges | **Either direction.** Do not tell a grower that raising light raises potency, and do not tell them it cannot — the evidence does not support either statement |
| C05  | Cannabis, **single CBD-dominant genotype ("Cherry Berry"), n=10 per treatment, controlled growth chambers** — the authors' own stated limitation       | % RH, kPa, mg/g                                 | One genotype; chamber, not a production room; severe contrast only; **no independent corroboration found — single-source**               | **That any mid-range kPa target follows.** The study cannot distinguish 1.1 from 1.4 kPa                                                                      |
| C06  | US workplaces; jurisdiction-specific                                                                                                                   | ppm; 8-hr TWA and short-term                    | Cal/OSHA applies only in California; NIOSH and ACGIH are non-binding                                                                     | That federal OSHA sets a 30,000 ppm STEL — it does not                                                                                                        |
| C08  | Commercial indoor cannabis                                                                                                                             | No quantitative figure carried                  | Trade press; the ASHRAE method was not read                                                                                              | **Any numeric load, sizing, or capacity figure.** Mechanism only                                                                                              |
| C09  | Hemp, greenhouse-framed                                                                                                                                | °F, % RH                                        | Greenhouse is not a sealed indoor room; hemp is not all cannabis; "below 50%" is greenhouse guidance                                     | That "RH below 50%" is an indoor cannabis setpoint                                                                                                            |
| C10  | _Phalaenopsis_, _Paphiopedilum_, Malabar chestnut (S7a); tomato, pepper, cucumber, courgette, aubergine, melon, watermelon, green bean, red bean (S7b) | Emissivity (dimensionless), °C, µm              | **No cannabis emissivity figure exists in either study**; S7b full text not read                                                         | That ~0.98 is verified for cannabis, or that instrument error is negligible — at ~0.35 °C it is comparable to the §3.2 air-temperature budget                 |
| C11  | Verdant deploy branch at `0522eefb1`                                                                                                                   | n/a                                             | Point-in-time repository state; re-verify at the current tip                                                                             | That the bands are wrong — only that they are unsourced                                                                                                       |

### 8.4 Review lifecycle

Author: Claude (Knowledge Library and Product Specification Architect), 2026-08-15.

| ID   | Evidence reviewer                          | Cultivation reviewer | Qualified (R3) reviewer | Approved | Invalidation trigger                                                                                 | Next review                                 |
| ---- | ------------------------------------------ | -------------------- | ----------------------- | -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| C01  | PENDING                                    | n/a                  | n/a                     | —        | FAO-56 revision or a superseding standard                                                            | 2028-08-15                                  |
| C02  | PENDING                                    | n/a                  | n/a                     | —        | An arithmetic error found in the worked cases                                                        | 2028-08-15                                  |
| C03  | PENDING                                    | PENDING              | n/a                     | —        | Shipped band values change; C01 invalidated                                                          | 2027-08-15                                  |
| C04a | PENDING                                    | PENDING              | n/a                     | —        | Retraction or correction; a contradicting cannabis trial                                             | 2027-08-15                                  |
| C04b | PENDING                                    | PENDING              | n/a                     | —        | **A trial that resolves the S2/S9 conflict** (matched cultivar and range), or a retraction of either | 2027-08-15                                  |
| C05  | **BLOCKED — no independent corroboration** | PENDING              | n/a                     | —        | **Publication of any independent study of elevated RH in cannabis**; retraction or correction        | 2027-08-15                                  |
| C06  | PENDING                                    | n/a                  | **PENDING — required**  | —        | 29 CFR 1910.1000 revision; Cal/OSHA or NIOSH update                                                  | **2027-02-15** (semi-annual for regulatory) |
| C08  | **BLOCKED — below tier**                   | PENDING              | **PENDING — required**  | —        | Acquisition of ASHRAE or another A/B-tier load source                                                | Immediate                                   |
| C09  | PENDING                                    | PENDING              | n/a                     | —        | Updated extension guidance; the OSU pages read directly                                              | 2027-08-15                                  |
| C10  | PENDING                                    | n/a                  | n/a                     | —        | A cannabis-specific emissivity study published                                                       | 2027-08-15                                  |
| C11  | PENDING                                    | n/a                  | n/a                     | —        | **Any change to `vpdTargets.ts` or the `vpd_targets` schema**                                        | Re-verify at each deploy tip                |

### 8.5 Missing evidence, explicit

1. **No source, anywhere, for Verdant's shipped stage VPD bands** (C11). See §9 — the
   central finding of this draft.
2. **No peer-reviewed cannabis-specific leaf-temperature-offset magnitude was found** (C10).
   The commonly repeated "leaves run 3–5 °F cooler than air" appears only in vendor and
   retailer copy, which `content-standards.md` excludes from the evidence tiers. This draft
   therefore states offsets only as _measured inputs_, never as expected values.
3. **No cannabis study establishing a mid-range VPD optimum was found** (C05). The 2025
   humidity study tests a severe contrast and cannot adjudicate 1.1 versus 1.4 kPa.
4. **Several sources returned HTTP 403 to this author** (the OSU half of S6, the S9
   publisher page, the S7b publisher page). They are marked NOT READ in the register rather
   than presented as read. S9 and S7b are cited from institutional records and search
   summaries; an evidence editor must obtain their full texts before C04a/C04b and C10
   advance.
   4b. **C07 (NIOSH IDLH 40,000 ppm) was removed entirely.** It was unverifiable — the CDC
   page returned 403 — _and_ unmapped: no section of this document ever stated the value,
   so the record could have been approved against absent prose. Rather than add an
   unverified number to an R3 safety section, the claim and its source (S5) are dropped.
   If a page needs the IDLH, it belongs on `KL-202`/`KL-212` with a source someone has
   actually read.
5. **C08 has no admissible source.** Trade press is not an evidence tier. The mechanism is
   physically uncontroversial, but no quantitative load figure may be published from it.
6. **C05 is single-source and cannot satisfy R2 as it stands** — a blocker not previously
   recorded. `content-standards.md` requires an R2 claim to carry "at least one Tier A
   source **and one independent corroborating A/B source**." A search for independent work
   on elevated RH in cannabis returned nothing but the same study. Until corroboration
   exists, C05's wording state is downgraded to **field tendency / single-source**, and it
   **cannot advance past evidence review as an R2 cultivation claim.** Either corroboration
   is found, or the claim is downgraded further or dropped.
7. **C04 was split because its two halves have different evidentiary standing** (C04a,
   C04b). Searching for the corroboration R2 requires turned up an independent group (S9)
   that **supports** the yield direction and **contradicts** the no-potency-effect finding.
   C04a is now genuinely multi-source; C04b is a recorded conflict that licenses no
   recommendation in either direction. An earlier revision of §6 asserted that "light
   intensity is not a potency lever" — a single-source overstatement, now removed.
8. **Citation-integrity correction — C10 was mis-attributed and is rebuilt.** An earlier
   revision cited "López et al., PMC4481894" for canopy emissivity ≈0.98, snap bean 0.96,
   tobacco 0.97, alfalfa/sudangrass 0.97–0.98, an 8–13 µm band pass, 0.1–0.3 °C error, and
   an emissivity-determination error of 0.01. Reading the sources showed that was wrong on
   every axis: **PMC4481894 is Chen 2015, not López**, its three crops are _Phalaenopsis_,
   _Paphiopedilum_, and Malabar chestnut (not snap bean, tobacco, alfalfa, or sudangrass),
   and its instrument is 6.0–14.0 µm with 0.35 °C post-calibration accuracy — not 8–13 µm
   and 0.1–0.3 °C. Those figures came from search summaries and were attributed to a paper
   that does not contain them. `content-standards.md` lists a fabricated citation under
   automatic rejection, so this is recorded rather than quietly patched. C10 is rebuilt on
   two sources that were actually checked (S7a read at source; S7b's per-crop values from
   its institutional record, marked not-read), and every figure it now states was taken
   from one of them. The unverifiable snap bean / tobacco / alfalfa / sudangrass and
   8–13 µm / 0.1–0.3 °C / 0.01 figures are **withdrawn**, not re-sourced.

### 8.6 Reviewers required before this advances past `drafted`

Evidence editor; cultivation reviewer; **qualified R3 reviewer** — required for this pillar
(unlike P7) and, per the risk-class notice at the top of this document, potentially for the
pillar page itself rather than only its four R3 descendants; product-truth reviewer (must
verify every §9 claim against shipped behaviour at the then-current deploy tip);
SEO/technical editor; copy/accessibility editor.

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

**Handoff.** This revision is **not** ready for `evidence_review` — it is pre-`drafted`,
and the blocker is concrete: **none of the eight original assets in §7 has been built.**
That is the next unit of work and it needs no decision from anyone — including the two
R3-boundary assets, which the author drafts with a pending-safety marker and the
`safety_review` lane clears afterwards.

Two **evidence blockers** also sit ahead of `evidence_review` and are recorded in §8.5:
C05 is single-source and cannot satisfy R2's corroboration requirement as it stands, and
C04b is a live conflict between two independent groups that licenses no recommendation in
either direction.

Four items do need a decision, and all four can be settled in parallel with the asset work:
the **risk-class question at the top of this document** (ship the pillar R3, or move its
CO2/HVAC claims out and keep it R2), the §9 VPD-band option (1, 2, or 3), the §11.2
L1-cluster structural question, and the §11.5 R3 reviewer resourcing. The
`KL-002` search brief is already at `draft` and needs no GA4/GSC access to stay there —
only advancing it to `validated` does.
