---
name: nutrient-schedule-assistant
description: Turn Verdant diary entries (feeding, watering, pH/EC/TDS, runoff) into a weekly feeding log summary and next-step reminders. Use when the user asks to review their feeding schedule, build a weekly nutrient log, spot chart-adherence drift (e.g. "am I following Fox Farm correctly?"), or generate the next feeding reminder from recent diary data.
---

# Nutrient Schedule Assistant

Helps the grower convert existing Verdant diary data into (1) a **weekly feeding log** and (2) **next-step reminders** — without inventing a schedule or auto-writing to the Action Queue. Positioning: chart-adherence + evaluation, not chart-authoring. Growers already follow a brand chart (Fox Farm, GH Flora, Jack's 321, Canna Coco); this skill tells them whether *their plant* is actually responding to it.

## When to trigger

- "Summarize my feeding this week / last 7 days."
- "Am I following [Fox Farm / Jack's / GH] correctly?"
- "What should I feed next?" / "When's my next feeding?"
- "Build a weekly nutrient log for grow X."
- "Is my EC/pH trending in the right direction?"

## Data sources (read-only)

All logic sits in `src/lib/*`. Never interpret `diary_entries.details` raw JSON in `.tsx`.

1. `diary_entries` (via `src/lib/diaryEntryRules.ts` → `normalizeDiaryEntry` / `normalizeDiaryEntries`).
2. Feeding view model: `src/lib/feedingHistoryRules.ts` → `buildFeedingHistory` (already exposes `volumeMl`, `ph`, `ec`, `tds`, `runoffPh`, `runoffEc`, `runoffTds`, `recipe`, `nutrients[]`, `warnings[]`, `occurredAt`).
3. Grow context: `grows`, `plants`, `grow_targets` (stage, medium, target pH/EC bands).
4. Optional sensor snapshot: `get_latest_sensor_snapshot` MCP tool — treat any reading whose `quality !== "ok"` or `source === "sim"` as **not** live.

## Output contract (weekly feeding log)

Produce a deterministic markdown block. No random tips, no bro-science.

```
Weekly feeding log — {growName} — {ISO week range}

Feedings: N   |   Waterings (no nutes): M   |   Skipped days: K
Avg input pH: X.XX (target Y.YY–Z.ZZ)   drift: ok | high | low
Avg input EC: X.XX mS/cm (target ...)   drift: ok | high | low
Avg runoff pH: ...                      drift: ok | high | low
Avg runoff EC: ...                      drift: ok | high | low

Timeline:
- {date} — {volumeMl} ml @ pH {ph} EC {ec} | runoff pH {rPh} EC {rEc} | {recipe or nutrients summary} | ⚠ {warnings joined}
- ...

Observations (evidence-only, no diagnosis):
- Runoff EC climbing 3 feedings in a row → possible salt buildup; consider a plain-water or reduced-EC feed and re-measure. (do NOT auto-execute)
- Input pH consistently below target band → check pen calibration and adjust up.
- Missing runoff data on {n} of {m} feeds → log runoff pH/EC next time for better signal.

Missing information:
- {list what would sharpen the answer — e.g. no runoff, no water temp, stage unknown}
```

## Output contract (next-step reminder)

```
Next feeding suggestion — {plantName or growName}

Based on: last feed {relative time}, avg interval {N.N days}, current stage {stage}.

Suggested next check: {date/time window}, e.g. "tomorrow AM before lights-on".
What to log: pH in, EC in, volume, runoff pH, runoff EC, water temp.

Confidence: low | medium | high
Why: {1–2 lines pointing at evidence: interval regularity, runoff trend, stage}.

This is a reminder, not an approved action. Nothing is written to the Action Queue.
```

## Rules (non-negotiable)

- **Never** write to `action_queue`, `alerts`, `feeding_events`, `diary_entries`, or any table. Read-only.
- **Never** call device control or "execute" anything.
- **Never** invent a nutrient schedule the grower didn't provide. Chart-adherence only.
- **Never** treat `demo | stale | invalid | sim` data, or sensor readings with `quality !== "ok"`, as healthy/current.
- **Never** claim certainty from one feeding or one runoff sample. Require ≥3 comparable data points before calling something a "trend"; otherwise say "not enough data".
- If `grow_targets` band is missing, report the observed value and say "no target band on file" — do not guess the band.
- Confidence ladder: `low` (<3 comparable feeds OR missing runoff), `medium` (3–5 feeds with runoff), `high` (≥6 feeds with runoff and stable interval).
- All summarization logic belongs in `src/lib/*` pure helpers (e.g. `nutrientScheduleSummaryRules.ts`, `nextFeedingReminderRules.ts`) — presenters render only. Add tests for happy path, empty diary, malformed `details`, missing runoff, and single-entry (low-confidence) cases.
- Respect existing warnings from `feedingHistoryRules` — do not suppress them.

## What NOT to do

- Do not recommend nutrient brand switches.
- Do not recommend aggressive flush/reset from weak evidence.
- Do not translate a reminder into an Action Queue item automatically.
- Do not fabricate missing runoff/EC/pH values.
- Do not rewrite `diary_entries.details` shape.
