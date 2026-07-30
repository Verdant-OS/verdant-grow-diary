---
slug: cannabis-grow-light-distance-and-schedule
title: Cannabis Grow Light Distance, PPFD, DLI, and Schedules: What to Measure Before You Change Anything
meta_description: Learn why fixture distance alone is not enough. Measure canopy PPFD, calculate DLI from your schedule, and log one light change at a time.
schema: Article, BreadcrumbList, FAQPage backed by the mounted visible FAQ
status: implemented in the shared guide registry on a production-ready branch based on merged PR #560
---

# Cannabis Grow Light Distance, PPFD, DLI, and Schedules: What to Measure Before You Change Anything

There is no honest universal answer to “How far should my grow light be from the plants?” The same distance can create a very different canopy environment when the fixture, dimmer setting, optics, coverage, canopy shape, and schedule change.

Use distance as a starting point from the fixture manufacturer—not as proof that the plants are receiving an appropriate light dose. The useful question is: **what reaches the canopy, for how long, and what changed before the plant’s response changed?**

That is where PPFD, DLI, a stable schedule, and a simple timeline help.

## Start with a baseline, not a big adjustment

Before raising output, lowering a fixture, or changing the hours on the timer, write down the baseline:

- fixture model and number of fixtures
- dimmer setting and fixture-to-canopy distance
- how the light reading was obtained: a PAR meter, a manufacturer map, an app estimate, or unknown
- readings across the canopy, not only directly under the fixture
- light-on and light-off times
- plant stage and canopy condition
- temperature and relative humidity, including the source and timestamp
- any recent watering, feeding, transplant, or environmental change

This is not busywork. If several inputs change at once, it becomes very difficult to tell whether a leaf response followed the light, heat, water status, root-zone conditions, or something else.

Verdant’s useful role is to keep the decision beside the plant’s history: a measured baseline, the precise change, and the response you observe afterward.

## PPFD tells you about intensity at a moment

PPFD—photosynthetic photon flux density—is the number of photosynthetically active photons arriving at a square meter each second. It is commonly written as `µmol·m⁻²·s⁻¹`.

For a grower, PPFD is more useful than a hanging-height rule because it describes the canopy location being measured. A center reading alone can still hide dim corners or a sharp hot spot, especially as the canopy grows unevenly.

### Make a simple canopy map

If you have a suitable meter or a trustworthy fixture map, take readings at repeatable points:

1. Mark a small grid across the usable canopy.
2. Keep the meter plane level at canopy height.
3. Record the fixture setting, distance, and measurement method with the readings.
4. Note the center, edges, and any position that is noticeably different.
5. Repeat the same method after a single light adjustment.

An app estimate and a manufacturer map can still be useful context, but they should not be presented as the same thing as an on-canopy measurement. Label the source so a later comparison is honest.

## DLI adds the schedule to the picture

DLI—daily light integral—is the total photosynthetic light delivered across a day. It combines intensity and photoperiod, so a change in timer hours can change daily dose even if the dimmer and distance never move.

The calculation is:

```text
DLI (mol·m⁻²·d⁻¹) = PPFD (µmol·m⁻²·s⁻¹) × light hours × 3,600 ÷ 1,000,000
```

For example, a **hypothetical** canopy reading of 500 `µmol·m⁻²·s⁻¹` over 18 hours produces a calculated DLI of 32.4 `mol·m⁻²·d⁻¹`. That calculation does not tell you that 500 is the correct setting for every cultivar, stage, or room. It simply makes the total dose visible when comparing one logged condition with another.

Research in controlled indoor cannabis environments shows that light response depends on the production context and that intensity, duration, uniformity, and environmental management should be considered together. It should not be converted into a universal home-grow target. [Rodriguez-Morrison et al., 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8144505/)

## Why distance charts are only a starting point

Manufacturer hanging guidance is useful for a particular fixture, with a particular lens, at a particular power setting and coverage area. It stops being reliable when any of those conditions changes.

Distance can affect several things at once:

- the intensity at the canopy
- how evenly the fixture covers the canopy
- heat around the top growth
- how much the corners differ from the center
- how far a tall plant is from the rest of the canopy

If you need to adjust, make the smallest reasonable change you can measure. Then leave the other major variables stable long enough to get a useful observation. Do not move the light, extend the schedule, change feeding, and change watering on the same day and expect the result to explain itself.

## Light schedules: compare the full context

Photoperiod is not just a timer preference. It works alongside intensity, total daily dose, growth stage, cultivar traits, temperature, and the grower’s practical constraints. A schedule that changes daily dose may also change heat and water demand.

For autoflowers, the useful question is not “Which schedule wins for every plant?” It is “What schedule can I keep stable, what dose does it create at my measured canopy level, and how does this plant respond?” A study of controlled cannabis production describes vegetative photoperiods commonly maintained around 16–18 hours in its specific research context; that is context, not a universal prescription. [Blanchard et al., 2025](https://pubmed.ncbi.nlm.nih.gov/41095236/)

Before changing a schedule:

- calculate the current and proposed DLI from a measured or clearly labeled estimated PPFD
- record why you are considering the change
- make one schedule or intensity change, not both
- check temperature/RH and watering demand during the next light period
- add a 24-hour note and a three-day comparison note

If the purpose is to improve a stressed canopy, first make sure the stress has not been confused with heat, watering, root-zone, or pest issues. More photons are not a safe default response to an uncertain symptom.

## When a light change looks like a stress event

Pale or damaged-looking upper growth after a light adjustment can be consistent with excessive light exposure, but it is not proof on its own. Temperature, airflow, water status, root-zone conditions, and the location/timing of the symptom all matter.

Pause before stacking adjustments. Record:

- the exact time, dimmer level, distance, and schedule change
- canopy location of the affected leaves
- a photo taken in normal, consistent lighting
- canopy PPFD source or measurement method
- temperature and RH at the time and source of the reading
- recent watering/feed changes and plant stage

Then use the [light-stress troubleshooting guide](/guides/cannabis-light-stress-light-burn-bleaching-or-heat) to decide what evidence is missing. If you have an electrical, heat, or severe plant-health safety concern, address that immediate safety issue through appropriate local expertise rather than waiting for a diary comparison.

## A one-change-at-a-time light log

Use this short record whenever you make a lighting change:

| Before the change                                                                                | Change made                                   | Next observations                                                                       |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Fixture/model, dimmer, distance, schedule, canopy map source, stage, temperature/RH, recent care | One measurable adjustment and exact timestamp | Immediate safety check; 24-hour note; three-day comparison; photos at repeatable angles |

The goal is not to prove that one number is perfect. It is to make the next decision less dependent on memory.

## Keep the decision attached to the plant’s history

In Verdant, save the canopy reading or source, fixture setting, schedule, and reason for the change with a plant note. Add a photo and a 24-hour follow-up. When you compare later, you will have the conditions that changed—not only an impression that “the lights were different.”

[Try a 30-second Quick Log](/quick-log) or [calculate air VPD from a measured temperature and RH](/tools/vpd-calculator) when environment context is part of the question.

## Frequently asked questions

### How far should an LED grow light be from cannabis plants?

Start with the manufacturer’s model-specific guidance, then verify the actual canopy intensity and coverage if you can. Distance alone cannot account for fixture output, dimmer level, optics, canopy shape, and schedule.

### How do I calculate DLI from PPFD and a light schedule?

Multiply PPFD by the number of light hours and 3,600, then divide by 1,000,000. Label the PPFD source and treat the result as a comparison tool, not a universal target.

### Do autoflowers need a light-schedule change?

There is no single schedule that is right for every autoflower and room. Compare schedule choices alongside measured or clearly labeled estimated intensity, DLI, temperature/RH, plant stage, and the plant’s response. Make one change at a time.

### Is bleaching always light burn?

No. Upper-canopy color change can have several possible causes. Check timing, canopy position, light change, temperature/RH, watering/feed history, and measurement source before deciding what to adjust.

## Editorial sources and review notes

- [Cannabis Yield, Potency, and Leaf Photosynthesis Respond Differently to Increasing Light Levels in an Indoor Environment](https://pmc.ncbi.nlm.nih.gov/articles/PMC8144505/). Use for context-limited indoor intensity discussion; do not turn study treatments into universal targets.
- [Examining the Night Break Method in Cannabis sativa Horticulture](https://pubmed.ncbi.nlm.nih.gov/41095236/). Use for scoped photoperiod/DLI context; verify the final citation and applicability during editorial review.
- Fixture-specific guidance must link to the manufacturer’s current documentation and identify model/date. No third-party chart should be copied into the page.
