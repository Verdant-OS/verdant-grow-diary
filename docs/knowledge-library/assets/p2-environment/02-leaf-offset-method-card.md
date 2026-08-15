# Asset 2 — Leaf-offset method card

**Revision** r1 · 2026-08-15 · **Risk** R1 · **Claims** C01, C03, C10 · **Licence** repository

**Accessibility note.** Table-and-prose, no image. The sampling pattern is given as written
positions rather than a drawn grid.

---

## The rule this card exists to enforce

**No measured leaf temperature, no leaf VPD.** A leaf-basis calculation built on an assumed
offset is an air calculation wearing a leaf label. Draft §3.3 shows the consequence: at
26.0 °C / 60% RH the same room reads **1.345 kPa inside** the shipped `mid_late_flower` band
on air basis and **0.967 kPa below** it at a measured −2 °C offset. The verdict inverts.

## Before measuring — record your reflected-temperature problem

This is the step most method cards omit, and in a grow room it is the one that bites.
Emissivity error converts into temperature error **through the reflected temperature**, and
a hot fixture above the canopy is exactly the case where the term stops being small.
Author computation (draft §3.5), leaf at 24 °C, Δε = 0.01 on ε = 0.98:

| Effective reflected temperature at the leaf plane | Temperature error from a 0.01 emissivity error |
| ------------------------------------------------- | ---------------------------------------------: |
| 24 °C (no gradient)                               |                                       0.000 °C |
| 30 °C                                             |                                       0.063 °C |
| 40 °C                                             |                                       0.177 °C |
| 50 °C                                             |                                       0.302 °C |
| 60 °C                                             |                                       0.440 °C |

For scale, the instrument in claim C10 had a **0.35 °C** post-calibration accuracy. So
emissivity uncertainty is negligible in a uniform room and **equal to or larger than the
instrument** once a surface above the canopy reaches 50–60 °C. **Neither term dominates in
general — which one dominates is a property of your room.** Measure the background.

## Method

1. Bring the room to its normal operating state — normal light, airflow, and irrigation.
   An offset measured in an abnormal state describes nothing you will act on.
2. Record the **effective reflected temperature at the leaf plane** — not a fixture's
   apparent temperature.

   **Aiming the IR thermometer at the fixture housing, ceiling, or reflector is wrong**, and
   it is what an earlier revision of this card said. What that reports is _that surface's_
   apparent temperature, which depends on the surface's own emissivity and on how much of the
   leaf's field of view it actually occupies. Several surfaces at different temperatures
   contribute, weighted by view factor; one of them is not the answer.

   **The standard workaround** is a diffuse reflector at the leaf plane: place a crumpled
   then re-flattened sheet of aluminium foil where the leaf is, facing the same way, set the
   instrument's emissivity to 1.0, and read its apparent temperature — that reading _is_ the
   effective reflected temperature. **The evidence editor should confirm and cite the
   controlling method reference** (thermography practice standards cover this); this card
   describes the technique but **claims no standard for it**, and §8 carries no such source
   yet.

   **If you cannot do this, record the reflected-temperature contribution as UNQUANTIFIED**
   rather than substituting a fixture reading — an unquantified term you have flagged is
   safer than a quantified one that is wrong.

3. Set the instrument's emissivity. Absent a cannabis figure, **0.98 is a proxy starting
   point to verify, not an established value** — claim C10 covers twelve non-cannabis
   species at 0.973–0.985 and **neither source measured cannabis.**
4. Sample several leaves spread across the canopy, at the height the reading is meant to
   describe, and record each position. **This card sets no sourced minimum** — no claim in §8
   establishes one. The template below lays out five rows as an illustrative starting point,
   not a threshold; what matters is that `u_samp = SD ÷ √n` shrinks as `n` grows, so **let
   your own spread tell you whether you have sampled enough** rather than hitting a count.
5. Record air temperature **at the same instant and the same location** — the offset is a
   difference, and a difference taken across two times is not an offset.
6. Compute offset per sample, then report the mean **and the spread**. A single number
   without a spread hides whether the canopy is uniform.

## Record

**Room / tent:** ............ **Date / time:** ............ **Recorded by:** ............
**Light state:** on / off / transition · **Minutes since state change:** ............

| Field                                              | Value |
| -------------------------------------------------- | ----- |
| IR instrument make / model                         |       |
| Instrument spectral band (µm)                      |       |
| Instrument stated accuracy (°C)                    |       |
| Last calibration / verification date               |       |
| Emissivity setting used                            |       |
| Distance to leaf (cm)                              |       |
| Spot size at that distance (cm)                    |       |
| Effective reflected temperature at leaf plane (°C) |       |
| Method used (foil reflector / UNQUANTIFIED)        |       |
| Air-temperature instrument                         |       |
| Air-probe stated accuracy (°C)                     |       |
| Air-probe repeatability (°C, if published)         |       |
| IR repeatability (°C, if published)                |       |

| Sample | Position (written locator) | Leaf T (°C) | Air T at same instant (°C) | Offset (leaf − air, °C) |
| ------ | -------------------------- | ----------- | -------------------------- | ----------------------- |
| 1      |                            |             |                            |                         |
| 2      |                            |             |                            |                         |
| 3      |                            |             |                            |                         |
| 4      |                            |             |                            |                         |
| 5      |                            |             |                            |                         |

**Mean offset:** ...... °C · **Min:** ...... · **Max:** ...... · **Spread (max − min):** ...... °C

## Uncertainty budget — two instruments, and one thing that is not an error at all

The offset is a **difference between two separately measured quantities**, taken with two
different devices, so its uncertainty is not either instrument's accuracy alone.

**But canopy spread is not part of that budget.** Variation between leaves is **real spatial
variation** — the leaves genuinely differ — not measurement error. Folding a range into an
error budget both mislabels it and makes the answer depend on which extremes you happened to
sample; a range also grows with sample size rather than shrinking, which is the opposite of
how an uncertainty behaves.

### Measurement uncertainty of the mean offset

**Convert everything to a common standard uncertainty before combining.** A datasheet
"±0.35 °C accuracy" is a **maximum-error bound**, not a one-standard-deviation uncertainty,
and a standard error of the mean **is** one. Root-sum-squaring them as they stand mixes
incompatible quantities and produces a ± with no defined confidence level.

**Step 1 — convert each bound to a standard uncertainty.** For a stated bound ±a with no
distribution given, the conventional assumption is rectangular, so `u = a ÷ √3`.

| Contribution           | Symbol   | Raw figure                                                                                           | Type   | Standard uncertainty (°C) |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------- | ------ | ------------------------- |
| IR thermometer         | `u_ir`   | datasheet bound ±...                                                                                 | bound  | `a ÷ √3` = ......         |
| Air probe              | `u_air`  | datasheet bound ±...                                                                                 | bound  | `a ÷ √3` = ......         |
| Emissivity × reflected | `u_emis` | estimated bound ± ... (table above), **or record UNQUANTIFIED if the reflector method was not used** | bound  | `a ÷ √3` = ......         |
| Sampling               | `u_samp` | `SD ÷ √n` of your per-leaf offsets                                                                   | **1σ** | use as-is = ......        |

**Step 2 — combine.**

```text
u_c = sqrt(u_ir² + u_air² + u_emis² + u_samp²)   combined standard uncertainty (1σ)
U   = k · u_c,   k = 2 for roughly 95%           expanded uncertainty
```

`u_c` is the GUM symbol for the **combined** uncertainty; each contribution above carries
its own name so the formula is not circular.

**Report U and state k.** A ± with no coverage factor is not interpretable.

Quadrature assumes independence; **if two contributions share a cause — for example both
instruments calibrated against the same reference — they are correlated, and adding them
linearly is the conservative choice.** Record which you used, and whether you assumed
rectangular distributions.

> **Worked shape (illustrative, using this card's own figures):** IR bound 0.35 °C, air-probe
> bound 0.5 °C, emissivity/background bound 0.30 °C at 50 °C reflected, and five leaves with
> SD 0.4 °C.
>
> - standard uncertainties: 0.35/√3 = **0.202**, 0.5/√3 = **0.289**, 0.30/√3 = **0.173**,
>   SEM = 0.4/√5 = **0.179**
> - combined: `u_c` = **0.43 °C (1σ)**; expanded at k = 2: **U ≈ 0.86 °C (~95%)**
>
> An earlier revision root-sum-squared the raw bounds against the SEM and reported
> **0.70 °C** with no stated coverage — a figure that sits between the 1σ and 95% values and
> means neither. **The ± you carry into asset 3 should be U with its k stated**, or the
> leaf-VPD range built from it is narrower than it appears. (A conservative
> alternative propagates the **bounds linearly and expands the sampling term to match**:
> `0.35 + 0.5 + 0.30 + k·SEM` with k = 2 gives **1.51 °C**. Adding the raw 1σ SEM to three
> hard bounds — as an earlier revision did, reporting 1.33 °C — mixes coverage levels and can
> come out **smaller** than the properly expanded `U`, which defeats the point of a
> conservative bound.)

### Canopy distribution — reported separately, never combined

| Field                       | Value |
| --------------------------- | ----- |
| n (leaves sampled)          |       |
| Mean offset (°C)            |       |
| SD of per-leaf offsets (°C) |       |
| Min / max (°C)              |       |

**If the SD is large relative to the mean, a single canopy-wide offset is the wrong object to
apply at all.** The canopy is not uniform, and the right response is a microclimate map
(asset 4), not a tighter error bar — consider carrying separate offsets for the zones you
care about instead of one room number.

## Uncertainty statement (required — copy into the VPD worksheet)

> Mean offset **......** °C ± **......** °C (**expanded** uncertainty in the mean, k = **...**,
> from a–d above), from **......** leaves with SD **......** °C and range **......** to
> **......** °C, at
> emissivity **......**, effective reflected temperature **......** °C (method: **......**),
> IR instrument **......** °C, air probe
> **......** °C, combined by **quadrature / linear addition**, measured **......** minutes
> into **lights-on / lights-off**.

**The ± is uncertainty in the mean; the SD and range describe the canopy.** Asset 3 needs the
first for its leaf-VPD corners; a reader deciding whether one offset applies at all needs the
second.

If you cannot fill that sentence, **you do not have a leaf basis.** Label the result air VPD
and say so.

## What not to conclude

- Not a cultivar property. An offset is a measurement of this canopy, in this room, in this
  state — it does not transfer to another run.
- Not a constant. It changes with light intensity, airflow, irrigation, and canopy density.
- Not a target. This card produces an input, never a setpoint.
