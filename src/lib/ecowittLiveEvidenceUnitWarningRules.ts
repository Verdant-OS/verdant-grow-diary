/**
 * EcoWitt Live Evidence unit-warning rules — pure deterministic.
 *
 * Detects unit/scale mismatches between operator-entered backend and
 * controller values BEFORE values are fed to evaluateLiveSourceTruth.
 * No data fetch, no writes, no persistence, no model calls, no clipboard.
 */

import type { LiveSourceTruthMetricKey } from "./liveSourceTruthGateRules";
import type { EcowittLiveEvidenceMetricRow } from "./ecowittLiveEvidenceFormRules";

export type EcowittEvidenceUnitWarningSeverity = "warning" | "blocks_live_proof";

export interface EcowittEvidenceUnitWarning {
  readonly metric_key: LiveSourceTruthMetricKey;
  readonly severity: EcowittEvidenceUnitWarningSeverity;
  readonly message: string;
  readonly operator_fix: string;
}

function parseNum(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s.length === 0) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function isFahrenheit(u: string): boolean {
  return u === "f" || u === "°f" || u === "degf";
}
function isCelsius(u: string): boolean {
  return u === "c" || u === "°c" || u === "degc";
}
function isPercent(u: string): boolean {
  return u === "%" || u === "pct" || u === "percent";
}
function isFraction(u: string): boolean {
  return u === "frac" || u === "fraction" || u === "0-1";
}
function isMs(u: string): boolean {
  return u === "ms/cm" || u === "ms";
}
function isUs(u: string): boolean {
  return u === "us/cm" || u === "µs/cm" || u === "μs/cm" || u === "us";
}

function effectiveUnits(row: EcowittLiveEvidenceMetricRow): {
  backend: string;
  controller: string;
} {
  const shared = (row.unit ?? "").trim();
  const b = (row.backend_unit ?? "").trim() || shared;
  const c = (row.controller_unit ?? "").trim() || shared;
  return { backend: b, controller: c };
}

export function detectEcowittEvidenceUnitWarnings(
  metricRows: readonly EcowittLiveEvidenceMetricRow[],
): readonly EcowittEvidenceUnitWarning[] {
  const out: EcowittEvidenceUnitWarning[] = [];
  for (const row of metricRows) {
    if (!row.enabled) continue;
    const key = row.key;
    const { backend: bRaw, controller: cRaw } = effectiveUnits(row);
    const bU = norm(bRaw);
    const cU = norm(cRaw);
    const bV = parseNum(row.backend_value);
    const cV = parseNum(row.controller_value);

    // Temperature unit C vs F
    if (key === "temp_f" || key === "soil_temp_f") {
      const bIsF = isFahrenheit(bU);
      const bIsC = isCelsius(bU);
      const cIsF = isFahrenheit(cU);
      const cIsC = isCelsius(cU);
      if ((bIsF && cIsC) || (bIsC && cIsF)) {
        out.push({
          metric_key: key,
          severity: "blocks_live_proof",
          message: `Backend unit '${bRaw || "missing"}' and controller unit '${cRaw || "missing"}' disagree (Fahrenheit vs Celsius) for ${key}.`,
          operator_fix:
            "Normalize both readings to the same temperature unit before comparing.",
        });
      }
      // Missing unit but values look like C-shown-as-F
      const looksCAsF = (v: number | null) =>
        v !== null && v >= 10 && v <= 45;
      if (
        bU.length === 0 &&
        cU.length === 0 &&
        (looksCAsF(bV) || looksCAsF(cV))
      ) {
        out.push({
          metric_key: key,
          severity: "warning",
          message: `${key} unit missing on both sides and values may be Celsius shown as Fahrenheit.`,
          operator_fix:
            "Label backend and controller units (F or C) before treating values as live.",
        });
      }
    }

    // Humidity / soil moisture: % vs fraction or scale mismatch
    if (key === "humidity_pct" || key === "soil_moisture_pct") {
      const bIsPct = isPercent(bU);
      const bIsFrac = isFraction(bU);
      const cIsPct = isPercent(cU);
      const cIsFrac = isFraction(cU);
      if ((bIsPct && cIsFrac) || (bIsFrac && cIsPct)) {
        out.push({
          metric_key: key,
          severity: "blocks_live_proof",
          message: `Backend unit '${bRaw || "missing"}' and controller unit '${cRaw || "missing"}' disagree (percent vs fraction) for ${key}.`,
          operator_fix:
            "Convert both sides to percent before comparing.",
        });
      }
      const looksFrac = (v: number | null) =>
        v !== null && v > 0 && v < 1;
      const looksPct = (v: number | null) =>
        v !== null && v >= 1 && v <= 100;
      if (
        (looksFrac(bV) && looksPct(cV)) ||
        (looksPct(bV) && looksFrac(cV))
      ) {
        out.push({
          metric_key: key,
          severity: "blocks_live_proof",
          message: `${key} backend value ${bV} and controller value ${cV} appear to be on different scales (0–1 vs 1–100).`,
          operator_fix:
            "Normalize both values to percent (1–100) before comparing.",
        });
      }
    }

    // EC unit mismatch mS/cm vs µS/cm
    if (key === "soil_ec_ms_cm" || key === "soil_ec_us_cm") {
      const bIsMs = isMs(bU);
      const bIsUs = isUs(bU);
      const cIsMs = isMs(cU);
      const cIsUs = isUs(cU);
      if ((bIsMs && cIsUs) || (bIsUs && cIsMs)) {
        out.push({
          metric_key: key,
          severity: "blocks_live_proof",
          message: `Backend unit '${bRaw || "missing"}' and controller unit '${cRaw || "missing"}' disagree (mS/cm vs µS/cm) for ${key}.`,
          operator_fix:
            "Normalize both EC readings to the same unit before comparing.",
        });
      }
    }
  }
  return Object.freeze(out);
}
