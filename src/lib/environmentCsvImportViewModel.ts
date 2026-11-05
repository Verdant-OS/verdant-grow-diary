/**
 * environmentCsvImportViewModel — pure state machine + reducer for the CSV
 * Drop import flow. UI components import this; no I/O, no React, no Supabase.
 *
 * Flow: idle → parsing → time_confirm? → (parsing →) unit_confirm? → preview
 *       → inserting → done | error
 *
 * time_confirm is entered when any row has a wall-clock timestamp and no
 * source zone was chosen. A preview that still holds unresolved times
 * (daylight-saving fold or gap) is shown but is never write-eligible.
 */
import {
  parseEnvironmentCSV,
  renormalizeWithUnit,
  type ParseEnvironmentCsvOptions,
  type ParseEnvironmentCsvResult,
  type ParsedEnvironmentRow,
  type UnresolvedTimeRow,
} from "@/lib/csvParser";

export type ImportPhase =
  "idle" | "parsing" | "time_confirm" | "unit_confirm" | "preview" | "inserting" | "done" | "error";

export interface ImportState {
  phase: ImportPhase;
  parsed: ParseEnvironmentCsvResult | null;
  insertedCount: number;
  /** Sensor rows that contributed an insert. Null until confirm returns. */
  contributedSensorRowCount: number | null;
  /** Rows skipped as duplicates (same file or already imported for this tent). */
  duplicateCount: number;
  /** Earlier batches committed before a later batch failed. */
  partialWrite: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  /**
   * The grower's explicit choice to leave out rows whose time could not be
   * established (DST fold/gap) for this exact parse. Null = not chosen.
   * Any new parse (file or zone change) or reset clears it.
   */
  timeExclusion: TimeExclusion | null;
}

export interface TimeExclusion {
  sourceTimeZone: string | null;
  rowNumbers: readonly number[];
}

export const INITIAL_IMPORT_STATE: ImportState = {
  phase: "idle",
  parsed: null,
  insertedCount: 0,
  contributedSensorRowCount: null,
  duplicateCount: 0,
  partialWrite: false,
  errorCode: null,
  errorMessage: null,
  timeExclusion: null,
};

export function startParsingState(): ImportState {
  return { ...INITIAL_IMPORT_STATE, phase: "parsing" };
}

export function reduceParseResult(
  prev: ImportState,
  result: ParseEnvironmentCsvResult,
): ImportState {
  if (result.errors.length > 0) {
    const e = result.errors[0];
    return {
      ...INITIAL_IMPORT_STATE,
      phase: "error",
      errorCode: e.code,
      errorMessage: e.message,
      parsed: result,
    };
  }
  return {
    ...INITIAL_IMPORT_STATE,
    phase: needsSourceTimeZone(result)
      ? "time_confirm"
      : result.isAmbiguous
        ? "unit_confirm"
        : "preview",
    parsed: result,
  };
}

/** True when wall-clock rows exist and no source zone was chosen. */
export function needsSourceTimeZone(parsed: ParseEnvironmentCsvResult | null): boolean {
  return (parsed?.unresolvedTimeRows ?? []).some((r) => r.reason === "needs_source_time_zone");
}

/** True while any row lacks an established observation instant. */
export function hasUnresolvedTime(parsed: ParseEnvironmentCsvResult | null): boolean {
  return (parsed?.unresolvedTimeRows ?? []).length > 0;
}

/** Row numbers that a grower may opt to leave out: folds and gaps only. */
function excludableRowNumbers(parsed: ParseEnvironmentCsvResult | null): number[] | null {
  const unresolved = parsed?.unresolvedTimeRows ?? [];
  if (unresolved.length === 0) return null;
  if (unresolved.some((r) => r.reason === "needs_source_time_zone")) return null;
  return unresolved.map((r) => r.rowNumber);
}

/** True only when the exclusion names exactly this parse's unresolved rows and zone. */
export function exclusionCoversUnresolved(
  parsed: ParseEnvironmentCsvResult | null,
  exclusion: TimeExclusion | null | undefined,
): boolean {
  const rows = excludableRowNumbers(parsed);
  if (!rows || !exclusion) return false;
  if (exclusion.sourceTimeZone !== (parsed?.sourceTimeZone ?? null)) return false;
  if (exclusion.rowNumbers.length !== rows.length) return false;
  return rows.every((n, i) => exclusion.rowNumbers[i] === n);
}

/** Whether unresolved times still stop the write. */
export function timeBlocksWrite(
  parsed: ParseEnvironmentCsvResult | null,
  exclusion: TimeExclusion | null | undefined,
): boolean {
  return hasUnresolvedTime(parsed) && !exclusionCoversUnresolved(parsed, exclusion);
}

/** Explicit opt-in: leave out the DST fold/gap rows and import the rest. */
export function excludeUnresolvedTimeRows(state: ImportState): ImportState {
  if (state.phase !== "preview") return state;
  const rows = excludableRowNumbers(state.parsed);
  if (!rows || (state.parsed?.validRows.length ?? 0) === 0) return state;
  return {
    ...state,
    timeExclusion: { sourceTimeZone: state.parsed?.sourceTimeZone ?? null, rowNumbers: rows },
  };
}

export function undoTimeExclusion(state: ImportState): ImportState {
  return state.timeExclusion ? { ...state, timeExclusion: null } : state;
}

/** Return to the zone question for the same file (e.g. "Change time zone"). */
export function reopenTimeZoneChoice(state: ImportState): ImportState {
  if (state.phase !== "preview" && state.phase !== "unit_confirm") return state;
  if (
    !state.parsed ||
    (state.parsed.sourceTimeZone == null && !needsSourceTimeZone(state.parsed))
  ) {
    return state;
  }
  return { ...state, phase: "time_confirm", timeExclusion: null };
}

/** The Confirm gate. The persistence adapter re-checks independently. */
export function canConfirmImport(state: ImportState): boolean {
  return (
    (state.phase === "preview" || state.phase === "error") &&
    !timeBlocksWrite(state.parsed, state.timeExclusion) &&
    (state.parsed?.validRows.length ?? 0) > 0
  );
}

export function applyUnitChoice(state: ImportState, unit: "F" | "C"): ImportState {
  if (state.phase !== "unit_confirm" || !state.parsed) return state;
  const renorm = renormalizeWithUnit(state.parsed, unit);
  return { ...state, parsed: renorm, phase: "preview" };
}

export function cancelImport(): ImportState {
  return INITIAL_IMPORT_STATE;
}

/**
 * Calm, grower-facing copy for a completed (non-error) CSV import.
 * Never mentions raw database internals — duplicates are an expected,
 * safe outcome, not a failure.
 */
export function buildCsvImportDoneMessage(
  insertedCount: number,
  duplicateCount: number,
  sensorRowCount?: number,
  timeExcludedCount = 0,
): string {
  const excludedNote =
    timeExcludedCount > 0
      ? ` Left out ${timeExcludedCount} row${timeExcludedCount === 1 ? "" : "s"} whose time was unclear around a clock change, as you chose.`
      : "";
  if (insertedCount === 0 && duplicateCount > 0) {
    return `No new readings imported. These readings already exist in Verdant.${excludedNote}`;
  }
  const stored =
    sensorRowCount != null && sensorRowCount > 0 && sensorRowCount !== insertedCount
      ? `Imported ${insertedCount} CSV reading(s). From ${sensorRowCount} sensor row(s).`
      : `Imported ${insertedCount} CSV reading(s).`;
  if (duplicateCount > 0) {
    return `${stored} Skipped ${duplicateCount} duplicate reading(s) already in Verdant.${excludedNote}`;
  }
  return `${stored}${excludedNote}`;
}

/** Convenience wrapper that calls the parser and reduces the result. */
export async function runParseFile(
  file: File,
  options: ParseEnvironmentCsvOptions = {},
): Promise<{
  next: ImportState;
  result: ParseEnvironmentCsvResult;
}> {
  const result = await parseEnvironmentCSV(file, options);
  return { next: reduceParseResult(startParsingState(), result), result };
}

// ---------- preview / coverage ----------

export interface CoveragePreview {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  daysCovered: number;
  dateRange: { start: string; end: string } | null;
  partialSuccess: boolean;
  partialMessage: string | null;
}

export function buildCoveragePreview(parsed: ParseEnvironmentCsvResult | null): CoveragePreview {
  if (!parsed) {
    return {
      totalRows: 0,
      validRows: 0,
      skippedRows: 0,
      daysCovered: 0,
      dateRange: null,
      partialSuccess: false,
      partialMessage: null,
    };
  }
  const valid = parsed.validRows.length;
  const skipped = parsed.skippedRows.length;
  const total = valid + skipped;
  let days = 0;
  if (parsed.dateRange) {
    const ms = Date.parse(parsed.dateRange.end) - Date.parse(parsed.dateRange.start);
    days = Math.max(1, Math.ceil(ms / 86_400_000));
  } else if (valid > 0) {
    days = 1;
  }
  const partialSuccess = skipped > 0 && valid > 0;
  return {
    totalRows: total,
    validRows: valid,
    skippedRows: skipped,
    daysCovered: days,
    dateRange: parsed.dateRange,
    partialSuccess,
    partialMessage: partialSuccess
      ? `Ready to import. ${skipped} row${skipped === 1 ? "" : "s"} will be skipped. Nothing is saved until you confirm.`
      : null,
  };
}

/**
 * Rows ready for the confirm-only persistence step. Empty while any time is
 * unresolved, unless the grower explicitly excluded exactly those rows.
 * Excluded rows are never in validRows, so they can never be written.
 */
export function rowsToPersist(
  parsed: ParseEnvironmentCsvResult | null,
  exclusion: TimeExclusion | null = null,
): readonly ParsedEnvironmentRow[] {
  if (timeBlocksWrite(parsed, exclusion)) return [];
  return parsed?.validRows ?? [];
}

// ---------- time preview ----------

export interface CsvTimeSample {
  rowNumber: number;
  sourceText: string;
  zoneLabel: string;
  utcOffset: string;
  observedAt: string; // ISO UTC
}

export interface CsvTimePreview {
  /** The confirmed zone, or null when every row carried its own offset. */
  sourceTimeZone: string | null;
  /** First row, each offset change (e.g. both sides of a DST change), last row. */
  samples: readonly CsvTimeSample[];
  unresolvedCount: number;
  ambiguousCount: number;
  nonexistentCount: number;
  /** First few unresolved rows, in file order, for the grower to look up. */
  unresolvedExamples: readonly UnresolvedTimeRow[];
}

export function buildTimePreview(
  parsed: ParseEnvironmentCsvResult | null,
  maxSamples = 6,
  maxExamples = 5,
): CsvTimePreview {
  const rows = parsed?.validRows ?? [];
  const picked: ParsedEnvironmentRow[] = [];
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    const offsetChanged =
      prev != null && prev.time_provenance?.utc_offset !== row.time_provenance?.utc_offset;
    if (i === 0 || offsetChanged) {
      if (offsetChanged && prev && picked[picked.length - 1] !== prev) picked.push(prev);
      picked.push(row);
    }
  });
  const last = rows[rows.length - 1];
  if (last && picked[picked.length - 1] !== last) picked.push(last);
  const unresolved = parsed?.unresolvedTimeRows ?? [];
  return {
    sourceTimeZone: parsed?.sourceTimeZone ?? null,
    samples: picked.slice(0, maxSamples).map((r) => ({
      rowNumber: r.rowNumber,
      sourceText: r.time_provenance?.source_text ?? r.captured_at,
      zoneLabel: r.time_provenance?.source_time_zone ?? "offset in file",
      utcOffset: r.time_provenance?.utc_offset ?? "",
      observedAt: r.captured_at,
    })),
    unresolvedCount: unresolved.length,
    ambiguousCount: unresolved.filter((r) => r.reason === "ambiguous_local_time").length,
    nonexistentCount: unresolved.filter((r) => r.reason === "nonexistent_local_time").length,
    unresolvedExamples: unresolved.slice(0, maxExamples),
  };
}
