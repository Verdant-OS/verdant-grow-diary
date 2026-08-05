/**
 * timelineDiaryEntryDetailPresentationRules — single source of truth for
 * deciding what a diary entry's `details` JSONB blob is safe to render on
 * the Grow Timeline, versus what must never render raw.
 *
 * Why this lives alone (Codex review, PR #502):
 *  - This logic previously lived inline inside Timeline.tsx's per-entry
 *    render body as a `HIDDEN` array + a chain of per-category booleans.
 *    Every diary writer that adds a new internal/machine field (a Pheno
 *    evidence receipt, a Quick Log v2 companion-row plumbing field, a
 *    future AI Doctor or learning-loop marker) has to remember to update
 *    that inline list, or the default-open raw "key: value" chip fallback
 *    silently exposes it to the grower — which is exactly how two
 *    unrelated leaks (hunt_id/evidence_goal/... and quick_log_version/
 *    linked_grow_event_id/...) both happened in production. Centralizing
 *    the rule in one tested, pure module makes "does this leak?" a single
 *    answerable question instead of an implicit render-body side effect.
 *
 * When you add a new diary/QuickLog writer with internal-only fields:
 *  1. If the ENTIRE details blob is machine bookkeeping for one event
 *     kind (e.g. a receipt/marker with its own `kind` discriminator),
 *     add that kind to `SUPPRESSED_DETAIL_KINDS` below so nothing from
 *     it ever reaches the raw fallback.
 *  2. If only SOME top-level keys are internal (schema-version markers,
 *     join ids, redundant echoes of a row-level column), add those keys
 *     to `HIDDEN_DIARY_DETAIL_KEYS` below.
 *  3. If the field is genuinely grower-facing, register it as a proper
 *     structured field in `quickLogActivityDetailFields.ts` so it gets a
 *     real label instead of a raw snake_case chip.
 *
 * Pure. No React, no I/O, no Supabase.
 */
import {
  describeQuickLogDetailsFromExtras,
  QUICK_LOG_DETAIL_FIELD_KEYS,
  type QuickLogDetailDisplayLine,
} from "@/lib/quickLogActivityDetailFields";
import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import { PHENO_EVIDENCE_RECEIPT_KIND } from "@/lib/phenoEvidenceCaptureRules";

/**
 * Top-level detail keys that must never render as a raw "key: value" chip,
 * regardless of event kind or value. Pure internal bookkeeping: schema
 * version markers, foreign-key join ids, and echoes already presented by a
 * dedicated element elsewhere on the card.
 */
export const HIDDEN_DIARY_DETAIL_KEYS: ReadonlySet<string> = new Set([
  "event_type",
  "plant_id",
  "plant_name",
  "tent_id",
  "sensor",
  "sensor_snapshot",
  "remind_at",
  // Quick Log v2 companion-row plumbing (see quickLogDiaryCompanionRules.ts):
  // a schema version marker and a grow_events join id.
  "quick_log_version",
  "linked_grow_event_id",
  // Guided Symptom Check stage is presented by its dedicated evidence card.
  "observation_stage",
  // Redundant with the dedicated photo render, which reads the row-level
  // photo_url column directly.
  "photo_url",
]);

/**
 * `details.kind` values whose ENTIRE blob is machine bookkeeping for a
 * dedicated feature (not general QuickLog activity detail) and must never
 * reach the raw fallback. Learning-loop and AI Doctor readiness-check rows
 * are excluded by their own dedicated presenters upstream of this module
 * (they carry no stable `details.kind` this module can key off); Pheno
 * evidence receipts are the one case identified so far that flows through
 * the generic diary render path.
 */
const SUPPRESSED_DETAIL_KINDS: ReadonlySet<string> = new Set([PHENO_EVIDENCE_RECEIPT_KIND]);

export interface TimelineDiaryEntryDetailPresentation {
  /** Structured, labeled display lines (e.g. "Technique: Topping"). */
  readonly detailLines: readonly QuickLogDetailDisplayLine[];
  /** Remaining raw "key: value" chips — last-resort fallback only. */
  readonly extra: ReadonlyArray<readonly [key: string, value: string]>;
}

const EMPTY_PRESENTATION: TimelineDiaryEntryDetailPresentation = Object.freeze({
  detailLines: [],
  extra: [],
});

function detailsRecord(details: unknown): Record<string, unknown> {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : {};
}

/**
 * Decide whether a diary entry's `details` blob is entirely internal
 * bookkeeping that must never reach the generic render path (learning-loop
 * rows, AI Doctor readiness checks, Pheno evidence receipts, ...).
 * `suppress` covers categories this module cannot key off `details` alone
 * (e.g. learning-loop rows, keyed off the row's `event_type`) — pass the
 * caller's own classification for those.
 */
export function isFullySuppressedTimelineDetail(details: unknown, suppress = false): boolean {
  if (suppress) return true;
  const record = detailsRecord(details);
  return typeof record.kind === "string" && SUPPRESSED_DETAIL_KINDS.has(record.kind);
}

/**
 * Compute what a diary entry's `details` blob is safe to present: labeled
 * structured lines, plus any remaining unrecognized-but-non-null key as a
 * last-resort raw chip. Returns an empty presentation when the entry is
 * fully suppressed (see `isFullySuppressedTimelineDetail`).
 *
 * A null-valued key is always dropped from the raw fallback — the write
 * seam echoes several always-present-but-often-null fields (e.g.
 * feeding/watering on a non-feeding/watering entry) onto every row, and a
 * null value is "not provided", never "feeding: null" (matching this
 * codebase's absence-stays-unknown doctrine).
 */
export function presentTimelineDiaryEntryDetails(
  details: unknown,
  tempUnit: TemperatureUnitPreference,
  options: { suppress?: boolean } = {},
): TimelineDiaryEntryDetailPresentation {
  if (isFullySuppressedTimelineDetail(details, options.suppress)) return EMPTY_PRESENTATION;

  const detailLines = describeQuickLogDetailsFromExtras(details, tempUnit);
  const extra = Object.entries(detailsRecord(details))
    .filter(
      ([k, v]) =>
        v != null && !HIDDEN_DIARY_DETAIL_KEYS.has(k) && !QUICK_LOG_DETAIL_FIELD_KEYS.has(k),
    )
    .map(([k, v]) => [k, String(v)] as const);

  return { detailLines, extra };
}
