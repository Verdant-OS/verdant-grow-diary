/**
 * Pure helpers for the scoped Dashboard "Environment Alerts" card.
 *
 * Generates read-only alert candidates from:
 *   - the latest SensorSnapshot
 *   - the SensorQualityResult
 *   - the TargetComparisonResult
 *
 * Strict constraints:
 *   - No I/O. No Supabase calls. No React.
 *   - No AI calls. No plant-health diagnosis.
 *   - Read-only. Suggests nothing automated.
 *   - Does NOT create database rows. Candidates only.
 */
import { isStale, type SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorQualityResult } from "@/lib/sensorQuality";
import type { MetricKey, TargetComparisonResult } from "@/lib/environmentTargetComparison";
import { METRIC_LABELS } from "@/lib/environmentTargetComparison";
import { buildDefaultThresholdAlerts } from "@/lib/defaultEnvironmentThresholds";

export type AlertSeverity = "info" | "watch" | "warning" | "critical";

export type AlertSource =
  "sensor_snapshot" | "sensor_quality" | "target_comparison" | "default_thresholds";

export interface EnvironmentAlert {
  id: string;
  severity: AlertSeverity;
  metric: MetricKey | "snapshot" | "targets";
  title: string;
  reason: string;
  source: AlertSource;
  createdAt: string;
}

export interface AlertInputs {
  snapshot: SensorSnapshot | null;
  quality: SensorQualityResult;
  targets: TargetComparisonResult;
  now?: number;
  /** Optional source/device detail surfaced in default-threshold alert text. */
  deviceLabel?: string | null;
  /**
   * Plant/grow/tent stage. When provided (even as null), VPD evaluation in
   * the default-thresholds fallback uses stage-aware target bands. When
   * omitted, legacy generic VPD thresholds apply (backward compatibility).
   */
  stage?: string | null;
  /**
   * When true, target-comparison breach reasons include the observed value and
   * configured target range so persisted alert rows self-describe their target
   * band for AlertWhyContext.
   */
  includeConfiguredRangeInTargetBreachReason?: boolean;
}

const SEVERITY_WEIGHT: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  info: 3,
};

/**
 * Per-field implausibility checks that promote a suspicious field from
 * `warning` to `critical`. These mirror the "definitely broken" cases in
 * sensorQuality (sensor faults / out-of-physical-range values).
 */
function isCriticalImplausible(field: string, snapshot: SensorSnapshot | null): boolean {
  if (!snapshot) return false;
  switch (field) {
    case "temp":
      return snapshot.temp !== null && (snapshot.temp < -10 || snapshot.temp > 60);
    case "rh":
      return snapshot.rh !== null && (snapshot.rh < 0 || snapshot.rh > 100 || snapshot.rh === 100);
    case "vpd":
      return snapshot.vpd !== null && (snapshot.vpd < 0 || snapshot.vpd > 5);
    case "soil_ec":
      return snapshot.soil_ec !== null && (snapshot.soil_ec < 0 || snapshot.soil_ec >= 50);
    case "ppfd":
      return snapshot.ppfd !== null && (snapshot.ppfd < 0 || snapshot.ppfd > 3000);
    default:
      return false;
  }
}

function fieldLabel(field: string): string {
  return (METRIC_LABELS as Record<string, string>)[field] ?? field;
}

const TARGET_METRIC_UNITS: Partial<Record<MetricKey, string>> = {
  temp: "°C",
  rh: "%",
  vpd: " kPa",
  soil: "%",
  soil_ec: " mS/cm",
  soil_temp: "°C",
  ppfd: " µmol",
};

function fmtTargetNum(v: number, unit: string): string {
  const s = Number.isInteger(v)
    ? String(v)
    : (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)).replace(/\.?0+$/, "");
  // A tiny negative value rounds to "-0"; never render a signed zero.
  return `${s === "-0" ? "0" : s}${unit}`;
}

function buildTargetBreachReason(
  m: {
    metric: MetricKey;
    label: string;
    value: number | null;
    min: number | null;
    max: number | null;
    state: "low" | "high";
  },
  includeRange = false,
): string {
  const base =
    m.state === "low"
      ? `${m.label} is below the configured minimum.`
      : `${m.label} is above the configured maximum.`;
  if (!includeRange) return base;
  const unit = TARGET_METRIC_UNITS[m.metric] ?? "";
  const obsText = m.value !== null && Number.isFinite(m.value) ? fmtTargetNum(m.value, unit) : null;
  const rangeText =
    m.min !== null && m.max !== null
      ? `${fmtTargetNum(m.min, "")}–${fmtTargetNum(m.max, unit)}`
      : m.min !== null
        ? `≥ ${fmtTargetNum(m.min, unit)}`
        : m.max !== null
          ? `≤ ${fmtTargetNum(m.max, unit)}`
          : null;
  if (obsText && rangeText) {
    return `${base} Observed ${obsText} (configured target ${rangeText}).`;
  }
  if (rangeText) {
    return `${base} Configured target ${rangeText}.`;
  }
  return base;
}

function nowIso(now: number): string {
  return new Date(now).toISOString();
}

export function buildEnvironmentAlerts(inputs: AlertInputs): EnvironmentAlert[] {
  const now = inputs.now ?? Date.now();
  const createdAt = nowIso(now);
  const alerts: EnvironmentAlert[] = [];

  const { snapshot, quality, targets } = inputs;

  // --- 1. Sensor availability ---------------------------------------------
  if (!snapshot || snapshot.source === "unavailable") {
    alerts.push({
      id: "snapshot:unavailable",
      severity: "info",
      metric: "snapshot",
      title: "Sensor data unavailable",
      reason: "No recent sensor snapshot is available for this grow.",
      source: "sensor_snapshot",
      createdAt,
    });
  } else if (isStale(snapshot.ts, now, undefined, snapshot.source)) {
    alerts.push({
      id: "snapshot:stale",
      severity: "watch",
      metric: "snapshot",
      title: "Sensor reading is stale",
      reason:
        snapshot.source === "manual" || snapshot.source === "diary"
          ? "The latest reading is older than 24 hours."
          : "The latest reading is older than 15 minutes.",
      source: "sensor_snapshot",
      createdAt,
    });
  }

  // --- 2. Sensor quality (suspicious fields) ------------------------------
  if (quality && quality.suspiciousFields.length > 0) {
    for (const field of quality.suspiciousFields) {
      const critical = isCriticalImplausible(field, snapshot);
      alerts.push({
        id: `quality:${field}`,
        severity: critical ? "critical" : "warning",
        metric: (field as MetricKey) ?? "snapshot",
        title: critical
          ? `${fieldLabel(field)} reading is implausible`
          : `${fieldLabel(field)} reading needs review`,
        reason: critical
          ? `${fieldLabel(field)} is outside its physically plausible range.`
          : `${fieldLabel(field)} looks suspicious in the latest snapshot.`,
        source: "sensor_quality",
        createdAt,
      });
    }
  }

  // --- 3. Target comparison ------------------------------------------------
  if (targets) {
    if (targets.status === "missing_targets") {
      alerts.push({
        id: "targets:missing",
        severity: "info",
        metric: "targets",
        title: "No grow targets configured",
        reason: "Configure target ranges to enable target comparison alerts.",
        source: "target_comparison",
        createdAt,
      });
    } else if (targets.status === "out_of_range") {
      for (const m of targets.metrics) {
        if (m.state === "low" || m.state === "high") {
          alerts.push({
            id: `target:${m.metric}:${m.state}`,
            severity: "warning",
            metric: m.metric,
            title: m.state === "low" ? `${m.label} below target` : `${m.label} above target`,
            reason: buildTargetBreachReason(
              {
                metric: m.metric,
                label: m.label,
                value: m.value,
                min: m.min,
                max: m.max,
                state: m.state,
              },
              inputs.includeConfiguredRangeInTargetBreachReason === true,
            ),
            source: "target_comparison",
            createdAt,
          });
        }
      }
    }
  }
  // --- 4. Default-threshold fallback --------------------------------------
  // When no grow targets exist, evaluate temp/RH/VPD against conservative
  // default ranges. Only triggers from real, non-stale, non-sim snapshots.
  if (targets && targets.status === "missing_targets") {
    const defaults = buildDefaultThresholdAlerts({
      snapshot,
      now,
      deviceLabel: inputs.deviceLabel ?? null,
      createdAt,
      ...("stage" in inputs ? { stage: inputs.stage ?? null } : {}),
    });
    alerts.push(...defaults);
  }

  // --- Deterministic ordering ---------------------------------------------
  alerts.sort((a, b) => {
    const ds = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (ds !== 0) return ds;
    if (a.metric !== b.metric) return a.metric < b.metric ? -1 : 1;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return alerts;
}

export const EMPTY_ALERTS_MESSAGE = "No environment alerts.";
