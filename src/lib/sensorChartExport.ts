/**
 * Pure CSV export helper for sensor readings. Keeping this out of JSX
 * guarantees the same rules are testable headlessly and prevents inline
 * CSV logic from drifting.
 *
 * No I/O, no React. Deterministic.
 */
import type { SensorReading } from "@/mock";
import { format } from "date-fns";

const CSV_HEADER =
  "Timestamp,Temperature (°C),Humidity (%),VPD (kPa),CO₂ (ppm),Soil Moisture (%),Source,Status,Captured At";

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
 * deterministic so tests can assert exact rows.
 */
export function buildSensorReadingsCsv(readings: ReadonlyArray<SensorReading>): string {
  const rows = readings.map((r) =>
    [
      format(new Date(r.ts), "yyyy-MM-dd HH:mm:ss"),
      r.temp,
      r.rh,
      r.vpd,
      r.co2,
      r.soil,
      r.source,
      r.status,
      r.capturedAt ? format(new Date(r.capturedAt), "yyyy-MM-dd HH:mm:ss") : "",
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
