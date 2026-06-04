/**
 * environmentCsvImportViewModel — pure state machine + reducer for the CSV
 * Drop import flow. UI components import this; no I/O, no React, no Supabase.
 *
 * Flow: idle → parsing → unit_confirm? → preview → inserting → done | error
 */
import {
  parseEnvironmentCSV,
  renormalizeWithUnit,
  type ParseEnvironmentCsvResult,
  type ParsedEnvironmentRow,
} from "@/lib/csvParser";

export type ImportPhase =
  | "idle"
  | "parsing"
  | "unit_confirm"
  | "preview"
  | "inserting"
  | "done"
  | "error";

export interface ImportState {
  phase: ImportPhase;
  parsed: ParseEnvironmentCsvResult | null;
  insertedCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export const INITIAL_IMPORT_STATE: ImportState = {
  phase: "idle",
  parsed: null,
  insertedCount: 0,
  errorCode: null,
  errorMessage: null,
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
    phase: result.isAmbiguous ? "unit_confirm" : "preview",
    parsed: result,
  };
}

export function applyUnitChoice(
  state: ImportState,
  unit: "F" | "C",
): ImportState {
  if (state.phase !== "unit_confirm" || !state.parsed) return state;
  const renorm = renormalizeWithUnit(state.parsed, unit);
  return { ...state, parsed: renorm, phase: "preview" };
}

export function cancelImport(): ImportState {
  return INITIAL_IMPORT_STATE;
}

/** Convenience wrapper that calls the parser and reduces the result. */
export async function runParseFile(file: File): Promise<{
  next: ImportState;
  result: ParseEnvironmentCsvResult;
}> {
  const result = await parseEnvironmentCSV(file);
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

export function buildCoveragePreview(
  parsed: ParseEnvironmentCsvResult | null,
): CoveragePreview {
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
    const ms =
      Date.parse(parsed.dateRange.end) - Date.parse(parsed.dateRange.start);
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
      ? `Imported safely with ${skipped} row${skipped === 1 ? "" : "s"} skipped.`
      : null,
  };
}

/** Rows ready for the confirm-only persistence step. */
export function rowsToPersist(
  parsed: ParseEnvironmentCsvResult | null,
): readonly ParsedEnvironmentRow[] {
  return parsed?.validRows ?? [];
}
