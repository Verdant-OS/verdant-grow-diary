/**
 * EcoWitt Live Evidence form rules — pure deterministic helpers.
 *
 * Translates an operator-entered evidence form (local React state) into a
 * LiveSourceTruthEvidence object suitable for evaluateLiveSourceTruth.
 *
 * Does NOT query sensors, call Supabase, write data, call models, create
 * alerts, create Action Queue items, or control devices. No Date.now() —
 * the `now` field comes from the form state.
 */

import type {
  LiveSourceTruthEvidence,
  LiveSourceTruthMetricEvidence,
  LiveSourceTruthMetricKey,
  LiveSourceTruthSource,
} from "./liveSourceTruthGateRules";

export const ECOWITT_FORM_METRIC_KEYS: readonly LiveSourceTruthMetricKey[] = [
  "temp_f",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "soil_ec_us_cm",
  "soil_temp_f",
  "ph",
];

export const ECOWITT_FORM_SOURCE_OPTIONS: readonly LiveSourceTruthSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
];

export interface EcowittLiveEvidenceMetricRow {
  readonly key: LiveSourceTruthMetricKey;
  readonly enabled: boolean;
  readonly backend_value: string;
  readonly controller_value: string;
  /**
   * Shared/effective unit used by the evaluator. Kept for backward
   * compatibility; UI may also fill backend_unit/controller_unit. When
   * backend_unit is set and unit is blank, backend_unit is used as the
   * effective unit for evaluator metric evidence.
   */
  readonly unit: string;
  readonly backend_unit?: string;
  readonly controller_unit?: string;
  readonly tolerance: string;
}


export interface EcowittLiveEvidenceFormState {
  readonly source: string;
  readonly captured_at: string;
  readonly now: string;
  readonly tent_id: string;
  readonly plant_id: string;
  readonly raw_payload_present: boolean;
  readonly normalized_payload_present: boolean;
  readonly operator_compared_controller: boolean;
  readonly metric_rows: readonly EcowittLiveEvidenceMetricRow[];
}

export interface EcowittLiveEvidenceBuildResult {
  readonly evidence: LiveSourceTruthEvidence;
  readonly form_warnings: readonly string[];
}

export function createInitialEcowittLiveEvidenceFormState(): EcowittLiveEvidenceFormState {
  return {
    source: "live",
    captured_at: "",
    now: "",
    tent_id: "",
    plant_id: "",
    raw_payload_present: false,
    normalized_payload_present: false,
    operator_compared_controller: false,
    metric_rows: ECOWITT_FORM_METRIC_KEYS.map((key) => ({
      key,
      enabled: false,
      backend_value: "",
      controller_value: "",
      unit: "",
      tolerance: "",
    })),
  };
}

function parseNumber(raw: string): number | null {
  const s = (raw ?? "").trim();
  if (s.length === 0) return null;
  // Reject non-numeric strings up-front
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isBlank(raw: string): boolean {
  return (raw ?? "").trim().length === 0;
}

export function buildLiveSourceTruthEvidenceFromForm(
  state: EcowittLiveEvidenceFormState,
): EcowittLiveEvidenceBuildResult {
  const warnings: string[] = [];
  const metrics: LiveSourceTruthMetricEvidence[] = [];

  // Preserve stable metric order by iterating ECOWITT_FORM_METRIC_KEYS.
  for (const key of ECOWITT_FORM_METRIC_KEYS) {
    const row = state.metric_rows.find((r) => r.key === key);
    if (!row || !row.enabled) continue;

    const backendBlank = isBlank(row.backend_value);
    const controllerBlank = isBlank(row.controller_value);

    let backend_value: number | null = null;
    if (!backendBlank) {
      backend_value = parseNumber(row.backend_value);
      if (backend_value === null) {
        warnings.push(
          `Backend value for ${key} is not a valid number; treated as missing.`,
        );
      }
    }

    let controller_value: number | null = null;
    if (!controllerBlank) {
      controller_value = parseNumber(row.controller_value);
      if (controller_value === null) {
        warnings.push(
          `Controller value for ${key} is not a valid number; treated as missing.`,
        );
      }
    }

    let tolerance: number | null = null;
    if (!isBlank(row.tolerance)) {
      const t = parseNumber(row.tolerance);
      if (t === null) {
        warnings.push(
          `Tolerance for ${key} is not a valid number; default tolerance used.`,
        );
      } else if (t < 0) {
        warnings.push(
          `Tolerance for ${key} is negative; default tolerance used.`,
        );
      } else {
        tolerance = t;
      }
    }

    const unit = (row.unit ?? "").trim();
    const backendUnit = (row.backend_unit ?? "").trim();
    const controllerUnit = (row.controller_unit ?? "").trim();
    // Effective unit for evaluator: prefer explicit shared unit, then
    // backend unit (matches legacy behavior), then controller unit.
    const effectiveUnit =
      unit.length > 0
        ? unit
        : backendUnit.length > 0
          ? backendUnit
          : controllerUnit.length > 0
            ? controllerUnit
            : null;

    metrics.push({
      key,
      backend_value,
      controller_value,
      unit: effectiveUnit,
      tolerance,
    });
  }


  const evidence: LiveSourceTruthEvidence = {
    source: (state.source ?? "") as LiveSourceTruthSource,
    captured_at: isBlank(state.captured_at) ? null : state.captured_at,
    now: state.now ?? "",
    tent_id: isBlank(state.tent_id) ? null : state.tent_id,
    plant_id: isBlank(state.plant_id) ? null : state.plant_id,
    raw_payload_present: state.raw_payload_present === true,
    normalized_payload_present: state.normalized_payload_present === true,
    operator_compared_controller: state.operator_compared_controller === true,
    metrics,
  };

  return {
    evidence,
    form_warnings: warnings,
  };
}
