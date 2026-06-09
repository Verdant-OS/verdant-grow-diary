/**
 * Live Source Truth Gate — pure deterministic rules.
 *
 * Evaluates sensor evidence and returns a conservative live-source-truth
 * verdict for operator validation. Does NOT query data, write data, call
 * Supabase, call models, create alerts, create Action Queue items, or
 * control devices. No Date.now() — `evidence.now` is required and is the
 * only clock the rules consult.
 */

// =========================================================================
// Types
// =========================================================================

export type LiveSourceTruthVerdict =
  | "verified_live"
  | "unverified_live"
  | "not_live_proof"
  | "stale"
  | "invalid"
  | "mismatch";

export type LiveSourceTruthSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

export type LiveSourceTruthMetricKey =
  | "temp_f"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct"
  | "soil_ec_ms_cm"
  | "soil_ec_us_cm"
  | "soil_temp_f"
  | "ph";

export type LiveSourceTruthConfidenceLabel = "none" | "low" | "medium" | "high";

export interface LiveSourceTruthMetricEvidence {
  readonly key: LiveSourceTruthMetricKey;
  readonly backend_value?: number | null;
  readonly controller_value?: number | null;
  readonly unit?: string | null;
  readonly tolerance?: number | null;
}

export interface LiveSourceTruthEvidence {
  readonly source: LiveSourceTruthSource | string;
  readonly captured_at: string | null | undefined;
  readonly received_at?: string | null;
  readonly now: string;
  readonly tent_id?: string | null;
  readonly plant_id?: string | null;
  readonly confidence?: number | null;
  readonly raw_payload_present?: boolean | null;
  readonly normalized_payload_present?: boolean | null;
  readonly operator_compared_controller?: boolean | null;
  readonly metrics?: readonly LiveSourceTruthMetricEvidence[] | null;
  readonly notes?: readonly string[] | null;
}

export type LiveSourceTruthMetricStatus =
  | "match"
  | "missing_controller"
  | "missing_backend"
  | "mismatch"
  | "invalid"
  | "not_checked";

export interface LiveSourceTruthMetricResult {
  readonly key: LiveSourceTruthMetricKey;
  readonly status: LiveSourceTruthMetricStatus;
  readonly backend_value?: number | null;
  readonly controller_value?: number | null;
  readonly difference?: number | null;
  readonly tolerance?: number | null;
  readonly message: string;
}

export interface LiveSourceTruthGateResult {
  readonly verdict: LiveSourceTruthVerdict;
  readonly is_live_proof: boolean;
  readonly confidence_label: LiveSourceTruthConfidenceLabel;
  readonly summary: string;
  readonly evidence: LiveSourceTruthEvidence;
  readonly limitations: readonly string[];
  readonly warnings: readonly string[];
  readonly required_next_steps: readonly string[];
  readonly metric_results: readonly LiveSourceTruthMetricResult[];
}

// =========================================================================
// Constants
// =========================================================================

/** Captured_at older than this is stale. */
export const LIVE_SOURCE_TRUTH_STALE_AFTER_MS = 15 * 60 * 1000;

/** Captured_at more than this far in the future is invalid. */
export const LIVE_SOURCE_TRUTH_FUTURE_SKEW_MS = 5 * 60 * 1000;

const DEFAULT_TOLERANCES: Readonly<
  Record<LiveSourceTruthMetricKey, number>
> = Object.freeze({
  temp_f: 1.5,
  humidity_pct: 3,
  vpd_kpa: 0.2,
  co2_ppm: 100,
  soil_moisture_pct: 5,
  soil_ec_ms_cm: 0.2,
  soil_ec_us_cm: 200,
  soil_temp_f: 1.5,
  ph: 0.2,
});

const SUSPICIOUS_RANGES: Readonly<
  Record<
    LiveSourceTruthMetricKey,
    { min: number; max: number; forbid_exact?: readonly number[] }
  >
> = Object.freeze({
  temp_f: { min: 32, max: 120 },
  humidity_pct: { min: 1, max: 99, forbid_exact: [0, 100] },
  vpd_kpa: { min: 0, max: 5 },
  co2_ppm: { min: 250, max: 5000 },
  soil_moisture_pct: { min: 1, max: 99, forbid_exact: [0, 100] },
  soil_ec_ms_cm: { min: 0, max: 10 },
  soil_ec_us_cm: { min: 0, max: 10000 },
  soil_temp_f: { min: 32, max: 120 },
  ph: { min: 3, max: 10 },
});

const KNOWN_METRIC_KEYS: ReadonlySet<LiveSourceTruthMetricKey> = new Set([
  "temp_f",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "soil_ec_us_cm",
  "soil_temp_f",
  "ph",
]);

const KNOWN_SOURCES: ReadonlySet<string> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

// Sort order for metric results — stable & deterministic.
const METRIC_KEY_ORDER: readonly LiveSourceTruthMetricKey[] = [
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

// =========================================================================
// Helpers
// =========================================================================

function parseIso(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function pushUnique<T>(arr: T[], value: T): void {
  if (!arr.includes(value)) arr.push(value);
}

function metricOrder(k: LiveSourceTruthMetricKey): number {
  const i = METRIC_KEY_ORDER.indexOf(k);
  return i < 0 ? METRIC_KEY_ORDER.length : i;
}

// =========================================================================
// Suspicious / unit-mismatch detection
// =========================================================================

interface MetricEval {
  result: LiveSourceTruthMetricResult;
  is_invalid: boolean;
  is_mismatch: boolean;
  has_unit_warning: boolean;
  warnings: readonly string[];
}

function evaluateMetric(m: LiveSourceTruthMetricEvidence): MetricEval {
  const warnings: string[] = [];
  let is_invalid = false;
  let is_mismatch = false;
  let has_unit_warning = false;
  let status: LiveSourceTruthMetricStatus = "not_checked";
  let message = "Not evaluated.";

  const key = m.key;
  if (!KNOWN_METRIC_KEYS.has(key)) {
    return {
      result: {
        key,
        status: "invalid",
        backend_value: null,
        controller_value: null,
        message: `Unknown metric key '${String(key)}'.`,
      },
      is_invalid: true,
      is_mismatch: false,
      has_unit_warning: false,
      warnings: [`Unknown metric key '${String(key)}'.`],
    };
  }

  const backend = isFiniteNumber(m.backend_value) ? m.backend_value : null;
  const controller = isFiniteNumber(m.controller_value)
    ? m.controller_value
    : null;
  const tolerance = isFiniteNumber(m.tolerance)
    ? Math.abs(m.tolerance)
    : DEFAULT_TOLERANCES[key];

  // Suspicious-value check on backend value
  if (backend !== null) {
    const range = SUSPICIOUS_RANGES[key];
    const exactBad = range.forbid_exact?.includes(backend);
    if (exactBad || backend < range.min || backend > range.max) {
      is_invalid = true;
      status = "invalid";
      message = `Backend ${key} value ${backend} is outside the trustworthy range (${range.min}-${range.max}).`;
      warnings.push(message);
    }
  }

  // Unit mismatch heuristics on backend value — emit warnings even when the
  // value also fails the suspicious-range check so operators see both signals.
  if (backend !== null) {
    const unit = (m.unit ?? "").toString();
    if (key === "temp_f" || key === "soil_temp_f") {
      const unitLooksF = unit === "" || /^f$/i.test(unit);
      if (unitLooksF && backend >= 10 && backend <= 45) {
        has_unit_warning = true;
        warnings.push(
          `${key} backend value ${backend} with unit '${unit || "missing"}' may be Celsius shown as Fahrenheit.`,
        );
      }
    }
    if (key === "soil_ec_ms_cm" && backend > 20) {
      has_unit_warning = true;
      warnings.push(
        `soil_ec_ms_cm backend value ${backend} is unusually high; may be µS/cm shown as mS/cm.`,
      );
    }
    if (key === "soil_ec_us_cm" && backend > 0 && backend < 20) {
      has_unit_warning = true;
      warnings.push(
        `soil_ec_us_cm backend value ${backend} is unusually low; may be mS/cm shown as µS/cm.`,
      );
    }
  }

  // Backend / controller comparison
  if (!is_invalid) {
    if (backend === null && controller === null) {
      status = "missing_backend";
      message = `Backend value missing for ${key}.`;
      is_invalid = true;
    } else if (backend === null) {
      status = "missing_backend";
      message = `Backend value missing for ${key}.`;
      is_invalid = true;
    } else if (controller === null) {
      status = "missing_controller";
      message = `Controller/app value missing for ${key}; cannot complete live comparison.`;
    } else {
      const diff = Math.abs(backend - controller);
      if (diff > tolerance) {
        status = "mismatch";
        is_mismatch = true;
        message = `Backend ${backend} and controller ${controller} disagree by ${diff} for ${key} (tolerance ${tolerance}).`;
      } else {
        status = "match";
        message = `Backend ${backend} and controller ${controller} agree within tolerance ${tolerance} for ${key}.`;
      }

      // Unit mismatch on a compared metric is a hard block.
      if (has_unit_warning) {
        is_invalid = true;
        status = "invalid";
        message = `${message} Suspected unit mismatch blocks live proof.`;
      }
    }
  }

  return {
    result: {
      key,
      status,
      backend_value: backend,
      controller_value: controller,
      difference:
        backend !== null && controller !== null
          ? Math.abs(backend - controller)
          : null,
      tolerance,
      message,
    },
    is_invalid,
    is_mismatch,
    has_unit_warning,
    warnings,
  };
}

// =========================================================================
// Summary copy (operator-facing, no overconfident words)
// =========================================================================

const SUMMARY_COPY: Readonly<Record<LiveSourceTruthVerdict, string>> =
  Object.freeze({
    verified_live:
      "Live proof verified from recent device evidence and controller comparison.",
    unverified_live:
      "Recent live-source evidence exists, but controller comparison is missing or incomplete.",
    not_live_proof:
      "This evidence can support review, but it cannot prove live sensor truth.",
    stale: "Sensor evidence is too old to prove current live conditions.",
    invalid:
      "Sensor evidence is missing, malformed, or suspicious and cannot be trusted.",
    mismatch:
      "Backend values and controller/app values disagree beyond tolerance.",
  });

const CONFIDENCE_BY_VERDICT: Readonly<
  Record<LiveSourceTruthVerdict, LiveSourceTruthConfidenceLabel>
> = Object.freeze({
  verified_live: "high",
  unverified_live: "medium",
  not_live_proof: "low",
  stale: "low",
  invalid: "none",
  mismatch: "none",
});

// =========================================================================
// Main evaluator
// =========================================================================

export function evaluateLiveSourceTruth(
  evidence: LiveSourceTruthEvidence,
): LiveSourceTruthGateResult {
  const limitations: string[] = [];
  const warnings: string[] = [];
  const next: string[] = [];

  const source = (evidence?.source ?? "") as string;
  const nowMs = parseIso(evidence?.now);
  const capturedMs = parseIso(evidence?.captured_at ?? null);

  let any_invalid = false;
  let any_stale = false;
  let any_mismatch = false;

  // ---- now / captured_at parsing ----
  if (nowMs === null) {
    any_invalid = true;
    pushUnique(limitations, "Evaluator 'now' is missing or invalid.");
  }
  if (capturedMs === null) {
    any_invalid = true;
    pushUnique(limitations, "captured_at is missing or invalid.");
    pushUnique(next, "Provide a valid ISO captured_at for this reading.");
  }

  // ---- freshness ----
  if (nowMs !== null && capturedMs !== null) {
    const delta = capturedMs - nowMs;
    if (delta > LIVE_SOURCE_TRUTH_FUTURE_SKEW_MS) {
      any_invalid = true;
      pushUnique(
        limitations,
        "captured_at is in the future beyond the allowed clock skew.",
      );
    } else {
      const age = nowMs - capturedMs;
      if (age > LIVE_SOURCE_TRUTH_STALE_AFTER_MS) {
        any_stale = true;
        pushUnique(
          limitations,
          "captured_at is older than the freshness threshold (15 minutes).",
        );
        pushUnique(next, "Refresh sensor reading before claiming live proof.");
      }
    }
  }

  // ---- source label ----
  if (!KNOWN_SOURCES.has(source)) {
    any_invalid = true;
    pushUnique(limitations, `Unknown source label '${source}'.`);
  }
  if (source === "invalid") {
    any_invalid = true;
    pushUnique(limitations, "Source is labelled invalid.");
  }
  if (source === "stale") {
    any_stale = true;
    pushUnique(limitations, "Source is labelled stale.");
  }

  const isNonLiveProofSource =
    source === "manual" || source === "csv" || source === "demo";
  if (isNonLiveProofSource) {
    pushUnique(
      limitations,
      `Source '${source}' cannot prove live sensor truth on its own.`,
    );
    pushUnique(
      next,
      "Compare a recent live sensor reading against the controller before claiming live proof.",
    );
  }

  // ---- tent / payload presence (only required for live-source proof) ----
  if (source === "live") {
    if (!evidence?.tent_id) {
      any_invalid = true;
      pushUnique(limitations, "tent_id is missing for a live-source reading.");
      pushUnique(next, "Attach a tent_id to live readings.");
    }
    if (evidence?.raw_payload_present !== true) {
      pushUnique(limitations, "Raw payload evidence is missing.");
      pushUnique(next, "Capture the raw payload for tonight's reading.");
    }
    if (evidence?.normalized_payload_present !== true) {
      pushUnique(limitations, "Normalized backend payload is missing.");
      pushUnique(
        next,
        "Capture the normalized backend payload for tonight's reading.",
      );
    }
  }

  // ---- metrics ----
  const metricResults: LiveSourceTruthMetricResult[] = [];
  let comparedMatchCount = 0;
  let comparedMismatchCount = 0;
  let comparedAttemptCount = 0;

  const metricsArr = Array.isArray(evidence?.metrics) ? evidence.metrics : [];
  if (evidence?.metrics != null && !Array.isArray(evidence.metrics)) {
    any_invalid = true;
    pushUnique(limitations, "metrics is malformed (expected an array).");
  }

  for (const m of metricsArr) {
    if (!m || typeof m !== "object") {
      any_invalid = true;
      pushUnique(limitations, "Encountered a malformed metric entry.");
      continue;
    }
    const ev = evaluateMetric(m);
    metricResults.push(ev.result);
    for (const w of ev.warnings) pushUnique(warnings, w);
    if (ev.is_invalid) any_invalid = true;
    if (ev.is_mismatch) any_mismatch = true;

    if (ev.result.status === "match") comparedMatchCount++;
    if (ev.result.status === "mismatch") {
      comparedMismatchCount++;
      comparedAttemptCount++;
    }
    if (ev.result.status === "match") comparedAttemptCount++;

    if (ev.result.status === "missing_controller") {
      pushUnique(
        limitations,
        `Controller/app value missing for ${m.key}; comparison incomplete.`,
      );
    }
    if (ev.result.status === "missing_backend") {
      pushUnique(limitations, `Backend value missing for ${m.key}.`);
    }
  }

  // Stable sort by metric key order
  metricResults.sort((a, b) => metricOrder(a.key) - metricOrder(b.key));

  if (source === "live" && metricsArr.length === 0) {
    any_invalid = true;
    pushUnique(
      limitations,
      "No metrics provided for a live-source reading; cannot verify live proof.",
    );
  }

  // ---- operator comparison ----
  const operatorCompared = evidence?.operator_compared_controller === true;
  const hasComparedMetric = comparedMatchCount > 0 || comparedMismatchCount > 0;

  if (source === "live") {
    if (!operatorCompared) {
      pushUnique(
        limitations,
        "Operator did not record a controller/app comparison.",
      );
      pushUnique(
        next,
        "Compare controller/app readings against backend values and record the result.",
      );
    } else if (!hasComparedMetric) {
      pushUnique(
        limitations,
        "Operator comparison flagged, but no metric has both backend and controller values.",
      );
      pushUnique(
        next,
        "Record at least one metric with both backend and controller values.",
      );
    }
  }

  // ---- pick verdict by precedence ----
  let verdict: LiveSourceTruthVerdict;
  if (any_invalid) {
    verdict = "invalid";
  } else if (any_stale) {
    verdict = "stale";
  } else if (any_mismatch) {
    verdict = "mismatch";
  } else if (isNonLiveProofSource) {
    verdict = "not_live_proof";
  } else if (source === "live") {
    const payloadsPresent =
      evidence?.raw_payload_present === true &&
      evidence?.normalized_payload_present === true;
    if (
      operatorCompared &&
      hasComparedMetric &&
      comparedMatchCount > 0 &&
      payloadsPresent
    ) {
      verdict = "verified_live";
    } else {
      verdict = "unverified_live";
    }
  } else {
    // Unknown sources that survived "invalid" (shouldn't happen) → not_live_proof
    verdict = "not_live_proof";
  }

  if (verdict === "verified_live") {
    pushUnique(
      next,
      "Record GO with linked evidence for the captured_at window reviewed.",
    );
  }
  if (verdict === "mismatch") {
    pushUnique(
      next,
      "Investigate normalization, units, and source labelling before another attempt.",
    );
  }
  if (verdict === "invalid") {
    pushUnique(
      next,
      "Hold. Do not describe the loop as live until evidence is repaired.",
    );
  }

  return Object.freeze({
    verdict,
    is_live_proof: verdict === "verified_live",
    confidence_label: CONFIDENCE_BY_VERDICT[verdict],
    summary: SUMMARY_COPY[verdict],
    evidence,
    limitations: Object.freeze([...limitations].sort()),
    warnings: Object.freeze([...warnings].sort()),
    required_next_steps: Object.freeze([...next].sort()),
    metric_results: Object.freeze(metricResults),
  });
}
