/**
 * Optional Quick Log note occurrence time.
 *
 * Pure. The field is local wall-clock (`datetime-local`). Persistence is UTC
 * ISO. Leaving the field untouched, or clearing it, returns `pOccurredAt:
 * null` so each caller keeps today's default: the legacy note RPC sends null
 * and the server stamps save time; Quick Log v2 still sends client-now at
 * the click. A touched value is the grower's chosen minute.
 *
 * Included: legacy observation and note, and Quick Log v2 `note`.
 * Excluded: watering (recovery replays a null occurrence), environment
 * checks (those are manual sensor measurements), and feed. Archived grows
 * have no end timestamp, so the upper bound is now unless a caller supplies
 * an explicit end. The lower bound is the later of the grow start and the
 * selected plant start, floored to the local minute so a minute picker can
 * select the start minute.
 */

export const QUICK_LOG_NOTE_OCCURRED_AT_LABEL = "When it happened" as const;

export const QUICK_LOG_NOTE_OCCURRED_AT_HELPER =
  "Defaults to now, in your local timezone. Leave it unchanged to save at the current time." as const;

export const QUICK_LOG_NOTE_OCCURRED_AT_FUTURE =
  "That time is in the future. Choose the current time or earlier." as const;

export const QUICK_LOG_NOTE_OCCURRED_AT_BEFORE_LIFETIME =
  "That time is before this grow or plant started." as const;

export const QUICK_LOG_NOTE_OCCURRED_AT_AFTER_LIFETIME =
  "That time is after this grow ended." as const;

export const QUICK_LOG_NOTE_OCCURRED_AT_INVALID = "Enter a valid date and time." as const;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export type QuickLogNoteOccurredAtDraft = {
  touched: boolean;
  value: string;
};

export const EMPTY_QUICK_LOG_NOTE_OCCURRED_AT: QuickLogNoteOccurredAtDraft = {
  touched: false,
  value: "",
};

export type QuickLogNoteOccurredAtResult =
  | { ok: true; mode: "default"; pOccurredAt: null }
  | { ok: true; mode: "chosen"; pOccurredAt: string }
  | {
      ok: false;
      reason:
        | "invalid_occurred_at"
        | "occurred_at_in_future"
        | "occurred_at_before_lifetime"
        | "occurred_at_after_lifetime";
      message: string;
    };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseBound(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function startOfLocalMinute(ms: number): number {
  const date = new Date(ms);
  date.setSeconds(0, 0);
  return date.getTime();
}

export function formatQuickLogNoteLocalDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Local `YYYY-MM-DDTHH:mm`. Overflow dates such as February 31 are rejected. */
export function parseQuickLogNoteLocalDateTime(value: string): number | null {
  const match = LOCAL_DATE_TIME.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date.getTime();
}

export function canonicalQuickLogOccurredAtIso(value: string): string | null {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function quickLogRowStartedAt(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const value = (row as { started_at?: unknown }).started_at;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function quickLogNoteOccurredAtDraftFromIso(
  iso: string | null | undefined,
): QuickLogNoteOccurredAtDraft {
  if (typeof iso !== "string" || iso.trim().length === 0) return EMPTY_QUICK_LOG_NOTE_OCCURRED_AT;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return EMPTY_QUICK_LOG_NOTE_OCCURRED_AT;
  return { touched: true, value: formatQuickLogNoteLocalDateTime(new Date(ms)) };
}

export function quickLogNoteLifetimeBounds(input: {
  growStartedAt?: string | null;
  plantStartedAt?: string | null;
  endedAt?: string | null;
}): { startMs: number | null; endMs: number | null } {
  const starts = [parseBound(input.growStartedAt), parseBound(input.plantStartedAt)].filter(
    (ms): ms is number => ms !== null,
  );
  return {
    startMs: starts.length > 0 ? Math.max(...starts) : null,
    endMs: parseBound(input.endedAt),
  };
}

export function resolveQuickLogNoteOccurredAt(input: {
  touched: boolean;
  localValue: string;
  now: Date;
  growStartedAt?: string | null;
  plantStartedAt?: string | null;
  endedAt?: string | null;
}): QuickLogNoteOccurredAtResult {
  const nowMs = input.now.getTime();
  if (!Number.isFinite(nowMs)) {
    return {
      ok: false,
      reason: "invalid_occurred_at",
      message: QUICK_LOG_NOTE_OCCURRED_AT_INVALID,
    };
  }
  if (!input.touched || input.localValue.trim().length === 0) {
    return { ok: true, mode: "default", pOccurredAt: null };
  }
  const chosenMs = parseQuickLogNoteLocalDateTime(input.localValue);
  if (chosenMs === null) {
    return {
      ok: false,
      reason: "invalid_occurred_at",
      message: QUICK_LOG_NOTE_OCCURRED_AT_INVALID,
    };
  }
  if (chosenMs > nowMs) {
    return {
      ok: false,
      reason: "occurred_at_in_future",
      message: QUICK_LOG_NOTE_OCCURRED_AT_FUTURE,
    };
  }
  const bounds = quickLogNoteLifetimeBounds(input);
  if (bounds.endMs !== null && chosenMs > bounds.endMs) {
    return {
      ok: false,
      reason: "occurred_at_after_lifetime",
      message: QUICK_LOG_NOTE_OCCURRED_AT_AFTER_LIFETIME,
    };
  }
  if (bounds.startMs !== null && chosenMs < startOfLocalMinute(bounds.startMs)) {
    return {
      ok: false,
      reason: "occurred_at_before_lifetime",
      message: QUICK_LOG_NOTE_OCCURRED_AT_BEFORE_LIFETIME,
    };
  }
  return { ok: true, mode: "chosen", pOccurredAt: new Date(chosenMs).toISOString() };
}
