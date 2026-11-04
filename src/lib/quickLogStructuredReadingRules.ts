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
import { celsiusToFahrenheit, fahrenheitToCelsius } from "@/lib/temperatureUnitPreference";

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
  ambiguousComma: "Write 1000 or 1.2, without a thousands comma",
  invalidPpfd: "Invalid PPFD",
  checkValue: "Saved as entered — check value",
  fixBeforeSave: "Fix the soil and light readings before saving.",
} as const;

/** Field labels, in display order. Soil temp's unit follows the temperature preference. */
export const STRUCTURED_READING_FIELDS = [
  { key: "soil_temp_c", input: "soilTemp", label: "Soil temp", unit: null },
  { key: "soil_moisture_pct", input: "vwcPct", label: "Water content", unit: "% VWC" },
  { key: "soil_ec_ms_cm", input: "soilEcMsCm", label: "Soil EC", unit: "mS/cm" },
  { key: "co2_ppm", input: "co2Ppm", label: "CO₂", unit: "ppm" },
  { key: "ppfd", input: "ppfd", label: "PPFD", unit: "µmol/m²/s" },
] as const;

export type StructuredReadingTextInput = Record<
  (typeof STRUCTURED_READING_FIELDS)[number]["input"],
  string
>;

export const EMPTY_STRUCTURED_READING_INPUT: StructuredReadingTextInput = {
  soilTemp: "",
  vwcPct: "",
  soilEcMsCm: "",
  co2Ppm: "",
  ppfd: "",
};

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

function parse(raw: string | null | undefined): number | null | "nan" | "ambiguous" {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // "1,000" could be one thousand or 1.000; never guess. A single comma with
  // other than three digits after it is a decimal comma ("1,2").
  if ((trimmed.match(/,/g) ?? []).length > 1 || /,\d{3}(?!\d)/.test(trimmed)) return "ambiguous";
  const n = Number(trimmed.replace(",", "."));
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
    if (parsed === "nan" || parsed === "ambiguous") {
      result.errors.push({
        key,
        message:
          parsed === "nan"
            ? STRUCTURED_READING_COPY.notANumber
            : STRUCTURED_READING_COPY.ambiguousComma,
      });
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

export interface StructuredReadingChip {
  readonly label: string;
  readonly value: string;
  /** Stored value that cannot be a real reading; shown flagged, never as plausible. */
  readonly invalid: boolean;
}

/**
 * Display chips for a saved `details.manual_sensor_snapshot`. Requires the
 * literal `source: "manual"`; ignores non-finite values. Soil temp is shown in
 * the viewer's unit (stored canonical °C).
 */
export function structuredReadingChips(
  snapshot: unknown,
  tempUnit: "F" | "C",
): StructuredReadingChip[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const rec = snapshot as Record<string, unknown>;
  if (rec.source !== "manual") return [];
  const chips: StructuredReadingChip[] = [];
  for (const field of STRUCTURED_READING_FIELDS) {
    const raw = rec[field.key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const invalid =
      field.key === "ppfd" ? !isPpfdValid(raw) : !classifyManualMetric(field.key, raw).valid;
    const shown =
      field.key === "soil_temp_c" && tempUnit === "F" ? round2(celsiusToFahrenheit(raw)) : raw;
    const unit = field.unit ?? (tempUnit === "F" ? "°F" : "°C");
    chips.push({ label: field.label, value: `${shown} ${unit}`, invalid });
  }
  return chips;
}
