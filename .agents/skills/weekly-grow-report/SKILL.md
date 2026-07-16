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
  text, locale, or IP address. The **report time preferences** slice below adds
  an explicit, grower-set, device-local override; absent a valid saved
  preference, the validated browser zone remains the only source.
- Model both report windows as half-open instants: `[start, nextDayStart)`.
  Derive those instants from local calendar dates in the explicit timezone so
  daylight-saving transitions may produce 167- or 169-hour weeks without
  dropping or duplicating a local day.
- Print the local date range, timezone name, and resolved UTC instants at the
  top of the report so the grower can verify the boundary.

### Report time preferences (grower-facing setting — authorized slice)

Two explicit preferences let the 7-day window align with the grower's actual
day changes instead of the device's defaults. Both are selection inputs, never
inference.

- **Report timezone.** An explicit IANA zone picker (searchable select,
  default "Use this browser's timezone"). Validate the zone with
  `Intl.DateTimeFormat` at save time AND again at load time; an invalid or
  unparseable stored zone is ignored with an honest inline notice ("Saved
  timezone is no longer valid — using this browser's timezone") — never a
  silent fallback and never a blocked report when the browser zone is valid.
  The never-infer rule stands: no zone from sensor timestamps, light-schedule
  text, locale, or IP.
- **Effective report timezone.** One resolved zone — the validated saved
  preference when present, else the validated browser zone — governs every
  selection surface: date-picker defaults and bounds, the companion window
  display, URL end-date resolution, day grouping, both comparison windows,
  and the report key. No control may consult the raw browser zone directly
  once a valid preference exists.
- **Report day boundary.** The local hour at which a report "day" begins
  (whole hours only, default `00:00`; e.g. `06:00` for a lights-on day).
  Window instants become `[dayStart + boundary, nextDayStart + boundary)` —
  still half-open, still derived from local calendar dates in the explicit
  zone, so DST weeks may still be 167 or 169 hours. A record belongs to the
  local calendar date whose boundary hour opened its window.
- **One boundary everywhere.** Window derivation, equal-time-bucket math,
  narrative day grouping, weekday alignment, and BOTH week-over-week windows
  use the same zone + boundary in the same report. Mixed-boundary comparisons
  are forbidden.
- **Header transparency.** The header prints the zone, the boundary ("Days run
  06:00 → 06:00 local"), and the resolved UTC instants so the grower can
  verify exactly where their week starts.
- **Selection, not history.** Zone and boundary are part of the report key;
  changing a preference is a new selection, never a silent rewrite of a
  previously generated report.
- **Persistence (v1): device-local.** Stored in `localStorage` under a
  versioned key, labeled "Saved on this device" in the UI. Stored values are
  validated on load exactly like fresh input; unknown fields are discarded.
  No emails, notes, tokens, raw payloads, or another grower's identifiers are
  ever written to storage. An account-level (synced) preference is a separate
  schema slice that requires its own explicit authorization and migration —
  do not add tables for this slice.
- **Read-only + accessible.** Changing preferences only re-resolves windows
  and re-reads data; visible labels, keyboard operability, and an
  `aria-live="polite"` announcement of the newly resolved window are required.

### Date-range selector (grower-facing control)

A single control at the top of the report lets the grower generate a report for **the 7-day window ending on any chosen day**. Purpose: let the grower re-run the report against past weeks or a non-Sunday cadence without needing custom filters.

- **Control shape:** a single "Report end date" date picker (shadcn `Calendar` inside a `Popover` — see the shadcn-datepicker pattern, including `pointer-events-auto` on the calendar wrapper). Report window is always **7 local calendar days**, ending on the selected local date and starting 6 calendar dates before it.
- **Default:** today in the **effective report timezone** — the validated report time preference when one is saved, else the validated browser zone. If no valid IANA zone is available from either source, block all report generation with an honest "Timezone needed" state; neither window nor its future/floor bounds are safe to resolve. Do not silently fall back to the server timezone.
- **Companion display (read-only):** next to the picker, render the resolved window as `<startDate> → <endDate>` in the effective report timezone so the grower can verify before generating. Also render the prior-week comparison window (`<priorStart> → <priorEnd>`) so the week-over-week math is transparent.
- **Bounds:**
  - Max selectable end date = **today** in the effective report timezone. Future dates are disabled — never generate a report for a window that includes the future.
  - Min selectable end date = the earliest activity returned by the audited,
    RLS-scoped source adapters (or a hard floor of 2 years back, whichever is
    later). Do not claim this bound until every enabled source adapter
    participates; otherwise use the 2-year floor and label it as a search
    limit, not "No grow data."
  - If the selected window contains zero source events (no diary entries, no sensor readings, no alerts), render the report with honest empty states in each section — never fabricate a baseline and never silently shift the window.
- **Comparison window follows automatically.** Selecting an end date of `D` sets this-week local dates to `D−6 ... D` and prior-week local dates to `D−13 ... D−7`. Resolve each as its own half-open instant window in the same timezone.
- **URL + deterministic selection.** Encode only the validated end-date value
  as `?end=YYYY-MM-DD` on the private report route. The effective report
  timezone is displayed and is part of the report key; the URL alone is not
  evidence that a different device resolved the same timezone. Do not put
  emails, notes, sensor payloads, service tokens, or unvalidated query values
  in the URL.
- **Accessibility.** The picker is keyboard-navigable, has a visible label ("Report end date"), announces the resolved window to screen readers via `aria-live="polite"` when the date changes, and the calendar hit targets meet the existing a11y CI bar.
- **Read-only.** Changing the date only re-reads existing data; it never writes, never triggers an AI call, never inserts Action Queue items, and never sends device commands.
- **No preset shortcuts that imply value judgment.** A small neutral set of shortcuts is allowed — "Today", "Yesterday", "Last Sunday" — rendered as plain buttons in muted tokens. No "best week", "worst week", or streak framing. Grower-defined saved presets (below) are additionally allowed; the system itself never generates a judgment-framed preset.

### Plant scope selector (grower-facing control — authorized slice)

A scope control next to the date picker: **All plants** (default, current
behavior) or **one owned plant** in the selected grow/tent. Purpose: generate
the same 7-day report for a single plant without changing any other rule.

- **Control shape:** a labeled select ("Report scope") listing "All plants"
  plus the grower's owned plants in the current grow/tent scope, by plant
  name. Ownership is enforced by RLS-scoped reads; the control never lists or
  accepts another grower's plant.
- **What filters, honestly.** Plant-scoped sources (waterings, feedings,
  observations, photos, training, AI Doctor sessions, and alerts/Action Queue
  rows that carry a real plant back-pointer) filter to the selected plant on
  BOTH comparison windows. Records without a plant assignment are **excluded
  from the single-plant view and surfaced in "Missing this week"** ("N
  waterings had no plant assignment and are not shown in this plant view") —
  never silently attributed to the plant and never silently dropped.
- **Environment stays tent-level.** Sensor readings belong to the tent, not
  the plant. In single-plant scope, environment/VPD sections render with an
  explicit label ("Tent environment — readings are tent-level, not
  plant-specific"); they are never re-labeled as plant data.
- **Report key + URL.** The plant scope is part of the report key. Encode it
  only as the existing opaque owned plant ID on the private report route
  (`?plant=<id>`), validated against RLS-scoped ownership before use, subject
  to all existing URL rules (never in analytics, logs, copy, or share URLs).
- **Empty plant windows are honest.** A plant with zero scoped events renders
  the standard empty states; the report never borrows tent-level events to
  fill a plant view.
- **Deterministic + read-only + accessible** per the shared control rules
  (visible label, keyboard operable, `aria-live` window/scope announcement).

### Saved report presets (grower-facing control — authorized slice)

Named, grower-created presets capture a report selection so common windows
regenerate in one click without reselecting settings.

- **What a preset stores — selection inputs only:** a grower-chosen name; an
  end-date rule (**relative** — "ends today", "ends last <weekday>" — or a
  **fixed** past date); the plant scope (all plants or one opaque owned plant
  ID); nothing else. The report timezone and day boundary are **referenced
  from the current report time preferences at apply time, never frozen into
  the preset**, so a grower who changes zones keeps consistent semantics.
  Never store emails, notes, sensor payloads, tokens, raw records, or another
  grower's identifiers.
- **Applying a preset** resolves the rule against today in the validated
  zone + boundary, shows the resolved window in the companion display, and
  regenerates the report — a read-only selection change, exactly as if the
  grower had set each control by hand. Bounds still apply: a resolved window
  may not include the future, and a fixed-date preset older than the search
  floor renders the floor-limit label, never fabricated data.
- **Validation on load.** Presets persist device-locally (`localStorage`,
  versioned key, "Saved on this device" label). Every stored preset is
  re-validated on load like fresh input — unknown fields discarded, invalid
  dates/rules/plant references mark the preset "needs review" with an honest
  notice instead of applying partially. A plant reference that no longer
  resolves to an owned plant renders the preset invalid; it never falls back
  to another plant.
- **Neutral naming, grower's words.** The grower's own preset names render
  verbatim in the picker but never appear in URLs, analytics, or logs. The
  system never creates presets itself and never adds judgment framing
  ("best week") to any preset UI.
- **Cap and order.** At most 20 presets; deterministic ordering
  (alphabetical by name, then created-at). Creating, renaming, and deleting
  presets are device-local storage operations only — never a database write,
  never an AI call, never an Action Queue insert.
- **Account-level (synced) presets are a separate schema slice** requiring
  explicit authorization and migration; do not add tables for this slice.

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
- Report scope: "All plants" or the selected plant's name.
- Window start → end, validated IANA timezone, the report day boundary
  ("Days run 06:00 → 06:00 local" when non-midnight), and resolved UTC
  instants.
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

- Show `this week` as the primary value; show `Δ absolute (Δ %)` as a secondary line. Treat numeric zero as observed data, never as missing. If current data is unavailable, show `—` as the primary value and label it "current data unavailable." If current data exists but prior data is unavailable, preserve the current value, show `—` for both deltas, and label only the comparison "insufficient prior data." If the prior value is a verified zero, preserve both values and the absolute delta; percentage change alone is undefined and renders `—`.
- **No good/bad framing.** Neutral typography only — no red/green coloring, no up/down arrows implying value judgment, no emoji. A small neutral glyph (▲ ▼ —) is allowed _only_ to indicate direction of change, styled in a muted token color, not success/destructive tokens.
- **Provenance-aware.** Cards exclude `demo | stale | invalid` readings from both sides identically, matching section 3/4 rules. If a card's math had to drop a provenance class, add a one-line footnote under the strip (e.g. "Temp/RH exclude 12 stale readings from last week").
- **Deterministic order and rounding.** Same inputs = same card values, same order, same rounding (1 decimal for temp/RH/VPD, integer ml, 2 decimals for EC, 1 decimal for pH).
- **Cadence-safe environment math.** Within each source series, aggregate raw
  eligible readings into one value per equal time bucket. Only then may a
  cross-source headline combine the per-source bucket values with an explicit,
  deterministic equal-source rule. A high-frequency device must never receive
  more weight because it emitted more raw points. Report bucket size, included
  sources, and coverage on both sides. Do not compare averages when the
  configured coverage floor is not met.
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

Each row shows: `this week | last week | Δ absolute | Δ %`. Preserve every observed value, including numeric zero. Missing current data renders only the current value and deltas unavailable; missing prior data preserves current and renders prior/deltas unavailable; a verified zero prior value preserves both values and the absolute delta while only percentage renders `—`. No arrows/emoji urgency. No red/green good-vs-bad framing.

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
- **Report key:** stable hash of rules version + owned grow/tent scope +
  plant scope + selected end date + validated timezone + report day boundary.
  It identifies the requested selection, not an immutable snapshot.
- **Content version ID:** hash of the report key plus a canonical serialization
  of every sorted normalized, output-affecting contribution field and exclusion
  decision. References and timestamps alone are insufficient because mutable
  diary content may change without an `updated_at` field. Exclude raw payloads
  and unused private fields from the digest, but include every normalized value
  that can change a rendered number, label, note excerpt, source classification,
  or omission. A late entry or corrected content changes this ID. Never claim
  two reports with the same selection key have identical content when the
  underlying data changed.
- Neither identifier exposes its raw hash inputs in rendered copy, URLs, or
  analytics.

## Printable delivery

- Rendered as a single-column dashboard, print-optimized (A4/Letter safe, page-break hints between sections).
- Colors from existing semantic HSL tokens in `index.css` — no hardcoded hex.
- Charts rendered inline (SVG preferred) so print + PDF export work without JS.
- A "Print" affordance uses `window.print()`. The dedicated one-click PDF
  export below is an authorized slice; no server-side PDF service is ever
  added.

### One-click PDF export (authorized slice)

A single "Export PDF" button on the report produces a PDF of the generated
report. It is a projection of the same data — never a second computation.

- **Same source of truth.** The PDF renders from the exact same normalized
  rules output, contribution ledger, and deterministic inline SVG charts as
  the on-screen report — identical numbers, ordering, rounding, exclusions,
  and honest empty states. It never recomputes with different rules and never
  includes sections the grower cannot see on screen.
- **Client-side only.** Export happens entirely in the grower's browser. No
  server round-trip, no external rendering service, no upload of report
  content, no analytics events carrying report content. The private report
  never leaves the device unless the grower shares the file themselves.
- **Implementation ladder.** First preference: the print pipeline — the
  button drives `window.print()` against the print stylesheet (page-break
  hints, A4/Letter-safe, `@page` title) so the grower lands one confirm away
  from a PDF with zero new dependencies. A bundled client-side PDF library is
  authorized only if that pipeline cannot meet fidelity, and then only with:
  vector embedding of the same SVG charts (no canvas rasterization of any
  chart that carries contribution drill-down), deterministic output for the
  same content version ID (no random object IDs, no wall-clock timestamps
  beyond the report's own generated-at), and an explicit dependency review.
- **Drill-down references in print form.** Per the print rules, contribution
  drill-downs render as short human-readable contribution references and
  counts — never raw URLs, internal IDs, or interactive-only affordances that
  a PDF cannot honor. The footer's report key and content version ID render
  in the PDF exactly as on screen.
- **Honest filename.** Deterministic and content-safe: grow name slug +
  window local dates (e.g. `verdant-weekly-blue-dream-2026-07-10-to-2026-07-16.pdf`).
  Never hashes, opaque IDs, emails, or grower notes in the filename.
- **Read-only.** Export never writes, never invokes AI, never touches the
  Action Queue, never sends device commands.

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
7. **Report time preferences** — extend `weeklyReportWindowRules.ts` with the
   day-boundary offset (test boundary + DST interactions, midnight vs
   non-midnight parity, record-to-day assignment at the boundary instant),
   then the device-local preference store with load-time validation, then the
   settings UI. Land window math before UI.
8. **Plant scope** — extend the source adapters with plant filtering + the
   unassigned-records omission ledger, extend the report key, then the
   selector UI. Test: unassigned exclusion surfaces in Missing this week,
   both comparison windows share the filter, foreign plant IDs rejected.
9. **Saved presets** — pure preset rules first (serialize/validate/resolve
   relative rules against zone + boundary), then the device-local store,
   then the picker UI. Test: corrupted/unknown-field storage, stale plant
   references, future-date resolution clamping, cap + deterministic order.
10. **One-click PDF export** — print-pipeline button + print stylesheet
    proof first; a client-side PDF library only if fidelity demands it,
    under the export slice's determinism and vector rules.

Do not add schema, a new report route, entitlement gates, scheduled delivery,
or a PDF service unless the task explicitly authorizes that slice. The report
time preferences, plant scope, saved presets, and one-click PDF export slices
above are explicitly authorized in their device-local, client-side forms;
their account-synced or server-side variants remain unauthorized. Run focused
tests, type-check, lint, format, and relevant browser coverage before calling a
slice complete.

## Non-goals

- Not a diagnosis engine (that's AI Doctor).
- Not a harvest predictor (that's `harvest-readiness-assistant`).
- Not a feed-schedule builder (that's `nutrient-schedule-assistant`).
- Not a share/publish surface — the report is grower-private until the grower explicitly exports it.
- Not a scheduled email — the grower opens or prints it; this skill does not push notifications.
