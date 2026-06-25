/**
 * Transpiration Response — pure calculation rules (skeleton).
 *
 * Documentation contract:
 *  - docs/decision-record-size-proxy-vpd-demand.md
 *  - docs/cultivation-review-size-proxy-vpd-demand.md
 *  - docs/spec-transpiration-response-dashboard.md
 *  - docs/spec-transpiration-response-calculation-rules.md
 *
 * SAFETY:
 *  - Pure, deterministic, null-safe.
 *  - No React, no Supabase, no fetch, no rpc.
 *  - No insert/update/delete/upsert.
 *  - No alerts, no Action Queue, no AI/model calls, no device control.
 *  - Does not classify unknown/invalid telemetry as healthy.
 */

export type TranspirationStage =
  | "seedling"
  | "vegetative"
  | "transition"
  | "flower_early"
  | "flower_mid"
  | "flower_late";

export type TranspirationConfidence =
  | "high"
  | "medium"
  | "low"
  | "insufficient";

export type TranspirationWindowStatus =
  | "valid"
  | "invalid"
  | "stale"
  | "insufficient";

export type SizeBasis = "plant_weight_kg" | "approved_proxy" | "none";

export type WeightSource =
  | "load_cell"
  | "manual"
  | "soil_moisture_proxy"
  | "unknown";

export type BoundarySource =
  | "diary_event"
  | "manual_baseline"
  | "weight_jump_only"
  | "unknown";

export type TranspirationWindowInput = {
  windowId: string;
  plantId?: string;
  tentId?: string;
  stage: TranspirationStage;
  startTime: string;
  endTime: string;
  startWeightG?: number | null;
  endWeightG?: number | null;
  vpdReadings: Array<{ capturedAt: string; valueKpa: number | null }>;
  sizeBasis: SizeBasis;
  sizeProxyValue?: number | null;
  weightSource: WeightSource;
  boundarySource: BoundarySource;
  now?: string;
};

export type TranspirationWindowResult = {
  windowId: string;
  plantId?: string;
  tentId?: string;
  stage: TranspirationStage;
  startTime: string;
  endTime: string;
  durationHours: number | null;
  waterLossG: number | null;
  waterLossRateGPerH: number | null;
  averageVpdKpa: number | null;
  sizeBasis: SizeBasis;
  sizeProxyValue: number | null;
  waterLossRatePerVpdPerSize: number | null;
  waterLossRatePerVpd: number | null;
  moistureResponseProxy: number | null;
  confidence: TranspirationConfidence;
  confidenceReasons: string[];
  status: TranspirationWindowStatus;
  warnings: string[];
  sourceSummary: string[];
};

export type TranspirationRulesOptions = {
  /** Maximum age (hours) for end weight relative to `now` before window is stale. */
  stalenessThresholdHours?: number;
  /** Minimum VPD readings within the window before VPD coverage is considered adequate. */
  minVpdReadings?: number;
  /** Minimum realistic VPD value (kPa). Values <= this are considered invalid. */
  minRealisticVpdKpa?: number;
  /** Maximum realistic VPD value (kPa). Values >= this are considered invalid. */
  maxRealisticVpdKpa?: number;
};

const DEFAULT_OPTIONS: Required<TranspirationRulesOptions> = {
  stalenessThresholdHours: 6,
  minVpdReadings: 2,
  minRealisticVpdKpa: 0.05,
  maxRealisticVpdKpa: 4.0,
};

function emptyResult(
  input: TranspirationWindowInput,
  status: TranspirationWindowStatus,
  confidence: TranspirationConfidence,
  warnings: string[],
  reasons: string[],
  sourceSummary: string[],
): TranspirationWindowResult {
  return {
    windowId: input.windowId,
    plantId: input.plantId,
    tentId: input.tentId,
    stage: input.stage,
    startTime: input.startTime,
    endTime: input.endTime,
    durationHours: null,
    waterLossG: null,
    waterLossRateGPerH: null,
    averageVpdKpa: null,
    sizeBasis: input.sizeBasis,
    sizeProxyValue:
      typeof input.sizeProxyValue === "number" && isFinite(input.sizeProxyValue)
        ? input.sizeProxyValue
        : null,
    waterLossRatePerVpdPerSize: null,
    waterLossRatePerVpd: null,
    moistureResponseProxy: null,
    confidence,
    confidenceReasons: [...reasons].sort(),
    status,
    warnings: [...warnings].sort(),
    sourceSummary: [...sourceSummary].sort(),
  };
}

function parseTime(value: string): number | null {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function evaluateTranspirationWindow(
  input: TranspirationWindowInput,
  options: TranspirationRulesOptions = {},
): TranspirationWindowResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];
  const reasons: string[] = [];
  const sourceSummary: string[] = [
    `weight_source:${input.weightSource}`,
    `boundary_source:${input.boundarySource}`,
    `size_basis:${input.sizeBasis}`,
  ];

  // Soil moisture proxy path: never produces weight-based metrics.
  if (input.weightSource === "soil_moisture_proxy") {
    warnings.push("soil_moisture_proxy_low_confidence");
    reasons.push("soil_moisture_proxy_not_supported_in_skeleton");
    return emptyResult(
      input,
      "insufficient",
      "insufficient",
      warnings,
      reasons,
      sourceSummary,
    );
  }

  // Boundary source must be reliable.
  if (input.boundarySource === "weight_jump_only" || input.boundarySource === "unknown") {
    warnings.push("unreliable_boundary");
    reasons.push("boundary_source_not_diary_or_manual");
    return emptyResult(
      input,
      "insufficient",
      "insufficient",
      warnings,
      reasons,
      sourceSummary,
    );
  }

  // Weight presence.
  const hasStart =
    typeof input.startWeightG === "number" && isFinite(input.startWeightG);
  const hasEnd =
    typeof input.endWeightG === "number" && isFinite(input.endWeightG);
  if (!hasStart || !hasEnd) {
    warnings.push("missing_weight_reading");
    reasons.push("fewer_than_two_valid_weight_points");
    return emptyResult(
      input,
      "insufficient",
      "insufficient",
      warnings,
      reasons,
      sourceSummary,
    );
  }

  const startWeight = input.startWeightG as number;
  const endWeight = input.endWeightG as number;

  // Time parsing and duration.
  const startMs = parseTime(input.startTime);
  const endMs = parseTime(input.endTime);
  if (startMs === null || endMs === null) {
    warnings.push("invalid_timestamp");
    reasons.push("unparseable_window_bounds");
    return emptyResult(
      input,
      "invalid",
      "insufficient",
      warnings,
      reasons,
      sourceSummary,
    );
  }
  const durationHours = (endMs - startMs) / 3_600_000;
  if (!(durationHours > 0)) {
    warnings.push("non_positive_duration");
    reasons.push("duration_hours_not_positive");
    return emptyResult(
      input,
      "invalid",
      "insufficient",
      warnings,
      reasons,
      sourceSummary,
    );
  }

  // Weight must strictly decrease (skeleton: no split/top-off accounting).
  if (endWeight >= startWeight) {
    warnings.push("end_weight_not_less_than_start");
    reasons.push("water_loss_non_positive");
    return emptyResult(
      input,
      "invalid",
      "insufficient",
      warnings,
      reasons,
      sourceSummary,
    );
  }

  // Staleness check.
  if (input.now) {
    const nowMs = parseTime(input.now);
    if (nowMs !== null) {
      const ageHours = (nowMs - endMs) / 3_600_000;
      if (ageHours > opts.stalenessThresholdHours) {
        warnings.push("stale_weight");
        reasons.push("end_weight_exceeds_staleness_threshold");
        return emptyResult(
          input,
          "stale",
          "insufficient",
          warnings,
          reasons,
          sourceSummary,
        );
      }
    }
  }

  // VPD readings within the window.
  const vpdInWindow: number[] = [];
  for (const r of input.vpdReadings ?? []) {
    if (r === null || r === undefined) continue;
    const t = parseTime(r.capturedAt);
    if (t === null) continue;
    if (t < startMs || t > endMs) continue;
    if (typeof r.valueKpa !== "number" || !isFinite(r.valueKpa)) continue;
    vpdInWindow.push(r.valueKpa);
  }

  if (vpdInWindow.length === 0) {
    warnings.push("missing_vpd");
    reasons.push("no_vpd_readings_in_window");
    return emptyResult(
      input,
      "insufficient",
      "insufficient",
      warnings,
      reasons,
      sourceSummary,
    );
  }

  const averageVpdKpa =
    vpdInWindow.reduce((a, b) => a + b, 0) / vpdInWindow.length;

  if (
    !(averageVpdKpa > opts.minRealisticVpdKpa) ||
    !(averageVpdKpa < opts.maxRealisticVpdKpa)
  ) {
    warnings.push("unrealistic_vpd");
    reasons.push("average_vpd_outside_realistic_band");
    return emptyResult(
      input,
      "insufficient",
      "insufficient",
      warnings,
      reasons,
      sourceSummary,
    );
  }

  const sparseVpd = vpdInWindow.length < opts.minVpdReadings;
  if (sparseVpd) {
    warnings.push("sparse_vpd_coverage");
  }

  // Core derived values.
  const waterLossG = startWeight - endWeight;
  const waterLossRateGPerH = waterLossG / durationHours;
  const waterLossRatePerVpd = waterLossRateGPerH / averageVpdKpa;

  // Size proxy.
  const hasSize =
    input.sizeBasis !== "none" &&
    typeof input.sizeProxyValue === "number" &&
    isFinite(input.sizeProxyValue) &&
    (input.sizeProxyValue as number) > 0;

  let waterLossRatePerVpdPerSize: number | null = null;
  if (hasSize) {
    // Never default to 1; only compute when a real qualified size value exists.
    waterLossRatePerVpdPerSize =
      waterLossRatePerVpd / (input.sizeProxyValue as number);
  } else {
    warnings.push("size_unnormalized");
    reasons.push("no_qualified_size_proxy");
  }

  // Confidence classification.
  let confidence: TranspirationConfidence;
  if (
    hasSize &&
    !sparseVpd &&
    input.weightSource === "load_cell" &&
    (input.boundarySource === "diary_event" ||
      input.boundarySource === "manual_baseline")
  ) {
    confidence = "high";
    reasons.push("load_cell_with_size_and_adequate_vpd");
  } else if (
    hasSize &&
    !sparseVpd &&
    input.weightSource === "manual" &&
    (input.boundarySource === "diary_event" ||
      input.boundarySource === "manual_baseline")
  ) {
    confidence = "medium";
    reasons.push("manual_weight_with_size_and_adequate_vpd");
  } else {
    confidence = "low";
    if (!hasSize) reasons.push("size_unnormalized_fallback");
    if (sparseVpd) reasons.push("sparse_vpd_lowered_confidence");
    if (input.weightSource === "unknown") reasons.push("unknown_weight_source");
  }

  return {
    windowId: input.windowId,
    plantId: input.plantId,
    tentId: input.tentId,
    stage: input.stage,
    startTime: input.startTime,
    endTime: input.endTime,
    durationHours,
    waterLossG,
    waterLossRateGPerH,
    averageVpdKpa,
    sizeBasis: input.sizeBasis,
    sizeProxyValue: hasSize ? (input.sizeProxyValue as number) : null,
    waterLossRatePerVpdPerSize,
    waterLossRatePerVpd,
    moistureResponseProxy: null,
    confidence,
    confidenceReasons: [...reasons].sort(),
    status: "valid",
    warnings: [...warnings].sort(),
    sourceSummary: [...sourceSummary].sort(),
  };
}
