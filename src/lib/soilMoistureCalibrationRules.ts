import { z } from "zod";

export type SoilMoistureCalibrationFailureReason =
  | "missing_input"
  | "invalid_input"
  | "identical_points";

export type SoilMoistureCalibrationResult =
  | { ok: true; calibratedValue: number; reason: "calibrated" }
  | {
      ok: false;
      calibratedValue: null;
      reason: SoilMoistureCalibrationFailureReason;
    };

const NumericInput = z.preprocess((val) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.length === 0) return undefined;

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return val;
}, z.number().finite());

export const SoilMoistureCalibrationInputSchema = z.object({
  rawValue: NumericInput.nullable().optional(),
  dryRaw: NumericInput.nullable().optional(),
  wetRaw: NumericInput.nullable().optional(),
});

/**
 * Pure soil-moisture calibration helper.
 *
 * Safety boundaries:
 * - No I/O, no Supabase, no React, no timers.
 * - Does not read raw_payload or trust caller-provided calibration metadata.
 * - Returns a structured failure reason instead of throwing.
 * - Supports normal and inverted sensors.
 */
export function calibrateSoilMoisture(
  rawValue: number | null | undefined,
  dryRaw: number | null | undefined,
  wetRaw: number | null | undefined,
): SoilMoistureCalibrationResult {
  const parsed = SoilMoistureCalibrationInputSchema.safeParse({
    rawValue,
    dryRaw,
    wetRaw,
  });

  if (!parsed.success) {
    return { ok: false, calibratedValue: null, reason: "invalid_input" };
  }

  const { rawValue: rv, dryRaw: dr, wetRaw: wr } = parsed.data;

  if (rv == null || dr == null || wr == null) {
    return { ok: false, calibratedValue: null, reason: "missing_input" };
  }

  if (dr === wr) {
    return { ok: false, calibratedValue: null, reason: "identical_points" };
  }

  const min = Math.min(dr, wr);
  const max = Math.max(dr, wr);
  const isInverted = dr > wr;

  const percent = isInverted
    ? ((max - rv) / (max - min)) * 100
    : ((rv - min) / (max - min)) * 100;

  const clamped = Math.max(0, Math.min(100, percent));
  const calibratedValue = Math.round(clamped * 10) / 10;

  return { ok: true, calibratedValue, reason: "calibrated" };
}
