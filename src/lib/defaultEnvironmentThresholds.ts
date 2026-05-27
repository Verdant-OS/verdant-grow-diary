/**
 * Default conservative environment thresholds + cautious recommendations
 * used by Environment Alert v1 when no grow/stage targets are configured.
 *
 * Strict constraints:
 *   - No I/O. No Supabase. No React. No timers. No AI. No device control.
 *   - Pure data + a single pure builder. Read-only.
 *   - Recommendations are review-first; they NEVER instruct equipment to
 *     act and NEVER recommend nutrient changes from environment alerts.
 *   - CO2 is intentionally NOT evaluated here. CO2 stays context-only in v1.
 *
 * VPD behavior:
 *   - When `stage` is provided (even as null), VPD is evaluated via the
 *     canonical `classifyVpdAgainstStage` helper from `vpdStageTargetRules`.
 *     * unknown stage  → NO active VPD alert (avoids misleading guidance).
 *     * harvest/drying → NO active VPD alert (context-only).
 *     * in_target      → NO alert.
 *     * below/above_target → low/high VPD alert.
 *   - When `stage` is undefined (legacy callers), the conservative generic
 *     0.6–1.6 kPa default range still applies for backward compatibility.
 */
import { isStale, type SensorSnapshot } from "@/lib/sensorSnapshot";
import type { EnvironmentAlert } from "@/lib/environmentAlerts";
import { classifyVpdAgainstStage } from "@/lib/vpdStageTargetRules";

export type DefaultMetric = "temp" | "rh" | "vpd";

export interface DefaultRange {
  min: number;
  max: number;
  unit: string;
  label: string;
}

/**
 * Conservative general indoor grow thresholds.
 * These are intentionally wide and safe; they are NOT stage-tuned.
 */
export const DEFAULT_THRESHOLDS: Record<DefaultMetric, DefaultRange> = {
  temp: { min: 18, max: 30, unit: "°C", label: "Temperature" },
  rh: { min: 35, max: 70, unit: "%", label: "Humidity" },
  vpd: { min: 0.6, max: 1.6, unit: "kPa", label: "VPD" },
};

export const DEFAULT_THRESHOLD_NOTE =
  "Compared against conservative default indoor thresholds (no grow targets configured).";

export const STAGE_VPD_THRESHOLD_NOTE =
  "Compared against stage-aware VPD targets. VPD targets depend on plant stage.";

/** Cautious review-first recommendations. No device execution. No nutrients. */
export const DEFAULT_RECOMMENDATIONS: Record<DefaultMetric, { high: string; low: string }> = {
  temp: {
    high: "Review heat load, exhaust, and light intensity before making changes.",
    low: "Review heater/environment settings and raise temperature gradually.",
  },
  rh: {
    high: "Review humidity control and increase airflow/dehumidification gradually.",
    low: "Review humidification and avoid large humidity swings.",
  },
  vpd: {
    high: "Review RH and temperature balance before changing irrigation or feed.",
    low: "Review RH and airflow to reduce overly humid conditions.",
  },
};

function fmt(v: number | null, unit: string): string {
  if (v === null || !Number.isFinite(v)) return "Unknown";
  // Trim trailing zeros for tidy output (e.g. 24, 24.5).
  const s = Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1);
  return `${s.replace(/\.?0+$/, "")}${unit}`;
}

interface BuildArgs {
  snapshot: SensorSnapshot | null;
  now?: number;
  deviceLabel?: string | null;
  createdAt?: string;
  /**
   * Plant/grow/tent stage. When provided (even as null), VPD evaluation
   * is delegated to `classifyVpdAgainstStage`. When omitted (undefined),
   * the legacy generic VPD range is used for backward compatibility.
   */
  stage?: string | null;
}

/**
 * Build default-threshold alerts when no grow targets are configured.
 * Only emits alerts when the snapshot is real (manual or live), not stale,
 * and not unavailable/sim/diary. Invalid (null) values are skipped.
 *
 * Returned alerts use `source: "default_thresholds"` so the existing
 * persistence layer can save them without colliding with target-comparison
 * alerts. The reason field carries observed value, default range, source
 * timestamp, optional device label, default-threshold note, and a cautious
 * review-first recommendation.
 */
export function buildDefaultThresholdAlerts(args: BuildArgs): EnvironmentAlert[] {
  const { snapshot } = args;
  if (!snapshot) return [];
  if (snapshot.source !== "live" && snapshot.source !== "manual") return [];
  const now = args.now ?? Date.now();
  if (isStale(snapshot.ts, now)) return [];

  const createdAt = args.createdAt ?? new Date(now).toISOString();
  const out: EnvironmentAlert[] = [];
  const stageProvided = "stage" in args;

  for (const metric of ["temp", "rh", "vpd"] as DefaultMetric[]) {
    const value = snapshot[metric];
    if (value === null || !Number.isFinite(value)) continue;

    // VPD via stage-aware classifier when stage context is provided.
    if (metric === "vpd" && stageProvided) {
      const cls = classifyVpdAgainstStage({
        value,
        stage: args.stage ?? null,
        stale: false,
      });
      // Skip when no actionable target breach for this stage:
      //   - in_target / unavailable     → no alert
      //   - stage_unknown / context_only → no misleading alert
      if (
        cls.classification !== "below_target" &&
        cls.classification !== "above_target"
      ) {
        continue;
      }
      const state: "high" | "low" =
        cls.classification === "above_target" ? "high" : "low";
      const recommendation = DEFAULT_RECOMMENDATIONS.vpd[state];
      const stageLabel = cls.band.stage.replace("_", " ");
      const rangeText =
        cls.band.min !== null && cls.band.max !== null
          ? `${fmt(cls.band.min, " kPa")}–${fmt(cls.band.max, " kPa")}`
          : "stage range";
      const parts: string[] = [];
      parts.push(
        state === "high"
          ? `VPD is above the ${stageLabel} target range.`
          : `VPD is below the ${stageLabel} target range.`,
      );
      parts.push(
        `Observed ${fmt(value, " kPa")} (${stageLabel} range ${rangeText}).`,
      );
      if (snapshot.ts) parts.push(`Reading at ${snapshot.ts}.`);
      if (args.deviceLabel) parts.push(`Source: ${args.deviceLabel}.`);
      parts.push(STAGE_VPD_THRESHOLD_NOTE);
      parts.push(`Recommendation: ${recommendation}`);

      out.push({
        // ID kept stable across stages for dedupe compatibility.
        id: `default_target:vpd:${state}`,
        severity: "warning",
        metric: "vpd",
        // Title intentionally does NOT include observed value, timestamp,
        // or stage — keeps title-based dedupe stable for the same direction.
        title:
          state === "high" ? "VPD above stage range" : "VPD below stage range",
        reason: parts.join(" "),
        source: "default_thresholds",
        createdAt,
      });
      continue;
    }

    const range = DEFAULT_THRESHOLDS[metric];
    let state: "high" | "low" | null = null;
    if (value > range.max) state = "high";
    else if (value < range.min) state = "low";
    if (!state) continue;

    const recommendation = DEFAULT_RECOMMENDATIONS[metric][state];
    const parts: string[] = [];
    parts.push(
      state === "high"
        ? `${range.label} is above the default safe range.`
        : `${range.label} is below the default safe range.`,
    );
    parts.push(
      `Observed ${fmt(value, range.unit)} (default range ${fmt(range.min, range.unit)}–${fmt(range.max, range.unit)}).`,
    );
    if (snapshot.ts) parts.push(`Reading at ${snapshot.ts}.`);
    if (args.deviceLabel) parts.push(`Source: ${args.deviceLabel}.`);
    parts.push(DEFAULT_THRESHOLD_NOTE);
    parts.push(`Recommendation: ${recommendation}`);

    out.push({
      id: `default_target:${metric}:${state}`,
      severity: "warning",
      metric,
      title:
        state === "high"
          ? `${range.label} above default range`
          : `${range.label} below default range`,
      reason: parts.join(" "),
      source: "default_thresholds",
      createdAt,
    });
  }

  return out;
}
