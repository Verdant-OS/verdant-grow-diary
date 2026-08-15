# Asset 8 † — CO2 monitoring and escalation card

> ## ⚠ PENDING QUALIFIED-SAFETY APPROVAL — NOT CLEARED FOR OPERATIONAL USE
>
> This asset sits inside the **R3 `co2_safety`** boundary. Per `editorial-workflow.md`,
> `safety_review` runs **after** `drafted`, so this is drafted here and awaits a qualified
> reviewer. **Do not rely on it as a life-safety document until that lane clears it.** It is
> a draft of a monitoring and escalation record, not a substitute for a competent
> gas-safety assessment of your specific room.
>
> **Reviewer scope required:** compressed gas, worker exposure, ventilation, egress,
> jurisdiction. Per `content-standards.md`, cannabis cultivation experience does not
> substitute.
>
> **Known gap this reviewer must close:** the ACGIH short-term averaging period is
> **NOT VERIFIED** in this draft (claim C06 note). A concentration without an exposure window
> cannot define an alarm, so **the ACGIH row below must not be used until that period is
> supplied.**

**Revision** r1 · 2026-08-15 · **Risk** **R3** · **Claims** C06 · **Licence** repository

**Accessibility note.** Tables and prose, no image.

---

## Scope — deliberately narrow

**Monitoring, alarm, egress, escalation. That is all.** This card contains no enrichment
procedure, no setpoint, no injection-rate guidance, and no equipment specification. The
pillar states no enrichment range at all; if a page needs one it belongs on `KL-212` with its
own source and applicability bounds.

## Occupational limits — carry the authority AND the period with every number

Each authority defines its own averaging period. **The concentrations coincide at 5,000 ppm;
the periods do not.** Source: OSHA Annotated PELs, Table Z-1, CAS 124-38-9 (claim C06).

| Authority            | Long-term | Its averaging period                  | Short-term                           | Status                    |
| -------------------- | --------- | ------------------------------------- | ------------------------------------ | ------------------------- |
| **Federal OSHA PEL** | 5,000 ppm | 8-hour TWA                            | **none listed**                      | Enforceable federal limit |
| Cal/OSHA PEL         | 5,000 ppm | 8-hour TWA                            | 30,000 ppm (STEL, 15-min)            | Enforceable in California |
| NIOSH REL            | 5,000 ppm | up to a 10-hour workday, 40-hour week | 30,000 ppm (ST, 15-min)              | Recommendation, not law   |
| ACGIH TLV            | 5,000 ppm | 8-hour TWA                            | 30,000 ppm — **period NOT VERIFIED** | Consensus guideline       |

**Two errors this table exists to prevent**, both of which occurred in earlier drafts of this
material and were corrected in review:

1. **Do not attribute the 30,000 ppm short-term value to federal OSHA.** Federal OSHA lists
   no short-term limit for CO2.
2. **Do not read the four rows as one blended limit.** Which row applies to you depends on
   your jurisdiction and on whether you are bound by law or following guidance.

**The hazard is the failure mode, not the setpoint.** A stuck valve, a failed regulator, a
burner fault, or a blocked exhaust can carry a space past these limits regardless of what a
controller was asked for. That is why this card is about monitoring and egress.

## Monitor inventory

| Field                                         | Monitor 1 | Monitor 2 |
| --------------------------------------------- | --------- | --------- |
| Make / model                                  |           |           |
| Sensor type                                   |           |           |
| Measurement range                             |           |           |
| Stated accuracy                               |           |           |
| Last calibration date                         |           |           |
| Calibration method / by whom                  |           |           |
| Position (asset 1 locator) and height         |           |           |
| Alarm output type (audible / visual / remote) |           |           |
| Power source and behaviour on power loss      |           |           |
| Fail state if the sensor fails                |           |           |

**Height matters.** CO2 is denser than air; a monitor placed high may not represent the
breathing zone or a low-lying accumulation. Record the height and the reasoning, and have
the qualified reviewer confirm the placement.

## Alarm settings as configured

Fill in what your system is **actually set to**, then have the reviewer confirm each against
the applicable authority for your jurisdiction.

| Alarm level | Configured value | Averaging period | Which authority it references | Reviewer confirmed |
| ----------- | ---------------- | ---------------- | ----------------------------- | ------------------ |
| Warning     |                  |                  |                               | ☐                  |
| High        |                  |                  |                               | ☐                  |
| Evacuate    |                  |                  |                               | ☐                  |

**Every row needs a period.** A concentration alone cannot define an alarm.

## Egress and response

| Field                                                       | Value |
| ----------------------------------------------------------- | ----- |
| Primary exit route from the room                            |       |
| Secondary exit route                                        |       |
| Is any exit route through a lower-lying space?              |       |
| Ventilation: how the space is purged, and by whom           |       |
| Who is authorised to isolate the CO2 supply, and how        |       |
| Is the isolation point reachable without entering the room? |       |
| Lone-working policy for this room                           |       |
| Who is called, in order                                     |       |

## Response sequence

1. **Alarm sounds — leave.** Do not investigate, do not silence, do not re-enter to check a
   reading. The monitor is the instrument; you are not.
2. **Isolate the supply from outside the space** if that is possible where you are.
3. **Ventilate** per your documented method.
4. **Do not re-enter** until the monitor reads normal _and_ the person authorised to make
   that call has made it.
5. **Record the event** below, including for false alarms — a monitor that cries wolf is a
   maintenance finding.

## Event log

Append-only.

| Date / time | Peak reading | Duration above alarm | Who was in the room | Action taken | Root cause | Closed by |
| ----------- | ------------ | -------------------- | ------------------- | ------------ | ---------- | --------- |
|             |              |                      |                     |              |            |           |

## Escalation boundary — where this pillar stops

Route to a **qualified professional** for: any compressed-gas installation or modification;
any burner or combustion-based generation; ventilation design; alarm-system commissioning;
electrical supply; and any jurisdiction or compliance question. Verdant does not adjudicate
these and does not control equipment.

## Zero product CTA

`content-standards.md` requires urgent CO2 safety content to carry **no product call to
action**. This card has none, and must not acquire one.
