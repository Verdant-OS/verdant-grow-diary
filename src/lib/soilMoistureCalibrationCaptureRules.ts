/**
 * soilMoistureCalibrationCaptureRules — pure validation + payload build for
 * grower-entered dry/wet soil moisture baselines.
 *
 * Write path is insert + deactivate-previous only. Never rewrites
 * sensor_readings. Never recommends irrigation. Never models factory curves.
 */

import { isUuid } from "@/lib/isUuid";

export const SOIL_MOISTURE_CALIBRATION_CAPTURE_TITLE = "Soil moisture calibration";
export const SOIL_MOISTURE_CALIBRATION_CAPTURE_CAVEAT =
  "Dry and wet points are raw sensor units as stored (EcoWitt/GGS are often already 0–100). Verdant applies a linear dry→wet map for display only — not a manufacturer curve, not live factory calibration, not a watering recommendation." as const;

export const SOIL_MOISTURE_RAW_UNIT_HINT =
  "Enter the same unit your probe reports (often 0–100). Both points must differ." as const;

export type SoilMoistureCalibrationCaptureField =
  | "growId"
  | "tentId"
  | "plantId"
  | "deviceId"
  | "dryRaw"
  | "wetRaw"
  | "notes";

export type SoilMoistureCalibrationCaptureError =
  | "required"
  | "invalid_uuid"
  | "invalid_number"
  | "not_finite"
  | "identical_points"
  | "notes_too_long"
  | "invalid_device";

export interface SoilMoistureCalibrationCaptureInput {
  readonly growId: string | null | undefined;
  readonly tentId: string | null | undefined;
  readonly plantId?: string | null | undefined;
  readonly deviceId?: string | null | undefined;
  readonly dryRaw: string | number | null | undefined;
  readonly wetRaw: string | number | null | undefined;
  readonly notes?: string | null | undefined;
}

export interface SoilMoistureCalibrationInsertPayload {
  readonly grow_id: string;
  readonly tent_id: string;
  readonly plant_id: string | null;
  readonly device_id: string | null;
  readonly dry_raw: number;
  readonly wet_raw: number;
  readonly source: "manual";
  readonly is_active: true;
  readonly notes: string | null;
  readonly label: string | null;
}

export interface SoilMoistureCalibrationCaptureValidation {
  readonly ok: boolean;
  readonly errors: Partial<Record<SoilMoistureCalibrationCaptureField, SoilMoistureCalibrationCaptureError>>;
  readonly payload: SoilMoistureCalibrationInsertPayload | null;
  readonly dryRaw: number | null;
  readonly wetRaw: number | null;
}

const NOTES_MAX = 280;

function cleanOptionalId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Parse a raw calibration point. Accepts number or numeric string.
 * Does not clamp — raw units may sit outside 0–100 for some probes.
 */
export function parseCalibrationRawPoint(
  value: string | number | null | undefined,
): { ok: true; value: number } | { ok: false; reason: SoilMoistureCalibrationCaptureError } {
  if (value === null || value === undefined) return { ok: false, reason: "required" };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { ok: false, reason: "not_finite" };
    return { ok: true, value };
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return { ok: false, reason: "required" };
    const n = Number(t);
    if (!Number.isFinite(n)) return { ok: false, reason: "invalid_number" };
    return { ok: true, value: n };
  }
  return { ok: false, reason: "invalid_number" };
}

export function validateSoilMoistureCalibrationCapture(
  input: SoilMoistureCalibrationCaptureInput,
): SoilMoistureCalibrationCaptureValidation {
  const errors: Partial<Record<SoilMoistureCalibrationCaptureField, SoilMoistureCalibrationCaptureError>> =
    {};

  const growId = cleanOptionalId(input.growId);
  const tentId = cleanOptionalId(input.tentId);
  if (!growId) errors.growId = "required";
  else if (!isUuid(growId)) errors.growId = "invalid_uuid";
  if (!tentId) errors.tentId = "required";
  else if (!isUuid(tentId)) errors.tentId = "invalid_uuid";

  const plantRaw = cleanOptionalId(input.plantId);
  if (plantRaw && !isUuid(plantRaw)) errors.plantId = "invalid_uuid";
  const plantId = plantRaw && isUuid(plantRaw) ? plantRaw : null;

  const deviceRaw = cleanOptionalId(input.deviceId);
  // device_id is free text in schema; cap length for safety.
  let deviceId: string | null = null;
  if (deviceRaw) {
    if (deviceRaw.length > 120) errors.deviceId = "invalid_device";
    else deviceId = deviceRaw;
  }

  const dryParsed = parseCalibrationRawPoint(input.dryRaw);
  const wetParsed = parseCalibrationRawPoint(input.wetRaw);
  if (!dryParsed.ok) errors.dryRaw = dryParsed.reason;
  if (!wetParsed.ok) errors.wetRaw = wetParsed.reason;

  let notes: string | null = null;
  if (typeof input.notes === "string") {
    const t = input.notes.trim();
    if (t.length > NOTES_MAX) errors.notes = "notes_too_long";
    else if (t.length > 0) notes = t;
  }

  const dryRaw = dryParsed.ok ? dryParsed.value : null;
  const wetRaw = wetParsed.ok ? wetParsed.value : null;
  if (dryRaw !== null && wetRaw !== null && dryRaw === wetRaw) {
    errors.dryRaw = "identical_points";
    errors.wetRaw = "identical_points";
  }

  const ok = Object.keys(errors).length === 0;
  if (!ok || !growId || !tentId || dryRaw === null || wetRaw === null) {
    return { ok: false, errors, payload: null, dryRaw, wetRaw };
  }

  return {
    ok: true,
    errors: {},
    dryRaw,
    wetRaw,
    payload: {
      grow_id: growId,
      tent_id: tentId,
      plant_id: plantId,
      device_id: deviceId,
      dry_raw: dryRaw,
      wet_raw: wetRaw,
      source: "manual",
      is_active: true,
      notes,
      label: "Manual dry/wet baseline",
    },
  };
}

export function soilMoistureCalibrationFieldErrorCopy(
  field: SoilMoistureCalibrationCaptureField,
  code: SoilMoistureCalibrationCaptureError | undefined,
): string | null {
  if (!code) return null;
  switch (code) {
    case "required":
      return field === "dryRaw" || field === "wetRaw"
        ? "Enter a number."
        : "Select a tent with a grow.";
    case "invalid_uuid":
      return "Invalid target.";
    case "invalid_number":
      return "Enter a valid number.";
    case "not_finite":
      return "Value must be finite.";
    case "identical_points":
      return "Dry and wet points must differ.";
    case "notes_too_long":
      return `Notes max ${NOTES_MAX} characters.`;
    case "invalid_device":
      return "Device id is too long.";
    default:
      return null;
  }
}
