# One-Tent Evidence Chain — Demo Script v1

**Audience:** internal demos, partner calls, founder-led sales.
**Length:** 2–3 minutes spoken.
**Tagline:** *Plant memory. Sensor truth. Better decisions.*

---

## 1. Demo Objective

This demo shows how Verdant keeps a grow event traceable from source-labeled
sensor data through alert review, grower-approved action review, and post-grow
learning. The point is not to impress with automation — the point is to prove
that every decision in Verdant is anchored to evidence the grower can see.

> Verdant does not pretend to grow the plant for you. It helps you remember
> what happened, what the sensors said, and what you decided to do about it.

---

## How to run this demo

Target length: 2–3 minutes.

1. 0:00–0:20 — Open Sensors and point out the source label.
2. 0:20–0:45 — Open the environment alert created from that metric.
3. 0:45–1:10 — Show the AlertDetail evidence badge or honest fallback.
4. 1:10–1:35 — Add the alert to the approval-required Action Queue.
5. 1:35–2:00 — Open ActionDetail and show that evidence follows the action.
6. 2:00–2:30 — Open the Post-Grow Learning Report and show reviewed alerts/actions.
7. 2:30–3:00 — Close with: "Plant memory. Sensor truth. Better decisions."

If a badge is missing, say Verdant does not fake missing provenance.

Do not describe Verdant as hands-off, do not imply it operates equipment on
the grower's behalf, and do not promise specific yield outcomes.

---

## 2. Setup Checklist

Before starting the demo, make sure the following exist in the demo account:

- One **grow**.
- One **tent** under that grow.
- One **plant** in that tent.
- At least one **sensor reading** row that includes:
  - `id`
  - `metric` (e.g. `vpd`, `temp`, `humidity`)
  - `value`
  - `source` (`live | manual | csv | demo | stale | invalid`)
  - `ts` / `captured_at`
  - `tent_id`
- One **environment alert** created from that reading/metric, carrying a
  persisted `originating_timeline_events` ref where applicable.
- One **Action Queue** item created from that alert (status: pending review).
- One **Post-Grow Learning Report** available for the grow.

### Safety setup

- Source labels must be clearly visible everywhere a reading is shown.
- Demo / CSV / manual / live readings must not be mixed under one label.
- No device control is wired into the demo account.
- No automatic action execution is wired into the demo account.
- No fabricated "live" readings. If the reading is CSV history, it stays CSV.

---

## 3. Demo Path

### Step 1 — Show sensor truth

1. Open **Sensors**.
2. Show the source label on a reading.
3. Say:
   > "Verdant does not pretend all data is live. CSV, manual, demo, stale,
   > invalid, and live readings stay labeled. The grower always knows which
   > kind of evidence they are looking at."

### Step 2 — Show environment alert

1. Open **Alerts**.
2. Select the prepared environment alert.
3. Show the alert context (metric, threshold, captured-at, source).
4. Say:
   > "This alert came from a known sensor reading. Verdant preserves the
   > evidence reference instead of forcing the grower to remember what
   > caused it."

### Step 3 — Show AlertDetail evidence badge

1. Point to the `EvidenceLinkageBadges` on AlertDetail.
2. Say:
   > "This badge is not inferred from timestamps or prose. It is linked from
   > the exact persisted evidence ref. If a safe ref is not available,
   > Verdant shows an honest fallback instead of guessing."

### Step 4 — Add to Action Queue

1. Use the existing **Add to Action Queue** control on the alert.
2. Confirm the new Action Queue row is created in a pending / approval-required
   state.
3. Say:
   > "Verdant suggests a reviewable next step, but it does not execute
   > anything. The grower stays in control."

### Step 5 — Show ActionDetail evidence badge

1. Open the newly created Action Queue item.
2. Show that the same evidence ref is carried forward to ActionDetail.
3. Say:
   > "The evidence follows the action, so the grower can review why this
   > action was suggested before approving anything."

### Step 6 — Show Post-Grow Learning Report

1. Open the **Post-Grow Learning Report** for the grow.
2. Walk through:
   - what changed
   - what was logged
   - alerts reviewed
   - actions reviewed
   - repeat / avoid next run
3. Use **Print / Save PDF** to demonstrate the export.
4. Say:
   > "At the end of the run, Verdant turns the grow history into a learning
   > report. The grower keeps the evidence even after the plants are gone."

### Step 7 — Close with value proposition

> "Free helps you log the grow. Pro helps you preserve, analyze, and learn
> from the grow."

---

## 4. Talk Track (2–3 minutes)

> Most grow apps either feel like a notebook or pretend to be a robot.
> Verdant is neither. Verdant is plant memory, sensor truth, and cautious
> decisions.
>
> When a sensor reading comes in, we label its source. Live, CSV, manual,
> demo, stale, invalid — the grower always sees what kind of data they are
> looking at.
>
> When an environment alert fires, we keep a reference to the reading that
> caused it. The AlertDetail page shows that link as a badge — not a guess,
> not a timestamp match, an actual persisted reference.
>
> If the grower decides to act, they add the alert to the Action Queue. The
> Action Queue is approval-required. Verdant does not push buttons on
> equipment. The grower reviews, approves, and chooses what to do.
>
> When the grow is finished, the Post-Grow Learning Report turns everything
> that happened into something the grower can use next run — what worked,
> what to repeat, what to avoid. They can print or save a PDF and keep it.
>
> Free helps you log the grow. Pro helps you preserve, analyze, and learn
> from the grow.

Tone notes:

- Plain language. No hype.
- Do not claim Verdant grows the plant for the user.
- Do not promise yield outcomes.
- Do not claim hands-off operation. See the Do-Not-Say List below for the exact banned phrases.
- Emphasize evidence, source labels, cautious decisions, grower approval.

---

## 5. Failure / Fallback Notes

If something in the demo is not in an ideal state, do not paper over it.
Use these honest framings:

- **Evidence badge shows fallback copy:**
  > "This row was created before evidence refs were persisted, or no safe
  > evidence ref was available. Verdant does not fabricate missing
  > provenance."
- **CSV import is being used:**
  > "This reading is CSV-labeled and will not be presented as live
  > telemetry."
- **Report section is empty:**
  > "Missing data is treated as missing. Verdant will not call an empty
  > section healthy."

---

## 6. Do-Not-Say List

The phrases below must not appear in the spoken demo or in any supporting
slide / handout for this script. They overclaim what Verdant does and break
the trust the rest of the product is designed to earn.

<!-- DEMO-SCRIPT-DO-NOT-SAY:BEGIN -->
- "AI grows for you"
- "guaranteed yield"
- "fully automated"
- "controls your grow"
- "automatically executes"
- "diagnosed with certainty"
- "fake live"
- "set fan"
- "set light"
- "set irrigation"
- "dose nutrients"
<!-- DEMO-SCRIPT-DO-NOT-SAY:END -->

If a viewer asks about any of these, redirect to what Verdant actually does:
labeled evidence, approval-required actions, and grower-owned decisions.

---

## 7. Success Criteria

The demo passes if all of the following are true:

- Source labels are visible on sensor readings.
- AlertDetail shows an evidence badge, or an honest provenance-aware fallback.
- The Action Queue item created from the alert is approval-required.
- ActionDetail carries the evidence ref forward when one exists.
- The Post-Grow Learning Report shows reviewed alerts and reviewed actions.
- Print / Save PDF export of the report works.
- No fake-live or automation copy appears anywhere in the flow.

If any criterion fails, stop the demo, name what is missing, and reschedule
rather than improvising around the gap.
