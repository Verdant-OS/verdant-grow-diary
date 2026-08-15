# Asset 1 — Canopy sensor-placement record

**Revision** r1 · 2026-08-15 · **Risk** R1 · **Claims** C01, C03 · **Licence** repository

**Accessibility note.** This asset is a table-and-prose record with no image. Positions are
described by written coordinates (row/column labels and a height in cm), so it is fully
usable by a screen reader and reproducible without graphics. A rendered plan-view diagram
may be added later; if it is, it must carry this same content as its text equivalent.

---

## Why this exists

**One probe describes one point.** A number from a single sensor is a claim about the air at
that sensor, at that moment — not about "the room," and not about the canopy. This record
makes the position explicit so a later reading is comparable to an earlier one, and so a
reader can tell whether a value describes the plants or the wall behind them.

## Placement rules (apply before recording)

| Rule                    | What it means in practice                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Representative height   | Probe sits at the height of the canopy the reading is meant to describe. Record the height, in cm.        |
| Shielded from radiation | Not in the direct beam of a fixture. Radiant gain reads as air temperature and is invisible in the data.  |
| Clear of local extremes | Not in the discharge of a dehumidifier, humidifier, heater, or fan; not in irrigation spray.              |
| Repeatable              | Position is fixed and described well enough that someone else could put the probe back in the same place. |
| Not the only point      | If the room has a gradient, one probe cannot describe it — see asset 4.                                   |

## Record

**Room / tent:** ............ **Date:** ............ **Recorded by:** ............
**Stage of crop:** ............ **Light state at time of record:** on / off / transition

| Field                                    | Probe A | Probe B | Probe C |
| ---------------------------------------- | ------- | ------- | ------- |
| Device make / model                      |         |         |         |
| Device identifier (serial or app name)   |         |         |         |
| Metric(s) reported                       |         |         |         |
| Position — row/column or written locator |         |         |         |
| Height above floor (cm)                  |         |         |         |
| Height relative to canopy top (cm, ±)    |         |         |         |
| Distance to nearest fixture (cm)         |         |         |         |
| In direct fixture beam? (y/n)            |         |         |         |
| Distance to nearest air outlet (cm)      |         |         |         |
| Shielding / housing used                 |         |         |         |
| Sample interval                          |         |         |         |
| Last verification date                   |         |         |         |
| Verification method                      |         |         |         |
| Source label it reports as               |         |         |         |

**Source label** must be one of the six canonical values — `live`, `manual`, `csv`, `demo`,
`stale`, `invalid`. Anything else is unverified provenance, not a seventh option.

## Placement change log

Append-only. A moved probe breaks comparability with every earlier reading; recording the
move is what preserves the history.

| Date | Probe | Old position | New position | Reason | Moved by |
| ---- | ----- | ------------ | ------------ | ------ | -------- |
|      |       |              |              |        |          |

## Completion check

- [ ] Every probe has a position a stranger could reproduce
- [ ] Every probe has a height relative to the canopy, not only to the floor
- [ ] No probe sits in a direct beam or an equipment discharge, or the exception is written down
- [ ] Every probe has a verification date, or is explicitly recorded as unverified
- [ ] Source label recorded for each, from the six canonical values

**Next observation:** re-check placement whenever the canopy height changes materially, when
equipment moves, and at every stage transition. **A probe at a fixed height becomes wrong as
the canopy grows past it.**
