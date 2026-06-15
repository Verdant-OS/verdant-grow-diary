/**
 * manualSensorSnapshotQualityRules — pure helper that classifies a manual /
 * current sensor snapshot for grower-facing trust badges.
 *
 * Hard constraints:
 *  - Pure logic. No React, no Supabase, no I/O, no model calls.
 *  - Read-only classification — never writes Action Queue rows, never
 *    triggers device control, never creates alerts.
 *  - Conservative: unknown source can never resolve to "usable".
 *  - Never classifies invalid / stale / demo telemetry as healthy.
 */

import {
  AIR_TEMP_C_RANGE,
  EC_SUSPICIOUS_MSCM_MAX,
  HUMIDITY_RANGE,
  HUMIDITY_STUCK_VALUES,
  PH_REALISTIC_RANGE,
  SUBSTRATE_TEMP_C_RANGE,
  VWC_RANGE,
} from "@/constants/csvValidationRanges";

/** Default staleness threshold for "current" room confidence. */
export const MANUAL_SNAPSHOT_CURRENT_STALE_HOURS = 6;
/** Realistic VPD window for indoor grow rooms (kPa). */
export const VPD_REALISTIC_RANGE = { min: 0.2, max: 2.5 } as const;

export type ManualSnapshotQuality =
  | "usable"
  | "needs_review"
  | "invalid"
  | "missing";

export type ManualSnapshotSourceLabel =
  | "manual"
  | "live"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

export interface ManualSensorSnapshotInput {
  readonly source?: string | null;
  readonly captured_at?: string | number | Date | null;
  readonly temperature_c?: number | null;
  readonly humidity_pct?: number | null;
  readonly vpd_kpa?: number | null;
  readonly soil_temp_c?: number | null;
  readonly soil_moisture_pct?: number | null;
  readonly soil_ec_mscm?: number | null;
  readonly ph?: number | null;
}

export interface ManualSensorSnapshotQuality {
  readonly quality: ManualSnapshotQuality;
  readonly sourceLabel: ManualSnapshotSourceLabel;
  readonly summary: string;
  readonly reasons: ReadonlyArray<string>;
  readonly invalidFields: ReadonlyArray<string>;
  readonly missingFields: ReadonlyArray<string>;
  readonly canSupportAiDoctorCurrentContext: boolean;
  readonly canSupportActionSuggestionPreview: boolean;
}

const KNOWN_SOURCES: ReadonlyArray<ManualSnapshotSourceLabel> = [
  "manual",
  "live",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
];

function normalizeSource(raw: unknown): ManualSnapshotSourceLabel {
  if (typeof raw !== "string") return "unknown";
  const s = raw.trim().toLowerCase();
  return (KNOWN_SOURCES as ReadonlyArray<string>).includes(s)
    ? (s as ManualSnapshotSourceLabel)
    : "unknown";
}

function toMs(v: ManualSensorSnapshotInput["captured_at"]): number | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function inRange(n: number, r: { min: number; max: number }): boolean {
  return n >= r.min && n <= r.max;
}

export interface EvaluateOptions {
  readonly nowMs?: number;
  readonly staleHours?: number;
}

export function evaluateManualSensorSnapshotQuality(
  input: ManualSensorSnapshotInput | null | undefined,
  options: EvaluateOptions = {},
): ManualSensorSnapshotQuality {
  const reasons: string[] = [];
  const invalidFields: string[] = [];
  const missingFields: string[] = [];

  if (!input || typeof input !== "object") {
    return {
      quality: "missing",
      sourceLabel: "unknown",
      summary: "Missing current reading",
      reasons: ["No sensor snapshot provided."],
      invalidFields: [],
      missingFields: ["snapshot"],
      canSupportAiDoctorCurrentContext: false,
      canSupportActionSuggestionPreview: false,
    };
  }

  const sourceLabel = normalizeSource(input.source);
  const capturedMs = toMs(input.captured_at);
  const nowMs = options.nowMs ?? Date.now();
  const staleHours = options.staleHours ?? MANUAL_SNAPSHOT_CURRENT_STALE_HOURS;

  if (capturedMs == null) {
    missingFields.push("captured_at");
    reasons.push("Missing captured-at timestamp.");
  }

  // Numeric range checks (only when value is present)
  const checkNum = (
    field: string,
    value: number | null | undefined,
    range: { min: number; max: number },
    label: string,
  ) => {
    if (value == null || !Number.isFinite(value)) return;
    if (!inRange(value, range)) {
      invalidFields.push(field);
      reasons.push(`${label} outside realistic range.`);
    }
  };

  checkNum(
    "temperature_c",
    input.temperature_c,
    AIR_TEMP_C_RANGE,
    "Air temperature",
  );
  checkNum(
    "soil_temp_c",
    input.soil_temp_c,
    SUBSTRATE_TEMP_C_RANGE,
    "Soil temperature",
  );
  checkNum("vpd_kpa", input.vpd_kpa, VPD_REALISTIC_RANGE, "VPD");
  checkNum("ph", input.ph, PH_REALISTIC_RANGE, "pH");

  if (input.humidity_pct != null && Number.isFinite(input.humidity_pct)) {
    if (!inRange(input.humidity_pct, HUMIDITY_RANGE)) {
      invalidFields.push("humidity_pct");
      reasons.push("Humidity outside 0–100%.");
    } else if (HUMIDITY_STUCK_VALUES.includes(input.humidity_pct)) {
      invalidFields.push("humidity_pct");
      reasons.push("Humidity appears stuck at 0 or 100%.");
    }
  }

  if (
    input.soil_moisture_pct != null &&
    Number.isFinite(input.soil_moisture_pct)
  ) {
    if (!inRange(input.soil_moisture_pct, VWC_RANGE)) {
      invalidFields.push("soil_moisture_pct");
      reasons.push("Soil moisture outside 0–100%.");
    } else if (
      input.soil_moisture_pct === 0 ||
      input.soil_moisture_pct === 100
    ) {
      invalidFields.push("soil_moisture_pct");
      reasons.push("Soil moisture appears stuck at 0 or 100%.");
    }
  }

  if (input.soil_ec_mscm != null && Number.isFinite(input.soil_ec_mscm)) {
    if (input.soil_ec_mscm < 0) {
      invalidFields.push("soil_ec_mscm");
      reasons.push("Soil EC cannot be negative.");
    } else if (input.soil_ec_mscm > EC_SUSPICIOUS_MSCM_MAX) {
      invalidFields.push("soil_ec_mscm");
      reasons.push("Soil EC value looks like µS/cm reported as mS/cm.");
    }
  }

  // Stale check
  let isStaleByTime = false;
  if (capturedMs != null) {
    const ageMs = nowMs - capturedMs;
    const staleMs = staleHours * 60 * 60 * 1000;
    if (ageMs > staleMs) {
      isStaleByTime = true;
      reasons.push(`Reading older than ${staleHours}h.`);
    }
  }

  // Source-driven gates
  const sourceBlocksCurrent =
    sourceLabel === "csv" ||
    sourceLabel === "demo" ||
    sourceLabel === "stale" ||
    sourceLabel === "invalid" ||
    sourceLabel === "unknown";

  let quality: ManualSnapshotQuality;
  let summary: string;

  if (sourceLabel === "invalid" || invalidFields.length > 0) {
    quality = "invalid";
    summary = "Invalid reading";
  } else if (capturedMs == null) {
    quality = "missing";
    summary = "Missing current reading";
  } else if (sourceLabel === "unknown") {
    quality = "needs_review";
    summary = "Needs review";
    reasons.unshift("Sensor source unknown.");
  } else if (sourceLabel === "csv") {
    quality = "needs_review";
    summary = "Needs review";
    reasons.unshift("CSV history only — not a current-room reading.");
  } else if (sourceLabel === "demo") {
    quality = "needs_review";
    summary = "Needs review";
    reasons.unshift("Demo data — not a current-room reading.");
  } else if (sourceLabel === "stale" || isStaleByTime) {
    quality = "needs_review";
    summary = "Needs review";
    if (sourceLabel === "stale") {
      reasons.unshift("Snapshot labeled stale.");
    }
  } else {
    quality = "usable";
    summary = "Usable current reading";
  }

  const canSupportAiDoctorCurrentContext =
    quality === "usable" && !sourceBlocksCurrent;
  const canSupportActionSuggestionPreview = canSupportAiDoctorCurrentContext;

  return {
    quality,
    sourceLabel,
    summary,
    reasons: Object.freeze([...reasons]),
    invalidFields: Object.freeze([...invalidFields]),
    missingFields: Object.freeze([...missingFields]),
    canSupportAiDoctorCurrentContext,
    canSupportActionSuggestionPreview,
  };
}

export const MANUAL_SNAPSHOT_QUALITY_SOURCE_LABELS: Readonly<
  Record<ManualSnapshotSourceLabel, string>
> = Object.freeze({
  manual: "Source: manual",
  live: "Source: live",
  csv: "Source: csv — history only",
  demo: "Source: demo",
  stale: "Source: stale",
  invalid: "Source: invalid",
  unknown: "Source: unknown",
});
