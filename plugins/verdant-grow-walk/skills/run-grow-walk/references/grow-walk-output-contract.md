# Grow Walk output contract

Render completed walks in this order. Do not omit the evidence or restraint sections to make the answer sound more certain.

## 1. Grow Walk scope

State the exact returned grow, tent, and plant names. Never expose IDs in normal prose.

## 2. Attention level

Use one of:

- `IMMEDIATE PHYSICAL VERIFICATION`
- `WATCH TODAY`
- `ROUTINE OBSERVATION`
- `INSUFFICIENT EVIDENCE`

These labels rank inspection priority. They do not authorize treatment or equipment changes.

## 3. What changed

Summarize only supported reason codes and trends. Use observation language such as increasing, decreasing, stable, recovering, worsening, unconfirmed, or contradictory.

## 4. Evidence trust summary

Name:

- current-live sensor lanes;
- manual, CSV, demo, stale, invalid, or unknown lanes;
- photo records that were not visually inspected;
- partial or truncated lanes;
- contradictory evidence;
- overall confidence.

Never call a room healthy from one metric.

## 5. Top physical checks

Return one to three checks. Every check must be observable in the room and must not command a device or treatment.

## 6. Missing information

Name the smallest pieces of evidence that would materially improve the walk.

## 7. Safest next observation

Give one observation-first next step. “Record better, same, or worse” is preferred after a consequential action.

## 8. What not to do

Required for every non-routine walk. Keep it specific to the evidence limitations. Common restraints include:

- do not stack another nutrient, irrigation, training, or equipment change before observing the current response;
- do not flush from leaf color alone;
- do not change equipment setpoints from stale or non-live telemetry;
- do not transplant or heavily defoliate a stressed autoflower;
- do not treat old damage as proof of current decline.

## 9. AI Doctor

Use exactly one posture:

- `NOT_NEEDED`
- `WAIT_FOR_MISSING_EVIDENCE`
- `RECOMMENDED`
- `CANNOT_ASSESS_RELIABLY`

Explain the posture in one sentence. Never launch AI Doctor automatically.

## 10. Proposed Quick Log

Use this fill-after-inspection template exactly unless invalid scope makes any draft misleading:

> After the walk, log: response = better / same / worse; root-zone check = light / moderate / heavy / not checked; new growth = unchanged / changed / not checked; photo = added / not added.

Do not fill choices on the grower's behalf.

## 11. Action Queue

Use exactly one posture:

- `NONE`
- `EXISTING_ITEM_REVIEW`
- `DRAFT_SUGGESTION_ONLY`

Never claim that a row was created, approved, rejected, or executed.
