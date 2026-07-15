---
name: weekly-grow-report
description: Compiles the grower's last 7 days of diary actions (waterings, feedings, observations, photos, training, alerts, AI Doctor sessions) plus environment/sensor snapshots into a printable dashboard-style weekly summary with key charts (VPD/temp/RH trends, feed EC/pH, watering volume, event timeline), week-over-week comparison charts against the prior 7 days, and a next-week focus areas section. Use when the grower asks "generate my weekly report", "weekly summary", "how did this week go?", "compare this week to last week", "week over week", "print my grow log for the week", or "what should I focus on next week?".
---

# Weekly Grow Report

Read-only compiler that turns the last 7 days of a grower's diary + sensor context into a printable, dashboard-style weekly summary. Never invents data. Never auto-acts. Never sends device commands.

## When to activate

- "Generate my weekly report", "weekly summary", "print this week's log", "how did this week go?", "next-week focus".
- After a Sunday-night wrap-up or before a scheduled tent walk-through.
- Manually via `/` in chat.

Scope defaults to the grower's **active grow** (single tent for Free tier; grower picks tent for Pro/Founder). Never crosses grower boundaries; RLS-scoped reads only.

## Time window

- Default window: **rolling last 7 days**, ending at "now" in the grower's local timezone.
- Grower may override: "last week" (Mon–Sun of the previous ISO week), "last 14 days", or a specific date range.
- The window's start/end timestamps are printed at the top of the report so the reader can verify.

## Inputs (read-only, existing seams only)

1. **Diary timeline** via `growDiaryTimelineRules` — normalized events across `watering_events`, `feeding_events`, `observation_events`, `photo_events`, `training_events`, `environment_events`, `grow_events`, `alerts` / `alert_events`, `ai_doctor_sessions`.
2. **Grow / tent / plant** records for names and stage/age.
3. **Sensor snapshots** classified via `sensorSnapshot.ts` and labeled with the six-label provenance (`live | manual | csv | demo | stale | invalid`).
4. **Grow targets** (`grow_targets`, `vpd_targets`) — for target bands only, never to fabricate a reading.
5. **Action Queue** — count of pending/approved/dismissed items in the window (read via existing hook; never write).

Anything missing = surfaced explicitly in a **Missing this week** section — never guessed.

## Report structure (printable)

Sections in exactly this order:

### 1. Header
- Grow name, tent name, plant count, stage/age (weeks in veg/flower).
- Window start → end in grower's local timezone.
- Generated-at timestamp.

### 2. At-a-glance stats
Small stat tiles, each with its source count:
- Waterings (count, total ml)
- Feedings (count, avg EC/TDS, avg pH)
- Observations
- Photos
- Training events
- AI Doctor sessions
- Alerts triggered / resolved
- Action Queue items: pending / approved / dismissed
Each tile shows "—" (not zero) if no source data exists.

### 3. Charts (printable, deterministic)
Render as static SVG/canvas suitable for print (no interactive tooltips required). Every chart caption cites data provenance:

- **Environment trend** — temp + RH lines over the 7 days, with target band shaded. Points colored by provenance label; `stale/demo/invalid` points rendered dashed/greyed with a legend note.
- **VPD trend** — computed from same environment series; target band shaded.
- **Feed EC & pH** — bar or dot plot per feeding event, target band shaded, unit labels explicit (`mS/cm`, `pH`).
- **Watering volume** — daily total ml, plus a marker showing whether runoff was captured.
- **Event timeline** — horizontal timeline row per day, colored dots per event type; alerts and AI Doctor sessions marked distinctly.

If a chart has zero eligible data points, render an honest empty state ("No feeding events logged in this window") — never a fake baseline.

### 4. Week-over-week comparison
Side-by-side visual + numeric diff of **this week** vs the **immediately prior 7-day window** of equal length, ending exactly where this week begins. Purpose: show how the environment and inputs *changed*, not whether they're "good".

Rendered as a **compare strip** above each of these existing charts (env trend, VPD, feed EC & pH, watering volume) plus a small **stat-delta table**:

- **Overlaid dual-series line** for env trend + VPD — this week solid, last week dashed and de-emphasized, same target band shaded. Same y-axis scale so eyeballing is honest.
- **Grouped bars** for feed EC & pH and daily watering ml — this week vs last week per weekday (Mon..Sun), same y-axis.
- **Delta table** with one row per metric:
  - Waterings (count, total ml)
  - Feedings (count, avg EC, avg pH)
  - Avg temp / RH / VPD (per source, provenance-weighted)
  - Hours outside temp/RH/VPD target band
  - Observations, photos, training events
  - Alerts triggered / resolved
  - AI Doctor sessions
  - Action Queue: pending / approved / dismissed
  Each row shows: `this week | last week | Δ absolute | Δ %` (or "—" if either side is empty). No arrows/emoji urgency. No red/green good-vs-bad framing.

Comparison rules — non-negotiable:

- **Provenance is honored on both sides.** `demo | stale | invalid` readings are excluded from both this-week and last-week trend math identically. If exclusions differ (e.g. last week was all `stale`), state that explicitly under the chart.
- **Stage-aware caveat.** If the plant crossed a stage boundary (veg → flower, flower week N → N+1) between the two windows, print a one-line notice: "Comparison spans a stage change (<from> → <on <date>>); trends may reflect the transition rather than a real change." Never suppress the comparison — just annotate it.
- **Missing last week.** If the prior window has < 3 days of coverage for a metric, render its delta as "insufficient prior data — showing this week only" and skip the % change. Never extrapolate.
- **Timezone-consistent windows.** Both windows use the same grower-local weekday alignment; no UTC drift.
- **Deterministic.** Same two windows = same numbers, same ordering, same rendered chart.
- **No causal claims.** The section shows *what changed*, never *why*. Causal reasoning is deferred to the grower and to AI Doctor.

### 5. What happened (narrative)
Deterministic bullet list, grouped by day (most recent first):
- Day header (weekday + date).
- One line per event, with time, event type, and a short factual detail (e.g. "Watering 500 ml, runoff pH 6.2").
- Alerts and AI Doctor summaries quoted verbatim from the source record.

No embellishment. No "you did great" language.

### 6. Signals worth noting
Cautious pattern surface — only rule-based observations, never diagnoses:
- Environment: hours outside target band (per source), longest continuous drift.
- Feed drift: EC or pH trending across the week's feedings.
- Watering cadence: gap analysis (longest gap, avg interval).
- Photo cadence: days without a photo.
- Any repeated alert type.
- Notable week-over-week deltas from section 4 (e.g. "Avg VPD rose 0.3 kPa vs last week") — factual only, no cause attributed.
Each item cites its evidence timestamps. Prefixed with "Signal — verify before acting."

### 7. Missing this week
Explicit list of what the report *could not* include:
- Sensor gaps (hours with no readings, per source).
- Days without any diary entry.
- Feedings without EC or pH recorded.
- Photos without stage/plant assignment.
- Any snapshot labeled `demo | stale | invalid` that was excluded from trend math.
- Metrics where prior-week coverage was too thin for a valid week-over-week delta.

### 8. Next-week focus areas
Grower-decides suggestions only. Each item includes:
- **Focus** — short label (e.g. "Log runoff EC after next feed").
- **Why** — one sentence tied to a signal, week-over-week delta, or missing-info item above.
- **How to capture it** — the exact Quick Log field or observation to add.
- **Risk if skipped** — low / medium / high, honestly scoped.

Cap at **5 items**, ordered by risk then evidence strength. Never a device command. Never a "we will do this for you" phrasing.

### 9. Footer
- "This report reflects logged data only. Verdant did not act on your behalf."
- Report ID (deterministic hash of grow_id + this-week window + prior-week window) so re-runs are idempotent.

## Printable delivery

- Rendered as a single-column dashboard, print-optimized (A4/Letter safe, page-break hints between sections).
- Colors from existing semantic HSL tokens in `index.css` — no hardcoded hex.
- Charts rendered inline (SVG preferred) so print + PDF export work without JS.
- A "Print" affordance uses `window.print()`; a "Save as PDF" hint tells the grower to use the browser's Save-as-PDF from the print dialog. No custom PDF pipeline added in this skill.

## Hard rules

- **Read-only.** No writes to any table. No `functions.invoke` for mutations. No Action Queue inserts. No AI model calls.
- **No device control.** Ever.
- **Provenance honesty.** `demo | stale | invalid` readings are labeled and excluded from trend math; they are never quietly averaged in.
- **No fabricated values.** Empty fields render "—", never 0.
- **No motivational or urgency copy.** Calm, grower-first, factual. No "act now", no streak-shaming, no dark patterns.
- **No cross-grower data.** RLS-scoped reads only; never surface another user's plants, tents, or sessions.
- **No secrets in the rendered report.** No IDs in URLs, no emails, no raw payloads, no service_role usage.
- **Deterministic.** Same inputs + same window = same report (same ordering, same Report ID).
- **Reuse existing rules modules** — `growDiaryTimelineRules`, `sensorSnapshot`, `sensorSourceLabels`, VPD helpers. Do not duplicate their logic in the report component.

## Non-goals

- Not a diagnosis engine (that's AI Doctor).
- Not a harvest predictor (that's `harvest-readiness-assistant`).
- Not a feed-schedule builder (that's `nutrient-schedule-assistant`).
- Not a share/publish surface — the report is grower-private until the grower explicitly exports it.
- Not a scheduled email — the grower opens or prints it; this skill does not push notifications.
