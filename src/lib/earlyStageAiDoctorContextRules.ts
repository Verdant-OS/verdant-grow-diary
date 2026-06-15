/**
 * earlyStageAiDoctorContextRules — pure, read-only helper that assembles
 * a safe AI Doctor context section from saved early-stage Quick Log
 * milestones and vigor notes.
 *
 * Hard constraints:
 *  - No I/O, no React, no Supabase, no Action Queue, no AI calls, no
 *    device control.
 *  - Deterministic. Time is injectable.
 *  - Never echoes raw payload keys, service_role, tokens, unknown enum
 *    values, internal IDs, or arbitrary objects.
 *  - Cautious: surfaces missing-information and caution notes instead of
 *    promoting diagnoses from a single milestone or photo.
 *  - Does not classify telemetry; only reflects which evidence is missing.
 */
import { buildEarlyStageTimelineViewModel } from "./earlyStageTimelineViewModel";

/** Per-entry source label rendered alongside an early-stage memory line. */
export type EarlyStageMemorySourceLabel = "Quick Log" | "Manual diary";

export interface EarlyStageMemoryEntry {
  /** Resolved milestone label, or null when only vigor/note was present. */
  milestoneLabel: string | null;
  /** True when a milestone value was present but did not match a known enum. */
  milestoneUnknown: boolean;
  /** Resolved vigor label, or null when not present. */
  vigorLabel: string | null;
  /** True when vigor was present but did not match a known enum. */
  vigorUnknown: boolean;
  /** Trimmed grower observation (length-capped), or null. */
  note: string | null;
  /** Resolved stage context label (Title-cased), or null. */
  stageContextLabel: string | null;
  /** ISO timestamp of the source diary row when available. */
  capturedAt: string | null;
  /** Source label — never echoes raw enum/source strings. */
  source: EarlyStageMemorySourceLabel;
}

export interface EarlyStageAiDoctorContext {
  /** True when at least one early-stage memory entry is present. */
  hasEarlyStageMemory: boolean;
  /** Latest entry by capturedAt (descending, ties broken by input order). */
  latest: EarlyStageMemoryEntry | null;
  /** All entries, latest first. Length-capped for safety. */
  entries: readonly EarlyStageMemoryEntry[];
  /** Count of entries that carried a known milestone value. */
  milestoneHistoryCount: number;
  /** Resolved stage context (from latest entry that has one), or null. */
  stageContextLabel: string | null;
  /** Items added to the AI Doctor "Missing information" list. */
  missingInformation: readonly string[];
  /** Cautious guidance lines surfaced to AI Doctor consumers verbatim. */
  cautionNotes: readonly string[];
}

/** Permissive diary/grow_event row shape used by the AI Doctor pipeline. */
export interface EarlyStageDiaryRowLike {
  occurred_at?: string | null;
  captured_at?: string | null;
  event_type?: string | null;
  source?: string | null;
  /** Free-form details JSON — may contain `early_stage` envelope. */
  details?: unknown;
}

export interface BuildEarlyStageAiDoctorContextInput {
  /** Diary rows to scan for `details.early_stage` envelopes. */
  diaryRows?: readonly EarlyStageDiaryRowLike[] | null;
  /** True when at least one trustworthy live sensor snapshot exists. */
  hasRecentSensorSnapshot?: boolean | null;
  /** True when at least one recent photo exists for the plant. */
  hasRecentPhoto?: boolean | null;
}

/** Maximum entries surfaced to AI Doctor (oldest entries are dropped). */
export const EARLY_STAGE_AI_DOCTOR_MAX_ENTRIES = 10;

/** Caution copy rendered verbatim by AI Doctor consumers. */
export const EARLY_STAGE_AI_DOCTOR_CAUTION_REPEATED_OBS =
  "Early-stage assessment needs repeated observations — do not diagnose from a single milestone or photo.";

export const EARLY_STAGE_AI_DOCTOR_CAUTION_GENTLE =
  "Seedlings recover slowly from aggressive changes — prefer stable environment over intervention.";

export const EARLY_STAGE_AI_DOCTOR_MISSING_PHOTO = "Recent photo of the seedling";
export const EARLY_STAGE_AI_DOCTOR_MISSING_SENSOR =
  "Current sensor snapshot for the tent";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resolveSource(raw: unknown): EarlyStageMemorySourceLabel {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  // Only `quick_log` is mapped to the Quick Log label. Anything else
  // (including unknown enums) falls back to the generic "Manual diary"
  // label so we never echo a raw source string into AI Doctor.
  if (s === "quick_log" || s === "quicklog") return "Quick Log";
  return "Manual diary";
}

function resolveCapturedAt(row: EarlyStageDiaryRowLike): string | null {
  const candidate = row.occurred_at ?? row.captured_at ?? null;
  if (typeof candidate !== "string" || candidate.length === 0) return null;
  const ms = Date.parse(candidate);
  if (!Number.isFinite(ms)) return null;
  return candidate;
}

function compareEntriesDesc(
  a: { capturedAt: string | null; index: number },
  b: { capturedAt: string | null; index: number },
): number {
  const at = a.capturedAt ? Date.parse(a.capturedAt) : Number.NEGATIVE_INFINITY;
  const bt = b.capturedAt ? Date.parse(b.capturedAt) : Number.NEGATIVE_INFINITY;
  if (at !== bt) return bt - at;
  // Stable tie-break by original input order (earlier inputs come first).
  return a.index - b.index;
}

/**
 * Build a safe, read-only early-stage AI Doctor context from diary rows.
 * Deterministic for any given input.
 */
export function buildEarlyStageAiDoctorContext(
  input: BuildEarlyStageAiDoctorContextInput,
): EarlyStageAiDoctorContext {
  const rows = Array.isArray(input.diaryRows) ? input.diaryRows : [];

  const collected: Array<EarlyStageMemoryEntry & { index: number }> = [];
  rows.forEach((row, index) => {
    if (!isPlainObject(row)) return;
    const vm = buildEarlyStageTimelineViewModel(row.details);
    if (!vm) return;
    collected.push({
      milestoneLabel: vm.milestoneLabel,
      milestoneUnknown: vm.milestoneUnknown,
      vigorLabel: vm.vigorLabel,
      vigorUnknown: vm.vigorUnknown,
      note: vm.note,
      stageContextLabel: vm.stageContextLabel,
      capturedAt: resolveCapturedAt(row),
      source: resolveSource(row.source),
      index,
    });
  });

  collected.sort(compareEntriesDesc);

  const capped = collected.slice(0, EARLY_STAGE_AI_DOCTOR_MAX_ENTRIES);
  const entries: EarlyStageMemoryEntry[] = capped.map(
    ({ index: _index, ...entry }) => entry,
  );
  const latest = entries[0] ?? null;
  const milestoneHistoryCount = entries.filter(
    (e) => e.milestoneLabel !== null,
  ).length;
  const stageContextLabel =
    entries.find((e) => e.stageContextLabel !== null)?.stageContextLabel ?? null;

  const missingInformation: string[] = [];
  if (entries.length > 0) {
    if (input.hasRecentPhoto === false) {
      missingInformation.push(EARLY_STAGE_AI_DOCTOR_MISSING_PHOTO);
    }
    if (input.hasRecentSensorSnapshot === false) {
      missingInformation.push(EARLY_STAGE_AI_DOCTOR_MISSING_SENSOR);
    }
  }

  const cautionNotes: string[] =
    entries.length > 0
      ? [
          EARLY_STAGE_AI_DOCTOR_CAUTION_REPEATED_OBS,
          EARLY_STAGE_AI_DOCTOR_CAUTION_GENTLE,
        ]
      : [];

  return {
    hasEarlyStageMemory: entries.length > 0,
    latest,
    entries: Object.freeze(entries),
    milestoneHistoryCount,
    stageContextLabel,
    missingInformation: Object.freeze(missingInformation),
    cautionNotes: Object.freeze(cautionNotes),
  };
}
