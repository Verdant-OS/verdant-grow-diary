/**
 * Sensor Bridge Intake Contract v1 — hardware-neutral payload validator and
 * source-honest resolver for external bridge readings (EcoWitt, Home
 * Assistant, Raspberry Pi, SensorPush, AROYA, CSV, API, ...).
 *
 * Pure rules. No I/O. No Supabase. No React. No hooks. No fetch.
 *
 * Boundaries (stop-ship if violated):
 *  - Never trusts caller-supplied "live" without authenticated bridge AND
 *    fresh timestamp.
 *  - Never classifies unknown / malformed / suspicious telemetry as healthy.
 *  - Never returns raw payload, tokens, secrets, or service-role values in
 *    the error path — only safe reason codes.
 *  - Does NOT write to alerts, action_queue, ai_doctor_sessions, or
 *    sensor_readings. Persistence is owned by the existing
 *    `sensor-ingest-webhook` edge function.
 *  - Does NOT call AI Doctor. Does NOT control devices.
 *
 * This contract is the source-of-truth shape that downstream persistence,
 * status surfaces, and future per-vendor adapters must normalize INTO.
 */

import {
  HUMIDITY_RANGE,
  HUMIDITY_STUCK_VALUES,
  PH_REALISTIC_RANGE,
  EC_SUSPICIOUS_MSCM_MAX,
  AIR_TEMP_C_RANGE,
  VWC_RANGE,
} from "@/constants/csvValidationRanges";

// ---------------------------------------------------------------------------
// Public contract types
// ---------------------------------------------------------------------------

/**
 * Resolved trust label — NOT the raw `source` column on sensor_readings.
 * This is the data-labeling state the UI/AI may surface for this intake.
 * Mirrors docs/sensor-truth-rules.md `state`.
 */
export type BridgeIntakeResolvedSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

/** Submitted source claim from the bridge payload — never blindly trusted. */
export type BridgeIntakeSubmittedSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "unknown";

export type BridgeMetricKey =
  | "temperature_c"
  | "humidity_pct"
  | "soil_moisture_pct"
  | "ph"
  | "ec"
  | "co2_ppm";

export interface BridgeReadingInput {
  metric: BridgeMetricKey;
  /** Raw numeric value in the submitted unit. */
  value: number;
  /** Optional unit hint to enable suspicion checks (e.g. "C", "F", "mS/cm"). */
  unit?: string | null;
}

export interface BridgeIntakePayload {
  tent_id?: unknown;
  plant_id?: unknown;
  submitted_source?: unknown;
  captured_at?: unknown;
  /** 0..1 caller confidence. Conservative default when missing. */
  confidence?: unknown;
  readings?: unknown;
  /** Bridge tokens are validated by the transport layer (edge fn), not here. */
  authenticated?: unknown;
}

/** Safe, non-PII reason codes. Never include raw payload values. */
export type BridgeIntakeReasonCode =
  | "ok"
  | "payload_missing"
  | "tent_id_missing"
  | "captured_at_missing"
  | "captured_at_invalid"
  | "captured_at_future"
  | "submitted_source_invalid"
  | "readings_missing"
  | "readings_empty"
  | "reading_value_invalid"
  | "humidity_out_of_range"
  | "soil_moisture_out_of_range"
  | "ph_out_of_realistic_range"
  | "unauthenticated_live_claim"
  | "stale_for_live"
  | "stale_for_manual"
  | "no_valid_metrics";

export type BridgeIntakeSuspicionCode =
  | "temp_c_suspected_fahrenheit"
  | "humidity_stuck_extreme"
  | "soil_moisture_stuck_extreme"
  | "ph_outside_realistic"
  | "ec_suspected_us_per_cm"
  | "downgraded_live_to_stale"
  | "downgraded_live_unauthenticated";

export interface BridgeNormalizedReading {
  metric: BridgeMetricKey;
  /** Canonical-unit value (C, %, kPa-not-applicable, ppm, ms/cm, ph units). */
  value: number;
  suspicions: BridgeIntakeSuspicionCode[];
  /** Per-reading trust — never "live" if any suspicion present. */
  is_trusted: boolean;
}

export interface BridgeIntakeResult {
  ok: boolean;
  resolved_source: BridgeIntakeResolvedSource;
  /** Confidence after downgrades. Always 0..1. */
  confidence: number;
  readings: BridgeNormalizedReading[];
  suspicions: BridgeIntakeSuspicionCode[];
  /** Reason codes only. Never raw values, never secrets. */
  reasons: BridgeIntakeReasonCode[];
  captured_at: string | null;
  tent_id: string | null;
  plant_id: string | null;
}

// ---------------------------------------------------------------------------
// Freshness windows
// ---------------------------------------------------------------------------

export const BRIDGE_LIVE_FRESH_MS = 15 * 60 * 1000;
export const BRIDGE_MANUAL_FRESH_MS = 24 * 60 * 60 * 1000;
export const BRIDGE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUBMITTED_SOURCES: readonly BridgeIntakeSubmittedSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "unknown",
] as const;

const ALLOWED_METRICS: readonly BridgeMetricKey[] = [
  "temperature_c",
  "humidity_pct",
  "soil_moisture_pct",
  "ph",
  "ec",
  "co2_ppm",
] as const;

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function coerceFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampConfidence(v: unknown): number {
  const n = coerceFinite(v);
  if (n === null) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeSubmittedSource(v: unknown): BridgeIntakeSubmittedSource {
  if (!isNonEmptyString(v)) return "unknown";
  const lower = v.trim().toLowerCase();
  return (SUBMITTED_SOURCES as readonly string[]).includes(lower)
    ? (lower as BridgeIntakeSubmittedSource)
    : "unknown";
}

function unitLooksFahrenheit(unit?: string | null): boolean {
  if (!unit) return false;
  const u = unit.trim().toLowerCase();
  return u === "f" || u === "°f" || u === "fahrenheit";
}

function unitLooksMicroSiemens(unit?: string | null): boolean {
  if (!unit) return false;
  const u = unit.trim().toLowerCase().replace(/\s+/g, "");
  return u === "us/cm" || u === "µs/cm" || u === "μs/cm";
}

// ---------------------------------------------------------------------------
// Reading validation
// ---------------------------------------------------------------------------

interface ReadingEval {
  reading: BridgeNormalizedReading | null;
  reasons: BridgeIntakeReasonCode[];
}

function evaluateReading(input: unknown): ReadingEval {
  const reasons: BridgeIntakeReasonCode[] = [];

  if (!input || typeof input !== "object") {
    return { reading: null, reasons: ["reading_value_invalid"] };
  }
  const r = input as Record<string, unknown>;
  const metric = r.metric;
  if (
    !isNonEmptyString(metric) ||
    !(ALLOWED_METRICS as readonly string[]).includes(metric)
  ) {
    return { reading: null, reasons: ["reading_value_invalid"] };
  }
  const numeric = coerceFinite(r.value);
  if (numeric === null) {
    return { reading: null, reasons: ["reading_value_invalid"] };
  }
  const unit = isNonEmptyString(r.unit) ? r.unit : null;

  const suspicions: BridgeIntakeSuspicionCode[] = [];
  const value = numeric;

  switch (metric as BridgeMetricKey) {
    case "humidity_pct": {
      if (value < HUMIDITY_RANGE.min || value > HUMIDITY_RANGE.max) {
        reasons.push("humidity_out_of_range");
        return { reading: null, reasons };
      }
      if ((HUMIDITY_STUCK_VALUES as readonly number[]).includes(value)) {
        suspicions.push("humidity_stuck_extreme");
      }
      break;
    }
    case "soil_moisture_pct": {
      if (value < VWC_RANGE.min || value > VWC_RANGE.max) {
        reasons.push("soil_moisture_out_of_range");
        return { reading: null, reasons };
      }
      if (value === 0 || value === 100) {
        suspicions.push("soil_moisture_stuck_extreme");
      }
      break;
    }
    case "ph": {
      // Out of physical range → invalid; outside realistic → suspicion only.
      if (value < 0 || value > 14) {
        reasons.push("ph_out_of_realistic_range");
        return { reading: null, reasons };
      }
      if (value < PH_REALISTIC_RANGE.min || value > PH_REALISTIC_RANGE.max) {
        suspicions.push("ph_outside_realistic");
      }
      break;
    }
    case "temperature_c": {
      // Explicit Fahrenheit unit OR plausibly-Fahrenheit magnitude → suspect.
      if (unitLooksFahrenheit(unit) || value > AIR_TEMP_C_RANGE.max) {
        suspicions.push("temp_c_suspected_fahrenheit");
      }
      break;
    }
    case "ec": {
      if (unitLooksMicroSiemens(unit) || value > EC_SUSPICIOUS_MSCM_MAX) {
        suspicions.push("ec_suspected_us_per_cm");
      }
      break;
    }
    case "co2_ppm": {
      if (value < 0) {
        reasons.push("reading_value_invalid");
        return { reading: null, reasons };
      }
      break;
    }
  }

  return {
    reading: {
      metric: metric as BridgeMetricKey,
      value,
      suspicions,
      is_trusted: suspicions.length === 0,
    },
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Main entry — validateAndResolveBridgeIntake
// ---------------------------------------------------------------------------

export interface BridgeIntakeOptions {
  /** Injectable now for deterministic tests. */
  now?: number | Date;
}

export function validateAndResolveBridgeIntake(
  input: BridgeIntakePayload | null | undefined,
  options: BridgeIntakeOptions = {},
): BridgeIntakeResult {
  const reasons: BridgeIntakeReasonCode[] = [];
  const suspicions: BridgeIntakeSuspicionCode[] = [];
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : typeof options.now === "number" && Number.isFinite(options.now)
        ? options.now
        : Date.now();

  if (!input || typeof input !== "object") {
    return invalidResult(["payload_missing"]);
  }

  // tent_id ----------------------------------------------------------------
  const tentId = isNonEmptyString(input.tent_id) && UUID_RE.test(input.tent_id)
    ? input.tent_id
    : null;
  if (!tentId) reasons.push("tent_id_missing");

  const plantId =
    isNonEmptyString(input.plant_id) && UUID_RE.test(input.plant_id)
      ? input.plant_id
      : null;

  // captured_at ------------------------------------------------------------
  let capturedAtIso: string | null = null;
  let ageMs: number | null = null;
  if (!isNonEmptyString(input.captured_at)) {
    reasons.push("captured_at_missing");
  } else {
    const t = Date.parse(input.captured_at);
    if (!Number.isFinite(t)) {
      reasons.push("captured_at_invalid");
    } else if (t > nowMs + BRIDGE_FUTURE_TOLERANCE_MS) {
      reasons.push("captured_at_future");
    } else {
      capturedAtIso = new Date(t).toISOString();
      ageMs = nowMs - t;
    }
  }

  // submitted source -------------------------------------------------------
  const submitted = normalizeSubmittedSource(input.submitted_source);
  if (submitted === "unknown" && isNonEmptyString(input.submitted_source)) {
    reasons.push("submitted_source_invalid");
  }

  // readings ---------------------------------------------------------------
  const readingsArr = Array.isArray(input.readings) ? input.readings : null;
  if (!readingsArr) {
    reasons.push("readings_missing");
  } else if (readingsArr.length === 0) {
    reasons.push("readings_empty");
  }

  const normalized: BridgeNormalizedReading[] = [];
  if (readingsArr) {
    for (const r of readingsArr) {
      const e = evaluateReading(r);
      for (const c of e.reasons) reasons.push(c);
      if (e.reading) {
        normalized.push(e.reading);
        for (const s of e.reading.suspicions) suspicions.push(s);
      }
    }
  }

  // Structural failures → invalid early.
  if (!tentId || !capturedAtIso) {
    return invalidResult(uniq(reasons), {
      captured_at: capturedAtIso,
      tent_id: tentId,
      plant_id: plantId,
    });
  }

  if (normalized.length === 0) {
    if (!reasons.includes("readings_missing") && !reasons.includes("readings_empty")) {
      reasons.push("no_valid_metrics");
    }
    return invalidResult(uniq(reasons), {
      captured_at: capturedAtIso,
      tent_id: tentId,
      plant_id: plantId,
    });
  }

  // ----------------------------------------------------------------------
  // Resolve source conservatively. Never blindly trust "live".
  // ----------------------------------------------------------------------
  const isAuthenticated = input.authenticated === true;
  let resolved: BridgeIntakeResolvedSource;
  const baseConfidence = clampConfidence(input.confidence);
  let confidence = baseConfidence;

  if (submitted === "demo") {
    resolved = "demo";
  } else if (submitted === "csv") {
    resolved = "csv";
  } else if (submitted === "manual") {
    if (ageMs !== null && ageMs > BRIDGE_MANUAL_FRESH_MS) {
      resolved = "stale";
      reasons.push("stale_for_manual");
      confidence = Math.min(confidence, 0.3);
    } else {
      resolved = "manual";
    }
  } else if (submitted === "live") {
    if (!isAuthenticated) {
      resolved = "stale";
      reasons.push("unauthenticated_live_claim");
      suspicions.push("downgraded_live_unauthenticated");
      confidence = Math.min(confidence, 0.3);
    } else if (ageMs !== null && ageMs > BRIDGE_LIVE_FRESH_MS) {
      resolved = "stale";
      reasons.push("stale_for_live");
      suspicions.push("downgraded_live_to_stale");
      confidence = Math.min(confidence, 0.4);
    } else {
      resolved = "live";
    }
  } else {
    // submitted === "unknown" — never healthy.
    resolved = "invalid";
  }

  // Any per-reading suspicion downgrades a live claim to stale (never auto-healthy).
  if (resolved === "live" && normalized.some((r) => !r.is_trusted)) {
    resolved = "stale";
    suspicions.push("downgraded_live_to_stale");
    confidence = Math.min(confidence, 0.4);
  }

  reasons.push("ok");

  return {
    ok: resolved !== "invalid",
    resolved_source: resolved,
    confidence,
    readings: normalized,
    suspicions: uniq(suspicions),
    reasons: uniq(reasons),
    captured_at: capturedAtIso,
    tent_id: tentId,
    plant_id: plantId,
  };
}

function invalidResult(
  reasons: BridgeIntakeReasonCode[],
  partial: Partial<Pick<BridgeIntakeResult, "captured_at" | "tent_id" | "plant_id">> = {},
): BridgeIntakeResult {
  return {
    ok: false,
    resolved_source: "invalid",
    confidence: 0,
    readings: [],
    suspicions: [],
    reasons: uniq(reasons.length ? reasons : ["payload_missing"]),
    captured_at: partial.captured_at ?? null,
    tent_id: partial.tent_id ?? null,
    plant_id: partial.plant_id ?? null,
  };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
