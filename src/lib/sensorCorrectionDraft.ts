import type { ManualCorrectionContext } from "@/lib/manualSensorCorrectionContext";
import type { ManualEntryInput, ManualReadingMetric } from "@/lib/sensorReadingManualEntryRules";
import { celsiusToInputString, type TemperatureInputUnit } from "@/lib/sensorInputUnitConversion";
import { createManualDraftValues, type ManualDraftValues } from "@/lib/sensorsPageSessionRules";

export const EMPTY: ManualEntryInput = {
  airTemp: "",
  humidityPct: "",
  vpdKpa: "",
  co2Ppm: "",
  soilMoisturePct: "",
  ppfd: "",
};

export function correctionToPrefill(
  ctx: ManualCorrectionContext | null | undefined,
  unit: TemperatureInputUnit,
): ManualEntryInput {
  if (!ctx) return { ...EMPTY, airTempUnit: unit };
  const v = ctx.originalValues;
  const out: ManualEntryInput = { ...EMPTY, airTempUnit: unit };
  if (typeof v.temperature_c === "number") {
    // Stored value is canonical Celsius; render it in the grower's entry unit.
    out.airTemp = celsiusToInputString(v.temperature_c, unit);
  }
  if (typeof v.humidity_pct === "number") out.humidityPct = String(v.humidity_pct);
  if (typeof v.vpd_kpa === "number") out.vpdKpa = String(v.vpd_kpa);
  if (typeof v.co2_ppm === "number") out.co2Ppm = String(v.co2_ppm);
  if (typeof v.soil_moisture_pct === "number") out.soilMoisturePct = String(v.soil_moisture_pct);
  if (typeof v.ppfd === "number") out.ppfd = String(v.ppfd);
  return out;
}

export function correctionPrefillFromRestoredMetrics(
  correction: ManualCorrectionContext,
  metrics: ReadonlyArray<ManualReadingMetric>,
): ManualCorrectionContext {
  return {
    ...correction,
    originalValues: Object.fromEntries(metrics.map((row) => [row.metric, row.value])),
  };
}

/** Match standard snapshot restore: canonical °C digits + explicit C override. */
export function recoveredCorrectionDraftValues(
  correction: ManualCorrectionContext,
  metrics: ReadonlyArray<ManualReadingMetric>,
): ManualDraftValues {
  return {
    ...createManualDraftValues(
      correctionToPrefill(correctionPrefillFromRestoredMetrics(correction, metrics), "C"),
      "C",
    ),
    hasEditedReading: true,
    saveUnconfirmed: true,
  };
}
