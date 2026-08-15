# Asset 3 — VPD input and uncertainty worksheet

**Revision** r1 · 2026-08-15 · **Risk** R1 · **Claims** C01, C02, C03 · **Licence** repository

**Accessibility note.** Tables and arithmetic in text; no image. Every computation is written
out so it can be reproduced with a calculator.

---

## The output of this worksheet is a range, not a number

VPD is **calculated, never measured**, and it inherits every error in its inputs. A single
kPa figure with no range attached is a false-precision claim.

**Formula (claim C01) — FAO-56 Equation 11:**

```text
e°(T) = 0.6108 · exp[ 17.27·T / (T + 237.3) ]      kPa, T in °C

air VPD  = e°(T_air)  · (1 − RH/100)
leaf VPD = e°(T_leaf) − e°(T_air) · (RH/100)
```

## Step 1 — inputs and their provenance

| Field                                     | Value | Source label | Captured at | Accuracy (absolute) | Repeatability |
| ----------------------------------------- | ----- | ------------ | ----------- | ------------------- | ------------- |
| Air temperature (°C)                      |       |              |             | ±                   | ±             |
| Relative humidity (%)                     |       |              |             | ±                   | ±             |
| Leaf temperature (°C) — or "not measured" |       |              |             | ±                   | ±             |

**Accuracy and repeatability are different numbers and answer different questions** — see the
decision rule in step 4. If the datasheet gives only one, record which one it is.

Source label is one of `live`, `manual`, `csv`, `demo`, `stale`, `invalid`. **If any input
is `stale`, `invalid`, or `demo`, stop — the result is not authoritative and no target
comparison may be made from it.**

**Instrument accuracy comes from the datasheet, not from this worksheet.** The example in the
pillar draft assumes ±0.5 °C and ±3% RH purely to illustrate; your instruments differ.

## Step 2 — which sensor is your limiting one

This ordering is **not universal** — it depends on the operating point _and_ on your two
instruments. The break-even is the sensitivity ratio in **%RH per °C** (author computation,
claim C02/C03):

| Operating point | Break-even (%RH per 1 °C) |
| --------------- | ------------------------: |
| 26 °C, 40% RH   |                      3.55 |
| 26 °C, 60% RH   |                      2.36 |
| 26 °C, 80% RH   |                      1.18 |
| 20 °C, 60% RH   |                      2.48 |
| 30 °C, 60% RH   |                      2.29 |

**Your ratio** = (RH accuracy in %) ÷ (temperature accuracy in °C) = ..........
Compare it with the break-even nearest your operating point. Above it, RH is your limiting
sensor; below it, temperature is. **A better RH sensor or a worse temperature probe reverses
the answer.**

## Step 3 — compute the range

Compute VPD at the nominal inputs, then at the two corners that push VPD furthest apart:
warm-and-dry (T + accuracy, RH − accuracy) and cool-and-wet (T − accuracy, RH + accuracy).

| Case                | T (°C) | RH (%) | VPD (kPa) |
| ------------------- | ------ | ------ | --------- |
| Nominal             |        |        |           |
| Warm and dry corner |        |        |           |
| Cool and wet corner |        |        |           |

**Reported result:** VPD = ...... kPa, plausible range ...... to ...... kPa (span ...... kPa).

## Step 4 — compare the span to whatever band you are using

| Field                                    | Value |
| ---------------------------------------- | ----- |
| Band you are comparing against (kPa)     |       |
| Band width (kPa)                         |       |
| Your uncertainty span (kPa, from step 3) |       |
| Span as a percentage of band width       |       |

**Decision rule — and it is two rules, not one.** The span above is built from _absolute_
accuracy, so it answers only one of the two questions you are likely to ask:

| Question                                | Use                           | Record it here        |
| --------------------------------------- | ----------------------------- | --------------------- |
| Where does my room sit inside the band? | **Absolute accuracy** (above) | Span: ......          |
| Did the change I just made do anything? | **Repeatability / noise**     | Repeatability: ...... |

A stable calibration bias shifts every reading the same way, so it dominates _placement_
within a band but **largely cancels** when you difference two readings from the same
instrument. **A sensor that is badly off in absolute terms can still resolve a small change
reliably, provided it is repeatable.**

- Judge a **band comparison** against the absolute span.
- Judge **"did my adjustment do anything"** against repeatability, which is usually much
  smaller.
- If the datasheet gives no repeatability figure, **record that absence** — you then cannot
  say how small a change you can detect.

In the pillar's worked example the absolute span was about 70% of a 0.4 kPa band. That means
placement within the band is poorly determined under that assumed budget; **it does not mean
no adjustment is measurable.**

> **On the band itself.** This worksheet does not supply one. Verdant ships stage bands whose
> origin is unrecorded (draft §9, claim C11) — no source, method, or reviewer, and the
> `vpd_targets` table has no provenance column. Whether those bands may be published as
> guidance is an open editorial question. Use whatever band your own evidence supports, and
> record where it came from.

## Step 5 — basis, stated explicitly

- [ ] **Leaf basis** — leaf temperature measured, uncertainty statement from asset 2 attached
- [ ] **Air basis** — leaf temperature not measured. **Label the result air VPD.** Do not
      apply an assumed offset

## Aggregating over time — do not average the inputs

**Compute VPD per reading, then aggregate. Never average temperature and RH and compute
once.** Two independent errors appear when you do:

- **Convexity** (claim C01): `e°` is convex, so `e°(T̄)` understates the mean of `e°`. FAO-56
  Eq. 12 requires the mean of `e°(T_max)` and `e°(T_min)` for this reason.
- **Covariance** (claim C02): temperature and RH move together, and that term can be larger
  than the convexity term, smaller, or **exactly zero when RH is constant**. It can push the
  result either way.

The pillar's worked cases: constant RH biases **low by 0.018 kPa**; RH rising with
temperature biases **high by 0.096**; RH falling as temperature rises biases **low by 0.131**.
**The sign is not predictable without inspecting your own paired readings** — which is why
the rule is stated as a procedure rather than a correction factor.

## Completion check

- [ ] Every input has a source label, capture time, and datasheet accuracy
- [ ] No input is `stale`, `invalid`, or `demo`
- [ ] Result reported as a range
- [ ] Basis stated (leaf or air) and, if leaf, the offset uncertainty statement attached
- [ ] Any band used is recorded with its origin
