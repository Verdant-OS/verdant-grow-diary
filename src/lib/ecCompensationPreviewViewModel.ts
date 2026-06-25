/**
 * ecCompensationPreviewViewModel — pure presenter that turns a Quick Log
 * feeding form's EC + water-temperature inputs into a read-only "EC @25°C
 * preview" line.
 *
 * Hard rules:
 *   - Pure. No I/O. No React. No Supabase. No writes.
 *   - Never claims the compensated value is stored.
 *   - Returns a stable label/value/tone so the UI cannot accidentally render
 *     ambiguous unit conversions as ground truth.
 *
 * Audit reference: docs/audits/ec-temperature-compensation-feasibility.md
 */
import {
  computeEcCompensation,
  type EcCompensationInput,
} from "@/lib/ecCompensationRules";
import type { EcUnit } from "@/constants/units";

export const EC_COMPENSATION_PREVIEW_LABEL = "EC @25°C preview" as const;
export const EC_COMPENSATION_PREVIEW_UNAVAILABLE =
  "EC compensation unavailable" as const;
export const EC_COMPENSATION_PREVIEW_NEEDS_REVIEW =
  "Needs unit review" as const;
export const EC_COMPENSATION_PREVIEW_DISCLAIMER =
  "Read-only estimate. Not stored." as const;

export type EcCompensationPreviewTone = "ok" | "review" | "unavailable";

export interface EcCompensationPreviewInput {
  ec: string | number | null | undefined;
  ecUnit?: EcUnit;
  waterTempC: string | number | null | undefined;
  sourceLabel: string | null | undefined;
}

export interface EcCompensationPreviewModel {
  visible: boolean;
  label: typeof EC_COMPENSATION_PREVIEW_LABEL;
  /** Display string for the compensated value, or status copy when blocked. */
  valueDisplay: string;
  tone: EcCompensationPreviewTone;
  disclaimer: typeof EC_COMPENSATION_PREVIEW_DISCLAIMER;
  /** Optional review hint (e.g. unit mismatch). Never contains raw payload. */
  hint: string | null;
}

function parseNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function buildEcCompensationPreview(
  input: EcCompensationPreviewInput,
): EcCompensationPreviewModel {
  const ecValue = parseNumber(input.ec);
  const tempValue = parseNumber(input.waterTempC);

  // Hide the preview entirely until both fields exist. Avoids noisy copy in
  // empty forms.
  if (ecValue === null || tempValue === null) {
    return {
      visible: false,
      label: EC_COMPENSATION_PREVIEW_LABEL,
      valueDisplay: "",
      tone: "unavailable",
      disclaimer: EC_COMPENSATION_PREVIEW_DISCLAIMER,
      hint: null,
    };
  }

  const helperInput: EcCompensationInput = {
    ecValue,
    ecUnit: input.ecUnit ?? "mS/cm",
    temperatureValue: tempValue,
    temperatureUnit: "C",
    sourceLabel: input.sourceLabel ?? "manual",
  };

  const result = computeEcCompensation(helperInput);

  if (result.blockedReason !== null) {
    const needsReview =
      result.blockedReason === "suspicious_ec_magnitude" ||
      result.blockedReason === "suspicious_temperature_magnitude";

    return {
      visible: true,
      label: EC_COMPENSATION_PREVIEW_LABEL,
      valueDisplay: needsReview
        ? EC_COMPENSATION_PREVIEW_NEEDS_REVIEW
        : EC_COMPENSATION_PREVIEW_UNAVAILABLE,
      tone: needsReview ? "review" : "unavailable",
      disclaimer: EC_COMPENSATION_PREVIEW_DISCLAIMER,
      hint: result.warnings[0] ?? null,
    };
  }

  const formatted = `${(result.compensatedEc25c as number).toFixed(2)} ${result.normalizedUnit}`;
  return {
    visible: true,
    label: EC_COMPENSATION_PREVIEW_LABEL,
    valueDisplay: formatted,
    tone: "ok",
    disclaimer: EC_COMPENSATION_PREVIEW_DISCLAIMER,
    hint: result.warnings[0] ?? null,
  };
}
