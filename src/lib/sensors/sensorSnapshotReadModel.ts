/**
 * sensorSnapshotReadModel — pure, read-only display model that aligns
 * existing Sensor Snapshot surfaces (Tent header) with the truth
 * vocabulary already used by SensorNormalizationPreviewPanel
 * (source / identity / transport / confidence / warnings / preview-only).
 *
 * Hard rules:
 *  - No I/O. No React. No Supabase. No fetch. Deterministic.
 *  - Never marks stale / manual / csv / demo as Live.
 *  - Never classifies invalid or unknown telemetry as healthy.
 *  - Never invents data: missing fields surface as "unknown" labels.
 *  - Never returns raw payload. Consumers must not render raw payloads.
 */
import {
  SOURCE_LABEL,
  isStale as isSnapshotStale,
  type SensorSnapshot,
  type SnapshotSource,
} from "@/lib/sensorSnapshot";
import type { SensorTruthAssessment } from "@/lib/sensorTruthRules";

export type SensorSnapshotReadModelTone =
  | "info"
  | "neutral"
  | "warning"
  | "danger"
  | "muted";

export interface SensorSnapshotReadModelBadge {
  label: string;
  tone: SensorSnapshotReadModelTone;
}

export interface SensorSnapshotReadModel {
  hasSnapshot: boolean;
  isMissing: boolean;
  isStale: boolean;
  isInvalid: boolean;
  source: SnapshotSource | "missing";
  sourceLabel: string;
  sourceIdentityLabel: string;
  transportLabel: string;
  confidenceLabel: string;
  capturedAt: string | null;
  capturedAtLabel: string;
  warnings: string[];
  badges: SensorSnapshotReadModelBadge[];
  previewOnlyNote: string;
  emptyState: string | null;
  rawPayloadFieldCount: 0;
  rawPayloadNote: string;
}

export const SENSOR_SNAPSHOT_PREVIEW_ONLY_NOTE =
  "Read-only — sensor snapshot. Bad or unknown telemetry is not treated as healthy." as const;

export const SENSOR_SNAPSHOT_MISSING_EMPTY_STATE =
  "No sensor snapshot is available yet." as const;

export const SENSOR_SNAPSHOT_STALE_NOTICE =
  "Latest sensor snapshot may be stale. Review timestamp and source before making decisions." as const;

export const SENSOR_SNAPSHOT_INVALID_NOTICE =
  "Sensor snapshot could not be trusted. Review source, timestamp, and units before using it." as const;

export const SENSOR_SNAPSHOT_RAW_PAYLOAD_NOTE =
  "Raw payload is not shown here." as const;

const SOURCE_TONE: Record<SnapshotSource, SensorSnapshotReadModelTone> = {
  live: "info",
  manual: "neutral",
  sim: "muted",
  diary: "muted",
  csv: "neutral",
  unavailable: "muted",
};

export interface BuildSensorSnapshotReadModelInput {
  snapshot: SensorSnapshot | null | undefined;
  truth?: SensorTruthAssessment | null;
  now?: number;
}

function identityLabel(snapshot: SensorSnapshot): string {
  const deviceId = snapshot.device_id;
  if (typeof deviceId === "string" && deviceId.trim() !== "") {
    return `Identity: ${deviceId.trim()}`;
  }
  const csv = snapshot.csvVendor;
  if (csv !== null && csv !== undefined && typeof csv === "object" && "label" in csv && typeof (csv as { label?: unknown }).label === "string") {
    return `Identity: ${(csv as { label: string }).label}`;
  }
  return "Identity: unknown";
}

export function buildSensorSnapshotReadModel(
  input: BuildSensorSnapshotReadModelInput,
): SensorSnapshotReadModel {
  const { snapshot, truth, now = Date.now() } = input;

  if (!snapshot || snapshot.source === "unavailable") {
    return {
      hasSnapshot: false,
      isMissing: true,
      isStale: false,
      isInvalid: false,
      source: "missing",
      sourceLabel: "Source: missing",
      sourceIdentityLabel: "Identity: unknown",
      transportLabel: "Transport: unknown",
      confidenceLabel: "Confidence: unknown",
      capturedAt: null,
      capturedAtLabel: "Captured: unknown",
      warnings: [],
      badges: [
        { label: "Source: missing", tone: "muted" },
        { label: "Identity: unknown", tone: "muted" },
        { label: "Transport: unknown", tone: "muted" },
        { label: "Confidence: unknown", tone: "muted" },
      ],
      previewOnlyNote: SENSOR_SNAPSHOT_PREVIEW_ONLY_NOTE,
      emptyState: SENSOR_SNAPSHOT_MISSING_EMPTY_STATE,
      rawPayloadFieldCount: 0,
      rawPayloadNote: SENSOR_SNAPSHOT_RAW_PAYLOAD_NOTE,
    };
  }

  const stale = truth?.stale ?? isSnapshotStale(snapshot.ts, now);
  const invalid = truth?.hasInvalid === true;
  const warnings = truth?.reasonChips ? [...truth.reasonChips] : [];

  const sourceLabel = `Source: ${SOURCE_LABEL[snapshot.source]}`;
  const identity = identityLabel(snapshot);
  const transportLabel = "Transport: unknown";
  const confidenceLabel = "Confidence: unknown";

  const badges: SensorSnapshotReadModelBadge[] = [
    { label: sourceLabel, tone: SOURCE_TONE[snapshot.source] },
    { label: identity, tone: "muted" },
    { label: transportLabel, tone: "muted" },
    { label: confidenceLabel, tone: "muted" },
  ];
  if (stale) badges.push({ label: "Stale", tone: "warning" });
  if (invalid) badges.push({ label: "Invalid", tone: "danger" });

  let emptyState: string | null = null;
  if (invalid) emptyState = SENSOR_SNAPSHOT_INVALID_NOTICE;
  else if (stale) emptyState = SENSOR_SNAPSHOT_STALE_NOTICE;

  return {
    hasSnapshot: true,
    isMissing: false,
    isStale: stale,
    isInvalid: invalid,
    source: snapshot.source,
    sourceLabel,
    sourceIdentityLabel: identity,
    transportLabel,
    confidenceLabel,
    capturedAt: snapshot.ts,
    capturedAtLabel: snapshot.ts ? `Captured: ${snapshot.ts}` : "Captured: unknown",
    warnings,
    badges,
    previewOnlyNote: SENSOR_SNAPSHOT_PREVIEW_ONLY_NOTE,
    emptyState,
    rawPayloadFieldCount: 0,
    rawPayloadNote: SENSOR_SNAPSHOT_RAW_PAYLOAD_NOTE,
  };
}
