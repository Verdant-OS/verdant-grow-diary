---
name: environment-check
description: When the grower logs an action (feeding, watering, defoliation, transplant, training, observation) in Verdant, flag missing sensor context (temp, humidity, VPD, CO2, soil moisture, pH/EC where relevant) and suggest exactly what to capture next. Use for QuickLog reviews, "what am I missing?" questions, or post-log context audits. Read-only, evidence-only, no auto-writes.
---

# Environment Check

Audits a just-logged (or about-to-be-logged) diary action for missing sensor context and returns a tight "capture next" list. Positioning: **context sufficiency**, not diagnosis. Pairs with AI Doctor readiness — the more complete the context, the more trustworthy any later AI call becomes.

## When to trigger

- After a QuickLog save: "did I capture enough?"
- User asks "what am I missing?" / "is this log complete?" / "why is AI Doctor low-confidence?"
- Reviewing a specific `diary_entries` row.
- Pre-check before invoking `ai-doctor-review` or `ai-coach`.

## Data sources (read-only)

All logic in `src/lib/*`. Never interpret raw `details` jsonb in `.tsx`.

1. Diary row → `src/lib/diaryEntryRules.ts` (`normalizeDiaryEntry`) to classify action type.
2. Latest sensor snapshot → `get_latest_sensor_snapshot` MCP tool or `src/lib/sensor/*` helpers.
3. AI context sufficiency rules → `src/lib/aiContextSufficiencyRules.ts` (source of truth for "healthy" context).
4. Grow/plant context → `grows`, `plants`, `tents`, `grow_targets` (stage, medium, tent).

## Required-context matrix (by action type)

Deterministic. Encode in a pure helper (`src/lib/environmentCheckRules.ts`) — do not scatter across UI.

| Action                | Required                                          | Recommended                        |
|-----------------------|---------------------------------------------------|------------------------------------|
| Feeding               | pH in, EC in, volume                              | runoff pH, runoff EC, water temp, tent temp+RH |
| Watering (plain)      | volume                                            | runoff pH/EC, tent temp+RH, soil moisture before/after |
| Defoliation / training| photo, stage                                      | tent temp+RH, VPD, days since last stress event |
| Transplant            | photo, medium, pot size                           | tent temp+RH, VPD, root health note |
| Observation / issue   | photo, note                                       | tent temp+RH, VPD, CO2 (if enrichment), affected-leaf location |
| Environment tweak     | what changed (setpoint, fan, light)               | tent temp+RH before/after, VPD, timestamp |

Sensor freshness rule: a tent reading counts only if `quality === "ok"` AND `source ∈ {live, manual}` AND captured within the last **30 min** of the logged action. Otherwise treat as **missing**. Never count `demo | sim | stale | invalid`.

## Output contract

```
Context check — {actionType} — {plant or tent} — {relative time}

Captured (✓):
- pH in 6.2
- EC in 1.4 mS/cm
- Volume 500 ml
- Tent temp 24.1°C (source: live, 4 min ago, quality: ok)

Missing (required):
- Runoff pH — not logged
- Runoff EC — not logged

Missing (recommended):
- Water temperature
- Tent humidity (last reading: stale, 3h ago)

Capture next (in order):
1. Runoff pH + EC within the next 10 min of this feed
2. Water temp on the next feed
3. Re-check tent humidity sensor — last fresh reading >3h ago

Context sufficiency: incomplete | partial | sufficient
Impact on AI Doctor confidence: would upgrade from {low → medium} if runoff pH+EC captured.

Nothing written. This is a suggestion, not an approved action.
```

## Rules (non-negotiable)

- **Read-only.** Never write to `diary_entries`, `feeding_events`, `action_queue`, `alerts`, or any table. Never call device control.
- **Never** treat `demo | sim | stale | invalid` sensor data, or any reading with `quality !== "ok"`, as captured context. Flag it as missing.
- **Never** invent a value the grower didn't log.
- **Never** auto-create an Action Queue item to "capture the missing data" — always a suggestion for the grower.
- **Never** upgrade context sufficiency past what `aiContextSufficiencyRules.ts` actually returns; this skill surfaces gaps, it does not override the sufficiency engine.
- Freshness window is **30 min** unless `grow_targets` or stage rules specify otherwise; encode the constant in the helper.
- Deterministic ordering: (1) required missing, (2) stale/invalid readings, (3) recommended missing. No randomness.
- All logic in `src/lib/environmentCheckRules.ts` (pure, typed, null-safe). Presenters render only. Add tests for: each action type, empty snapshot, stale snapshot, mixed sources, malformed `details`, and no `grow_targets`.
- Respect existing warnings from `feedingHistoryRules` / `diaryEntryRules` — surface them, don't hide them.

## What NOT to do

- Do not diagnose (that's AI Doctor's job with full context).
- Do not recommend nutrient/irrigation changes from this skill.
- Do not silently promote stale readings to "fresh".
- Do not gate the QuickLog Save button on missing context — advisory only, matching QuickLog preview validation policy.
- Do not modify the `diary_entries.details` jsonb shape or add new required columns.
