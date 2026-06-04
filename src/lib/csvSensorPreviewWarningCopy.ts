/**
 * csvSensorPreviewWarningCopy — plain-language explanations for the
 * suspicious-value flag codes emitted by csvSensorPreviewRules.
 *
 * Pure constants + a tiny lookup helper. No I/O, no React, no Supabase.
 */
import type { SuspiciousFlag } from "@/lib/csvSensorPreviewRules";

export type FlagCode = SuspiciousFlag["code"];

export interface WarningExplanation {
  title: string;
  whyItMatters: string;
  suggestedFix: string;
  severity: "warn" | "error";
}

export const CSV_PREVIEW_WARNING_COPY: Record<FlagCode, WarningExplanation> = {
  humidity_stuck: {
    title: "Humidity reading looks stuck",
    whyItMatters:
      "This may indicate a stuck or disconnected humidity sensor. Verdant treats it as untrustworthy until you confirm the sensor is healthy.",
    suggestedFix:
      "Check the sensor placement, battery, gateway connection, and export column mapping.",
    severity: "error",
  },
  ph_out_of_range: {
    title: "pH value outside realistic range",
    whyItMatters:
      "This pH value is outside a realistic cultivation range, so it likely reflects a unit or calibration issue rather than a true reading.",
    suggestedFix:
      "Confirm units, calibration, and whether the column is actually pH.",
    severity: "error",
  },
  ec_unit_ambiguous: {
    title: "EC unit looks ambiguous",
    whyItMatters:
      "This column may be ppm/TDS or µS/cm, but Verdant expects mS/cm for EC. Mixed units will misrepresent feed strength.",
    suggestedFix:
      "Confirm the export unit and map only mS/cm values to EC.",
    severity: "warn",
  },
  lux_not_ppfd: {
    title: "Lux is not PPFD",
    whyItMatters:
      "Lux is illuminance, not measured photosynthetic light. Verdant does not treat lux as measured PPFD.",
    suggestedFix:
      "Use measured PPFD/PAR data if available, or leave this column unmapped.",
    severity: "warn",
  },
  temp_unit_ambiguous: {
    title: "Temperature unit looks ambiguous",
    whyItMatters:
      "This value looks like °F but the column/mapping expects °C, or vice versa. Wrong units will skew VPD and stage targets.",
    suggestedFix:
      "Confirm whether the export uses Fahrenheit or Celsius and re-map if needed.",
    severity: "warn",
  },
  vwc_stuck: {
    title: "Soil moisture reading looks stuck",
    whyItMatters:
      "Substrate VWC is reporting the same extreme value across rows — typically a disconnected or saturated probe.",
    suggestedFix:
      "Inspect probe seating, calibration, and the gateway connection before trusting the values.",
    severity: "error",
  },
};

export function explainFlag(code: FlagCode): WarningExplanation {
  return CSV_PREVIEW_WARNING_COPY[code];
}

export const FUTURE_DIARY_CONVERSION_COPY =
  "Convert to diary entries — coming later. Import to diary will be built as a separate approval-required flow." as const;
