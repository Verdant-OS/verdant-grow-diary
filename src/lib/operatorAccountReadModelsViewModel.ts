/**
 * Pure presenter rules for the owner-scoped Operator Mode account panel.
 *
 * The input mirrors the presenter-safe fields exposed by Verdant's
 * `list_recent_diary_entries` and `get_latest_sensor_snapshot` MCP tools.
 * This module performs no I/O and never accepts raw sensor payloads, access
 * tokens, or a user id.
 */
import { formatSensorValue } from "@/lib/sensorFormat";
import type { OperatorWateringContextViewModel } from "@/lib/operatorWateringContextViewModel";

export interface OperatorDiaryEntryInput {
  id: string;
  stage: string | null;
  note: string | null;
  entry_at: string;
  created_at: string;
}

export interface OperatorSensorReadingInput {
  id: string;
  metric: string;
  value: number;
  quality: string;
  source: string;
  ts: string;
  captured_at: string | null;
  freshness: "fresh" | "stale" | "invalid";
  current_live: boolean;
}

export interface OperatorDiaryEntryRow {
  id: string;
  stageLabel: string;
  note: string;
  entryAt: string | null;
}

export type OperatorSensorTrustTone = "current" | "context" | "caution" | "invalid";

export interface OperatorSensorReadingRow {
  id: string;
  metric: string;
  metricLabel: string;
  valueLabel: string;
  sourceLabel: string;
  qualityLabel: string;
  freshness: "fresh" | "stale" | "invalid";
  freshnessLabel: string;
  capturedAt: string | null;
  currentLive: boolean;
  trustTone: OperatorSensorTrustTone;
}

export type OperatorPanelCollectionState<T> =
  | { status: "idle" | "loading"; items: readonly T[] }
  | { status: "empty"; items: readonly T[] }
  | { status: "ok"; items: readonly T[] }
  | { status: "unavailable"; items: readonly T[] };

export type OperatorPanelSensorState =
  | OperatorPanelCollectionState<OperatorSensorReadingRow>
  | { status: "no_tent"; items: readonly OperatorSensorReadingRow[] };

export type OperatorAccountReadModelsPanelModel =
  | { status: "loading" }
  | { status: "no_grow" }
  | { status: "unavailable" }
  | {
      status: "ready";
      growName: string;
      tentName: string | null;
      diary: OperatorPanelCollectionState<OperatorDiaryEntryRow>;
      sensor: OperatorPanelSensorState;
      watering: OperatorWateringContextViewModel;
    };

const METRIC_ORDER = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_temp_c",
  "ph",
  "ec",
  "ppfd",
] as const;

const METRIC_LABELS: Record<string, string> = {
  temperature_c: "Temperature",
  humidity_pct: "Humidity",
  vpd_kpa: "VPD",
  co2_ppm: "CO₂",
  soil_moisture_pct: "Soil moisture",
  soil_temp_c: "Soil temperature",
  ph: "pH",
  ec: "EC",
  ppfd: "PPFD",
};

const SENSOR_FORMAT_FIELDS: Record<string, string> = {
  temperature_c: "air_temp_c",
  humidity_pct: "humidity_pct",
  vpd_kpa: "vpd_kpa",
  co2_ppm: "co2_ppm",
  soil_moisture_pct: "soil_moisture_pct",
  soil_temp_c: "soil_temp_c",
  ph: "reservoir_ph",
  ec: "reservoir_ec_mscm",
  ppfd: "ppfd",
};

const BLOCKED_LABEL_PATTERN =
  /service[_-]?role|authorization|bearer\s+|api[_-]?key|secret|token|jwt|eyJ/i;

function normalizedToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function safeShortLabel(value: unknown, fallback = "Unknown"): string {
  if (typeof value !== "string") return fallback;
  const trimmed = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  })
    .join("")
    .trim();
  if (!trimmed || BLOCKED_LABEL_PATTERN.test(trimmed)) return fallback;
  return trimmed.slice(0, 64);
}

function titleLabel(value: unknown, fallback = "Unknown"): string {
  const safe = safeShortLabel(value, fallback);
  return safe
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function timestampMs(value: unknown): number {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function diaryNote(value: unknown): string {
  if (typeof value !== "string") return "No note recorded.";
  const trimmed = value.trim();
  if (!trimmed) return "No note recorded.";
  return trimmed.length > 400 ? `${trimmed.slice(0, 399)}…` : trimmed;
}

function formatMetricValue(metric: string, value: number): string {
  const field = SENSOR_FORMAT_FIELDS[metric] ?? metric;
  return formatSensorValue(field, value);
}

function metricRank(metric: string): number {
  const index = METRIC_ORDER.indexOf(metric as (typeof METRIC_ORDER)[number]);
  return index === -1 ? METRIC_ORDER.length : index;
}

function strictCurrentLive(reading: OperatorSensorReadingInput): boolean {
  return (
    reading.current_live === true &&
    normalizedToken(reading.source) === "live" &&
    normalizedToken(reading.quality) === "ok" &&
    reading.freshness === "fresh" &&
    validTimestamp(reading.captured_at ?? reading.ts) !== null
  );
}

function trustTone(
  reading: OperatorSensorReadingInput,
  currentLive: boolean,
): OperatorSensorTrustTone {
  const source = normalizedToken(reading.source);
  const quality = normalizedToken(reading.quality);
  if (source === "invalid" || quality === "invalid" || reading.freshness === "invalid") {
    return "invalid";
  }
  if (
    source === "stale" ||
    quality === "stale" ||
    quality === "degraded" ||
    reading.freshness === "stale"
  ) {
    return "caution";
  }
  return currentLive ? "current" : "context";
}

export function buildOperatorDiaryEntryRows(
  entries: readonly OperatorDiaryEntryInput[] | null | undefined,
): OperatorDiaryEntryRow[] {
  return [...(entries ?? [])]
    .filter((entry) => entry && typeof entry.id === "string" && entry.id.length > 0)
    .sort((a, b) => {
      const byEntry = timestampMs(b.entry_at) - timestampMs(a.entry_at);
      if (byEntry !== 0) return byEntry;
      const byCreated = timestampMs(b.created_at) - timestampMs(a.created_at);
      if (byCreated !== 0) return byCreated;
      return b.id.localeCompare(a.id);
    })
    .map((entry) => ({
      id: entry.id,
      stageLabel: titleLabel(entry.stage, "Stage not recorded"),
      note: diaryNote(entry.note),
      entryAt: validTimestamp(entry.entry_at),
    }));
}

export function buildOperatorSensorReadingRows(
  readings: Readonly<Record<string, OperatorSensorReadingInput>> | null | undefined,
): OperatorSensorReadingRow[] {
  return Object.values(readings ?? {})
    .filter(
      (reading) =>
        reading &&
        typeof reading.id === "string" &&
        reading.id.length > 0 &&
        typeof reading.metric === "string" &&
        reading.metric.length > 0 &&
        Number.isFinite(reading.value),
    )
    .sort((a, b) => {
      const byRank = metricRank(a.metric) - metricRank(b.metric);
      if (byRank !== 0) return byRank;
      const byMetric = a.metric.localeCompare(b.metric);
      return byMetric !== 0 ? byMetric : a.id.localeCompare(b.id);
    })
    .map((reading) => {
      const currentLive = strictCurrentLive(reading);
      return {
        id: reading.id,
        metric: reading.metric,
        metricLabel: METRIC_LABELS[reading.metric] ?? safeShortLabel(reading.metric),
        valueLabel: formatMetricValue(reading.metric, reading.value),
        sourceLabel: titleLabel(reading.source),
        qualityLabel: titleLabel(reading.quality),
        freshness: reading.freshness,
        freshnessLabel: titleLabel(reading.freshness),
        capturedAt: validTimestamp(reading.captured_at ?? reading.ts),
        currentLive,
        trustTone: trustTone(reading, currentLive),
      } satisfies OperatorSensorReadingRow;
    });
}
