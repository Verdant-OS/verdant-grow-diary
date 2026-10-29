/**
 * Render-time Water save gate. Dry-runs the existing watering payload
 * builder so Save and the footer use the same reasons as a click.
 * Temperatures passed in are already canonical °C.
 */
import type { TemperatureUnitPreference } from "./temperatureUnitPreference";
import { manualAirTemperatureRangeMessage } from "./manualAirTemperatureRules";
import {
  buildWateringFormPayload,
  EMPTY_QUICKLOG_WATERING_FORM,
  wateringFormReasonToHelper,
  type QuickLogWateringFormState,
} from "./quickLogWateringFormViewModel";

const PREVIEW_GROW_ID = "preview-grow";
const PREVIEW_IDEMPOTENCY_KEY = "preview-water-save-gate";
const PREVIEW_OCCURRED_AT = "2026-01-01T00:00:00.000Z";

export type QuickLogWaterGateField = "volume" | "temperature" | "humidity" | "vpd";

export interface QuickLogWaterSaveGate {
  blocksSave: boolean;
  fields: Partial<Record<QuickLogWaterGateField, string>>;
  footerMessage: string | null;
}

export function wateringTemperatureRangeMessage(unit: TemperatureUnitPreference): string {
  return manualAirTemperatureRangeMessage(unit);
}

function probeReason(
  form: QuickLogWateringFormState,
  air: { temperatureC: string; humidityPct: string; vpdKpa: string },
): string | null {
  const result = buildWateringFormPayload({
    growId: PREVIEW_GROW_ID,
    idempotencyKey: PREVIEW_IDEMPOTENCY_KEY,
    occurredAt: PREVIEW_OCCURRED_AT,
    form,
    temperatureC: air.temperatureC,
    humidityPct: air.humidityPct,
    vpdKpa: air.vpdKpa,
  });
  return result.ok ? null : result.reason;
}

function messageFor(
  reason: string,
  field: QuickLogWaterGateField,
  unit: TemperatureUnitPreference,
): string {
  if (field === "temperature" && reason === "temperature_out_of_range") {
    return wateringTemperatureRangeMessage(unit);
  }
  return wateringFormReasonToHelper(reason);
}

export function assessQuickLogWaterSaveGate(input: {
  form: QuickLogWateringFormState;
  temperatureC: string;
  humidityPct: string;
  vpdKpa: string;
  temperatureUnit: TemperatureUnitPreference;
}): QuickLogWaterSaveGate {
  const fields: QuickLogWaterSaveGate["fields"] = {};
  const blankAir = { temperatureC: "", humidityPct: "", vpdKpa: "" };
  const volumeReason = probeReason(
    { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: input.form.volumeMl },
    blankAir,
  );
  if (
    volumeReason === "volume_ml:missing" ||
    volumeReason === "volume_ml:invalid" ||
    volumeReason === "volume_ml:too_large" ||
    volumeReason === "numeric:invalid"
  ) {
    fields.volume = messageFor(volumeReason, "volume", input.temperatureUnit);
  }

  const volumeForAir = fields.volume ? "1" : input.form.volumeMl;
  const airForm: QuickLogWateringFormState = {
    ...EMPTY_QUICKLOG_WATERING_FORM,
    volumeMl: volumeForAir,
  };
  const probes: Array<
    [QuickLogWaterGateField, { temperatureC: string; humidityPct: string; vpdKpa: string }]
  > = [
    ["temperature", { temperatureC: input.temperatureC, humidityPct: "", vpdKpa: "" }],
    ["humidity", { temperatureC: "", humidityPct: input.humidityPct, vpdKpa: "" }],
    ["vpd", { temperatureC: "", humidityPct: "", vpdKpa: input.vpdKpa }],
  ];
  for (const [field, air] of probes) {
    const raw = air.temperatureC || air.humidityPct || air.vpdKpa;
    if (raw.trim() === "") continue;
    const reason = probeReason(airForm, air);
    if (reason) fields[field] = messageFor(reason, field, input.temperatureUnit);
  }

  const footerMessage =
    fields.volume ?? fields.temperature ?? fields.humidity ?? fields.vpd ?? null;

  return { blocksSave: footerMessage !== null, fields, footerMessage };
}
