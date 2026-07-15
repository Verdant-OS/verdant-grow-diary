---
name: photo-capture-assistant
description: After the grower logs a symptom, observation, or AI Doctor diagnosis, this skill reads what photos already exist for that plant/timeframe and tells the grower exactly which additional angles, close-ups, and reference shots to capture so the evidence is diagnosable. Use when the grower asks "what photos should I take?", "what am I missing?", after any symptom-tagged observation, or after an AI Doctor session returned low/medium confidence citing missing visual evidence.
---

# Photo Capture Assistant

Cautious, grower-decides checklist that closes the visual-evidence gap after a symptom log or diagnosis. Never captures, uploads, or writes on the grower's behalf. Never invents a diagnosis. Only tells the grower *which shots would raise confidence and why*.

## When to activate

- Immediately after a Quick Log observation tagged with a symptom keyword (yellowing, spotting, wilting, curl, burn, deficiency, pest, mold, stretch, etc.).
- After an AI Doctor session returns `confidence: low | medium` and lists `missing_info` that includes visual evidence.
- When the grower asks: "what photos should I take?", "what am I missing?", "how do I document this properly?".
- Manually via `/` in chat.

Do **not** activate for routine progress-photo logs where no symptom or diagnosis is present — the grower's regular photo cadence is not this skill's job.

## Inputs (read-only)

1. **Trigger record** — the diary observation (`observation_events`) or AI Doctor session (`ai_doctor_sessions`) that fired this skill. Use its `symptom_tags`, `body`, and (for AI Doctor) `likely_issue`, `evidence`, `missing_info`.
2. **Recent photos for the plant** — `photo_events` in the last 7 days (or since the trigger, whichever is shorter). Read: `taken_at`, `angle` / `shot_type` if present, `plant_id`, `tent_id`, `notes`.
3. **Plant record** — stage, age, cultivar, medium, pot size (for context-specific shot advice).
4. **Latest sensor snapshot** — six-label provenance respected. Used only to note whether a reference shot of the sensor display / environment is worth capturing (e.g. if the reading is `manual` or `stale`).
5. **Grow targets** — only to phrase "photograph the reading next to the target band" prompts.

Anything missing = **missing_info**, surfaced to the grower — never guessed.

## The symptom → shot-list map (deterministic)

For every activation, the skill produces a **prioritized shot list**. Each shot is chosen from a fixed catalog keyed by the trigger's symptom family. The skill never asks for a shot the grower already has (matched by `angle`/`shot_type` within the trigger window).

Baseline shots (recommended for *any* symptom log if not already present in the window):

- **Whole plant, front, natural light** — for scale and overall posture.
- **Whole plant, side profile** — for stretch, lean, canopy shape.
- **Top-down canopy** — for coverage and new-growth vigor.
- **Affected area, medium distance** — shows the symptom in context of its branch/leaf cluster.
- **Affected area, macro close-up (in focus, no flash glare)** — the diagnostic shot.
- **Underside of an affected leaf** — for pests, mildew, veinal patterns.
- **Reference: room/tent lights OFF, white-light photo** — color-true reference so leaf color is not misread as light-cast.

Symptom-specific add-ons (only appended when the trigger matches):

| Symptom family | Additional shots |
|---|---|
| Yellowing / chlorosis | New growth vs old growth side-by-side; petiole close-up; whole-plant to show top-vs-bottom distribution |
| Spotting / lesions | Adaxial (top) and abaxial (underside) of the same leaf; edge vs interior of the spot |
| Curl / taco / claw | Leaf tip, midrib, and petiole; whole-canopy to show how many leaves affected |
| Burn (tip / edge) | Tip close-up; runoff container if last watering was a feed; feed bottle label if brand/EC not yet logged |
| Wilting / droop | Time-stamped shots morning + evening; medium surface; lift-check pot shot if grower can |
| Pest suspicion | Underside of leaf; stem nodes; top of medium; any webbing under angled light |
| Mold / mildew (WPM, botrytis) | Bud interior if flower stage; underside of leaf; base of stem; ambient RH reading in frame |
| Deficiency (general) | New vs old growth comparison; whole plant for pattern (mobile vs immobile nutrient hint) |
| Stretch / light stress | Side profile with a ruler or known-height object; light-to-canopy distance shot |
| Root issues suspected | If pot can be lifted: root ball; runoff clarity; medium surface |
| Trichome / harvest readiness | Macro of trichomes on a mid-canopy bud; pistil close-up; whole-cola shot for context — defers to `harvest-readiness-assistant` for interpretation |

If the trigger is an AI Doctor session, also add shots that directly address each item in `missing_info` (e.g. "AI Doctor asked for an underside-of-leaf shot — not yet captured this week").

## Output contract

Return exactly this structure:

1. **Context line** — "Following your [observation | AI Doctor session] on [plant] at [time], here's what would strengthen the evidence."
2. **Already captured this window** — short list of shot types the grower already logged (so they see credit given, not busywork).
3. **Recommended shots — priority order**, each item with:
   - **Shot** — short label from the catalog above.
   - **Why** — one sentence tied to the trigger's symptom or the missing_info item.
   - **How to frame it** — 1–2 practical tips (distance, angle, lighting).
   - **Priority** — `must-have | helpful | optional`. `must-have` = required to raise a low-confidence diagnosis; `helpful` = disambiguates likely causes; `optional` = nice-to-have for the log.
4. **Lighting & handling notes** — always include: neutral white light preferred, no flash glare on waxy leaves, steady hands or brace against a pole, include a scale reference (finger, coin, ruler) for macro shots.
5. **What not to do** — don't overwater to "clean up" the medium for the shot; don't defoliate the affected leaves; don't move the plant into direct sun just for the photo; don't rely on a single blurry macro.
6. **How to log them** — remind the grower to attach the new photos to the same observation / AI Doctor session so the evidence chain is preserved. Do not open a new observation for the grower.
7. **Confidence lift estimate** — a plain sentence: "Capturing the must-have shots would move this from *low* toward *medium* confidence. It won't guarantee a diagnosis." No numeric percentages, no false precision.

Cap the recommended-shots list at **7 items**. If more are eligible, keep the highest-priority 7 and note the remainder as "additional optional shots available".

## Hard rules

- **Read-only.** No writes to `photo_events`, `observation_events`, `ai_doctor_sessions`, or any other table. No `functions.invoke`. No Action Queue inserts. No AI model calls.
- **No camera control, no auto-upload, no device commands.** Ever.
- **Never diagnose.** This skill lists shots and reasons. It never says "you have calcium deficiency" — that's AI Doctor's job, and only with sufficient evidence.
- **Never contradict a higher-confidence AI Doctor diagnosis** without citing exactly why (e.g. "AI Doctor's diagnosis was medium confidence; adding underside-of-leaf shots could confirm or rule out mite pressure").
- **Provenance honesty.** If the trigger cites a `demo | stale | invalid` sensor reading, do not treat it as evidence — recommend a fresh reading + a photo of the sensor display if relevant.
- **Grower privacy.** Never surface another grower's photos or plants. RLS-scoped reads only. No IDs in URLs or logs.
- **No urgency copy, no shame.** "Here's what would help" — never "you should have done this already".
- **Idempotent.** Re-running on the same trigger with the same photo set returns the same list in the same order.
- **Deduplicate against existing shots.** If a `macro close-up` was logged 20 minutes ago in the same observation, don't ask for it again — offer a re-shoot only if the grower flagged the previous as blurry.

## Non-goals

- Not a camera / capture pipeline.
- Not a photo-quality analyzer (no blur/exposure scoring).
- Not a diagnosis engine (AI Doctor).
- Not a harvest-readiness call (that's `harvest-readiness-assistant`, which this skill defers to for trichome/pistil interpretation).
- Not a scheduler — the grower opens this skill; it does not push notifications.
