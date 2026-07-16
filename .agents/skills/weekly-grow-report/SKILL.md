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

- V1 is always **7 local calendar days**. The default ends today; "last week"
  and specific-week requests resolve to a different end date. A 14-day or
  arbitrary-length report is a future slice, not a hidden mode in this control.
- Resolve the browser's current IANA timezone with
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, validate it, and pass it
  explicitly into pure window rules. Verdant does not currently persist a
  grower timezone. Never infer one from sensor timestamps, tent light-schedule
  text, locale, or IP address.
- Model both report windows as half-open instants: `[start, nextDayStart)`.
  Derive those instants from local calendar dates in the explicit timezone so
  daylight-saving transitions may produce 167- or 169-hour weeks without
  dropping or duplicating a local day.
- Print the local date range, timezone name, and resolved UTC instants at the
  top of the report so the grower can verify the boundary.

### Date-range selector (grower-facing control)

A single control at the top of the report lets the grower generate a report for **the 7-day window ending on any chosen day**. Purpose: let the grower re-run the report against past weeks or a non-Sunday cadence without needing custom filters.

- **Control shape:** a single "Report end date" date picker (shadcn `Calendar` inside a `Popover` — see the shadcn-datepicker pattern, including `pointer-events-auto` on the calendar wrapper). Report window is always **7 local calendar days**, ending on the selected local date and starting 6 calendar dates before it.
- **Default:** today in the validated browser timezone. If a valid IANA zone is unavailable, block comparison math with an honest "Timezone needed" state; do not silently fall back to the server timezone.
- **Companion display (read-only):** next to the picker, render the resolved window as `<startDate> → <endDate>` in the grower's local timezone so they can verify before generating. Also render the prior-week comparison window (`<priorStart> → <priorEnd>`) so the week-over-week math is transparent.
- **Bounds:**
  - Max selectable end date = **today** in the grower's local timezone. Future dates are disabled — never generate a report for a window that includes the future.
  - Min selectable end date = the earliest activity returned by the audited,
    RLS-scoped source adapters (or a hard floor of 2 years back, whichever is
    later). Do not claim this bound until every enabled source adapter
    participates; otherwise use the 2-year floor and label it as a search
    limit, not "No grow data."
  - If the selected window contains zero source events (no diary entries, no sensor readings, no alerts), render the report with honest empty states in each section — never fabricate a baseline and never silently shift the window.
- **Comparison window follows automatically.** Selecting an end date of `D` sets this-week local dates to `D−6 ... D` and prior-week local dates to `D−13 ... D−7`. Resolve each as its own half-open instant window in the same timezone.
- **URL + deterministic selection.** Encode only the validated end-date value
  as `?end=YYYY-MM-DD` on the private report route. The browser timezone is
  displayed and is part of the report key; the URL alone is not evidence that
  a different device used the same timezone. Do not put emails, notes, sensor
  payloads, service tokens, or unvalidated query values in the URL.
- **Accessibility.** The picker is keyboard-navigable, has a visible label ("Report end date"), announces the resolved window to screen readers via `aria-live="polite"` when the date changes, and the calendar hit targets meet the existing a11y CI bar.
- **Read-only.** Changing the date only re-reads existing data; it never writes, never triggers an AI call, never inserts Action Queue items, and never sends device commands.
- **No preset shortcuts that imply value judgment.** A small neutral set of shortcuts is allowed — "Today", "Yesterday", "Last Sunday" — rendered as plain buttons in muted tokens. No "best week", "worst week", or streak framing.

## Current implementation truth and source adapters

This skill is a build contract, not proof that a weekly-report page or unified
report query already ships. Audit the current default branch before editing.
As of this contract:

- `growDiaryTimelineRules` normalizes supplied diary rows; it does not fetch or
  union every event table.
- `/timeline` understands canonical scope parameters such as `growId`,
  `plantId`, and `tentId`, plus its existing audited special-purpose params. It
  does **not** currently implement report date-range or multi-event-type URL
  filters.
- Verdant has no general weekly Action Queue aggregate hook and no persisted
  grower timezone.
- A raw sensor reading is not automatically a diary entry and may have no
  timeline back-pointer.

Build one typed, read-only adapter per enabled source and keep aggregation out
of React:

1. **Diary entries** — normalize supplied rows through
   `growDiaryTimelineRules`; preserve row ID internally for contribution
   tracing but never render raw payloads.
2. **Grow events** — use the existing grow-event mapper before merging; never
   pretend `grow_events` came from `growDiaryTimelineRules` directly.
3. **Dedicated event tables** — watering, feeding, training, observation,
   photo, environment, alert, AI Doctor, and Action Queue sources require
   explicit RLS-scoped reads plus typed adapters. Enable a metric only after its
   adapter and status semantics are verified against current schema.
4. **Sensor readings/snapshots** — classify through the existing sensor-truth
   rules and preserve source, timestamp, quality, and any real diary
   back-pointer. A sensor-only record remains sensor-only.
5. **Grow / tent / plant and targets** — use owned records for labels, stage,
   and target bands; targets never fabricate observations.

Every adapter returns normalized records plus a stable internal contribution
reference. Missing or unavailable adapters become explicit report omissions;
they never become zero counts.

Anything missing = surfaced explicitly in a **Missing this week** section — never guessed.

## Report structure (printable)

Sections in exactly this order:

### 1. Header

- Grow name, tent name, plant count, stage/age (weeks in veg/flower).
- Window start → end, validated IANA timezone, and resolved UTC instants.
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
- Action Queue items: counts by the verified current lifecycle statuses
  (`pending_approval | approved | rejected | simulated | completed | cancelled`).
  Do not reuse the Alert-only `dismissed` status for Action Queue rows.

Each tile shows "—" (not zero) if no source data exists.

### 3. Charts (printable, deterministic)

Render as semantic inline SVG suitable for print and keyboard-equivalent trace controls (no interactive tooltip is required for meaning). Do not use canvas for a chart that needs accessible contribution drill-down. Every chart caption cites data provenance:

- **Environment trend** — temp + RH lines over the 7 days, with target band shaded. Points colored by provenance label; `stale/demo/invalid` points rendered dashed/greyed with a legend note.
- **VPD trend** — computed from same environment series; target band shaded.
- **Feed EC & pH** — bar or dot plot per feeding event, target band shaded, unit labels explicit (`mS/cm`, `pH`).
- **Watering volume** — daily total ml, plus a marker showing whether runoff was captured.
- **Event timeline** — horizontal timeline row per day, colored dots per event type; alerts and AI Doctor sessions marked distinctly.

If a chart has zero eligible data points, render an honest empty state ("No feeding events logged in this window") — never a fake baseline.

### 4. Week-over-week comparison

Side-by-side visual + numeric diff of **this week** vs the **immediately prior 7-day window** of equal length, ending exactly where this week begins. Purpose: show how the environment and inputs _changed_, not whether they're "good".

Rendered as an **at-a-glance delta card strip** at the top of the section, then a **compare strip** above each existing chart (env trend, VPD, feed EC & pH, watering volume), then a small **stat-delta table**:

- **Delta cards (at-a-glance strip)** — a horizontal row of small stat cards shown **above the week-over-week charts**. Each card summarizes one headline metric so the grower can scan changes in <5 seconds before drilling into charts. Cards to render, in this order:
  - Avg temperature (this week value, unit, Δ vs last week absolute + %)
  - Avg RH
  - Avg VPD
  - Total watering volume (ml)
  - Watering count
  - Avg feed EC (`mS/cm`)
  - Avg feed pH
  - Unique covered time outside any requested target band (temp/RH/VPD union;
    never sum three overlapping hour counts)

Card rules — non-negotiable:

- Show `this week` as the primary value; show `Δ absolute (Δ %)` as a secondary line. If either window is empty, render "—" and label the card "insufficient prior data" — never "0%" and never a fabricated baseline. If the prior value is zero, percentage change is undefined; show the absolute delta and `—` for percent.
- **No good/bad framing.** Neutral typography only — no red/green coloring, no up/down arrows implying value judgment, no emoji. A small neutral glyph (▲ ▼ —) is allowed _only_ to indicate direction of change, styled in a muted token color, not success/destructive tokens.
- **Provenance-aware.** Cards exclude `demo | stale | invalid` readings from both sides identically, matching section 3/4 rules. If a card's math had to drop a provenance class, add a one-line footnote under the strip (e.g. "Temp/RH exclude 12 stale readings from last week").
- **Deterministic order and rounding.** Same inputs = same card values, same order, same rounding (1 decimal for temp/RH/VPD, integer ml, 2 decimals for EC, 1 decimal for pH).
- **Cadence-safe environment math.** Aggregate eligible sensor readings into
  equal time buckets before averaging so a high-frequency device does not
  outweigh a lower-frequency source. Report bucket size and coverage on both
  sides. Do not compare averages when the configured coverage floor is not
  met.
- **No double-counted excursion time.** Compute the outside-target card as
  the union of covered time buckets where any requested metric is outside its
  band. Keep the per-metric hour counts in the detailed table.
- Colors, spacing, and typography come from existing semantic HSL tokens (`--muted`, `--muted-foreground`, `--border`, `--foreground`) — no hardcoded hex, no new tokens.
- Print-safe: cards render as static blocks that survive `window.print()` without clipping, and reflow to 2 columns on narrow print widths.

**Comparison charts:**

- **Overlaid dual-series line** for env trend + VPD — this week solid, last week dashed and de-emphasized, same target band shaded. Same y-axis scale so eyeballing is honest.
- **Grouped bars** for feed EC & pH and daily watering ml — this week vs last week per weekday (Mon..Sun), same y-axis.

**Delta table** — one row per metric:

- Waterings (count, total ml)
- Feedings (count, avg EC, avg pH)
- Avg temp / RH / VPD (per source, equal-time-bucket aggregation)
- Hours outside each temp/RH/VPD target band plus the unique union
- Observations, photos, training events
- Alerts triggered / resolved
- AI Doctor sessions
- Action Queue: current verified lifecycle-status counts; no invented
  `dismissed` bucket

Each row shows: `this week | last week | Δ absolute | Δ %` (or "—" if either side is empty or the prior value is zero). No arrows/emoji urgency. No red/green good-vs-bad framing.

Comparison rules — non-negotiable:

- **Provenance is honored on both sides.** `demo | stale | invalid` readings are excluded from both this-week and last-week trend math identically. If exclusions differ (e.g. last week was all `stale`), state that explicitly under the chart.
- **Stage-aware caveat.** If the plant crossed a stage boundary (veg → flower, flower week N → N+1) between the two windows, print a one-line notice: "Comparison spans a stage change (<from> → <on <date>>); trends may reflect the transition rather than a real change." Never suppress the comparison — just annotate it.
- **Missing last week.** If the prior window has < 3 days of coverage for a metric, render its delta as "insufficient prior data — showing this week only" and skip the % change. Never extrapolate.
- **Timezone-consistent windows.** Both windows use the same grower-local weekday alignment; no UTC drift.
- **Deterministic.** Same two windows = same numbers, same ordering, same rendered chart.
- **No causal claims.** The section shows _what changed_, never _why_. Causal reasoning is deferred to the grower and to AI Doctor.

**Contribution trace and drill-down — non-negotiable:**

Every rendered aggregate must retain the exact normalized source references that
contributed to it, plus excluded references and exclusion reasons. Build this
as a typed contribution ledger in pure rules; a chart is never the source of
truth.

- **In-report trace first.** Each card, table cell, bar, and line bucket opens a
  read-only contribution drawer in the report. It lists source kind, captured
  time, display-safe provenance, included/excluded status, and exclusion reason.
  It does not expose raw payloads or another grower's records.
- **Diary navigation only when real.** A contribution with a verified diary or
  grow-event back-pointer may link through using the canonical route helpers and
  currently supported scope parameters (`growId`, `plantId`, `tentId`, or an
  existing audited highlight token). A raw sensor reading without that
  back-pointer stays in the contribution drawer; never manufacture a diary row
  or a timeline link for it.
- **Do not claim nonexistent filters.** `/timeline` does not currently consume
  report `from`/`to`/multi-event query filters. If exact pre-filtered timeline
  navigation is requested, implement it as a separate slice: add a pure typed
  route builder/parser, validate half-open ISO instants and allow-listed event
  types, wire the page presenter, and add round-trip plus RLS-scope tests before
  this skill calls the filters available.
- **Private route IDs.** Opaque IDs already required by canonical private app
  routes may appear in those routes after ownership is enforced by RLS. Never
  put them in analytics properties, logs, copy, or public/share URLs. Never put
  emails, notes, tokens, raw payloads, or unvalidated values in any URL.
- **Provenance carries through.** Excluded `demo | stale | invalid` records stay
  visible and flagged in the contribution drawer so the grower can see what was
  excluded and why.
- **Accessibility.** Use semantic buttons/links paired with SVG chart elements;
  do not rely on canvas hit regions or hover alone. Each control describes the
  metric, window, and contribution count. Touch targets meet the existing a11y
  bar.
- **Print behavior.** Print/PDF output renders short human-readable contribution
  references and counts, never raw URLs or internal IDs.
- **Empty/uncertain buckets.** A bucket with zero source references is
  non-interactive. A bucket containing only excluded records opens the drawer
  with the exclusion notice as its primary content.
- **Read-only and deterministic.** Trace controls never write, invoke AI, add an
  Action Queue item, or control a device. The same normalized inputs yield the
  same contribution ordering and labels.

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

Explicit list of what the report _could not_ include:

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
- **Report key:** stable hash of rules version + owned grow/tent scope + selected
  end date + validated timezone. It identifies the requested selection, not an
  immutable snapshot.
- **Content version ID:** hash of the report key plus the sorted normalized
  contribution references and their version/timestamp fields. A late diary
  entry or corrected reading changes this ID. Never claim two reports with the
  same selection key have identical content when the underlying data changed.
- Neither identifier exposes its raw hash inputs in rendered copy, URLs, or
  analytics.

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
- **No secrets or grower content in URLs.** Canonical private routes may contain
  opaque, RLS-owned IDs; analytics and public/share URLs may not. Never include
  emails, notes, raw payloads, or service-role material.
- **Deterministic.** Same normalized inputs + rules version + explicit timezone
  and the same half-open windows = the same ordering, values, contribution
  ledger, and content version ID.
- **Reuse existing rules modules** — `growDiaryTimelineRules`, `sensorSnapshot`, `sensorSourceLabels`, VPD helpers. Do not duplicate their logic in the report component.

## Foundation-first implementation sequence

Keep this report scalable by landing narrow slices in this order:

1. `weeklyReportWindowRules.ts` — validate end date/timezone, derive current and
   prior half-open windows, enforce future/floor bounds, and build the stable
   report key. Test DST start/end, invalid zones, leap day, future dates, and
   deterministic repeatability.
2. Typed source adapters — one source at a time, RLS-scoped and read-only. Pin
   schema/status assumptions with tests. Missing adapters remain unavailable.
3. `weeklyReportAggregationRules.ts` — equal-time-bucket environment math,
   coverage floors, zero-denominator deltas, unique excursion unions, stable
   sorting, and the contribution ledger. Test empty, partial, stale, invalid,
   mixed-cadence, and overlapping-excursion cases.
4. Presenter — header, stats, table, accessible SVG charts, contribution drawer,
   and honest empty states. Keep queries and calculations out of JSX.
5. Print stylesheet and accessibility proof.
6. Optional exact timeline-filter navigation only after its own route-parser
   slice is implemented and tested. Do not block the core report on it.

Do not add schema, a new report route, entitlement gates, scheduled delivery,
or a PDF service unless the task explicitly authorizes that slice. Run focused
tests, type-check, lint, format, and relevant browser coverage before calling a
slice complete.

## Non-goals

- Not a diagnosis engine (that's AI Doctor).
- Not a harvest predictor (that's `harvest-readiness-assistant`).
- Not a feed-schedule builder (that's `nutrient-schedule-assistant`).
- Not a share/publish surface — the report is grower-private until the grower explicitly exports it.
- Not a scheduled email — the grower opens or prints it; this skill does not push notifications.
