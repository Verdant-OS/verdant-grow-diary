/**
 * sensorSnapshotReviewRules — pure validation for a MANUAL sensor snapshot
 * draft before it is attached to a diary/Quick Log entry.
 *
 * Safety invariants:
 *  - Source is ALWAYS "manual". Never "live". No fake live data.
 *  - No I/O, no React, no Supabase, no network. Pure derivations only.
 *  - `now` is injectable so staleness checks are deterministic in tests.
 *  - Findings are emitted in a fixed rule order for stable output.
 *  - Bad/unknown telemetry surfaces as a blocker or warning — never
 *    silently promoted to "ok".
 *
 * Scope:
 *  - Snapshot-shape input covers tempF, humidity, VPD, soil %/EC, reservoir
 *    EC/pH, CO2, PPFD, capturedAt, tent/plant.
 *  - Whether the parent persists a subset (sensor_readings only accepts a
 *    subset of these metrics) is out of scope. This module just reviews.
 */

import { PPFD_MAX } from "@/lib/ppfdRules";
import {
  computeVpdKpa,
  fahrenheitToCelsius,
} from "@/lib/sensorReadingManualEntryRules";

export type SensorSnapshotReviewSeverity = "ok" | "warning" | "blocker";

export interface SensorSnapshotReviewFinding {
  key: string;
  severity: SensorSnapshotReviewSeverity;
  label: string;
  message: string;
}

export interface SensorSnapshotNormalizedPreview {
  tempF?: number | null;
  humidity?: number | null;
  vpdKpa?: number | null;
  soilWaterContent?: number | null;
  soilEc?: number | null;
  reservoirEc?: number | null;
  reservoirPh?: number | null;
  co2Ppm?: number | null;
  ppfd?: number | null;
  capturedAt?: string | null;
  tentId?: string | null;
  plantId?: string | null;
}

export interface SensorSnapshotReviewResult {
  canSave: boolean;
  source: "manual";
  confidence: "high" | "medium" | "low";
  findings: SensorSnapshotReviewFinding[];
  normalizedPreview: SensorSnapshotNormalizedPreview;
}

export interface SensorSnapshotReviewInput {
  tempF?: string | number | null;
  humidity?: string | number | null;
  vpdKpa?: string | number | null;
  soilWaterContent?: string | number | null;
  soilEc?: string | number | null;
  reservoirEc?: string | number | null;
  reservoirPh?: string | number | null;
  co2Ppm?: string | number | null;
  ppfd?: string | number | null;
  capturedAt?: string | null;
  tentId?: string | null;
  plantId?: string | null;
}

export interface SensorSnapshotReviewOptions {
  /** Injectable "now" for deterministic staleness checks. Defaults to new Date(). */
  now?: Date;
  /** Max allowed clock skew for future-dated captures. Defaults to 5 minutes. */
  futureSkewMs?: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DEFAULT_FUTURE_SKEW_MS = 5 * MINUTE_MS;

function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Review a manual sensor snapshot draft.
 * Pure. Deterministic. Never fabricates a `live` source.
 */
export function reviewManualSensorSnapshot(
  input: SensorSnapshotReviewInput,
  opts: SensorSnapshotReviewOptions = {},
): SensorSnapshotReviewResult {
  const now = opts.now ?? new Date();
  const futureSkew = opts.futureSkewMs ?? DEFAULT_FUTURE_SKEW_MS;

  const tempF = toFinite(input.tempF);
  const humidity = toFinite(input.humidity);
  const vpd = toFinite(input.vpdKpa);
  const soilWc = toFinite(input.soilWaterContent);
  const soilEc = toFinite(input.soilEc);
  const resEc = toFinite(input.reservoirEc);
  const resPh = toFinite(input.reservoirPh);
  const co2 = toFinite(input.co2Ppm);
  const ppfd = toFinite(input.ppfd);
  const capturedAt = input.capturedAt ?? null;
  const capturedDate = parseTimestamp(capturedAt);

  // VPD auto-preview (derived, only for display — never silently persisted).
  let vpdPreview: number | null = vpd;
  let vpdDerived = false;
  if (vpdPreview === null && tempF !== null && humidity !== null && humidity >= 0 && humidity <= 100) {
    vpdPreview = computeVpdKpa(fahrenheitToCelsius(tempF), humidity);
    vpdDerived = true;
  }

  const findings: SensorSnapshotReviewFinding[] = [];
  const push = (f: SensorSnapshotReviewFinding) => findings.push(f);

  // --- Provenance blockers ---
  if (!input.tentId) {
    push({
      key: "tent_missing",
      severity: "blocker",
      label: "Tent",
      message: "A tent must be selected before saving a manual snapshot.",
    });
  }
  if (!capturedAt) {
    push({
      key: "captured_at_missing",
      severity: "blocker",
      label: "Captured at",
      message: "Capture time is required for a manual snapshot.",
    });
  } else if (!capturedDate) {
    push({
      key: "captured_at_invalid",
      severity: "blocker",
      label: "Captured at",
      message: "Capture time is not a valid timestamp.",
    });
  } else {
    const deltaMs = capturedDate.getTime() - now.getTime();
    if (deltaMs > futureSkew) {
      push({
        key: "captured_at_future",
        severity: "blocker",
        label: "Captured at",
        message: "Capture time is in the future.",
      });
    } else if (-deltaMs > 24 * HOUR_MS) {
      push({
        key: "captured_at_too_old",
        severity: "blocker",
        label: "Captured at",
        message: "Capture time is older than 24h — save as historical import instead.",
      });
    } else if (-deltaMs > HOUR_MS) {
      push({
        key: "captured_at_stale",
        severity: "warning",
        label: "Captured at",
        message: "Capture time is more than 1h old.",
      });
    }
  }

  // --- Metric blockers (impossible values) ---
  if (humidity !== null && (humidity < 0 || humidity > 100)) {
    push({
      key: "humidity_out_of_range",
      severity: "blocker",
      label: "Humidity",
      message: "Humidity must be between 0% and 100%.",
    });
  }
  if (soilWc !== null && (soilWc < 0 || soilWc > 100)) {
    push({
      key: "soil_water_content_out_of_range",
      severity: "blocker",
      label: "Soil water content",
      message: "Soil water content must be between 0% and 100%.",
    });
  }
  if (co2 !== null && co2 < 0) {
    push({
      key: "co2_negative",
      severity: "blocker",
      label: "CO₂",
      message: "CO₂ ppm cannot be negative.",
    });
  }
  if (vpd !== null && vpd < 0) {
    push({
      key: "vpd_negative",
      severity: "blocker",
      label: "VPD",
      message: "VPD cannot be negative.",
    });
  }
  if (ppfd !== null && ppfd < 0) {
    push({
      key: "ppfd_negative",
      severity: "blocker",
      label: "PPFD",
      message: "PPFD cannot be negative.",
    });
  }
  if (ppfd !== null && ppfd > PPFD_MAX) {
    push({
      key: "ppfd_out_of_range",
      severity: "blocker",
      label: "PPFD",
      message: `PPFD must be between 0 and ${PPFD_MAX} µmol/m²/s.`,
    });
  }
  if (soilEc !== null && soilEc < 0) {
    push({
      key: "soil_ec_negative",
      severity: "blocker",
      label: "Soil EC",
      message: "Soil EC cannot be negative.",
    });
  }
  if (resEc !== null && resEc < 0) {
    push({
      key: "reservoir_ec_negative",
      severity: "blocker",
      label: "Reservoir EC",
      message: "Reservoir EC cannot be negative.",
    });
  }
  if (resPh !== null && (resPh < 0 || resPh > 14)) {
    push({
      key: "reservoir_ph_out_of_range",
      severity: "blocker",
      label: "Reservoir pH",
      message: "Reservoir pH must be between 0 and 14.",
    });
  }

  // --- Warnings (suspicious but not impossible) ---
  let suspiciousUnitOrRail = false;

  if (tempF !== null && tempF >= 10 && tempF <= 35) {
    // Grow-room air rarely under 35°F; a value in 10-35 in the °F field is
    // almost certainly a °C reading typed into the wrong unit.
    suspiciousUnitOrRail = true;
    push({
      key: "temp_f_looks_like_celsius",
      severity: "warning",
      label: "Air temp",
      message: `Air temp ${tempF}°F looks like a °C value typed into the °F field.`,
    });
  } else if (tempF !== null && (tempF < 50 || tempF > 100)) {
    push({
      key: "temp_f_atypical",
      severity: "warning",
      label: "Air temp",
      message: `Air temp ${tempF}°F is outside the typical 50–100°F range.`,
    });
  }

  if (humidity !== null && humidity >= 0 && humidity <= 100) {
    if (humidity === 0 || humidity === 100) {
      suspiciousUnitOrRail = true;
      push({
        key: "humidity_stuck_rail",
        severity: "warning",
        label: "Humidity",
        message: `Humidity is stuck at ${humidity}% — possible sensor failure.`,
      });
    } else if (humidity < 20 || humidity > 90) {
      push({
        key: "humidity_atypical",
        severity: "warning",
        label: "Humidity",
        message: `Humidity ${humidity}% is outside the typical 20–90% range.`,
      });
    }
  }

  if (soilWc !== null && soilWc >= 0 && soilWc <= 100) {
    if (soilWc === 0 || soilWc === 100) {
      suspiciousUnitOrRail = true;
      push({
        key: "soil_water_content_stuck_rail",
        severity: "warning",
        label: "Soil water content",
        message: `Soil water content is stuck at ${soilWc}% — possible sensor failure.`,
      });
    }
  }

  if (vpd !== null && vpd >= 0 && vpd > 2.5) {
    push({
      key: "vpd_high",
      severity: "warning",
      label: "VPD",
      message: `VPD ${vpd} kPa is unusually high (> 2.5).`,
    });
  }

  if (resEc !== null && resEc >= 0 && (resEc < 0.3 || resEc > 4.0)) {
    push({
      key: "reservoir_ec_atypical",
      severity: "warning",
      label: "Reservoir EC",
      message: `Reservoir EC ${resEc} mS/cm is outside the typical 0.3–4.0 range.`,
    });
  }

  if (resPh !== null && resPh >= 0 && resPh <= 14 && (resPh < 5.0 || resPh > 7.5)) {
    push({
      key: "reservoir_ph_atypical",
      severity: "warning",
      label: "Reservoir pH",
      message: `Reservoir pH ${resPh} is outside the typical 5.0–7.5 range.`,
    });
  }

  if (ppfd !== null && ppfd >= 0 && ppfd > 1500 && ppfd <= PPFD_MAX) {
    push({
      key: "ppfd_high",
      severity: "warning",
      label: "PPFD",
      message: `PPFD ${ppfd} µmol/m²/s is unusually high (> 1500).`,
    });
  }

  if (vpdDerived && vpdPreview !== null) {
    push({
      key: "vpd_derived_preview",
      severity: "ok",
      label: "VPD",
      message: `VPD auto-computed from temp + RH for preview only (${vpdPreview} kPa). Not saved unless you enter it.`,
    });
  }

  // --- Metric presence ---
  const metricPresent =
    tempF !== null ||
    humidity !== null ||
    vpd !== null ||
    soilWc !== null ||
    soilEc !== null ||
    resEc !== null ||
    resPh !== null ||
    co2 !== null ||
    ppfd !== null;

  if (!metricPresent) {
    push({
      key: "no_metrics",
      severity: "blocker",
      label: "Metrics",
      message: "Enter at least one sensor reading.",
    });
  }

  // Sort by fixed severity order then by insertion — but insertion is already
  // in fixed rule order above, so we only re-group by severity.
  const severityOrder: Record<SensorSnapshotReviewSeverity, number> = {
    blocker: 0,
    warning: 1,
    ok: 2,
  };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const hasBlocker = findings.some((f) => f.severity === "blocker");
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const metricCount = [
    tempF,
    humidity,
    vpd,
    soilWc,
    soilEc,
    resEc,
    resPh,
    co2,
    ppfd,
  ].filter((v) => v !== null).length;

  let confidence: "high" | "medium" | "low";
  if (hasBlocker || suspiciousUnitOrRail) {
    confidence = "low";
  } else if (warningCount > 0) {
    confidence = "medium";
  } else if (metricCount >= 3) {
    confidence = "high";
  } else {
    confidence = "medium";
  }

  const normalizedPreview: SensorSnapshotNormalizedPreview = {
    tempF: tempF,
    humidity: humidity,
    vpdKpa: vpdPreview,
    soilWaterContent: soilWc,
    soilEc: soilEc,
    reservoirEc: resEc,
    reservoirPh: resPh,
    co2Ppm: co2,
    ppfd: ppfd,
    capturedAt: capturedAt ?? null,
    tentId: input.tentId ?? null,
    plantId: input.plantId ?? null,
  };

  return {
    canSave: !hasBlocker && metricPresent,
    source: "manual",
    confidence,
    findings,
    normalizedPreview,
  };
}
