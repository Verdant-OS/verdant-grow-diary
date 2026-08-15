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

| Background / reflected temperature | Temperature error from a 0.01 emissivity error |
| ---------------------------------- | ---------------------------------------------: |
| 24 °C (no gradient)                |                                       0.000 °C |
| 30 °C                              |                                       0.063 °C |
| 40 °C                              |                                       0.177 °C |
| 50 °C                              |                                       0.302 °C |
| 60 °C                              |                                       0.440 °C |

For scale, the instrument in claim C10 had a **0.35 °C** post-calibration accuracy. So
emissivity uncertainty is negligible in a uniform room and **equal to or larger than the
instrument** once a surface above the canopy reaches 50–60 °C. **Neither term dominates in
general — which one dominates is a property of your room.** Measure the background.

## Method

1. Bring the room to its normal operating state — normal light, airflow, and irrigation.
   An offset measured in an abnormal state describes nothing you will act on.
2. Record the **background/reflected temperature** (aim the instrument at the surface above
   the canopy — fixture housing, ceiling, or reflector).
3. Set the instrument's emissivity. Absent a cannabis figure, **0.98 is a proxy starting
   point to verify, not an established value** — claim C10 covers twelve non-cannabis
   species at 0.973–0.985 and **neither source measured cannabis.**
4. Sample at least five leaves spread across the canopy, at the height the reading is meant
   to describe. Record each position.
5. Record air temperature **at the same instant and the same location** — the offset is a
   difference, and a difference taken across two times is not an offset.
6. Compute offset per sample, then report the mean **and the spread**. A single number
   without a spread hides whether the canopy is uniform.

## Record

**Room / tent:** ............ **Date / time:** ............ **Recorded by:** ............
**Light state:** on / off / transition · **Minutes since state change:** ............

| Field                                      | Value |
| ------------------------------------------ | ----- |
| IR instrument make / model                 |       |
| Instrument spectral band (µm)              |       |
| Instrument stated accuracy (°C)            |       |
| Last calibration / verification date       |       |
| Emissivity setting used                    |       |
| Distance to leaf (cm)                      |       |
| Spot size at that distance (cm)            |       |
| Background / reflected temperature (°C)    |       |
| Air-temperature instrument                 |       |
| Air-probe stated accuracy (°C)             |       |
| Air-probe repeatability (°C, if published) |       |
| IR repeatability (°C, if published)        |       |

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

| Contribution                  | Where it comes from                                                     | Value (°C) |
| ----------------------------- | ----------------------------------------------------------------------- | ---------- |
| a. IR thermometer             | Its accuracy — or repeatability if you only compare offsets over time   |            |
| b. Air probe                  | Its accuracy — the offset inherits this in full                         |            |
| c. Emissivity × background    | From the reflected-temperature table above, at your measured background |            |
| d. Standard error of the mean | `SD of your per-leaf offsets ÷ √n` — **not** the range                  |            |

```text
uncertainty in the mean offset = sqrt(a² + b² + c² + d²)
```

Term **d** is the standard error of the mean, which _is_ a standard uncertainty and belongs
in quadrature. The range (max − min) does not.

Quadrature assumes independence; **if two contributions share a cause — for example both
instruments calibrated against the same reference — they are correlated and adding them
linearly is the conservative choice.** Record which you used.

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

> **Worked shape (illustrative, using this card's own figures):** IR 0.35 °C, air probe
> 0.5 °C, emissivity/background 0.30 °C at 50 °C reflected, and five leaves whose offsets
> have an SD of 0.4 °C, giving SEM = 0.4 ÷ √5 = **0.18 °C** →
> `sqrt(0.35² + 0.5² + 0.30² + 0.18²)` ≈ **0.70 °C**. Still larger than any single term, which
> is why recording only one instrument's accuracy produces a falsely narrow leaf-VPD range
> downstream. Note the SEM contributes far less than the raw spread would have — **0.18
> rather than 0.4** — and the 0.4 °C spread is still reported, in the distribution table,
> where it belongs.

## Uncertainty statement (required — copy into the VPD worksheet)

> Mean offset **......** °C ± **......** °C (uncertainty **in the mean**, from a–d above),
> from **......** leaves with SD **......** °C and range **......** to **......** °C, at
> emissivity **......**, background **......** °C, IR instrument **......** °C, air probe
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
