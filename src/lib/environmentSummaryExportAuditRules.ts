/**
 * Local-only export audit log for the Environment Summary Report.
 *
 * Browser localStorage only. No network. No Supabase. No analytics SDKs.
 * Bounded ring buffer of the last 50 events. Corrupt storage resets safely.
 *
 * Pure-ish: side effects are limited to the injected Storage. `now` and
 * `idFactory` are injectable for deterministic tests.
 */

export const ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY =
  "verdant.environmentSummaryExportAudit.v1";

export const ENVIRONMENT_SUMMARY_EXPORT_AUDIT_MAX_EVENTS = 50;

export type EnvironmentSummaryExportAuditEventType =
  | "full_report_print_opened"
  | "drilldown_print_opened";

export interface EnvironmentSummaryExportAuditEvent {
  id: string;
  eventType: EnvironmentSummaryExportAuditEventType;
  occurredAt: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  reportMode: "full_report" | "drilldown";
  issueRuleId?: string | null;
  issueLabel?: string | null;
  source: "local_only";
}

export interface EnvironmentSummaryExportAuditOptions {
  /** Injectable storage. Defaults to globalThis.localStorage. */
  storage?: Storage | null;
  /** Injectable clock. Defaults to new Date(). */
  now?: () => Date;
  /** Injectable id factory. Defaults to a time + random id. */
  idFactory?: () => string;
}

export interface RecordEnvironmentSummaryExportAuditInput {
  eventType: EnvironmentSummaryExportAuditEventType;
  startDate: string;
  endDate: string;
  reportMode: "full_report" | "drilldown";
  issueRuleId?: string | null;
  issueLabel?: string | null;
}

function getStorage(opts?: EnvironmentSummaryExportAuditOptions): Storage | null {
  if (opts && Object.prototype.hasOwnProperty.call(opts, "storage")) {
    return opts.storage ?? null;
  }
  try {
    return typeof globalThis !== "undefined" &&
      (globalThis as any).localStorage
      ? ((globalThis as any).localStorage as Storage)
      : null;
  } catch {
    return null;
  }
}

function defaultIdFactory(now: Date): string {
  const t = now.getTime();
  const rand = Math.random().toString(36).slice(2, 10);
  return `evt_${t}_${rand}`;
}

function isAuditEvent(v: unknown): v is EnvironmentSummaryExportAuditEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as any;
  return (
    typeof e.id === "string" &&
    (e.eventType === "full_report_print_opened" ||
      e.eventType === "drilldown_print_opened") &&
    typeof e.occurredAt === "string" &&
    e.dateRange &&
    typeof e.dateRange.startDate === "string" &&
    typeof e.dateRange.endDate === "string" &&
    (e.reportMode === "full_report" || e.reportMode === "drilldown") &&
    e.source === "local_only"
  );
}

export function readEnvironmentSummaryExportAuditEvents(
  opts?: EnvironmentSummaryExportAuditOptions,
): EnvironmentSummaryExportAuditEvent[] {
  const storage = getStorage(opts);
  if (!storage) return [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt → reset.
    try {
      storage.removeItem(ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY);
    } catch {
      // ignore
    }
    return [];
  }
  if (!Array.isArray(parsed)) {
    try {
      storage.removeItem(ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY);
    } catch {
      // ignore
    }
    return [];
  }
  const events = parsed.filter(isAuditEvent);
  // Defensive trim to max length.
  return events.slice(-ENVIRONMENT_SUMMARY_EXPORT_AUDIT_MAX_EVENTS);
}

export function recordEnvironmentSummaryExportAuditEvent(
  input: RecordEnvironmentSummaryExportAuditInput,
  opts?: EnvironmentSummaryExportAuditOptions,
): EnvironmentSummaryExportAuditEvent | null {
  const storage = getStorage(opts);
  const now = (opts?.now ?? (() => new Date()))();
  const id = (opts?.idFactory ?? (() => defaultIdFactory(now)))();
  const evt: EnvironmentSummaryExportAuditEvent = {
    id,
    eventType: input.eventType,
    occurredAt: now.toISOString(),
    dateRange: {
      startDate: input.startDate,
      endDate: input.endDate,
    },
    reportMode: input.reportMode,
    issueRuleId: input.issueRuleId ?? null,
    issueLabel: input.issueLabel ?? null,
    source: "local_only",
  };
  if (!storage) return evt;
  const existing = readEnvironmentSummaryExportAuditEvents(opts);
  const next = [...existing, evt].slice(
    -ENVIRONMENT_SUMMARY_EXPORT_AUDIT_MAX_EVENTS,
  );
  try {
    storage.setItem(
      ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Quota / unavailable → swallow; in-memory event still returned.
  }
  return evt;
}

export function clearEnvironmentSummaryExportAuditEvents(
  opts?: EnvironmentSummaryExportAuditOptions,
): void {
  const storage = getStorage(opts);
  if (!storage) return;
  try {
    storage.removeItem(ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
