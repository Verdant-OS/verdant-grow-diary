/**
 * Quick Log structured readings (grower bug brief 2026-11-03, item 14;
 * spec: docs/specs/quick-log-structured-sensor-readings.md §3 steps 2–3).
 *
 * Pure: no React, no Supabase, no clock. Builds the extra keys for
 * `details.manual_sensor_snapshot` using the codebase's existing canonical
 * metric names, and classifies each value with the existing validators so an
 * implausible reading is flagged, never shown as healthy. Values are kept as
 * entered (converted once for °F); blanks are omitted, never written as 0.
 */
import { classifyManualMetric } from "@/lib/sensorTruthRules";
import { isPpfdValid } from "@/lib/ppfdRules";
import { fahrenheitToCelsius } from "@/lib/temperatureUnitPreference";

export const STRUCTURED_READING_KEYS = [
  "soil_temp_c",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "co2_ppm",
  "ppfd",
] as const;
export type StructuredReadingKey = (typeof STRUCTURED_READING_KEYS)[number];

export const STRUCTURED_READING_COPY = {
  notANumber: "Enter a number",
  invalidPpfd: "Invalid PPFD",
} as const;

export interface StructuredReadingInput {
  soilTemp?: string | null;
  soilTempUnit?: "F" | "C";
  vwcPct?: string | null;
  soilEcMsCm?: string | null;
  co2Ppm?: string | null;
  ppfd?: string | null;
}

export interface StructuredReadingFlag {
  key: StructuredReadingKey;
  chip: string;
}

export interface StructuredReadingResult {
  /** Only keys the grower filled in. Merge into manual_sensor_snapshot. */
  values: Partial<Record<StructuredReadingKey, number>>;
  /** Filled-in but implausible values (kept, flagged). */
  flags: StructuredReadingFlag[];
  /** Fields whose text is not a number. Block save until fixed. */
  errors: Array<{ key: StructuredReadingKey; message: string }>;
}

function parse(raw: string | null | undefined): number | null | "nan" {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "nan";
}

/** Round to 2 decimals so 68 °F stores 20, not 19.999999999999996. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildStructuredReadings(input: StructuredReadingInput): StructuredReadingResult {
  const result: StructuredReadingResult = { values: {}, flags: [], errors: [] };
  const fields: Array<[StructuredReadingKey, string | null | undefined]> = [
    ["soil_temp_c", input.soilTemp],
    ["soil_moisture_pct", input.vwcPct],
    ["soil_ec_ms_cm", input.soilEcMsCm],
    ["co2_ppm", input.co2Ppm],
    ["ppfd", input.ppfd],
  ];
  for (const [key, raw] of fields) {
    const parsed = parse(raw);
    if (parsed === null) continue;
    if (parsed === "nan") {
      result.errors.push({ key, message: STRUCTURED_READING_COPY.notANumber });
      continue;
    }
    const value =
      key === "soil_temp_c" && input.soilTempUnit === "F"
        ? round2(fahrenheitToCelsius(parsed))
        : parsed;
    result.values[key] = value;
    if (key === "ppfd") {
      if (!isPpfdValid(value))
        result.flags.push({ key, chip: STRUCTURED_READING_COPY.invalidPpfd });
      continue;
    }
    const truth = classifyManualMetric(key, value);
    if (!truth.valid) result.flags.push({ key, chip: truth.chip ?? "Check value" });
  }
  return result;
}
