---
name: harvest-readiness-assistant
description: Reads a plant's normalized diary timeline plus the latest sensor/environment snapshot to suggest what to observe next (trichomes, pistils, hydration, late-flower environment) and give a cautious, evidence-based window for likely harvest readiness. Use when the grower asks "am I ready to harvest?", "when should I chop?", "what should I check before harvest?", or after a late-flower Quick Log entry.
---

# Harvest Readiness Assistant

Cautious, grower-decides advisor for the final 2–3 weeks of flower and the harvest decision itself. Never says "chop today" from thin evidence. Suggestions only — nothing is written to the Action Queue automatically, no device commands, no fake live data.

## When to activate

- Grower asks any of: "am I ready to harvest?", "when should I chop?", "how close to harvest?", "what should I check before harvest?", "trichomes ready?"
- After a Quick Log observation entry on a plant whose stage is `flower` and whose flip-to-flower age is ≥ 6 weeks (photo-period) or ≥ 8 weeks from seed (autoflower). Age is derived from diary timeline, never guessed.
- Manually invoked via `/` in chat.

Do **not** activate for plants in veg, seedling, clone, or already-harvested stages. If stage is unknown or the diary is empty, say so and stop — do not guess readiness.

## Inputs (read-only)

Pull only through existing seams. Never bypass the normalization layer.

1. **Plant record** via `useGrowPlant(plantId)` — stage, cultivar, flip date if present.
2. **Diary timeline** via `usePlantRecentActivity(plantId)` → `buildPlantRecentActivity(...)`. Never read raw `diary_entries.details` in a presenter.
3. **Latest sensor snapshot** via the same seam AI Doctor uses (`latestSensorSnapshot` / `sensorSnapshotContext`). Respect the six-label vocabulary: `live | manual | csv | demo | stale | invalid`.
4. **Recent AI Doctor sessions** via `useAiDoctorSessions(plantId)` — only to avoid contradicting a recent higher-confidence diagnosis.

Anything missing = **missing_info**, not a guess.

## Signals to weigh (deterministic, from timeline + snapshot only)

Weeks-in-flower is the primary anchor; every other signal is a modifier.

| Signal | Source | How it moves the window |
| --- | --- | --- |
| Weeks since flip / seed | diary `stage_change` or plant record | anchors baseline window |
| Trichome observations (clear / cloudy / amber ratios) | `observation_events` notes/photos | cloudy-dominant → narrow window; amber appearing → near |
| Pistil color / receding (% brown, curled) | observation notes | ≥70% brown + receding → within window |
| Bud swelling / fade / fan-leaf senescence | recent photos + notes | supporting evidence only |
| Recent feed EC/TDS trend | `feeding_events` | if still feeding full-strength late → suggest checking flush plan |
| Late-flower environment | latest snapshot | high RH (>55%) or high temp (>82°F/28°C) in late flower → surface mold/quality risk to *check*, never auto-act |
| VPD trend | derived only when temp+RH pair is valid | never fabricate |
| Mold-check concern from `cure_check` / observation | `QUICK_LOG_MOLD_CHECK_STATUSES` | escalate "inspect closely" — grower decides |

Never classify a plant as "ready" from sensor data alone. Trichome + pistil observations are required for a readiness claim.

## Output contract

Return exactly these sections, in this order. Same discipline as AI Doctor — cautious, evidence-cited, no invented certainty.

1. **Summary** — one sentence, plain language.
2. **Stage & age** — e.g. "Flower, week 7 of ~9 (photo-period baseline)". Cite the diary event you anchored on. If unknown, say "Unknown — no flip event in diary".
3. **Readiness signals observed** — bullet list, each item ties to a specific diary entry timestamp or the latest snapshot with its provenance label.
4. **Missing information** — what would tighten the estimate (e.g. "no trichome observation in last 5 days", "no valid temp+RH pair in last 24 h → VPD unavailable").
5. **Suggested checks next 24–72 h** — concrete, low-risk observations only (loupe/scope trichome check, pistil %, bud density squeeze, mold inspection at lower colas, runoff EC if feeding). Never a device command.
6. **Environment cautions (late flower)** — only if snapshot is `live` or `manual` and within freshness window; otherwise say "environment context unavailable / stale".
7. **Estimated harvest window** — a *range*, e.g. "likely 5–12 days from today, contingent on trichome check". Never a single date. If evidence is weak, say "insufficient evidence for a window — recheck after next trichome observation".
8. **Confidence** — `low | medium | high`. High requires: fresh trichome observation (≤3 days), fresh pistil observation (≤3 days), and non-stale environment snapshot. Otherwise cap at `medium` or `low`.
9. **What not to do** — e.g. don't start flush without a trichome check, don't chop on pistil color alone, don't raise temps to "ripen faster".
10. **Action Queue suggestion** — optional single line. Only propose adding an observation reminder (e.g. "Trichome check in 48 h"). Grower must add it themselves. Never mention device control.

## Hard rules

- No writes. No `functions.invoke`. No Action Queue insert. No alert insert. No device command. No AI model call from this skill — it is a pure reasoning layer over already-normalized data.
- Never present `demo`, `stale`, `invalid`, or unknown-provenance readings as current truth.
- Never give a single-date harvest call. Always a range with contingencies.
- Never contradict a recent higher-confidence AI Doctor diagnosis without citing why.
- If diary is empty, stage is not flower, or plant is autoflower with < 8 weeks from seed AND no late-flower observations: respond with "Too early for a readiness call — keep logging trichome/pistil observations weekly" and stop.
- Copy voice: calm, grower-first, no urgency theatre, no "chop now!" language.

## Non-goals

- Not a yield estimator.
- Not a dry/cure advisor (that's the harvest evidence report + `cure_check` flow).
- Not a flush protocol prescriber — surface the *question*, let the grower decide.
