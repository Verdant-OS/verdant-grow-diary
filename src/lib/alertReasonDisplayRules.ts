/**
 * alertReasonDisplayRules — make a persisted alert `reason` readable.
 *
 * Environment alert reasons are built client-side and stored verbatim in
 * `alerts.reason`. They carry a raw ISO timestamp ("Reading at
 * 2026-09-24T07:32:45.975+00:00.") and Celsius values ("Observed 31.4°C
 * (flower range 20°C–26°C)"), while the "Why this alert?" line beside them
 * is already converted to the grower's unit (QA 2026-09-24, BUG-015).
 *
 * The stored text is left untouched (dedupe and audit read it). Display
 * rewrites only:
 *  - "Reading at <ISO>." → "Reading at <local date/time>."
 *  - "<n>°C" → "<n>°F" when the grower prefers Fahrenheit.
 *
 * Pure: the timestamp formatter is injectable for deterministic tests.
 */
import { format } from "date-fns";
import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";

const READING_AT_RE =
  /Reading at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?))\./g;
const CELSIUS_RE = /(-?\d+(?:\.\d+)?)\s?°C\b/g;

export function defaultAlertTimestampFormatter(date: Date): string {
  return format(date, "MMM d, yyyy, h:mm a");
}

function formatFahrenheit(celsius: number): string {
  const f = Math.round(((celsius * 9) / 5) * 10 + 320) / 10;
  return `${Number.isInteger(f) ? f.toFixed(0) : f.toFixed(1)}°F`;
}

export function formatAlertReasonForDisplay(
  reason: string | null | undefined,
  options: {
    temperatureUnit: TemperatureUnitPreference;
    formatTimestamp?: (date: Date) => string;
  },
): string {
  if (typeof reason !== "string" || reason === "") return "";
  const formatTimestamp = options.formatTimestamp ?? defaultAlertTimestampFormatter;
  let text = reason.replace(READING_AT_RE, (whole, iso: string) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? `Reading at ${formatTimestamp(new Date(ms))}.` : whole;
  });
  if (options.temperatureUnit === "fahrenheit") {
    text = text.replace(CELSIUS_RE, (whole, value: string) => {
      const c = Number(value);
      return Number.isFinite(c) ? formatFahrenheit(c) : whole;
    });
  }
  return text;
}

/**
 * Local, readable capture time for a pre-save manual snapshot review
 * ("Captured at 2026-09-24T07:52:26.706Z" was shown raw; QA 2026-09-24,
 * BUG-015). Unparseable input is returned unchanged rather than hidden.
 */
export function formatSnapshotCapturedAt(
  iso: string,
  formatTimestamp: (date: Date) => string = defaultAlertTimestampFormatter,
): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? formatTimestamp(new Date(ms)) : iso;
}

/**
 * Alerts are grower-resolved: a later in-range reading does not close them
 * (QA 2026-09-24, BUG-018 — the grower saw an RH alert stay open after a
 * 60% reading with no explanation). Shown beside open/acknowledged status
 * actions so the rule is stated, not discovered.
 */
export const ALERT_MANUAL_RESOLUTION_NOTE =
  "This alert stays open until you resolve or dismiss it. A newer reading back in range does not close it automatically.";

/** Short form for the Open section of the Alerts list. */
export const ALERT_LIST_MANUAL_RESOLUTION_NOTE =
  "Open alerts stay open until you resolve or dismiss them — a newer in-range reading doesn't close them.";
