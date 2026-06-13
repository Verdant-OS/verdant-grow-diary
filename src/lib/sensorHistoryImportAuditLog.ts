/**
 * sensorHistoryImportAuditLog — local-only audit ledger for imported
 * sensor history (CSV/XLSX). Browser localStorage only.
 *
 * Hard contract:
 *  - Pure-ish: side effects limited to injected Storage.
 *  - No network. No Supabase. No alerts. No Action Queue. No AI. No
 *    device control. No schema/RLS/Edge changes.
 *  - Never stores raw_payload, raw rows, device serials, bridge tokens,
 *    source file contents, internal IDs, or full import batch IDs.
 *  - Canonical source label persisted on every event = "CSV history".
 *  - Bounded ring buffer; corrupt storage resets safely.
 */

export const SENSOR_HISTORY_IMPORT_AUDIT_STORAGE_KEY =
  "verdant.sensorHistoryImportAudit.v1";

export const SENSOR_HISTORY_IMPORT_AUDIT_MAX_EVENTS = 50;

export const SENSOR_HISTORY_CANONICAL_SOURCE_LABEL = "CSV history" as const;

export type SensorHistoryImportSourceAppId =
  | "spider_farmer"
  | "vivosun"
  | "verdant_genetics_xlsx"
  | "ac_infinity";

export const SENSOR_HISTORY_IMPORT_SOURCE_APP_LABELS: Record<
  SensorHistoryImportSourceAppId,
  string
> = {
  spider_farmer: "Spider Farmer CSV",
  vivosun: "Vivosun CSV",
  verdant_genetics_xlsx: "Verdant Genetics XLSX",
  ac_infinity: "AC Infinity CSV",
};

export type SensorHistoryImportFileType = "csv" | "xlsx";

export interface SensorHistoryImportAuditEvent {
  id: string;
  occurredAt: string;
  sourceAppId: SensorHistoryImportSourceAppId;
  sourceAppLabel: string;
  canonicalSourceLabel: typeof SENSOR_HISTORY_CANONICAL_SOURCE_LABEL;
  fileType: SensorHistoryImportFileType;
  acceptedRowCount: number;
  rejectedRowCount: number;
  dateRange: { start: string; end: string } | null;
  mappedTentLabels: string[];
  mappedSensorGroups: string[];
}

export interface SensorHistoryImportAuditOptions {
  storage?: Storage | null;
  now?: () => Date;
  idFactory?: () => string;
}

export interface RecordSensorHistoryImportAuditInput {
  sourceAppId: SensorHistoryImportSourceAppId;
  fileType: SensorHistoryImportFileType;
  acceptedRowCount: number;
  rejectedRowCount: number;
  dateRange?: { start: string; end: string } | null;
  mappedTentLabels?: ReadonlyArray<string> | null;
  mappedSensorGroups?: ReadonlyArray<string> | null;
}

function getStorage(opts?: SensorHistoryImportAuditOptions): Storage | null {
  if (opts && Object.prototype.hasOwnProperty.call(opts, "storage")) {
    return opts.storage ?? null;
  }
  try {
    return typeof globalThis !== "undefined" &&
      (globalThis as { localStorage?: Storage }).localStorage
      ? (globalThis as { localStorage: Storage }).localStorage
      : null;
  } catch {
    return null;
  }
}

function defaultIdFactory(now: Date): string {
  const t = now.getTime();
  const rand = Math.random().toString(36).slice(2, 10);
  return `imp_${t}_${rand}`;
}

function safeNonNegInt(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return v < 0 ? 0 : v;
}

function sanitizeLabels(
  list: ReadonlyArray<string> | null | undefined,
): string[] {
  if (!list) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s.length > 80 ? `${s.slice(0, 79)}…` : s);
    if (out.length >= 12) break;
  }
  return out;
}

function sanitizeDateRange(
  r: { start: string; end: string } | null | undefined,
): { start: string; end: string } | null {
  if (!r) return null;
  if (typeof r.start !== "string" || typeof r.end !== "string") return null;
  const s = r.start.trim();
  const e = r.end.trim();
  if (!s || !e) return null;
  return { start: s.slice(0, 30), end: e.slice(0, 30) };
}

function isAuditEvent(v: unknown): v is SensorHistoryImportAuditEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.occurredAt === "string" &&
    typeof e.sourceAppId === "string" &&
    typeof e.sourceAppLabel === "string" &&
    e.canonicalSourceLabel === SENSOR_HISTORY_CANONICAL_SOURCE_LABEL &&
    (e.fileType === "csv" || e.fileType === "xlsx") &&
    typeof e.acceptedRowCount === "number" &&
    typeof e.rejectedRowCount === "number" &&
    Array.isArray(e.mappedTentLabels) &&
    Array.isArray(e.mappedSensorGroups)
  );
}

export function readSensorHistoryImportAuditEvents(
  opts?: SensorHistoryImportAuditOptions,
): SensorHistoryImportAuditEvent[] {
  const storage = getStorage(opts);
  if (!storage) return [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(SENSOR_HISTORY_IMPORT_AUDIT_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      storage.removeItem(SENSOR_HISTORY_IMPORT_AUDIT_STORAGE_KEY);
    } catch {
      // ignore
    }
    return [];
  }
  if (!Array.isArray(parsed)) {
    try {
      storage.removeItem(SENSOR_HISTORY_IMPORT_AUDIT_STORAGE_KEY);
    } catch {
      // ignore
    }
    return [];
  }
  return parsed
    .filter(isAuditEvent)
    .slice(-SENSOR_HISTORY_IMPORT_AUDIT_MAX_EVENTS);
}

export function recordSensorHistoryImportAuditEvent(
  input: RecordSensorHistoryImportAuditInput,
  opts?: SensorHistoryImportAuditOptions,
): SensorHistoryImportAuditEvent | null {
  const storage = getStorage(opts);
  const now = (opts?.now ?? (() => new Date()))();
  const id = (opts?.idFactory ?? (() => defaultIdFactory(now)))();
  const label =
    SENSOR_HISTORY_IMPORT_SOURCE_APP_LABELS[input.sourceAppId] ??
    "Unknown source";

  const evt: SensorHistoryImportAuditEvent = {
    id,
    occurredAt: now.toISOString(),
    sourceAppId: input.sourceAppId,
    sourceAppLabel: label,
    canonicalSourceLabel: SENSOR_HISTORY_CANONICAL_SOURCE_LABEL,
    fileType: input.fileType,
    acceptedRowCount: safeNonNegInt(input.acceptedRowCount),
    rejectedRowCount: safeNonNegInt(input.rejectedRowCount),
    dateRange: sanitizeDateRange(input.dateRange ?? null),
    mappedTentLabels: sanitizeLabels(input.mappedTentLabels ?? null),
    mappedSensorGroups: sanitizeLabels(input.mappedSensorGroups ?? null),
  };

  if (!storage) return evt;
  const existing = readSensorHistoryImportAuditEvents(opts);
  const next = [...existing, evt].slice(
    -SENSOR_HISTORY_IMPORT_AUDIT_MAX_EVENTS,
  );
  try {
    storage.setItem(
      SENSOR_HISTORY_IMPORT_AUDIT_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // swallow quota/unavailable; in-memory event still returned
  }
  return evt;
}

export function clearSensorHistoryImportAuditEvents(
  opts?: SensorHistoryImportAuditOptions,
): void {
  const storage = getStorage(opts);
  if (!storage) return;
  try {
    storage.removeItem(SENSOR_HISTORY_IMPORT_AUDIT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Return the most recent `limit` events, newest first.
 */
export function getRecentSensorHistoryImportAuditEvents(
  limit = 10,
  opts?: SensorHistoryImportAuditOptions,
): SensorHistoryImportAuditEvent[] {
  const cap = limit > 0 ? Math.floor(limit) : 0;
  const all = readSensorHistoryImportAuditEvents(opts);
  // newest first
  return all.slice(-cap).reverse();
}
