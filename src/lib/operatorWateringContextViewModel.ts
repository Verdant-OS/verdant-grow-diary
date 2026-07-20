/**
 * Pure, read-only watering-context presenter rules.
 *
 * This model combines already owner-scoped history and sensor projections. It
 * never infers irrigation readiness, cadence, dose, targets, or actions. Typed
 * root-zone events are the only source of confirmed watering history; free-text
 * diary notes remain observation context even when their wording mentions water.
 */
import {
  buildOperatorDiaryEntryRows,
  buildOperatorSensorReadingRows,
  type OperatorDiaryEntryInput,
  type OperatorSensorReadingInput,
  type OperatorSensorReadingRow,
} from "@/lib/operatorAccountReadModelsViewModel";
import {
  normalizeRootZoneMetricsV1,
  normalizeRootZoneSource,
  rootZoneSourceLabel,
  type RootZoneMetricsV1,
  type RootZoneObservationV1,
} from "@/lib/rootZoneObservationRules";
import {
  buildOperatorRootZoneCycleRows,
  OPERATOR_ROOT_ZONE_CYCLE_ARITHMETIC_CAVEAT,
  OPERATOR_ROOT_ZONE_FUTURE_TOLERANCE_MS,
  OPERATOR_ROOT_ZONE_CYCLE_NUTRIENT_CAVEAT,
  OPERATOR_ROOT_ZONE_CYCLE_SCOPE_CAVEAT,
  type OperatorRootZoneCycleInput,
  type OperatorRootZoneCycleRow,
} from "@/lib/operatorRootZoneCycleViewModel";
import { formatSensorValue } from "@/lib/sensorFormat";

export type OperatorWateringContextStatus = "loading" | "unavailable" | "insufficient" | "context";

type OperatorWateringCollectionStatus = "loading" | "unavailable" | "ready";

export interface OperatorWateringReadState {
  rootZone: {
    status: OperatorWateringCollectionStatus;
    observations?: readonly OperatorRootZoneCycleInput[] | null;
  };
  diary: {
    status: OperatorWateringCollectionStatus;
    entries?: readonly OperatorDiaryEntryInput[] | null;
  };
  sensor: {
    status: OperatorWateringCollectionStatus | "no_tent";
    readings?: Readonly<Record<string, OperatorSensorReadingInput>> | null;
  };
}

export interface OperatorWateringContextOptions {
  now?: number;
  futureToleranceMs?: number;
}

export interface OperatorWateringMetricRow {
  key:
    | "volume_ml"
    | "input_ph"
    | "input_ec"
    | "runoff_ml"
    | "runoff_ph"
    | "runoff_ec"
    | "water_temp";
  label: string;
  valueLabel: string;
}

export interface OperatorConfirmedRootZoneApplicationRow {
  occurredAt: string;
  eventType: "watering" | "feeding";
  eventLabel: "Plain water" | "Feed";
  sourceLabel: string;
  metrics: readonly OperatorWateringMetricRow[];
  hasRejectedMetrics: boolean;
}

export type OperatorConfirmedWateringRow = OperatorConfirmedRootZoneApplicationRow;

export interface OperatorWateringDiaryObservationRow {
  id: string;
  stageLabel: string;
  note: string;
  entryAt: string | null;
}

export type OperatorWateringSensorContextKind = "root_zone" | "air";

export interface OperatorWateringSensorContextRow extends OperatorSensorReadingRow {
  contextKind: OperatorWateringSensorContextKind;
  contextLabel: "Root-zone context" | "Air context only";
}

export interface OperatorWateringContextViewModel {
  status: OperatorWateringContextStatus;
  summary: string;
  lastRootZoneApplication: OperatorConfirmedRootZoneApplicationRow | null;
  lastConfirmedWatering: OperatorConfirmedWateringRow | null;
  lastConfirmedFeeding: OperatorConfirmedRootZoneApplicationRow | null;
  typedWateringCount: number;
  typedFeedingCount: number;
  recentRootZoneCycles: readonly OperatorRootZoneCycleRow[];
  diaryObservationCount: number;
  diaryObservations: readonly OperatorWateringDiaryObservationRow[];
  sensorRows: readonly OperatorWateringSensorContextRow[];
  missingContext: readonly ("typed_root_zone_history" | "soil_moisture_snapshot")[];
  decisionReminder: "Review the plant, pot weight or medium, drainage, and recent water or feed applications before deciding.";
  snapshotCaveat: "One sensor snapshot is not a dryback trend; elapsed review starts after the latest root-zone application.";
  airContextCaveat: "Air readings alone do not determine watering.";
  cycleArithmeticCaveat: typeof OPERATOR_ROOT_ZONE_CYCLE_ARITHMETIC_CAVEAT;
  nutrientEvidenceCaveat: typeof OPERATOR_ROOT_ZONE_CYCLE_NUTRIENT_CAVEAT;
  cycleScopeCaveat: typeof OPERATOR_ROOT_ZONE_CYCLE_SCOPE_CAVEAT;
  growerControlNote: "Verdant presents read-only evidence here; the grower makes the decision.";
}

const DIARY_SNIPPET_CAP = 3;
const DIARY_SNIPPET_LENGTH = 180;

const DECISION_REMINDER =
  "Review the plant, pot weight or medium, drainage, and recent water or feed applications before deciding." as const;
const SNAPSHOT_CAVEAT =
  "One sensor snapshot is not a dryback trend; elapsed review starts after the latest root-zone application." as const;
const AIR_CONTEXT_CAVEAT = "Air readings alone do not determine watering." as const;
const GROWER_CONTROL_NOTE =
  "Verdant presents read-only evidence here; the grower makes the decision." as const;

const SECRET_LIKE_TEXT =
  /service[_-]?role|authorization|bearer\s+|api[_-]?key|secret|token|jwt|eyJ|sk_(?:live|test)_|sb_/i;

const SENSOR_CONTEXT_ORDER = [
  "soil_moisture_pct",
  "soil_temp_c",
  "ec",
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
] as const;

const ROOT_ZONE_SENSOR_METRICS = new Set(["soil_moisture_pct", "soil_temp_c", "ec"]);
const WATERING_SENSOR_METRICS = new Set<string>(SENSOR_CONTEXT_ORDER);

interface NormalizedRootZoneObservation {
  occurredAt: string;
  eventType: "watering" | "feeding";
  sourceLabel: string;
  metrics: RootZoneMetricsV1;
  hasRejectedMetrics: boolean;
  futureDated: boolean;
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function cleanDiarySnippet(value: string): string {
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
  const cleaned = withoutControls.replace(/\s+/g, " ").trim();
  if (!cleaned) return "No note recorded.";
  if (SECRET_LIKE_TEXT.test(cleaned)) return "Observation text hidden.";
  return cleaned.length > DIARY_SNIPPET_LENGTH
    ? `${cleaned.slice(0, DIARY_SNIPPET_LENGTH - 1)}…`
    : cleaned;
}

function finiteMetric(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function plainMeasurement(value: number, unit: string): string {
  const rounded = Number(value.toFixed(2));
  return `${rounded} ${unit}`;
}

function buildWateringMetricRows(metrics: RootZoneMetricsV1): OperatorWateringMetricRow[] {
  const rows: OperatorWateringMetricRow[] = [];
  if (finiteMetric(metrics.volumeMl)) {
    rows.push({
      key: "volume_ml",
      label: "Volume",
      valueLabel: plainMeasurement(metrics.volumeMl, "mL"),
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
      valueLabel: formatSensorValue("reservoir_ec_mscm", metrics.inputEcMsCm),
    });
  }
  if (finiteMetric(metrics.runoffMl)) {
    rows.push({
      key: "runoff_ml",
      label: "Runoff volume",
      valueLabel: plainMeasurement(metrics.runoffMl, "mL"),
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
      valueLabel: formatSensorValue("reservoir_ec_mscm", metrics.runoffEcMsCm),
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

function buildConfirmedApplicationRow(
  observation: NormalizedRootZoneObservation | null,
): OperatorConfirmedRootZoneApplicationRow | null {
  if (!observation) return null;
  return {
    occurredAt: observation.occurredAt,
    eventType: observation.eventType,
    eventLabel: observation.eventType === "feeding" ? "Feed" : "Plain water",
    sourceLabel: observation.sourceLabel,
    metrics: buildWateringMetricRows(observation.metrics),
    hasRejectedMetrics: observation.hasRejectedMetrics,
  };
}

function normalizeRootZoneObservations(
  observations: readonly OperatorRootZoneCycleInput[] | null | undefined,
  now: number,
  futureToleranceMs: number,
): NormalizedRootZoneObservation[] {
  if (!Array.isArray(observations)) return [];

  const normalized: NormalizedRootZoneObservation[] = [];
  for (const candidate of observations as readonly unknown[]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const row = candidate as Partial<RootZoneObservationV1>;
    if (row.eventType !== "watering" && row.eventType !== "feeding") continue;
    const occurredAt = validTimestamp(row.occurredAt);
    const metrics = normalizeRootZoneMetricsV1(row.metrics);
    if (!occurredAt || !metrics) continue;
    const source = normalizeRootZoneSource(row.source);
    normalized.push({
      occurredAt,
      eventType: row.eventType,
      sourceLabel: rootZoneSourceLabel(source),
      metrics,
      hasRejectedMetrics: Array.isArray(row.invalidFields) && row.invalidFields.length > 0,
      futureDated: Date.parse(occurredAt) > now + futureToleranceMs,
    });
  }

  return normalized.sort((a, b) => {
    const byTime = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    if (byTime !== 0) return byTime;
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
}

function buildDiaryObservations(entries: readonly OperatorDiaryEntryInput[] | null | undefined): {
  count: number;
  rows: OperatorWateringDiaryObservationRow[];
} {
  const rows = buildOperatorDiaryEntryRows(entries);
  return {
    count: rows.length,
    rows: rows.slice(0, DIARY_SNIPPET_CAP).map((row) => ({
      id: row.id,
      stageLabel: row.stageLabel,
      note: cleanDiarySnippet(row.note),
      entryAt: row.entryAt,
    })),
  };
}

function sensorContextRank(metric: string): number {
  const rank = SENSOR_CONTEXT_ORDER.indexOf(metric as (typeof SENSOR_CONTEXT_ORDER)[number]);
  return rank === -1 ? SENSOR_CONTEXT_ORDER.length : rank;
}

function buildSensorContextRows(
  readings: Readonly<Record<string, OperatorSensorReadingInput>> | null | undefined,
): OperatorWateringSensorContextRow[] {
  return buildOperatorSensorReadingRows(readings)
    .filter((row) => WATERING_SENSOR_METRICS.has(row.metric))
    .map((row) => {
      const contextKind: OperatorWateringSensorContextKind = ROOT_ZONE_SENSOR_METRICS.has(
        row.metric,
      )
        ? "root_zone"
        : "air";
      return {
        ...row,
        contextKind,
        contextLabel: contextKind === "root_zone" ? "Root-zone context" : "Air context only",
      } satisfies OperatorWateringSensorContextRow;
    })
    .sort((a, b) => {
      const byMetric = sensorContextRank(a.metric) - sensorContextRank(b.metric);
      return byMetric !== 0 ? byMetric : a.id.localeCompare(b.id);
    });
}

function sourceStatus(input: OperatorWateringReadState | null | undefined): {
  loading: boolean;
  anyReady: boolean;
} {
  const rootZone = input?.rootZone?.status;
  const diary = input?.diary?.status;
  const sensor = input?.sensor?.status;
  return {
    loading: rootZone === "loading" || diary === "loading" || sensor === "loading",
    anyReady: rootZone === "ready" || diary === "ready" || sensor === "ready",
  };
}

function summaryFor(status: OperatorWateringContextStatus): string {
  switch (status) {
    case "loading":
      return "Loading owner-scoped root-zone evidence.";
    case "unavailable":
      return "Root-zone evidence is unavailable right now.";
    case "context":
      return "Owner-scoped water and feed history plus sensor context are available for grower review.";
    default:
      return "There is not enough owner-scoped evidence to assess root-zone context.";
  }
}

export function buildOperatorWateringContextViewModel(
  input: OperatorWateringReadState | null | undefined,
  options: OperatorWateringContextOptions = {},
): OperatorWateringContextViewModel {
  const now = Number.isFinite(options.now) ? (options.now as number) : Date.now();
  const futureToleranceMs = Number.isFinite(options.futureToleranceMs)
    ? Math.max(0, options.futureToleranceMs as number)
    : OPERATOR_ROOT_ZONE_FUTURE_TOLERANCE_MS;
  const rootZoneObservations =
    input?.rootZone?.status === "ready"
      ? normalizeRootZoneObservations(input.rootZone.observations, now, futureToleranceMs)
      : [];
  const wateringObservations = rootZoneObservations.filter(
    (observation) => observation.eventType === "watering",
  );
  const feedingObservations = rootZoneObservations.filter(
    (observation) => observation.eventType === "feeding",
  );
  const lastRootZoneObservation =
    rootZoneObservations.find((observation) => !observation.futureDated) ?? null;
  const lastWatering = wateringObservations.find((observation) => !observation.futureDated) ?? null;
  const lastFeeding = feedingObservations.find((observation) => !observation.futureDated) ?? null;
  const lastRootZoneApplication = buildConfirmedApplicationRow(lastRootZoneObservation);
  const lastConfirmedWatering = buildConfirmedApplicationRow(lastWatering);
  const lastConfirmedFeeding = buildConfirmedApplicationRow(lastFeeding);
  const recentRootZoneCycles =
    input?.rootZone?.status === "ready"
      ? buildOperatorRootZoneCycleRows(input.rootZone.observations, {
          now,
          futureToleranceMs,
        })
      : [];

  const diary =
    input?.diary?.status === "ready"
      ? buildDiaryObservations(input.diary.entries)
      : { count: 0, rows: [] };
  const sensorRows =
    input?.sensor?.status === "ready" ? buildSensorContextRows(input.sensor.readings) : [];
  const usableSoilMoisture = sensorRows.some(
    (row) =>
      row.metric === "soil_moisture_pct" &&
      row.freshness === "fresh" &&
      row.trustTone !== "invalid" &&
      row.capturedAt !== null,
  );
  const missingContext: ("typed_root_zone_history" | "soil_moisture_snapshot")[] = [];
  if (!lastRootZoneApplication) missingContext.push("typed_root_zone_history");
  if (!usableSoilMoisture) missingContext.push("soil_moisture_snapshot");

  const sources = sourceStatus(input);
  const status: OperatorWateringContextStatus = sources.loading
    ? "loading"
    : !sources.anyReady
      ? "unavailable"
      : missingContext.length > 0
        ? "insufficient"
        : "context";

  return {
    status,
    summary: summaryFor(status),
    lastRootZoneApplication,
    lastConfirmedWatering,
    lastConfirmedFeeding,
    typedWateringCount: wateringObservations.length,
    typedFeedingCount: feedingObservations.length,
    recentRootZoneCycles,
    diaryObservationCount: diary.count,
    diaryObservations: diary.rows,
    sensorRows,
    missingContext,
    decisionReminder: DECISION_REMINDER,
    snapshotCaveat: SNAPSHOT_CAVEAT,
    airContextCaveat: AIR_CONTEXT_CAVEAT,
    cycleArithmeticCaveat: OPERATOR_ROOT_ZONE_CYCLE_ARITHMETIC_CAVEAT,
    nutrientEvidenceCaveat: OPERATOR_ROOT_ZONE_CYCLE_NUTRIENT_CAVEAT,
    cycleScopeCaveat: OPERATOR_ROOT_ZONE_CYCLE_SCOPE_CAVEAT,
    growerControlNote: GROWER_CONTROL_NOTE,
  };
}
