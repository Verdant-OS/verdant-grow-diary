/**
 * Pure form state and save-payload mapping for Quick Log Water.
 *
 * Only applied volume is required. Root-zone measurements, manual pre-water
 * observations, notes, and manual air readings are optional evidence. The
 * mapper never derives a watering schedule, target, diagnosis, or dryback.
 */

import { isExplicitNegativeDecimal, resolveEcPpm500Pair } from "./ecPpm500PairRules";
import {
  ROOT_ZONE_DRAINAGE_OBSERVATIONS,
  ROOT_ZONE_MANUAL_OBSERVATION_DETAILS_KEY,
  ROOT_ZONE_MANUAL_OBSERVATION_SCHEMA_VERSION,
  ROOT_ZONE_MEDIUM_SURFACES,
  ROOT_ZONE_POT_WEIGHT_FEELS,
  buildRootZoneManualObservationEnvelopeV1,
  type RootZoneDrainageObservation,
  type RootZoneMediumSurface,
  type RootZonePotWeightFeel,
} from "./rootZoneManualObservationRules";
import { isHumidityValid, isTemperatureValid, isVpdValid } from "./sensorReadingNormalizationRules";
import {
  assessWaterVolumeText,
  LARGE_WATER_AMOUNT_HARD_MAX_ML,
} from "./quickLogWaterVolumeWarningRules";
import type {
  QuickLogWateringManualSnapshot,
  WateringTypedEventInput,
} from "./writeQuickLogWateringTypedEvent";

export type PotWeightFeel = "" | RootZonePotWeightFeel;
export type MediumSurface = "" | RootZoneMediumSurface;
export type DrainageObservation = "" | RootZoneDrainageObservation;

export interface QuickLogWateringFormState {
  volumeMl: string;
  ph: string;
  ec: string;
  ppm: string;
  runoffMl: string;
  runoffPh: string;
  runoffEc: string;
  runoffPpm: string;
  waterTempC: string;
  potWeightFeel: PotWeightFeel;
  mediumSurface: MediumSurface;
  drainage: DrainageObservation;
}

export const EMPTY_QUICKLOG_WATERING_FORM: QuickLogWateringFormState = {
  volumeMl: "",
  ph: "",
  ec: "",
  ppm: "",
  runoffMl: "",
  runoffPh: "",
  runoffEc: "",
  runoffPpm: "",
  waterTempC: "",
  potWeightFeel: "",
  mediumSurface: "",
  drainage: "",
};

/** Backward-compatible alias; the shared contract owns the actual version. */
export { ROOT_ZONE_MANUAL_OBSERVATION_SCHEMA_VERSION as ROOT_ZONE_MANUAL_OBSERVATION_VERSION };

export interface BuildWateringFormPayloadInput {
  growId: string | null | undefined;
  tentId?: string | null;
  plantId?: string | null;
  idempotencyKey: string;
  occurredAt?: string | Date | number | null;
  form: QuickLogWateringFormState;
  note?: string | null;
  temperatureC?: string | null;
  humidityPct?: string | null;
  vpdKpa?: string | null;
  baseDetails?: Record<string, unknown> | null;
}

export type WateringFormFailureReason =
  | "grow_id:missing"
  | "idempotency_key:invalid"
  | "volume_ml:missing"
  | "volume_ml:invalid"
  | "volume_ml:too_large"
  | "numeric:invalid"
  | "numeric:out_of_range"
  | "ec:negative"
  | "runoff_ec:negative"
  | "ec_ppm:mismatch"
  | "manual_observation:invalid"
  | "observed_at:invalid"
  | "temperature_out_of_range"
  | "humidity_out_of_range"
  | "vpd_out_of_range";

export type BuildWateringFormPayloadResult =
  { ok: true; payload: WateringTypedEventInput } | { ok: false; reason: WateringFormFailureReason };

const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const POT_WEIGHT_VALUES = new Set<PotWeightFeel>(["", ...ROOT_ZONE_POT_WEIGHT_FEELS]);
const MEDIUM_SURFACE_VALUES = new Set<MediumSurface>(["", ...ROOT_ZONE_MEDIUM_SURFACES]);
const DRAINAGE_VALUES = new Set<DrainageObservation>(["", ...ROOT_ZONE_DRAINAGE_OBSERVATIONS]);

function trim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function parseOptionalNumber(
  raw: string | null | undefined,
): { ok: true; value: number | null } | { ok: false } {
  const value = trim(raw);
  if (value === "") return { ok: true, value: null };
  if (!PLAIN_NUMBER.test(value)) return { ok: false };
  const numeric = Number(value);
  return Number.isFinite(numeric) ? { ok: true, value: numeric } : { ok: false };
}

function normalizeOccurredAt(raw: BuildWateringFormPayloadInput["occurredAt"]): string | null {
  if (raw === null || raw === undefined) return null;
  const timestamp =
    raw instanceof Date
      ? raw.getTime()
      : typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Date.parse(raw)
          : Number.NaN;
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function hasManualObservation(form: QuickLogWateringFormState): boolean {
  return form.potWeightFeel !== "" || form.mediumSurface !== "" || form.drainage !== "";
}

function metricInRange(value: number | null, min: number, max: number): boolean {
  return value === null || (value >= min && value <= max);
}

export function isWateringFormPristine(form: QuickLogWateringFormState): boolean {
  return (Object.keys(form) as (keyof QuickLogWateringFormState)[]).every(
    (key) => form[key] === "",
  );
}

/** Ceiling for one logged watering (owner decision 2026-10-14); one source of truth. */
export const QUICK_LOG_WATER_VOLUME_MAX_ML = LARGE_WATER_AMOUNT_HARD_MAX_ML;
export const QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE =
  "Applied volume is too large (max 50,000 ml). Check the number and save again." as const;

export type WateringVolumeInputAssessment =
  { ok: true; value: number } | { ok: false; reason: "missing" | "invalid" | "too_large" };

/**
 * One typed watering volume, classified by the same parser as the structured
 * Water form and the large-water warning (assessWaterVolumeText: plain-decimal
 * grammar, so `0x10` / `1e2` are invalid, and the exact 50,000 ml ceiling).
 * Shared by entry points that do not go through buildWateringFormPayload.
 */
export function assessWateringVolumeInput(
  raw: string | null | undefined,
): WateringVolumeInputAssessment {
  const assessed = assessWaterVolumeText(raw);
  if (assessed.status === "valid") return { ok: true, value: assessed.volumeMl };
  return { ok: false, reason: assessed.status };
}

export function buildWateringFormPayload(
  input: BuildWateringFormPayloadInput,
): BuildWateringFormPayloadResult {
  const growId = trim(input.growId);
  if (!growId) return { ok: false, reason: "grow_id:missing" };

  const idempotencyKey = trim(input.idempotencyKey);
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return { ok: false, reason: "idempotency_key:invalid" };
  }

  // Same bounded, exact classification as the large-water warning, so an entry
  // the warning cannot evaluate, or one above the 50,000 ml ceiling, never saves.
  const parsedVolume = assessWaterVolumeText(input.form.volumeMl);
  if (parsedVolume.status === "missing") return { ok: false, reason: "volume_ml:missing" };
  if (parsedVolume.status === "invalid") return { ok: false, reason: "volume_ml:invalid" };
  if (parsedVolume.status === "too_large") return { ok: false, reason: "volume_ml:too_large" };

  const optionalFields = [
    ["ph", input.form.ph, 0, 14],
    ["runoff_ml", input.form.runoffMl, 0, 1_000_000],
    ["runoff_ph", input.form.runoffPh, 0, 14],
    ["water_temp_c", input.form.waterTempC, -10, 60],
  ] as const;
  const parsedMetrics: Partial<WateringTypedEventInput> = {};
  for (const [payloadKey, raw, min, max] of optionalFields) {
    const parsed = parseOptionalNumber(raw);
    if (!parsed.ok) return { ok: false, reason: "numeric:invalid" };
    if (!metricInRange(parsed.value, min, max)) {
      return { ok: false, reason: "numeric:out_of_range" };
    }
    if (parsed.value !== null) {
      (parsedMetrics as Record<string, number>)[payloadKey] = parsed.value;
    }
  }

  const ecPairs = [
    [input.form.ec, input.form.ppm, "ec_ms_cm"],
    [input.form.runoffEc, input.form.runoffPpm, "runoff_ec"],
  ] as const;
  for (const [ec, ppm, payloadKey] of ecPairs) {
    if (isExplicitNegativeDecimal(ec)) {
      return {
        ok: false,
        reason: payloadKey === "ec_ms_cm" ? "ec:negative" : "runoff_ec:negative",
      };
    }
    const resolved = resolveEcPpm500Pair(ec, ppm);
    if (resolved.status === "invalid") return { ok: false, reason: "numeric:invalid" };
    if (resolved.status === "mismatch") return { ok: false, reason: "ec_ppm:mismatch" };
    if (resolved.status === "valid") {
      if (!metricInRange(resolved.ec, 0, 10)) {
        return { ok: false, reason: "numeric:out_of_range" };
      }
      (parsedMetrics as Record<string, number>)[payloadKey] = resolved.ec;
    }
  }

  if (
    !POT_WEIGHT_VALUES.has(input.form.potWeightFeel) ||
    !MEDIUM_SURFACE_VALUES.has(input.form.mediumSurface) ||
    !DRAINAGE_VALUES.has(input.form.drainage)
  ) {
    return { ok: false, reason: "manual_observation:invalid" };
  }

  const occurredAt = normalizeOccurredAt(input.occurredAt);
  if (input.occurredAt !== null && input.occurredAt !== undefined && occurredAt === null) {
    return { ok: false, reason: "observed_at:invalid" };
  }

  const temperature = parseOptionalNumber(input.temperatureC);
  const humidity = parseOptionalNumber(input.humidityPct);
  const vpd = parseOptionalNumber(input.vpdKpa);
  if (!temperature.ok || !humidity.ok || !vpd.ok) {
    return { ok: false, reason: "numeric:invalid" };
  }
  if (!isTemperatureValid(temperature.value)) {
    return { ok: false, reason: "temperature_out_of_range" };
  }
  if (!isHumidityValid(humidity.value)) {
    return { ok: false, reason: "humidity_out_of_range" };
  }
  if (!isVpdValid(vpd.value)) return { ok: false, reason: "vpd_out_of_range" };

  const sensorMetrics: QuickLogWateringManualSnapshot["metrics"] = {};
  if (temperature.value !== null) sensorMetrics.temperature_c = temperature.value;
  if (humidity.value !== null) sensorMetrics.humidity_pct = humidity.value;
  if (vpd.value !== null) sensorMetrics.vpd_kpa = vpd.value;
  const hasSensorMetrics = Object.keys(sensorMetrics).length > 0;
  const hasObservation = hasManualObservation(input.form);
  if ((hasSensorMetrics || hasObservation) && !occurredAt) {
    return { ok: false, reason: "observed_at:invalid" };
  }

  const details: Record<string, unknown> = { ...(input.baseDetails ?? {}) };
  // This reserved envelope is owned exclusively by the validated form fields.
  // A stale or caller-supplied copy must never masquerade as this save's evidence.
  delete details[ROOT_ZONE_MANUAL_OBSERVATION_DETAILS_KEY];
  if (hasObservation && occurredAt) {
    const manualObservation = buildRootZoneManualObservationEnvelopeV1({
      observedAt: occurredAt,
      potWeightFeel: input.form.potWeightFeel || null,
      mediumSurface: input.form.mediumSurface || null,
      drainage: input.form.drainage || null,
    });
    if (!manualObservation) return { ok: false, reason: "manual_observation:invalid" };
    details[ROOT_ZONE_MANUAL_OBSERVATION_DETAILS_KEY] = manualObservation;
  }

  const note = trim(input.note);
  const payload: WateringTypedEventInput = {
    idempotency_key: idempotencyKey,
    grow_id: growId,
    tent_id: input.tentId ?? null,
    plant_id: input.plantId ?? null,
    occurred_at: occurredAt,
    note: note === "" ? null : note,
    volume_ml: parsedVolume.volumeMl,
    ...parsedMetrics,
    sensor_snapshot:
      hasSensorMetrics && occurredAt
        ? { source: "manual", captured_at: occurredAt, metrics: sensorMetrics }
        : null,
    details: Object.keys(details).length > 0 ? details : null,
  };

  return { ok: true, payload };
}

export const WATERING_SAVE_SUCCESS_MESSAGE = "Watering logged." as const;
export const WATERING_SAVE_FAILURE_MESSAGE =
  "Verdant could not confirm the watering save. Retry will safely check the exact same record." as const;

export function wateringFormReasonToHelper(reason: WateringFormFailureReason | string): string {
  switch (reason) {
    case "grow_id:missing":
      return "Choose a plant or tent with grow context before saving.";
    case "volume_ml:missing":
      return "Enter the total water applied before saving.";
    case "volume_ml:invalid":
      return "Applied volume must be a positive number of milliliters.";
    case "volume_ml:too_large":
      return QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE;
    case "ec_ppm:mismatch":
      return "EC and PPM must match the 500 scale. Re-enter either value.";
    case "numeric:invalid":
      return "Optional measurements must be plain numbers or left blank.";
    case "ec:negative":
      return "EC can't be negative.";
    case "runoff_ec:negative":
      return "Runoff EC can't be negative.";
    case "numeric:out_of_range":
      return "One or more measurements are outside Verdant's accepted sensor bands.";
    case "manual_observation:invalid":
      return "Choose one of the available manual observation labels.";
    case "temperature_out_of_range":
      return "Temperature must be between 14 and 140 °F (-10 to 60 °C).";
    case "humidity_out_of_range":
      return "Humidity must be between 0 and 100%.";
    case "vpd_out_of_range":
      return "VPD must be between 0 and 10 kPa.";
    case "rpc:invalid_typed_payload":
      return "The server rejected this Watering as invalid. Correct the values and save again.";
    case "observed_at:invalid":
    case "idempotency_key:invalid":
    default:
      return WATERING_SAVE_FAILURE_MESSAGE;
  }
}
