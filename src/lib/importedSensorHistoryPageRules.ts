/** Pure bounds, page summaries, and UTC labels for read-only CSV history browsing. */
export const IMPORTED_SENSOR_HISTORY_PAGE_SIZE = 50;

/** In imported history, ts may be ingestion time and cannot establish observation time. */
export function prepareImportedSensorHistoryObservationRows<T extends { ts?: string | null }>(
  rows: readonly T[] | null | undefined,
): Array<T & { ts: null }> {
  return (rows ?? []).map((row) => ({ ...row, ts: null }));
}

const DAY_MS = 86_400_000;
const MAX_PAGE = Math.floor(
  (Number.MAX_SAFE_INTEGER - (IMPORTED_SENSOR_HISTORY_PAGE_SIZE - 1)) /
    IMPORTED_SENSOR_HISTORY_PAGE_SIZE,
);

export interface ImportedSensorHistorySelection {
  fromDate: string;
  throughDate: string;
  page: number;
}

export interface ImportedSensorHistorySelectionResult {
  selection: ImportedSensorHistorySelection;
  startAt: string | null;
  endBefore: string | null;
  error: string | null;
  offset: number;
}

function normalizePage(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  const whole = Math.floor(value);
  return Number.isSafeInteger(whole) ? Math.min(whole, MAX_PAGE) : 0;
}

function parseUtcDay(value: string, maxYear = 9998): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year < 1 || year > maxYear) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  // Date.parse normalizes some impossible dates (for example February 30).
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

/** Blank bounds stay open; invalid supplied bounds fail closed instead of becoming open. */
export function normalizeImportedSensorHistorySelection(
  input?: Partial<ImportedSensorHistorySelection> | null,
): ImportedSensorHistorySelectionResult {
  const rawFrom = input?.fromDate;
  const rawThrough = input?.throughDate;
  const fromDate = typeof rawFrom === "string" ? rawFrom : "";
  const throughDate = typeof rawThrough === "string" ? rawThrough : "";
  const page = normalizePage(input?.page);
  const selection = { fromDate, throughDate, page };
  const offset = page * IMPORTED_SENSOR_HISTORY_PAGE_SIZE;
  const fromMs = fromDate === "" ? null : parseUtcDay(fromDate);
  const throughMs = throughDate === "" ? null : parseUtcDay(throughDate);
  let error: string | null = null;

  if ((rawFrom !== undefined && typeof rawFrom !== "string") || (fromDate && fromMs === null)) {
    error = "Enter a valid From date (YYYY-MM-DD, years 0001-9998).";
  } else if (
    (rawThrough !== undefined && typeof rawThrough !== "string") ||
    (throughDate && throughMs === null)
  ) {
    error = "Enter a valid Through date (YYYY-MM-DD, years 0001-9998).";
  } else if (fromMs !== null && throughMs !== null && fromMs > throughMs) {
    error = "From date must be on or before Through date.";
  }

  return {
    selection,
    startAt: !error && fromMs !== null ? new Date(fromMs).toISOString() : null,
    endBefore:
      !error && throughMs !== null ? new Date(throughMs + DAY_MS).toISOString() : null,
    error,
    offset,
  };
}

export interface ImportedSensorHistoryPageSummary {
  pageCount: number;
  firstRow: number;
  lastRow: number;
  hasNewer: boolean;
  hasOlder: boolean;
  lastPage: number;
}

/** The total must be an actual successful count, never an estimate or missing response. */
export function buildImportedSensorHistoryPageSummary(
  total: number,
  page: number,
): ImportedSensorHistoryPageSummary {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Imported sensor history total must be a nonnegative safe integer.");
  }
  if (total === 0) {
    return {
      pageCount: 0,
      firstRow: 0,
      lastRow: 0,
      hasNewer: false,
      hasOlder: false,
      lastPage: 0,
    };
  }

  const normalizedPage = normalizePage(page);
  const offset = normalizedPage * IMPORTED_SENSOR_HISTORY_PAGE_SIZE;
  const pageCount = Math.ceil(total / IMPORTED_SENSOR_HISTORY_PAGE_SIZE);
  const lastPage = pageCount - 1;
  const hasRows = offset < total;
  return {
    pageCount,
    firstRow: hasRows ? offset + 1 : 0,
    lastRow: hasRows ? Math.min(total, offset + IMPORTED_SENSOR_HISTORY_PAGE_SIZE) : 0,
    hasNewer: normalizedPage > 0,
    hasOlder: normalizedPage < lastPage,
    lastPage,
  };
}

/** An explicit timezone is required so browser locale never changes observation labels. */
export function formatImportedSensorHistoryObservation(
  timestamp: string | null | undefined,
): string {
  if (typeof timestamp !== "string") return "Unknown observation time";
  const trimmed = timestamp.trim();
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
      trimmed,
    ) ||
    parseUtcDay(trimmed.slice(0, 10), 9999) === null
  ) {
    return "Unknown observation time";
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms)
    ? new Date(ms).toISOString().replace("T", " ").replace("Z", " UTC")
    : "Unknown observation time";
}
