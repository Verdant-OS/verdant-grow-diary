/**
 * Pure, bounded presenter rules for recent typed root-zone cycles.
 *
 * The model exposes recorded watering/feeding evidence and simple arithmetic
 * comparisons only. It never infers a watering target, schedule, diagnosis,
 * chart compliance, or equipment action.
 */
import { PPM_500_PER_EC } from "@/lib/ecPpm500PairRules";
import { isUuid } from "@/lib/isUuid";
import type { OperatorRootZoneRecordV1 } from "@/lib/operatorRootZoneRecordRules";
import {
  normalizeRootZoneMetricsV1,
  normalizeRootZoneSource,
  rootZoneSourceLabel,
  type RootZoneMetricsV1,
} from "@/lib/rootZoneObservationRules";
import type {
  RootZoneDrainageObservation,
  RootZoneManualObservationV1,
  RootZoneMediumSurface,
  RootZonePotWeightFeel,
} from "@/lib/rootZoneManualObservationRules";
import { formatSensorValue } from "@/lib/sensorFormat";

export const OPERATOR_ROOT_ZONE_CYCLE_CAP = 5;
export const OPERATOR_ROOT_ZONE_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;
export const OPERATOR_ROOT_ZONE_CYCLE_ARITHMETIC_CAVEAT =
  "Intervals, ratios, and deltas are arithmetic from recorded events, not watering targets or health verdicts." as const;
export const OPERATOR_ROOT_ZONE_CYCLE_NUTRIENT_CAVEAT =
  "Recorded nutrient lines and products are evidence, not verification of a manufacturer feeding chart." as const;
export const OPERATOR_ROOT_ZONE_CYCLE_SCOPE_CAVEAT =
  "Intervals compare records for the same plant reference, or tent-level records when no plant was assigned." as const;
export const OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_ROW_CAP = 3;
export const OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_CAVEAT =
  "Manual observation only — not sensor data and not measured dryback." as const;

export type OperatorRootZoneCycleInput = OperatorRootZoneRecordV1;

export interface OperatorRootZoneCycleOptions {
  cap?: number;
  now?: number;
  futureToleranceMs?: number;
}

export type OperatorRootZoneCycleMetricKey =
  | "volume_ml"
  | "input_ph"
  | "input_ec"
  | "output_ec"
  | "runoff_ml"
  | "runoff_ph"
  | "runoff_ec"
  | "water_temp";

export interface OperatorRootZoneCycleMetricRow {
  key: OperatorRootZoneCycleMetricKey;
  label: string;
  valueLabel: string;
}

export type OperatorRootZoneCycleComparisonKey =
  | "event_interval"
  | "runoff_share"
  | "runoff_ph_delta"
  | "output_ec_delta"
  | "runoff_ec_delta";

export interface OperatorRootZoneCycleComparisonRow {
  key: OperatorRootZoneCycleComparisonKey;
  label: string;
  valueLabel: string;
}

export interface OperatorRootZoneCycleProductRow {
  name: string;
  valueLabel: string | null;
}

export type OperatorRootZoneCycleManualObservationKey =
  | "pot_weight_feel"
  | "medium_surface"
  | "drainage";

export interface OperatorRootZoneCycleManualObservationRow {
  key: OperatorRootZoneCycleManualObservationKey;
  label: string;
  valueLabel: string;
}

export interface OperatorRootZoneCycleManualObservation {
  observedAt: string;
  sourceLabel: "Manual observation";
  advisoryOnly: true;
  rows: readonly OperatorRootZoneCycleManualObservationRow[];
  caveat: typeof OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_CAVEAT;
}

export interface OperatorRootZoneCycleRow {
  key: string;
  occurredAt: string;
  eventType: "watering" | "feeding";
  eventLabel: "Watering" | "Feeding";
  targetLabel: string;
  sourceLabel: string;
  metrics: readonly OperatorRootZoneCycleMetricRow[];
  comparisons: readonly OperatorRootZoneCycleComparisonRow[];
  nutrientLine: string | null;
  products: readonly OperatorRootZoneCycleProductRow[];
  manualObservation: OperatorRootZoneCycleManualObservation | null;
  warnings: readonly string[];
}

interface NormalizedCycle {
  key: string;
  occurredAt: string;
  eventType: "watering" | "feeding";
  plantId: string | null;
  targetKey: string;
  targetLabel: string;
  futureDated: boolean;
  sourceLabel: string;
  metrics: RootZoneMetricsV1;
  manualObservation: OperatorRootZoneCycleManualObservation | null;
  hasRejectedMetrics: boolean;
  hasRejectedManualObservation: boolean;
}

const POT_WEIGHT_LABELS: Readonly<Record<RootZonePotWeightFeel, string>> = {
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
};
const MEDIUM_SURFACE_LABELS: Readonly<Record<RootZoneMediumSurface, string>> = {
  dry: "Dry",
  moist: "Moist",
  wet: "Wet",
};
const DRAINAGE_LABELS: Readonly<Record<RootZoneDrainageObservation, string>> = {
  normal: "Normal",
  slow: "Slow",
  none: "None observed",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function optionalDisplayLabel<T extends string>(
  value: unknown,
  labels: Readonly<Record<T, string>>,
): { status: "absent" } | { status: "invalid" } | { status: "valid"; valueLabel: string } {
  if (value === undefined) return { status: "absent" };
  if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(labels, value)) {
    return { status: "invalid" };
  }
  return { status: "valid", valueLabel: labels[value as T] };
}

function buildManualObservation(
  value: RootZoneManualObservationV1 | null | undefined,
  parent: {
    eventType: "watering" | "feeding";
    source: ReturnType<typeof normalizeRootZoneSource>;
    occurredAt: string;
  },
): OperatorRootZoneCycleManualObservation | null {
  if (parent.eventType !== "watering" || parent.source !== "manual") return null;
  const row = asRecord(value);
  if (!row || row.source !== "manual" || row.advisoryOnly !== true) return null;
  if (typeof row.observedAt !== "string") return null;
  const observedAtMs = Date.parse(row.observedAt);
  if (!Number.isFinite(observedAtMs)) return null;
  const observedAt = new Date(observedAtMs).toISOString();
  if (observedAt !== row.observedAt || observedAt !== parent.occurredAt) return null;

  const potWeightFeel = optionalDisplayLabel(row.potWeightFeel, POT_WEIGHT_LABELS);
  const mediumSurface = optionalDisplayLabel(row.mediumSurface, MEDIUM_SURFACE_LABELS);
  const drainage = optionalDisplayLabel(row.drainage, DRAINAGE_LABELS);
  if (
    potWeightFeel.status === "invalid" ||
    mediumSurface.status === "invalid" ||
    drainage.status === "invalid"
  ) {
    return null;
  }

  const rows: OperatorRootZoneCycleManualObservationRow[] = [];
  if (potWeightFeel.status === "valid") {
    rows.push({
      key: "pot_weight_feel",
      label: "Pot/container weight feel",
      valueLabel: potWeightFeel.valueLabel,
    });
  }
  if (mediumSurface.status === "valid") {
    rows.push({
      key: "medium_surface",
      label: "Medium surface",
      valueLabel: mediumSurface.valueLabel,
    });
  }
  if (drainage.status === "valid") {
    rows.push({
      key: "drainage",
      label: "Drainage",
      valueLabel: drainage.valueLabel,
    });
  }
  if (rows.length === 0) return null;

  return {
    observedAt,
    sourceLabel: "Manual observation",
    advisoryOnly: true,
    rows: rows.slice(0, OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_ROW_CAP),
    caveat: OPERATOR_ROOT_ZONE_MANUAL_OBSERVATION_CAVEAT,
  };
}

function finiteMetric(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function compact(value: number, decimals = 2): string {
  return String(Number(value.toFixed(decimals)));
}

function formatEcWithPpm500(value: number): string {
  const displayedEc = Number(value.toFixed(2));
  const ecLabel = formatSensorValue("reservoir_ec_mscm", displayedEc);
  const ppm = displayedEc * PPM_500_PER_EC;
  return `${ecLabel} · ${compact(ppm, 1)} ppm (500 scale)`;
}

function formatSigned(value: number, decimals: number, suffix: string): string {
  const rounded = Number(value.toFixed(decimals));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${compact(rounded, decimals)} ${suffix}`;
}

function formatInterval(milliseconds: number): string {
  const minutes = milliseconds / 60_000;
  if (minutes < 60) return `${compact(minutes, 1)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${compact(hours, 1)} h`;
  return `${compact(hours / 24, 1)} d`;
}

function buildMetricRows(metrics: RootZoneMetricsV1): OperatorRootZoneCycleMetricRow[] {
  const rows: OperatorRootZoneCycleMetricRow[] = [];
  if (finiteMetric(metrics.volumeMl)) {
    rows.push({
      key: "volume_ml",
      label: "Applied volume",
      valueLabel: `${compact(metrics.volumeMl)} mL`,
    });
  }
  if (finiteMetric(metrics.inputPh)) {
    rows.push({
      key: "input_ph",
      label: "Input pH",
      valueLabel: formatSensorValue("reservoir_ph", metrics.inputPh),
    });
  }
  if (finiteMetric(metrics.inputEcMsCm)) {
    rows.push({
      key: "input_ec",
      label: "Input EC",
      valueLabel: formatEcWithPpm500(metrics.inputEcMsCm),
    });
  }
  if (finiteMetric(metrics.outputEcMsCm)) {
    rows.push({
      key: "output_ec",
      label: "Output EC",
      valueLabel: formatEcWithPpm500(metrics.outputEcMsCm),
    });
  }
  if (finiteMetric(metrics.runoffMl)) {
    rows.push({
      key: "runoff_ml",
      label: "Runoff volume",
      valueLabel: `${compact(metrics.runoffMl)} mL`,
    });
  }
  if (finiteMetric(metrics.runoffPh)) {
    rows.push({
      key: "runoff_ph",
      label: "Runoff pH",
      valueLabel: formatSensorValue("reservoir_ph", metrics.runoffPh),
    });
  }
  if (finiteMetric(metrics.runoffEcMsCm)) {
    rows.push({
      key: "runoff_ec",
      label: "Runoff EC",
      valueLabel: formatEcWithPpm500(metrics.runoffEcMsCm),
    });
  }
  if (finiteMetric(metrics.waterTempC)) {
    rows.push({
      key: "water_temp",
      label: "Water temperature",
      valueLabel: formatSensorValue("soil_temp_c", metrics.waterTempC),
    });
  }
  return rows;
}

function buildComparisons(
  cycle: NormalizedCycle,
  previous: NormalizedCycle | null,
): OperatorRootZoneCycleComparisonRow[] {
  const rows: OperatorRootZoneCycleComparisonRow[] = [];
  if (previous) {
    const interval = Date.parse(cycle.occurredAt) - Date.parse(previous.occurredAt);
    if (Number.isFinite(interval) && interval >= 0) {
      rows.push({
        key: "event_interval",
        label: cycle.plantId
          ? "Interval from prior record for this plant reference"
          : "Interval from prior tent-level root-zone record",
        valueLabel: formatInterval(interval),
      });
    }
  }

  const metrics = cycle.metrics;
  if (finiteMetric(metrics.volumeMl) && metrics.volumeMl > 0 && finiteMetric(metrics.runoffMl)) {
    rows.push({
      key: "runoff_share",
      label: "Recorded runoff ÷ applied volume",
      valueLabel: `${compact((metrics.runoffMl / metrics.volumeMl) * 100, 1)}%`,
    });
  }
  if (finiteMetric(metrics.inputPh) && finiteMetric(metrics.runoffPh)) {
    rows.push({
      key: "runoff_ph_delta",
      label: "Runoff − input pH",
      valueLabel: formatSigned(metrics.runoffPh - metrics.inputPh, 2, "pH"),
    });
  }
  if (finiteMetric(metrics.inputEcMsCm) && finiteMetric(metrics.outputEcMsCm)) {
    rows.push({
      key: "output_ec_delta",
      label: "Output − input EC",
      valueLabel: formatSigned(metrics.outputEcMsCm - metrics.inputEcMsCm, 2, "mS/cm"),
    });
  }
  if (finiteMetric(metrics.inputEcMsCm) && finiteMetric(metrics.runoffEcMsCm)) {
    rows.push({
      key: "runoff_ec_delta",
      label: "Runoff − input EC",
      valueLabel: formatSigned(metrics.runoffEcMsCm - metrics.inputEcMsCm, 2, "mS/cm"),
    });
  }
  return rows;
}

function normalizeCycles(
  observations: readonly OperatorRootZoneCycleInput[] | null | undefined,
  now: number,
  futureToleranceMs: number,
): NormalizedCycle[] {
  if (!Array.isArray(observations)) return [];
  const cycles: NormalizedCycle[] = [];

  for (const candidate of observations as readonly unknown[]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const observation = candidate as Partial<OperatorRootZoneCycleInput>;
    if (observation.eventType !== "watering" && observation.eventType !== "feeding") continue;
    if (typeof observation.occurredAt !== "string") continue;
    const timestamp = Date.parse(observation.occurredAt);
    const metrics = normalizeRootZoneMetricsV1(observation.metrics);
    if (!Number.isFinite(timestamp) || !metrics) continue;
    const numericEvidence = [
      metrics.volumeMl,
      metrics.inputPh,
      metrics.inputEcMsCm,
      metrics.outputEcMsCm,
      metrics.runoffMl,
      metrics.runoffPh,
      metrics.runoffEcMsCm,
      metrics.waterTempC,
    ].some(finiteMetric);
    const feedingEvidence = metrics.nutrientLine !== null || metrics.products.length > 0;
    if (!numericEvidence && (observation.eventType !== "feeding" || !feedingEvidence)) continue;
    const occurredAt = new Date(timestamp).toISOString();
    const source = normalizeRootZoneSource(observation.source);
    if (!isUuid(observation.eventId) || !isUuid(observation.tentId)) continue;
    if (observation.plantId !== null && !isUuid(observation.plantId)) continue;
    const eventId = observation.eventId.toLowerCase();
    const tentId = observation.tentId.toLowerCase();
    const plantId = observation.plantId?.toLowerCase() ?? null;
    const targetKey = plantId ? `plant:${plantId}` : `tent:${tentId}`;
    const targetLabel = plantId ? `Plant ref …${plantId.slice(-8)}` : "Tent-level record";
    const futureDated = timestamp > now + futureToleranceMs;
    const manualObservation = buildManualObservation(observation.manualObservation, {
      eventType: observation.eventType,
      source,
      occurredAt,
    });
    const invalidFields = Array.isArray(observation.invalidFields)
      ? [...observation.invalidFields].map(String).sort()
      : [];
    const key = eventId;
    cycles.push({
      key,
      occurredAt,
      eventType: observation.eventType,
      plantId,
      targetKey,
      targetLabel,
      futureDated,
      sourceLabel: rootZoneSourceLabel(source),
      metrics,
      manualObservation,
      hasRejectedMetrics: invalidFields.some((field) => field !== "manualObservation"),
      hasRejectedManualObservation: invalidFields.includes("manualObservation"),
    });
  }

  const sorted = cycles.sort((a, b) => {
    const byTime = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    if (byTime !== 0) return byTime;
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    const aJson = JSON.stringify(a);
    const bJson = JSON.stringify(b);
    return aJson < bJson ? -1 : aJson > bJson ? 1 : 0;
  });
  const seenEventIds = new Set<string>();
  return sorted.filter((cycle) => {
    if (seenEventIds.has(cycle.key)) return false;
    seenEventIds.add(cycle.key);
    return true;
  });
}

function buildProducts(metrics: RootZoneMetricsV1): OperatorRootZoneCycleProductRow[] {
  const unitLabel = (unit: string | null): string | null =>
    unit?.trim().toLowerCase() === "ml_per_l" ? "mL/L" : unit;
  return metrics.products.map((product) => ({
    name: product.name,
    valueLabel:
      product.amount === null
        ? null
        : unitLabel(product.unit)
          ? `${compact(product.amount)} ${unitLabel(product.unit)}`
          : compact(product.amount),
  }));
}

function buildWarnings(cycle: NormalizedCycle): string[] {
  const warnings: string[] = [];
  if (cycle.futureDated) {
    warnings.push(
      "Timestamp is in the future; verify the recorded time before interpreting this record.",
    );
  }
  if (cycle.hasRejectedMetrics) warnings.push("Some supplied measurements were rejected.");
  if (cycle.hasRejectedManualObservation) {
    warnings.push("A grower-recorded manual observation was rejected.");
  }
  if (
    finiteMetric(cycle.metrics.volumeMl) &&
    finiteMetric(cycle.metrics.runoffMl) &&
    cycle.metrics.runoffMl > cycle.metrics.volumeMl
  ) {
    warnings.push(
      "Recorded runoff exceeds applied volume; verify the entry before interpreting it.",
    );
  }
  return warnings;
}

export function buildOperatorRootZoneCycleRows(
  observations: readonly OperatorRootZoneCycleInput[] | null | undefined,
  options: OperatorRootZoneCycleOptions = {},
): OperatorRootZoneCycleRow[] {
  const now = Number.isFinite(options.now) ? (options.now as number) : Date.now();
  const futureToleranceMs = Number.isFinite(options.futureToleranceMs)
    ? Math.max(0, options.futureToleranceMs as number)
    : OPERATOR_ROOT_ZONE_FUTURE_TOLERANCE_MS;
  const normalized = normalizeCycles(observations, now, futureToleranceMs);
  const boundedCap = Number.isFinite(options.cap)
    ? Math.max(0, Math.min(OPERATOR_ROOT_ZONE_CYCLE_CAP, Math.floor(options.cap as number)))
    : OPERATOR_ROOT_ZONE_CYCLE_CAP;

  return normalized.slice(0, boundedCap).map((cycle, index) => {
    const previous =
      !cycle.futureDated && cycle.targetKey
        ? (normalized
            .slice(index + 1)
            .find(
              (candidate) => !candidate.futureDated && candidate.targetKey === cycle.targetKey,
            ) ?? null)
        : null;
    return {
      key: cycle.key,
      occurredAt: cycle.occurredAt,
      eventType: cycle.eventType,
      eventLabel: cycle.eventType === "watering" ? "Watering" : "Feeding",
      targetLabel: cycle.targetLabel,
      sourceLabel: cycle.sourceLabel,
      metrics: buildMetricRows(cycle.metrics),
      comparisons: buildComparisons(cycle, previous),
      nutrientLine: cycle.eventType === "feeding" ? cycle.metrics.nutrientLine : null,
      products: cycle.eventType === "feeding" ? buildProducts(cycle.metrics) : [],
      manualObservation: cycle.manualObservation,
      warnings: buildWarnings(cycle),
    };
  });
}
