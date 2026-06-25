/**
 * greenhouseClimateRules — pure climate helpers for greenhouse VPD and
 * sunset condensation risk.
 *
 * Contract:
 *  - Pure. No I/O, no React, no Supabase, no fetch, no timers, no
 *    automation, no device control.
 *  - Consumes resolved snapshot-like inputs only.
 *  - Null-safe: missing/NaN/Infinity inputs resolve to "unknown" —
 *    never silently to healthy.
 *  - VPD high/low is a RISK / REVIEW signal, not a certainty.
 *  - Condensation risk is REVIEW-only.
 *  - No `command`, `device_id`, `action_queue`, `control`, `relay`, or
 *    `execute` keys are ever emitted.
 */
import { normalizeGreenhouseSource, type GreenhouseSource } from "./greenhouseLightRules";

export const AIR_TEMP_MIN_C = -20;
export const AIR_TEMP_MAX_C = 60;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export interface CalculateVpdInput {
  tempC: number | null | undefined;
  rhPercent: number | null | undefined;
}

/**
 * Tetens VPD (kPa). Returns null for invalid inputs.
 * es  = 0.6108 * exp((17.27 * tempC) / (tempC + 237.3))
 * vpd = es * (1 - RH / 100)
 */
export function calculateVpdKpa(input: CalculateVpdInput): number | null {
  if (!input) return null;
  const { tempC, rhPercent } = input;
  if (!isFiniteNumber(tempC)) return null;
  if (tempC < AIR_TEMP_MIN_C || tempC > AIR_TEMP_MAX_C) return null;
  if (!isFiniteNumber(rhPercent)) return null;
  if (rhPercent < 0 || rhPercent > 100) return null;
  const es = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const vpd = es * (1 - rhPercent / 100);
  if (!Number.isFinite(vpd)) return null;
  return Math.round(vpd * 100) / 100;
}

export interface VpdBand {
  minKpa: number;
  maxKpa: number;
}

export type VpdStatus = "unknown" | "low" | "in_band" | "high";
export type VpdSeverity = "review" | "risk" | null;

export interface AssessVpdInput {
  vpdKpa: number | null | undefined;
  /** Source for the underlying snapshot — drives unknown classification. */
  source?: unknown;
  /** Stage band (kPa). Optional; without it, `in_band` is not possible. */
  band?: VpdBand | null;
}

export interface AssessVpdResult {
  status: VpdStatus;
  severity: VpdSeverity;
  /** Normalized snapshot source (for inspection). */
  source: GreenhouseSource;
  reason: string;
}

/**
 * Classify a VPD value against an optional stage band.
 *
 * - stale/invalid sources → "unknown" (never healthy).
 * - Missing band → severity stays "review" when off-norm, since we
 *   cannot prove "in_band".
 * - Far-from-band → "risk". Near-band → "review". Never "certain".
 */
export function assessVpd(input: AssessVpdInput): AssessVpdResult {
  const source = normalizeGreenhouseSource(input?.source);
  if (source === "stale" || source === "invalid") {
    return { status: "unknown", severity: null, source, reason: "source_not_healthy" };
  }
  const vpd = input?.vpdKpa;
  if (!isFiniteNumber(vpd)) {
    return { status: "unknown", severity: null, source, reason: "vpd_missing_or_invalid" };
  }
  const band = input?.band;
  // Conservative absolute fallbacks for unknown stage band.
  const min = band && isFiniteNumber(band.minKpa) ? band.minKpa : 0.8;
  const max = band && isFiniteNumber(band.maxKpa) ? band.maxKpa : 1.5;
  if (vpd < min) {
    const distance = min - vpd;
    return {
      status: "low",
      severity: distance > 0.3 ? "risk" : "review",
      source,
      reason: "vpd_below_band",
    };
  }
  if (vpd > max) {
    const distance = vpd - max;
    return {
      status: "high",
      severity: distance > 0.3 ? "risk" : "review",
      source,
      reason: "vpd_above_band",
    };
  }
  return { status: "in_band", severity: null, source, reason: "vpd_within_band" };
}

export interface ClimateSample {
  ts: string;
  tempC: number | null | undefined;
  rhPercent: number | null | undefined;
  source: unknown;
}

export type CondensationStatus = "ok" | "review" | "invalid" | "insufficient_samples";

export interface CondensationRiskResult {
  status: CondensationStatus;
  reason: string;
  /** Total drop in tempC across the window (positive = cooling). */
  tempDropC: number | null;
  /** Maximum RH observed (healthy samples). */
  maxRhPercent: number | null;
  usedCount: number;
}

/**
 * Sunset-window condensation risk: rising RH while temperature is
 * falling pushes the dew point toward leaf surfaces. REVIEW-only.
 *
 * - Requires at least 2 healthy samples (live/manual/csv).
 * - Returns "invalid" when no healthy parseable samples exist.
 * - "review" when temp drop ≥ 1.5°C AND max RH ≥ 80%.
 */
export function detectSunsetCondensationRisk(
  samples: ReadonlyArray<ClimateSample> | null | undefined,
): CondensationRiskResult {
  const arr = Array.isArray(samples) ? samples : [];
  type Parsed = { tMs: number; tempC: number; rh: number };
  const healthy: Parsed[] = [];
  for (const s of arr) {
    const src = normalizeGreenhouseSource(s?.source);
    if (src === "stale" || src === "invalid" || src === "demo") continue;
    const tMs = Date.parse(String(s?.ts ?? ""));
    const tempC = typeof s?.tempC === "number" ? s.tempC : Number(s?.tempC);
    const rh = typeof s?.rhPercent === "number" ? s.rhPercent : Number(s?.rhPercent);
    if (!Number.isFinite(tMs) || !Number.isFinite(tempC) || !Number.isFinite(rh)) continue;
    if (rh < 0 || rh > 100) continue;
    if (tempC < AIR_TEMP_MIN_C || tempC > AIR_TEMP_MAX_C) continue;
    healthy.push({ tMs, tempC, rh });
  }
  if (healthy.length === 0) {
    return {
      status: "invalid",
      reason: "no_healthy_samples",
      tempDropC: null,
      maxRhPercent: null,
      usedCount: 0,
    };
  }
  if (healthy.length < 2) {
    return {
      status: "insufficient_samples",
      reason: "need_at_least_two_samples",
      tempDropC: null,
      maxRhPercent: healthy[0].rh,
      usedCount: 1,
    };
  }
  healthy.sort((a, b) => a.tMs - b.tMs);
  const drop = healthy[0].tempC - healthy[healthy.length - 1].tempC;
  const maxRh = healthy.reduce((m, x) => (x.rh > m ? x.rh : m), -Infinity);
  if (drop >= 1.5 && maxRh >= 80) {
    return {
      status: "review",
      reason: "falling_temp_with_high_rh_review_for_condensation",
      tempDropC: Math.round(drop * 10) / 10,
      maxRhPercent: Math.round(maxRh * 10) / 10,
      usedCount: healthy.length,
    };
  }
  return {
    status: "ok",
    reason: "no_condensation_pattern_detected",
    tempDropC: Math.round(drop * 10) / 10,
    maxRhPercent: Math.round(maxRh * 10) / 10,
    usedCount: healthy.length,
  };
}
