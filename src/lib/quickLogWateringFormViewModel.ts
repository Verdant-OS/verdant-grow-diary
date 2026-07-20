/**
 * Pure form state and save-payload mapping for Quick Log Water.
 *
 * Only applied volume is required. Root-zone measurements, manual pre-water
 * observations, notes, and manual air readings are optional evidence. The
 * mapper never derives a watering schedule, target, diagnosis, or dryback.
 */

import { resolveEcPpm500Pair } from "./ecPpm500PairRules";
import { isHumidityValid, isTemperatureValid, isVpdValid } from "./sensorReadingNormalizationRules";
import type {
  QuickLogWateringManualSnapshot,
  WateringTypedEventInput,
} from "./writeQuickLogWateringTypedEvent";

export type PotWeightFeel = "" | "light" | "moderate" | "heavy";
export type MediumSurface = "" | "dry" | "moist" | "wet";
export type DrainageObservation = "" | "normal" | "slow" | "none";

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

export const ROOT_ZONE_MANUAL_OBSERVATION_VERSION = 1 as const;

export interface RootZoneManualObservationV1 {
  schema_version: typeof ROOT_ZONE_MANUAL_OBSERVATION_VERSION;
  source: "manual";
  evidence_type: "root_zone_manual_observation";
  advisory_only: true;
  observed_at: string;
  pot_weight_feel?: Exclude<PotWeightFeel, "">;
  medium_surface?: Exclude<MediumSurface, "">;
  drainage?: Exclude<DrainageObservation, "">;
}

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
  | "numeric:invalid"
  | "numeric:out_of_range"
  | "ec_ppm:mismatch"
  | "manual_observation:invalid"
  | "observed_at:invalid"
  | "temperature_out_of_range"
  | "humidity_out_of_range"
  | "vpd_out_of_range";

export type BuildWateringFormPayloadResult =
  | { ok: true; payload: WateringTypedEventInput }
  | { ok: false; reason: WateringFormFailureReason };

const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const POT_WEIGHT_VALUES = new Set<PotWeightFeel>(["", "light", "moderate", "heavy"]);
const MEDIUM_SURFACE_VALUES = new Set<MediumSurface>(["", "dry", "moist", "wet"]);
const DRAINAGE_VALUES = new Set<DrainageObservation>(["", "normal", "slow", "none"]);

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

function buildManualObservation(
  form: QuickLogWateringFormState,
  observedAt: string,
): RootZoneManualObservationV1 {
  return {
    schema_version: ROOT_ZONE_MANUAL_OBSERVATION_VERSION,
    source: "manual",
    evidence_type: "root_zone_manual_observation",
    advisory_only: true,
    observed_at: observedAt,
    ...(form.potWeightFeel ? { pot_weight_feel: form.potWeightFeel } : {}),
    ...(form.mediumSurface ? { medium_surface: form.mediumSurface } : {}),
    ...(form.drainage ? { drainage: form.drainage } : {}),
  };
}

function metricInRange(value: number | null, min: number, max: number): boolean {
  return value === null || (value >= min && value <= max);
}

export function isWateringFormPristine(form: QuickLogWateringFormState): boolean {
  return Object.values(form).every((value) => value === "");
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

  const parsedVolume = parseOptionalNumber(input.form.volumeMl);
  if (!parsedVolume.ok) return { ok: false, reason: "volume_ml:invalid" };
  if (parsedVolume.value === null) return { ok: false, reason: "volume_ml:missing" };
  if (parsedVolume.value <= 0 || parsedVolume.value > 1_000_000) {
    return { ok: false, reason: "volume_ml:invalid" };
  }

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
  if (hasObservation && occurredAt) {
    details.root_zone_manual_observation_v1 = buildManualObservation(input.form, occurredAt);
  }

  const note = trim(input.note);
  const payload: WateringTypedEventInput = {
    idempotency_key: idempotencyKey,
    grow_id: growId,
    tent_id: input.tentId ?? null,
    plant_id: input.plantId ?? null,
    occurred_at: occurredAt,
    note: note === "" ? null : note,
    volume_ml: parsedVolume.value,
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
    case "ec_ppm:mismatch":
      return "EC and PPM must match the 500 scale. Re-enter either value.";
    case "numeric:invalid":
      return "Optional measurements must be plain numbers or left blank.";
    case "numeric:out_of_range":
      return "One or more measurements are outside Verdant's accepted sensor bands.";
    case "manual_observation:invalid":
      return "Choose one of the available manual observation labels.";
    case "temperature_out_of_range":
      return "Temperature must be between -10 and 60 °C.";
    case "humidity_out_of_range":
      return "Humidity must be between 0 and 100%.";
    case "vpd_out_of_range":
      return "VPD must be between 0 and 10 kPa.";
    case "observed_at:invalid":
    case "idempotency_key:invalid":
    default:
      return WATERING_SAVE_FAILURE_MESSAGE;
  }
}
