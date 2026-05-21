# Grow Diary Architecture

This document describes the current architecture for Verdant's grow diary
subsystem, the safety rules that govern it, and the future migration path
toward typed event tables. It is the source of truth for diary-related
decisions and is verified by `src/test/grow-diary-architecture-doc.test.ts`.

---

## 1. Current diary write path

- **QuickLog** is the primary entry point for grower-authored diary events.
- QuickLog writes rows to the `diary_entries` table.
- The `diary_entries.details` column is a flexible **jsonb** payload (the "details jsonb") and
  remains the current shape for all event-specific data
  (pH, EC/TDS, watering amount, runoff, notes, reminders, etc.).
- Photo uploads attached to a diary entry are stored in the
  **`diary-photos`** Supabase Storage bucket, and the resulting paths are
  referenced from inside `details` jsonb.
- **QuickLog preview validation** (`src/lib/quickLogPreviewRules.ts`) runs
  against the in-progress draft and surfaces severity-tagged warnings
  (invalid pH, out-of-range EC/TDS, invalid watering amount, missing note,
  invalid reminder timestamp, etc.) **before** save.
- QuickLog preview validation is advisory only — it does **not** block
  saving. The Save button is gated only on the in-flight `busy` state.

## 2. Current diary read path

- Raw `diary_entries` rows must be normalized through
  `src/lib/diaryEntryRules.ts` (`normalizeDiaryEntry`) before any
  downstream consumer reads them.
- The grower-facing diary/logs timeline must build its view model through
  `src/lib/growDiaryTimelineRules.ts` (`buildGrowDiaryTimeline`).
- `src/components/DiaryEntryBadges.tsx` is a **presenter-only** component
  that renders tags and warnings derived from the normalized
  `GrowDiaryTimelineItem` view model.
- **UI must not interpret raw `details` jsonb directly.** All business
  rules — value validation, tag derivation, note preview clipping,
  ordering, invalid-entry handling — live in `src/lib/*` and never inside
  `.tsx` files.

## 3. AI context path

- The Coach screen routes raw diary rows through the normalized diary
  adapter (`src/lib/coachContextAdapter.ts`), which reuses
  `diaryEntryRules` and feeds into
  `src/lib/aiContextSufficiencyRules.ts`.
- **Malformed `details` jsonb degrades context sufficiency.** Entries that
  fail normalization or carry invalid numeric ranges are not treated as
  high-confidence evidence.
- Valid normalized diary signals can **improve** AI context sufficiency:
  - Valid pH and EC/TDS values for nutrient questions.
  - Valid watering and feeding events for irrigation questions.
  - Photo attachments and sensor snapshots as supporting evidence.
- **Demo / mock / stale / unavailable** data sources must **never**
  increase AI confidence. The Coach UI continues to disclose
  Demo / Mixed / Unavailable provenance honestly.

## 4. Safety rules

- Do **not** treat malformed diary `details` jsonb as healthy.
- Do **not** hide invalid pH, EC/TDS, runoff, or watering values from the
  user — surface them as warnings via the normalized timeline.
- Do **not** block saving in QuickLog based on preview warnings unless
  explicitly approved in a later milestone.
- Do **not** change the `diary_entries.details` jsonb shape without an
  explicit migration plan, rollback strategy, and updated normalization
  rules.
- Do **not** move diary business logic into `.tsx` files. Rules,
  normalization, validation, and view-model construction stay in
  `src/lib/*`.

## 5. Future migration path

Once the normalization layer is proven stable, QuickLog entries will
eventually be mapped into typed event tables instead of (or alongside) the
flexible `diary_entries.details` jsonb payload:

- `grow_events` (base/shared columns)
- `watering_events`
- `feeding_events`
- `photo_events`
- `observation_events`
- `training_events`
- `environment_events`

Migration rules:

- Maintain backward compatibility with `diary_entries` during any rollout.
  Existing rows must remain readable through `diaryEntryRules` and
  `growDiaryTimelineRules`.
- Typed writes are only introduced after the target schema, indexes, RLS
  policies, and rollback plan are clear and reviewed.
- The normalization layer (`diaryEntryRules`, `growDiaryTimelineRules`,
  `coachContextAdapter`) is the seam where typed reads will be plugged in
  later, so UI and AI consumers do not need to change when the storage
  shape evolves.
