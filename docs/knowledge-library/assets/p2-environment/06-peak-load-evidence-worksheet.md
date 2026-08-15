# Asset 6 † — Peak-load evidence worksheet

> ## ⚠ PENDING QUALIFIED-SAFETY APPROVAL — NOT CLEARED FOR OPERATIONAL USE
>
> This asset sits inside the **R3 `hvac_safety`** boundary. Per `editorial-workflow.md`,
> `safety_review` runs **after** `drafted`, so this is drafted here and awaits a qualified
> reviewer. **Do not use it to make an equipment decision until that lane clears it.**
>
> **Reviewer scope required:** HVAC, electrical, structural, condensate. Per
> `content-standards.md`, cannabis cultivation experience does not substitute.

**Revision** r1 · 2026-08-15 · **Risk** **R3** · **Claims** C08 · **Licence** repository

**Accessibility note.** Tables and prose, no image.

---

## This worksheet produces evidence, not a size

**It does not size anything.** Its only output is an organised record to hand to a qualified
mechanical designer, so that their calculation starts from your room's measured behaviour
instead of a rule of thumb. Sizing is an ASHRAE-method engineering calculation performed by
someone qualified and accountable for it.

**Evidence limitation, stated up front (claim C08):** the mechanism below — that transpired
irrigation water becomes a latent load that persists after lights-off when sensible load
collapses — is supported in this draft only by **trade-press sources, which are not an
evidence tier** under `content-standards.md`. The mechanism is physically uncontroversial,
but **no quantitative load figure may be published from that source**, and none appears here.
Every number in this worksheet is one **you** measure.

## Part A — the room

| Field                                | Value |
| ------------------------------------ | ----- |
| Room / tent identifier               |       |
| Floor area                           |       |
| Ceiling height                       |       |
| Canopy area (actual, not floor)      |       |
| Sealed, vented, or mixed             |       |
| Envelope construction                |       |
| Known leaks / unsealed penetrations  |       |
| Adjacent spaces and their conditions |       |

## Part B — the load you can actually measure

Irrigation input is the most accessible proxy a grower has for transpiration. Record it;
do not convert it into a capacity figure yourself.

| Field                                          | Value | How measured |
| ---------------------------------------------- | ----- | ------------ |
| Irrigation volume delivered per day, peak week |       |              |
| Runoff volume collected per day, peak week     |       |              |
| Difference (input − runoff)                    |       |              |
| Days at this peak                              |       |              |
| Stage at peak                                  |       |              |
| Plant count and canopy area at peak            |       |              |

> **The difference between input and runoff is not the transpiration load, and it is not an
> upper bound on it either.** The full balance over a measurement period is
>
> ```text
> input − runoff_collected
>     = transpiration + evaporation
>     + Δ(substrate storage) + Δ(plant tissue water)
>     + uncollected runoff, leaks, and spillage
> ```
>
> **The last two terms are usually unmeasured, which is why this is a proxy and not a
> balance you can close.** Plant tissue gains water as the crop bulks and can release it
> late; runoff that never reaches the collection point looks identical to transpiration in
> this arithmetic. Both inflate the apparent figure.
>
> Evaporation from media surfaces and containers inflates the figure, **but a falling
> substrate water content makes Δstorage negative — and then transpiration can exceed
> input − runoff.** The two terms push in opposite directions, so the difference is neither
> a ceiling nor a floor.
>
> **Label it an incomplete proxy**, and record which way it is likely to be wrong:
>
> | Field                                                               | Value |
> | ------------------------------------------------------------------- | ----- |
> | Substrate water content at start of period (method: ......)         |       |
> | Substrate water content at end of period                            |       |
> | Direction of storage change (rising / falling / measured steady)    |       |
> | Was the period a full irrigation cycle returning to the same state? | y / n |
>
> **Even across a full cycle returning to the same substrate state, this is only an upper
> bound if tissue-water change is negligible and runoff collection is complete.** During
> rapid bulking neither holds. State which of those you have actually verified when you hand
> this over — an HVAC designer sizing from a figure mislabelled as a ceiling can undersize
> the room, and a ceiling that quietly assumes complete runoff collection is not a ceiling.

## Part C — equipment as installed

| Field                             | Cooling | Dehumidification | Heating | Circulation |
| --------------------------------- | ------- | ---------------- | ------- | ----------- |
| Make / model                      |         |                  |         |             |
| Nameplate capacity                |         |                  |         |             |
| Rated conditions on the nameplate |         |                  |         |             |
| Age / hours                       |         |                  |         |             |
| Last service                      |         |                  |         |             |
| Condensate route and destination  |         |                  |         |             |
| Redundancy present?               |         |                  |         |             |

**Nameplate capacity is quoted at the manufacturer's rated conditions, which are not your
room's conditions.** Record both; do not treat the nameplate as delivered capacity.

## Part D — observed behaviour (the part a designer cannot get elsewhere)

This is the highest-value section. It is your room telling you where its limit is.

| Observation                                                          | Value / notes |
| -------------------------------------------------------------------- | ------------- |
| Highest RH observed in the last cycle, and when in the light period  |               |
| How long RH stayed above that level                                  |               |
| Time for RH to recover after lights-off                              |               |
| Does equipment reach 100% duty and stay there? When?                 |               |
| Any period where setpoint was not held — when, how long, how far off |               |
| Condensation observed on any surface? Which, and when                |               |
| Surface temperatures measured where condensation appeared            |               |
| Behaviour difference between early and late flower                   |               |

> **Unverified working hypothesis, for the qualified reviewer to confirm or strike.** It is
> commonly asserted that the binding constraint is lights-off in late flower, when sensible
> load collapses while latent load does not. **That is claim C08** — trade press only, below
> the evidence tier, and blocked. It is recorded here rather than in the R2 assets because
> this worksheet already sits behind the qualified-safety banner, and because it tells the
> reviewer which window to scrutinise. **Do not treat it as established, and do not let it
> narrow what you measure** — asset 7 records the transition window across whatever stages
> you care about, and which stage actually binds is a finding of your own data. Attach it.

## Part E — what to hand over

- [ ] This worksheet, complete
- [ ] Asset 7 — lights-off transition timeline, at least one full cycle
- [ ] Asset 4 — airflow and microclimate map
- [ ] Asset 1 — sensor placement record, so the designer knows what the data describes
- [ ] Instrument accuracies for every figure above

## Escalation boundary — where this pillar stops

Route to a **qualified professional**, not to a guide, for any of:

- equipment selection or sizing of any kind;
- electrical supply, circuit capacity, or any wiring change;
- structural mounting or load-bearing questions;
- refrigerant handling;
- condensate drainage design, standing water, or any drainage that could reach an electrical
  path;
- any question about fire risk.

## What not to conclude

- **No sizing output.** If a number in this worksheet ever becomes a specification, the
  worksheet has been misused.
- **No device control.** Verdant may explain and suggest; it never commands equipment.
- **No rule of thumb.** This asset deliberately contains no ratio, multiplier, or
  capacity-per-area figure, because none in the source material clears the evidence tier.
