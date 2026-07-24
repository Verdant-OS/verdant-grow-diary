/**
 * ecowittLiveProofRules — pure classification helpers for the read-only
 * EcoWitt Live Ingest Proof Gate.
 *
 * Hard constraints:
 *  - Pure, deterministic, no I/O, no React, no Supabase.
 *  - Reuses canonical STALE_THRESHOLD_MS from sensorReadingNormalizationRules.
 *  - Never promotes demo/manual/csv/stale/invalid rows to live.
 *  - Never promotes Windows testbench packets to commissioning proof.
 *  - Never renders raw payload values; only consumes shape data.
 *  - Sort helper never assumes input order.
 */
import { STALE_THRESHOLD_MS } from "@/lib/sensorReadingNormalizationRules";
import {
  validateHumidity,
  validatePh,
  validateTempC,
  validateEcWithUnit,
} from "@/lib/sensorValidation";
import {
  CO2_VALID_BOUNDS,
  PPFD_VALID_BOUNDS,
  SOIL_VALID_BOUNDS,
} from "@/lib/sensorMetricStateRules";
import { isSensorTestbenchRow } from "@/lib/sensorTestbenchIndicatorRules";

export const ECOWITT_PROOF_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Future-timestamp tolerance (clock skew). */
export const ECOWITT_PROOF_FUTURE_SKEW_MS = 60_000;

export type EcowittProofRowStatus =
  | "live_confirmed"
  | "testbench"
  | "stale"
  | "invalid"
  | "unknown"
  | "limited"
  | "not_ecowitt";

export type EcowittProofSourceKind = "canonical_live" | "legacy_ecowitt" | "non_live" | "missing";

/** Minimal shape consumed by the proof helpers. */
export interface EcowittProofRow {
  id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  source?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  metric?: string | null;
  value?: number | string | null;
  unit?: string | null;
  raw_payload?: unknown;
}

export interface EcowittProofClassification {
  status: EcowittProofRowStatus;
  sourceKind: EcowittProofSourceKind;
  /** Parsed timestamp in ms, or null when missing/unparseable. */
  capturedAtMs: number | null;
  /** Whether vendor lineage indicates EcoWitt. */
  vendorIsEcowitt: boolean;
  /** Reason key for invalid/limited classification, if any. */
  reasonCode: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function lineageHasEcowitt(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const n = value.trim().toLowerCase();
  return n === "ecowitt" || n.startsWith("ecowitt");
}

/**
 * Detect EcoWitt vendor lineage from `raw_payload` shape. Mirrors the
 * existing `ecowittLatestSnapshotFilter` predicate semantics but is
 * intentionally local to keep this helper pure and dependency-light.
 */
export function detectEcowittVendor(row: EcowittProofRow): boolean {
  const src = (row.source ?? "").trim().toLowerCase();
  if (src === "ecowitt") return true;
  const raw = row.raw_payload;
  if (!isRecord(raw)) return false;
  const metadata = isRecord(raw.metadata) ? raw.metadata : null;
  const candidates: unknown[] = [
    raw.vendor,
    raw.source,
    raw.transport_source,
    metadata?.vendor,
    metadata?.source,
    metadata?.transport,
    metadata?.transport_source,
  ];
  return candidates.some(lineageHasEcowitt);
}

export function resolveSourceKind(row: EcowittProofRow): EcowittProofSourceKind {
  const src = (row.source ?? "").trim().toLowerCase();
  if (!src) return "missing";
  if (src === "live") return "canonical_live";
  if (src === "ecowitt") return "legacy_ecowitt";
  return "non_live";
}

function parseTimestampMs(row: EcowittProofRow): number | null {
  const raw = row.captured_at ?? row.ts ?? null;
  if (!raw) return null;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}

/**
 * Sort rows by parsed `captured_at ?? ts` descending. Rows with
 * unparseable/missing timestamps go last. Deterministic; stable by
 * input order for equal timestamps.
 */
export function sortRowsByCapturedAtDesc<T extends EcowittProofRow>(
  rows: readonly T[] | null | undefined,
): T[] {
  if (!rows || rows.length === 0) return [];
  return [...rows]
    .map((r, i) => ({ r, i, t: parseTimestampMs(r) }))
    .sort((a, b) => {
      if (a.t === null && b.t === null) return a.i - b.i;
      if (a.t === null) return 1;
      if (b.t === null) return -1;
      if (b.t !== a.t) return b.t - a.t;
      return a.i - b.i;
    })
    .map((x) => x.r);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Per-metric invalid check using the reused sensor-truth helpers. Returns
 * a reason code when invalid, or null when value is plausible / metric
 * unknown.
 */
export function detectInvalidMetric(row: EcowittProofRow): string | null {
  const metric = (row.metric ?? "").trim().toLowerCase();
  const value = num(row.value);
  if (!metric || value === null) return null;

  switch (metric) {
    case "rh":
    case "humidity":
    case "humidity_pct":
      return validateHumidity(value) ? "humidity_stuck" : null;
    case "ph":
    case "reservoir_ph":
      return validatePh(value) ? "ph_out_of_range" : null;
    case "temp":
    case "air_temp":
    case "air_temp_c":
    case "temperature":
    case "temperature_c":
      return validateTempC(value) ? "temp_out_of_range" : null;
    case "soil_ec":
    case "reservoir_ec":
    case "ec": {
      const unit = (row.unit ?? "").trim().toLowerCase();
      if (unit === "ms/cm") {
        return validateEcWithUnit(value, "mS/cm") ? "ec_unit_mismatch" : null;
      }
      if (unit === "us/cm" || unit === "µs/cm") {
        return validateEcWithUnit(value, "µS/cm") ? "ec_unit_mismatch" : null;
      }
      // Unknown unit: heuristic — EC >= 50 strongly implies µS/cm mislabel.
      return value >= 50 ? "ec_unit_mismatch" : null;
    }
    case "co2":
    case "co2_ppm":
      return value < CO2_VALID_BOUNDS.min || value > CO2_VALID_BOUNDS.max
        ? "co2_out_of_range"
        : null;
    case "ppfd":
      return value < PPFD_VALID_BOUNDS.min || value > PPFD_VALID_BOUNDS.max
        ? "ppfd_out_of_range"
        : null;
    case "soil":
    case "soil_moisture":
    case "soil_moisture_pct":
      // Single-sample stuck check is not safe; only flag out-of-bounds here.
      // Stuck-at-bound across multiple rows is handled by
      // `detectStuckSoilMoisture` below (returns "limited" when ambiguous).
      return value < SOIL_VALID_BOUNDS.min || value > SOIL_VALID_BOUNDS.max
        ? "soil_out_of_range"
        : null;
    default:
      return null;
  }
}

/**
 * Stuck-at-bound detection for soil moisture across the candidate row's
 * recent same-metric history. Returns:
 *   - "invalid" when 3+ consecutive stuck-at-0 or stuck-at-100 readings
 *   - "limited" when fewer than 3 same-metric samples are available
 *   - null when not stuck / not applicable
 */
export function detectStuckSoilMoisture(
  candidate: EcowittProofRow,
  recent: readonly EcowittProofRow[],
): "invalid" | "limited" | null {
  const metric = (candidate.metric ?? "").trim().toLowerCase();
  if (!["soil", "soil_moisture", "soil_moisture_pct"].includes(metric)) {
    return null;
  }
  const sameMetric = recent.filter((r) => (r.metric ?? "").trim().toLowerCase() === metric);
  if (sameMetric.length < 3) return "limited";
  const top3 = sameMetric.slice(0, 3).map((r) => num(r.value));
  const allZero = top3.every((v) => v === 0);
  const allHundred = top3.every((v) => v === 100);
  return allZero || allHundred ? "invalid" : null;
}

/**
 * Classify a single row against the proof contract. Pure.
 */
export function classifyEcowittProofRow(
  row: EcowittProofRow,
  sortedRecent: readonly EcowittProofRow[],
  nowMs: number,
): EcowittProofClassification {
  const vendorIsEcowitt = detectEcowittVendor(row);
  const sourceKind = resolveSourceKind(row);
  const capturedAtMs = parseTimestampMs(row);

  // Source gate: non-live canonical sources are never promoted.
  if (sourceKind === "non_live" || sourceKind === "missing") {
    return {
      status: "not_ecowitt",
      sourceKind,
      capturedAtMs,
      vendorIsEcowitt,
      reasonCode: "non_live_source",
    };
  }

  // Vendor gate: canonical "live" without EcoWitt lineage is out of scope.
  if (sourceKind === "canonical_live" && !vendorIsEcowitt) {
    return {
      status: "not_ecowitt",
      sourceKind,
      capturedAtMs,
      vendorIsEcowitt,
      reasonCode: "no_ecowitt_vendor",
    };
  }

  // Testbench provenance wins over freshness and valid-looking values. The
  // packet proves the transport path only; it is not evidence that a physical
  // EcoWitt sensor produced the reading.
  if (isSensorTestbenchRow(row)) {
    return {
      status: "testbench",
      sourceKind,
      capturedAtMs,
      vendorIsEcowitt,
      reasonCode: "test_provenance",
    };
  }

  // Timestamp gates.
  if (capturedAtMs === null) {
    return {
      status: "unknown",
      sourceKind,
      capturedAtMs,
      vendorIsEcowitt,
      reasonCode: "missing_timestamp",
    };
  }
  if (capturedAtMs - nowMs > ECOWITT_PROOF_FUTURE_SKEW_MS) {
    return {
      status: "invalid",
      sourceKind,
      capturedAtMs,
      vendorIsEcowitt,
      reasonCode: "future_timestamp",
    };
  }
  if (nowMs - capturedAtMs > STALE_THRESHOLD_MS) {
    return {
      status: "stale",
      sourceKind,
      capturedAtMs,
      vendorIsEcowitt,
      reasonCode: "stale",
    };
  }

  // Metric validity.
  const invalidReason = detectInvalidMetric(row);
  if (invalidReason) {
    return {
      status: "invalid",
      sourceKind,
      capturedAtMs,
      vendorIsEcowitt,
      reasonCode: invalidReason,
    };
  }

  const stuck = detectStuckSoilMoisture(row, sortedRecent);
  if (stuck === "invalid") {
    return {
      status: "invalid",
      sourceKind,
      capturedAtMs,
      vendorIsEcowitt,
      reasonCode: "soil_stuck",
    };
  }
  if (stuck === "limited") {
    return {
      status: "limited",
      sourceKind,
      capturedAtMs,
      vendorIsEcowitt,
      reasonCode: "insufficient_history",
    };
  }

  return {
    status: "live_confirmed",
    sourceKind,
    capturedAtMs,
    vendorIsEcowitt,
    reasonCode: null,
  };
}
