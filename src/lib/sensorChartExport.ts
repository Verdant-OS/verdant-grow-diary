/**
 * Pure CSV export helper for sensor readings. Keeping this out of JSX
 * guarantees the same rules are testable headlessly and prevents inline
 * CSV logic from drifting.
 *
 * No I/O, no React. Deterministic.
 */
import { isCurrentStateStale } from "@/lib/sensorTruthCanon";
import { leastTrustedStatus, refreshSensorReadingStatus } from "@/lib/growAdapters";
import type { SensorReading } from "@/mock";
import { readObservedSensorMetric } from "@/lib/sensorReadingSelectionRules";
import {
  celsiusToFahrenheit,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

const CSV_HEADER_CELSIUS =
  "Timestamp (UTC),Temperature (°C),Humidity (%),VPD (kPa),CO₂ (ppm),Soil Moisture (%),PPFD (µmol/m²/s),Source,Status,Captured At (UTC)";

const CSV_HEADER_FAHRENHEIT =
  "Timestamp (UTC),Temperature (°F),Humidity (%),VPD (kPa),CO₂ (ppm),Soil Moisture (%),PPFD (µmol/m²/s),Source,Status,Captured At (UTC)";

function resolveExportTemperatureUnit(
  unit?: TemperatureUnitPreference | "F" | "C",
): TemperatureUnitPreference {
  if (unit === "fahrenheit" || unit === "F") return "fahrenheit";
  if (unit === "celsius" || unit === "C") return "celsius";
  try {
    if (typeof window !== "undefined") {
      const stored = window.localStorage?.getItem("verdant:temperatureUnit");
      if (stored === "fahrenheit") return "fahrenheit";
      if (stored === "celsius") return "celsius";
    }
  } catch {
    // ignore storage access errors
  }
  return "celsius";
}

function formatExportTemperature(
  celsius: number | null,
  unit: TemperatureUnitPreference,
): number | null {
  if (celsius === null || !Number.isFinite(celsius)) return null;
  if (unit === "fahrenheit") {
    return Math.round(celsiusToFahrenheit(celsius) * 10) / 10;
  }
  return celsius;
}

function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Escape a field for CSV inclusion. Neutralises spreadsheet formula injection
 * on string values with a leading `=`, `+`, `-`, `@`, tab, or CR (numbers pass
 * through unguarded so negative temperatures stay numeric), then wraps in
 * quotes and escapes inner quotes when the value contains a comma, quote, CR,
 * or newline.
 */
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = String(value);
  if (FORMULA_TRIGGER.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '"' + '"')}"`;
  }
  return s;
}

/**
 * Build CSV text from sensor readings. Output is RFC 4180-ish and
 * deterministic so tests can assert exact rows. An explicit export clock ages
 * usable current live/manual evidence; provenance and historical values stay
 * unchanged. Omitting it preserves the supplied snapshot status.
 *
 * Readings whose retained freshness inputs are all current-state evidence
 * (live or manual) are recomputed first, so a grouped live + manual row ages on
 * its live window rather than the manual window its merged `source` implies.
 * A reading that mixes current-state evidence with CSV history ages its
 * live/manual inputs only and keeps the less trusted of that result and its
 * supplied status, so a stale live component is never exported as usable and
 * nothing is promoted. CSV-only readings keep their supplied status: CSV
 * history is never aged as current state. Readings without retained inputs
 * fall back to the source-window check below.
 */
function isCurrentStateSource(source: string): boolean {
  return source === "live" || source === "manual";
}

function refreshForExport(reading: SensorReading, now: Date): SensorReading {
  const timeSources = reading.freshness?.timeSources;
  if (!reading.freshness || !Array.isArray(timeSources) || timeSources.length === 0) {
    return reading;
  }
  const current = timeSources.filter(isCurrentStateSource);
  if (current.length === 0) return reading;
  if (current.length === timeSources.length) return refreshSensorReadingStatus(reading, now);
  const aged = refreshSensorReadingStatus(
    { ...reading, freshness: { ...reading.freshness, timeSources: current } },
    now,
  );
  const status = leastTrustedStatus(reading.status, aged.status);
  return status === reading.status ? reading : { ...reading, status };
}

export interface BuildSensorReadingsCsvOptions {
  /** Optional map of `tentId` → human-readable tent name for multi-tent exports. */
  tentNamesById?: Readonly<Record<string, string>>;
  /** Explicitly include the trailing `Tent` column even when only one tent is present. */
  includeTentColumn?: boolean;
}

function resolveReadingTentId(reading: SensorReading): string {
  if (typeof reading.tentId === "string" && reading.tentId.trim()) {
    return reading.tentId.trim();
  }
  const snake = (reading as { tent_id?: unknown }).tent_id;
  if (typeof snake === "string" && snake.trim()) {
    return snake.trim();
  }
  return "";
}

export function buildSensorReadingsCsv(
  readings: ReadonlyArray<SensorReading>,
  nowMs?: number,
  temperatureUnit?: TemperatureUnitPreference | "F" | "C",
  options?: BuildSensorReadingsCsvOptions,
): string {
  const resolvedUnit = resolveExportTemperatureUnit(temperatureUnit);
  const distinctTents = new Set(readings.map(resolveReadingTentId).filter(Boolean));
  const includeTent =
    options?.includeTentColumn === true ||
    options?.tentNamesById !== undefined ||
    distinctTents.size > 1;
  const duplicateTentNames = new Set<string>();
  if (includeTent && options?.tentNamesById) {
    const seenNames = new Map<string, string>();
    for (const [tentId, rawName] of Object.entries(options.tentNamesById)) {
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (!name) continue;
      const priorTentId = seenNames.get(name);
      if (priorTentId !== undefined && priorTentId !== tentId) {
        duplicateTentNames.add(name);
      } else {
        seenNames.set(name, tentId);
      }
    }
  }
  const baseHeader = resolvedUnit === "fahrenheit" ? CSV_HEADER_FAHRENHEIT : CSV_HEADER_CELSIUS;
  const header = includeTent ? `${baseHeader},Tent` : baseHeader;
  const clocked =
    nowMs !== undefined && Number.isFinite(nowMs)
      ? readings.map((r) => refreshForExport(r, new Date(nowMs)))
      : readings;
  const rows = clocked.map((r) => {
    const cells: Array<string | number | null | undefined> = [
      formatUtcTimestamp(r.ts),
      formatExportTemperature(readObservedSensorMetric(r, "temp"), resolvedUnit),
      readObservedSensorMetric(r, "rh"),
      readObservedSensorMetric(r, "vpd"),
      readObservedSensorMetric(r, "co2"),
      readObservedSensorMetric(r, "soil"),
      readObservedSensorMetric(r, "ppfd"),
      r.source,
      nowMs !== undefined &&
      Number.isFinite(nowMs) &&
      r.status === "usable" &&
      (r.source === "live" || r.source === "manual") &&
      isCurrentStateStale(r.capturedAt, { now: nowMs, source: r.source })
        ? "stale"
        : r.status,
      formatUtcTimestamp(r.capturedAt),
    ];
    if (includeTent) {
      const tentId = resolveReadingTentId(r);
      const rawName = tentId ? options?.tentNamesById?.[tentId] : undefined;
      const trimmedName = typeof rawName === "string" ? rawName.trim() : "";
      const tentLabel = trimmedName
        ? duplicateTentNames.has(trimmedName) && tentId
          ? `${rawName} (${tentId})`
          : (rawName as string)
        : tentId;
      cells.push(tentLabel);
    }
    return cells.map(csvEscape).join(",");
  });
  return [header, ...rows].join("\n");
}

/**
 * Trigger a browser download of a plain-text file. Must be called from a
 * user interaction (e.g. click) so popup blockers don't interfere.
 */
export function downloadTextFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
