# Unified Timeline stream

Status: draft spec. Founder decisions D1 to D3 (§6) are needed. Spec only; no application code.

Source: live grower audit 2026-11-03, finding 5, "The journal is fragmented by capture mechanism".
The audit adds: "This is not evidence of data loss: it is a discoverability/classification problem."

Measured on the deploy branch `verdant-grow-diary` at `c03f64a`.

## 1. Problem

Timeline shows separate sections for:

- CSV environment snapshots
- Recent Quick Logs
- the cultivation calendar
- Watering, Feeding, Pest, Training, Measurement and Photo histories
- detailed diary entries

Older manual captures are cut off. Only 100 of 253 detailed entries load at first. A grow whose
feeding is written up in notes still says "No feeding entries yet". The audit asks for one
chronological stream with source and type filters. It also asks for a clear way to classify a
note without duplicating it.

## 2. Source trace

### 2.1 Reads and their bounds (`src/pages/Timeline.tsx`)

| Read                                            | Line       | Bound                                                                                                  | Older rows                                                                              |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `diary_entries` for the grow                    | 889        | `.limit(100)`, `count: "exact"`                                                                        | cursor-paged "load older" (1301); the results count shows "N of total" (2651–2658)      |
| `grow_events` (root zone)                       | 911        | `.limit(100)`                                                                                          | none                                                                                    |
| `grow_events` with `event_type = 'environment'` | 943        | `.limit(100)`                                                                                          | none                                                                                    |
| manual sensor captures                          | 1204, 1211 | `TIMELINE_MANUAL_SENSOR_ROW_LIMIT + 1` (200 + 1, `src/lib/timelineManualSensorMeasurementRules.ts:28`) | none; the `timeline-manual-history-limit` notice (2339) says older readings are omitted |
| linked action/alert lookups                     | 1109, 1130 | `.limit(50)`                                                                                           | none                                                                                    |

These bounds are deliberate. https://github.com/Verdant-OS/verdant-grow-diary/pull/2795 (merged
2026-11-03) bounded the list reads to keep large payload columns off the heap after a production
crash (#2785). The "100 of 253" view is disclosed and pageable. It is not data loss.

### 2.2 Why a feeding note is not in Feeding history

`src/components/FeedingHistoryPanel.tsx:195-215` classifies a row by its top-level `entry_type`. If
that is missing, it lifts `details.event_type`, then normalises. The other per-type panels follow
the same convention. A Quick Log **note** whose text describes a feed is stored as a note, so it
never classifies as feeding. Line 282 then renders "No feeding entries yet" truthfully: there are
no feeding-typed entries.

### 2.3 Where the sections render

Timeline renders the sections stacked above the entries feed:

- `TimelineCsvContextGate` (2881)
- `RecentQuickLogActivityPanel` (2891)
- `DiaryCalendarSection` (2903)
- the six per-type history panels (2913–2965)
- action and alert event sections (2978–2979)
- the entries feed (~2985)

`docs/specs/first-viewport-task-first.md` R7 (#2826) already proposes collapsing the per-type
panels behind "History by type". This spec builds on that and does not duplicate it.

## 3. Safety fences

- **F1: no duplicate records.** Classifying a note never creates a second entry. It is never done
  by a new insert. Any change of type must be an append-only revision.
- **F2: no inferred facts.** Verdant never silently re-types a note from its text. A "looks like a
  feed" hint, if shown, is labelled as a suggestion. It changes nothing until the grower confirms.
- **F3: source labels stay.** Every stream item keeps its source label (manual, CSV, live, demo,
  stale, invalid) and its own timestamp. Retracted entries stay excluded.
- **F4: bounded reads stay bounded.** The #2795 heap limits and selects are kept. A unified stream
  pages; it never loads everything.
- **F5: truthful empty states.** "No feeding entries yet" may stay only while it is true for
  feeding-typed entries. If notes might describe feeds, the empty state may say so as a hint.

## 4. Requirements

- **R1:** per D1, Timeline offers one chronological stream: diary entries, grow events, manual
  sensor captures and CSV snapshots merged by occurred time. A stable tie-break keeps order
  deterministic.
- **R2:** the stream's filters reuse the existing type chips (`FilterChip`s, 2784–2836) and the
  sensor source toggles (2621–2647). No new filter vocabulary is introduced.
- **R3:** each source pages independently with its existing bound. The stream shows a "load older"
  per source, or one combined "load older" that advances every cursor. Either way it states what
  is still unloaded.
- **R4:** per D2, a note can be classified as watering, feeding, pest, training or measurement
  through an append-only revision. The change is visible in the entry's history. **Gap:** the
  existing correction path cannot do this today. `QuickLogCorrectionChanges`
  (`src/lib/quick-log/quickLogRevisionRules.ts:245-255`) accepts `note`, `occurredAt`,
  `targetType`/`targetId`, `volumeMl`, `doseAmount` and `sensorValues`, but no entry type. D2(a)
  therefore needs a new correction field that the server revision RPC accepts. That is a
  write-path change, and possibly a schema change.
- **R5:** per D3, the per-type panels become filtered views of the stream, or stay behind
  "History by type" per #2826.

## 5. Out of scope

- Changing what a Quick Log save writes.
- Schema or RLS changes.
- Auto-classifying notes.
- The Timeline first-viewport layout, which #2826 covers.

## 6. Founder decisions

- **D1, stream:**
  - (a) Build the unified stream now as the default Timeline view.
  - (b) Keep today's sections and add an "All activity" stream as a second tab.
  - Recommendation: **(b)**. It ships the audit's view without removing anything growers use
    today, and (a) can follow once (b) is measured.
- **D2, classifying notes:**
  - (a) Add "Classify as…" on a note, as an append-only revision the grower confirms. This
    needs a new revision field on the server (see the R4 gap).
  - (b) Show a read-only "this note may describe a feed" hint only.
  - (c) Neither for now.
  - Recommendation: **(a)**, with no auto-detection. The grower picks the type. That fixes the
    false "No feeding entries yet" without guessing.
  - D2(a) extends the Quick Log revision write path, and possibly the schema. It needs its own
    spec and RLS/RPC review, plus your explicit yes. (b) needs no write and can ship first.
- **D3, per-type panels:**
  - (a) Turn them into stream filters.
  - (b) Keep them behind "History by type" as #2826 proposes.
  - Recommendation: **(b)** first. It is the smaller change and pairs with #2826.

## 7. Acceptance tests

1. A grow with 253 diary entries, 120 grow events and 210 manual captures: the stream shows the
   newest items across all sources, ordered by occurred time with a stable tie-break. It states what
   is still unloaded per source. (R1, R3)
2. Load older advances each source and never loads an unbounded set. (F4)
3. Each item keeps its source label and timestamp. Retracted entries are absent. (F3)
4. Filter chips and sensor source toggles filter the stream. (R2)
5. Under D2(a): classifying a note as feeding makes it appear in the Feeding filter, and the entry
   count does not change. The revision appears in the entry's history. (R4, F1)
6. No note changes type without the grower's action. (F2)
7. With zero feeding-typed entries, the Feeding view still says "No feeding entries yet". (F5)

## 8. File plan (after D1 to D3)

1. Pure merge-and-order rules (new `src/lib/timelineUnifiedStreamRules.ts`), with a stable
   tie-break and per-source cursors. Tests first.
2. The "All activity" tab in `src/pages/Timeline.tsx`, reusing the existing reads, bounds, chips and
   toggles.
3. Under D2(a): a separate write-path spec. It adds an entry-type correction field to the revision
   RPC, with an append-only history. Implementation comes after its review.
