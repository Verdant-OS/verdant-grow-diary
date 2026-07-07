/**
 * manualSensorSnapshotFieldValidation — pure per-field validation for the
 * manual sensor snapshot entry / edit form.
 *
 * Guarantees:
 *  - No React, no I/O, no Supabase, no writes.
 *  - Never promotes manual readings to "live". Source stays whatever was
 *    passed in; the caller must not use this module to relabel data.
 *  - Missing OPTIONAL fields (CO2, PPFD) never mark the snapshot invalid.
 *  - Deterministic: given (input, now) the output is fully determined.
 *
 * Complements `manualSensorSnapshotQualityRules.ts` — that module returns
 * a snapshot-level trust verdict; this module returns per-field
 * form-friendly messages plus a VPD derivation for the edit UI.
 */
import {
  AIR_TEMP_C_RANGE,
  HUMIDITY_RANGE,
  HUMIDITY_STUCK_VALUES,
} from "@/constants/csvValidationRanges";
import { deriveVpd, type VpdInput } from "@/lib/vpdCalculationRules";
import {
  MANUAL_SNAPSHOT_CURRENT_STALE_HOURS,
  VPD_REALISTIC_RANGE,
} from "@/lib/manualSensorSnapshotQualityRules";

export type FieldSeverity = "info" | "warn" | "block";

export interface FieldHint {
  readonly field: string;
  readonly severity: FieldSeverity;
  readonly message: string;
}

export interface ManualSensorSnapshotFieldInput {
  readonly source?: string | null;
  readonly capturedAt?: string | number | Date | null;
  readonly temperatureC?: number | null;
  readonly humidityPct?: number | null;
  readonly vpdKpa?: number | null;
  /** Optional metrics — missing values must NOT flag invalid. */
  readonly co2Ppm?: number | null;
  readonly ppfdUmol?: number | null;
}

export type DerivedVpd =
  | { readonly kind: "derived"; readonly vpdKpa: number }
  | { readonly kind: "entered"; readonly vpdKpa: number }
  | { readonly kind: "missing"; readonly reason: "needs_temperature_and_humidity" | "invalid_inputs" };

export interface ManualSensorSnapshotFieldValidation {
  readonly hints: ReadonlyArray<FieldHint>;
  /** True when at least one hint has severity `block`. */
  readonly hasBlockingErrors: boolean;
  /**
   * VPD derivation result. Preserves grower-entered VPD when supplied; if
   * omitted and temp+RH are valid, VPD is derived deterministically.
   * Never overrides an entered VPD silently — a conflict produces a
   * separate `warn` hint on the vpdKpa field.
   */
  readonly derivedVpd: DerivedVpd;
  /**
   * Passthrough source label. This module NEVER rewrites source; if the
   * caller passes `"manual"` it stays `"manual"`. Callers must never use
   * this helper to relabel data as `"live"`.
   */
  readonly sourceLabel: string;
}

/** How far derived VPD can drift from entered VPD before we warn (kPa). */
export const VPD_CONFLICT_THRESHOLD_KPA = 0.3;

function toMs(v: ManualSensorSnapshotFieldInput["capturedAt"]): number | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function isFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export interface ValidateOptions {
  readonly nowMs?: number;
  readonly staleHours?: number;
}

export function validateManualSensorSnapshotFields(
  input: ManualSensorSnapshotFieldInput | null | undefined,
  options: ValidateOptions = {},
): ManualSensorSnapshotFieldValidation {
  const hints: FieldHint[] = [];
  const src = typeof input?.source === "string" ? input.source : "";
  const sourceLabel = src.length > 0 ? src : "manual";

  // -------- Humidity --------
  const rh = input?.humidityPct;
  if (isFinite(rh)) {
    if (rh < HUMIDITY_RANGE.min || rh > HUMIDITY_RANGE.max) {
      hints.push({
        field: "humidityPct",
        severity: "block",
        message: "Humidity must be between 0% and 100%.",
      });
    } else if (HUMIDITY_STUCK_VALUES.includes(rh)) {
      hints.push({
        field: "humidityPct",
        severity: "warn",
        message: "Humidity appears stuck at 0% or 100% — sensor may be faulty.",
      });
    }
  }

  // -------- Temperature (Celsius) --------
  const tempC = input?.temperatureC;
  if (isFinite(tempC)) {
    if (tempC < AIR_TEMP_C_RANGE.min || tempC > AIR_TEMP_C_RANGE.max) {
      hints.push({
        field: "temperatureC",
        severity: "block",
        message: `Air temperature outside realistic grow range (${AIR_TEMP_C_RANGE.min}–${AIR_TEMP_C_RANGE.max} °C).`,
      });
    }
  }

  // -------- VPD (entered) --------
  const enteredVpd = input?.vpdKpa;
  if (isFinite(enteredVpd)) {
    if (
      enteredVpd < VPD_REALISTIC_RANGE.min ||
      enteredVpd > VPD_REALISTIC_RANGE.max
    ) {
      hints.push({
        field: "vpdKpa",
        severity: "block",
        message: `VPD outside realistic grow range (${VPD_REALISTIC_RANGE.min}–${VPD_REALISTIC_RANGE.max} kPa).`,
      });
    }
  }

  // -------- Captured-at freshness --------
  const capturedMs = toMs(input?.capturedAt);
  if (capturedMs != null) {
    const nowMs = options.nowMs ?? Date.now();
    const staleHours = options.staleHours ?? MANUAL_SNAPSHOT_CURRENT_STALE_HOURS;
    if (nowMs - capturedMs > staleHours * 60 * 60 * 1000) {
      hints.push({
        field: "capturedAt",
        severity: "warn",
        message: `Reading older than ${staleHours}h — mark as historical or refresh before treating as current.`,
      });
    }
  }

  // -------- Optional metrics: NEVER blocking when missing --------
  // Only validate present values; do not add hints for absence.
  if (isFinite(input?.co2Ppm)) {
    if ((input!.co2Ppm as number) < 0) {
      hints.push({ field: "co2Ppm", severity: "block", message: "CO₂ cannot be negative." });
    }
  }
  if (isFinite(input?.ppfdUmol)) {
    if ((input!.ppfdUmol as number) < 0) {
      hints.push({ field: "ppfdUmol", severity: "block", message: "PPFD cannot be negative." });
    }
  }

  // -------- VPD derivation --------
  const vpdInput: VpdInput = {
    temperature: isFinite(tempC) ? tempC : null,
    humidity: isFinite(rh) ? rh : null,
    temperatureUnit: "C",
  };
  const vpdState = deriveVpd(vpdInput);

  let derivedVpd: DerivedVpd;
  if (isFinite(enteredVpd)) {
    // Preserve entered value. Warn on strong conflict with the derived
    // value; never silently override.
    if (vpdState.kind === "derived") {
      const diff = Math.abs(vpdState.vpdKpa - (enteredVpd as number));
      if (diff > VPD_CONFLICT_THRESHOLD_KPA) {
        hints.push({
          field: "vpdKpa",
          severity: "warn",
          message: `Entered VPD ${(enteredVpd as number).toFixed(2)} kPa disagrees with temp/RH-derived VPD ${vpdState.vpdKpa.toFixed(2)} kPa.`,
        });
      }
    }
    derivedVpd = { kind: "entered", vpdKpa: enteredVpd as number };
  } else if (vpdState.kind === "derived") {
    derivedVpd = { kind: "derived", vpdKpa: vpdState.vpdKpa };
  } else if (vpdState.kind === "invalid") {
    derivedVpd = { kind: "missing", reason: "invalid_inputs" };
  } else {
    derivedVpd = { kind: "missing", reason: "needs_temperature_and_humidity" };
  }

  const hasBlockingErrors = hints.some((h) => h.severity === "block");

  return {
    hints: Object.freeze([...hints]),
    hasBlockingErrors,
    derivedVpd,
    sourceLabel,
  };
}
