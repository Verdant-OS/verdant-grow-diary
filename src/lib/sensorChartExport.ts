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

const CSV_HEADER =
  "Timestamp (UTC),Temperature (°C),Humidity (%),VPD (kPa),CO₂ (ppm),Soil Moisture (%),PPFD (µmol/m²/s),Source,Status,Captured At (UTC)";

function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}

/**
 * Escape a field for CSV inclusion. Wraps in quotes and escapes inner
 * quotes when the value contains a comma, quote, or newline.
 */
function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) {
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

export function buildSensorReadingsCsv(
  readings: ReadonlyArray<SensorReading>,
  nowMs?: number,
): string {
  const clocked =
    nowMs !== undefined && Number.isFinite(nowMs)
      ? readings.map((r) => refreshForExport(r, new Date(nowMs)))
      : readings;
  const rows = clocked.map((r) =>
    [
      formatUtcTimestamp(r.ts),
      readObservedSensorMetric(r, "temp"),
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
    ]
      .map(csvEscape)
      .join(","),
  );
  return [CSV_HEADER, ...rows].join("\n");
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
