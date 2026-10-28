import { toDateTimeLocalInputValue } from "@/lib/dateTimeLocalRules";

/**
 * How far back a grower may set the observed time on a new manual reading.
 * Lookback 7 days: Cheeko chose this himself in Verdo's chat at 7:24 PM CT, Oct 9, 2026.
 *
 * This lookback is not a freshness window. A time inside it can still be
 * stale. Freshness, latest-snapshot selection, and any live or now indicator
 * use the observed instant, never the save time.
 */
export const MANUAL_READING_OBSERVED_AT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Grower-facing length of {@link MANUAL_READING_OBSERVED_AT_LOOKBACK_MS}. */
export function manualReadingObservedAtWindowLabel(
  lookbackMs: number = MANUAL_READING_OBSERVED_AT_LOOKBACK_MS,
): string {
  if (lookbackMs > 0 && lookbackMs % DAY_MS === 0) {
    const days = lookbackMs / DAY_MS;
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (lookbackMs > 0 && lookbackMs % HOUR_MS === 0) {
    const hours = lookbackMs / HOUR_MS;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${lookbackMs} ms`;
}

export const MANUAL_READING_OBSERVED_AT_WINDOW_LABEL = manualReadingObservedAtWindowLabel();

export const MANUAL_READING_OBSERVED_AT_FUTURE_MESSAGE = "Observed time cannot be in the future.";

export const MANUAL_READING_OBSERVED_AT_TOO_OLD_MESSAGE = `Observed time cannot be more than ${MANUAL_READING_OBSERVED_AT_WINDOW_LABEL} ago.`;

export const MANUAL_READING_OBSERVED_AT_INVALID_MESSAGE =
  "Observed time is not a real local date and time.";

export const MANUAL_READING_OBSERVED_AT_HINT = `Leave this unchanged to use the time of the save. A chosen time is when you observed the reading, in your local time, and must be within the last ${MANUAL_READING_OBSERVED_AT_WINDOW_LABEL}.`;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export type ManualReadingObservedAtDecision =
  | { kind: "device_now" }
  | { kind: "observed"; iso: string }
  | {
      kind: "rejected";
      reason: "future" | "too_old" | "invalid";
      message: string;
      parsedIso?: string;
    };

/**
 * Parse a `datetime-local` value in the runtime's local zone.
 * Invalid calendar dates and DST gaps return null. The spring-forward gap
 * is rejected because the constructed Date does not round-trip to the
 * components the grower typed.
 */
export function parseManualReadingLocalObservedAt(localValue: string): Date | null {
  const match = LOCAL_DATE_TIME.exec(localValue.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const parsed = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute ||
    parsed.getSeconds() !== second
  ) {
    return null;
  }
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

/**
 * Decide what instant a new manual reading should store.
 *
 * An untouched field is the device instant at save time (`device_now`).
 * The caller must omit `ts` so `buildManualReadingPayloads` stamps both
 * `ts` and `captured_at` with one `new Date()` at the moment of save.
 * A touched field is parsed, then rejected when it is in the future or
 * older than the lookback. Age equal to the lookback is allowed.
 */
export function decideManualReadingObservedAt(args: {
  touched: boolean;
  localValue: string;
  now: Date;
}): ManualReadingObservedAtDecision {
  if (!args.touched) return { kind: "device_now" };
  const nowMs = args.now.getTime();
  if (!Number.isFinite(nowMs)) {
    return {
      kind: "rejected",
      reason: "invalid",
      message: MANUAL_READING_OBSERVED_AT_INVALID_MESSAGE,
    };
  }
  const parsed = parseManualReadingLocalObservedAt(args.localValue);
  if (!parsed) {
    return {
      kind: "rejected",
      reason: "invalid",
      message: MANUAL_READING_OBSERVED_AT_INVALID_MESSAGE,
    };
  }
  const ageMs = nowMs - parsed.getTime();
  const iso = parsed.toISOString();
  if (ageMs < 0) {
    return {
      kind: "rejected",
      reason: "future",
      message: MANUAL_READING_OBSERVED_AT_FUTURE_MESSAGE,
      parsedIso: iso,
    };
  }
  if (ageMs > MANUAL_READING_OBSERVED_AT_LOOKBACK_MS) {
    return {
      kind: "rejected",
      reason: "too_old",
      message: MANUAL_READING_OBSERVED_AT_TOO_OLD_MESSAGE,
      parsedIso: iso,
    };
  }
  return { kind: "observed", iso };
}

/** Local value for the default "now" display. Not the value an untouched save uses. */
export function defaultManualReadingObservedAtLocalValue(now: Date): string {
  return toDateTimeLocalInputValue(now);
}
