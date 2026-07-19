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
import { formatSensorValue } from "@/lib/sensorFormat";

export type OperatorWateringContextStatus = "loading" | "unavailable" | "insufficient" | "context";

type OperatorWateringCollectionStatus = "loading" | "unavailable" | "ready";

export interface OperatorWateringReadState {
  rootZone: {
    status: OperatorWateringCollectionStatus;
    observations?: readonly RootZoneObservationV1[] | null;
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

export interface OperatorConfirmedWateringRow {
  occurredAt: string;
  sourceLabel: string;
  metrics: readonly OperatorWateringMetricRow[];
  hasRejectedMetrics: boolean;
}

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
  lastConfirmedWatering: OperatorConfirmedWateringRow | null;
  typedWateringCount: number;
  typedFeedingCount: number;
  diaryObservationCount: number;
  diaryObservations: readonly OperatorWateringDiaryObservationRow[];
  sensorRows: readonly OperatorWateringSensorContextRow[];
  missingContext: readonly ("typed_watering_history" | "soil_moisture_snapshot")[];
  decisionReminder: "Review the plant, pot weight or medium, drainage, and recent watering before deciding.";
  snapshotCaveat: "One sensor snapshot is not a dryback trend.";
  airContextCaveat: "Air readings alone do not determine watering.";
  growerControlNote: "Verdant presents read-only evidence here; the grower makes the decision.";
}

const DIARY_SNIPPET_CAP = 3;
const DIARY_SNIPPET_LENGTH = 180;

const DECISION_REMINDER =
  "Review the plant, pot weight or medium, drainage, and recent watering before deciding." as const;
const SNAPSHOT_CAVEAT = "One sensor snapshot is not a dryback trend." as const;
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

function normalizeRootZoneObservations(
  observations: readonly RootZoneObservationV1[] | null | undefined,
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
    });
  }

  return normalized.sort((a, b) => {
    const byTime = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    if (byTime !== 0) return byTime;
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    return aKey.localeCompare(bKey);
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
      return "Loading owner-scoped watering evidence.";
    case "unavailable":
      return "Watering evidence is unavailable right now.";
    case "context":
      return "Owner-scoped watering history and sensor context are available for grower review.";
    default:
      return "There is not enough owner-scoped evidence to assess watering context.";
  }
}

export function buildOperatorWateringContextViewModel(
  input: OperatorWateringReadState | null | undefined,
): OperatorWateringContextViewModel {
  const rootZoneObservations =
    input?.rootZone?.status === "ready"
      ? normalizeRootZoneObservations(input.rootZone.observations)
      : [];
  const wateringObservations = rootZoneObservations.filter(
    (observation) => observation.eventType === "watering",
  );
  const feedingCount = rootZoneObservations.filter(
    (observation) => observation.eventType === "feeding",
  ).length;
  const lastWatering = wateringObservations[0] ?? null;
  const lastConfirmedWatering: OperatorConfirmedWateringRow | null = lastWatering
    ? {
        occurredAt: lastWatering.occurredAt,
        sourceLabel: lastWatering.sourceLabel,
        metrics: buildWateringMetricRows(lastWatering.metrics),
        hasRejectedMetrics: lastWatering.hasRejectedMetrics,
      }
    : null;

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
  const missingContext: ("typed_watering_history" | "soil_moisture_snapshot")[] = [];
  if (!lastConfirmedWatering) missingContext.push("typed_watering_history");
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
    lastConfirmedWatering,
    typedWateringCount: wateringObservations.length,
    typedFeedingCount: feedingCount,
    diaryObservationCount: diary.count,
    diaryObservations: diary.rows,
    sensorRows,
    missingContext,
    decisionReminder: DECISION_REMINDER,
    snapshotCaveat: SNAPSHOT_CAVEAT,
    airContextCaveat: AIR_CONTEXT_CAVEAT,
    growerControlNote: GROWER_CONTROL_NOTE,
  };
}
