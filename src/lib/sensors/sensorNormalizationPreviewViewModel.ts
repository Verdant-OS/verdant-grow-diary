/**
 * sensorNormalizationPreviewViewModel — pure, read-only view model that
 * runs an external payload through the canonical sensor normalization
 * layer and shapes the result for display.
 *
 * Hard rules:
 *  - No I/O. No React. No Supabase. No fetch. Deterministic.
 *  - Writes are intentionally NOT supported. The contract advertises
 *    `writesEnabled: false` so any consumer surface can render
 *    `data-writes-enabled="false"`.
 *  - Raw payload is preserved on the underlying normalized reading for
 *    future ingest/debug context, but this view model intentionally
 *    omits raw payload values from display fields. Consumers must not
 *    render full raw payloads.
 */
import {
  normalizeSensorReading,
  type NormalizedSensorReading,
  type NormalizeSensorReadingOptions,
  type SensorSourceIdentity,
  type SensorTransport,
  type SensorTruthSource,
} from "./normalizeSensorReading";
import {
  normalizedReadingToLongFormRows,
  type NormalizedSensorLongFormRow,
} from "./sensorReadingLongForm";
import { isUuid } from "@/lib/isUuid";

export interface SensorNormalizationPreviewInput {
  payload: unknown;
  options: NormalizeSensorReadingOptions;
}

export interface SensorNormalizationPreviewMetricRow {
  metric: string;
  value: number;
}

export interface SensorNormalizationPreviewLongFormRow {
  metric: string;
  value: number;
  source: SensorTruthSource;
  source_identity: SensorSourceIdentity;
  transport: SensorTransport;
  confidence: number;
  captured_at: string;
}

export type SensorNormalizationPreviewBadgeTone =
  | "info"
  | "neutral"
  | "warning"
  | "danger"
  | "muted";

export interface SensorNormalizationPreviewBadge {
  label: string;
  tone: SensorNormalizationPreviewBadgeTone;
}

export interface SensorNormalizationPreviewWarning {
  code: string;
  label: string;
}

export type SensorNormalizationPreviewTentStatus =
  | "linked_verified"
  | "missing"
  | "invalid";

export type SensorNormalizationPreviewPlantStatus =
  | "linked"
  | "missing"
  | "invalid"
  | "not_applicable";

export interface SensorNormalizationPreviewViewModel {
  writesEnabled: false;
  disclaimer: string;
  emptyState: string | null;
  source: SensorTruthSource;
  sourceIdentity: SensorSourceIdentity;
  transport: SensorTransport;
  confidence: number;
  isStale: boolean;
  /** Back-compat coarse status (present/missing). */
  tentIdStatus: "present" | "missing";
  /** Detailed status incl. invalid UUID. */
  tentStatus: SensorNormalizationPreviewTentStatus;
  tentStatusLabel: string;
  plantIdStatus: "present" | "missing" | "not_applicable";
  plantStatus: SensorNormalizationPreviewPlantStatus;
  plantStatusLabel: string;
  capturedAtDisplay: string;
  capturedAtPresent: boolean;
  badges: SensorNormalizationPreviewBadge[];
  warnings: SensorNormalizationPreviewWarning[];
  metricRows: SensorNormalizationPreviewMetricRow[];
  longFormRows: SensorNormalizationPreviewLongFormRow[];
  longFormRowCount: number;
  rawPayloadFieldCount: number;
  rawPayloadNote: string;
  /** Underlying normalized reading; raw_payload preserved, but UI must
   *  not render it. Exposed only so consumers can audit it in tests. */
  normalized: NormalizedSensorReading;
}

export const SENSOR_NORMALIZATION_PREVIEW_DISCLAIMER =
  "Preview only — no sensor readings will be saved." as const;

export const SENSOR_NORMALIZATION_PREVIEW_EMPTY_STATE =
  "No write-ready metric rows were generated from this preview." as const;

export const SENSOR_NORMALIZATION_PREVIEW_INVALID_NOTICE =
  "Invalid preview — no long-form rows will be generated." as const;

export const SENSOR_NORMALIZATION_PREVIEW_TENT_MISSING_EMPTY_STATE =
  "No write-ready metric rows were generated because a valid tent context is missing." as const;

export const SENSOR_NORMALIZATION_PREVIEW_RAW_NOTE =
  "Raw payload preserved for future ingest/debug context. Full raw payload is not shown in preview mode." as const;

const WARNING_LABELS: Record<string, string> = {
  missing_tent_id: "Missing tent ID",
  missing_captured_at: "Missing captured_at",
  stale_reading: "Reading is stale",
  no_usable_metrics: "No usable metrics found",
  unknown_input_shape: "Unknown input shape",
  humidity_stuck_value: "Humidity stuck at 0% or 100%",
  humidity_out_of_range: "Humidity out of range",
  soil_moisture_stuck_value: "Soil moisture stuck at 0% or 100%",
  soil_moisture_out_of_range: "Soil moisture out of range",
  soil_ec_likely_us_cm: "EC value looks like µS/cm shown as mS/cm",
  reservoir_ec_likely_us_cm: "Reservoir EC value looks like µS/cm shown as mS/cm",
  temperature_c_likely_fahrenheit: "Celsius value looks like Fahrenheit",
  temperature_f_likely_celsius: "Fahrenheit value looks like Celsius",
  ph_out_of_range: "pH out of range",
  ph_out_of_realistic_range: "pH outside realistic range",
};

const SOURCE_TONE: Record<SensorTruthSource, SensorNormalizationPreviewBadgeTone> = {
  live: "info",
  manual: "neutral",
  csv: "neutral",
  demo: "muted",
  stale: "warning",
  invalid: "danger",
};

function countObjectFields(input: unknown): number {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return Object.keys(input as Record<string, unknown>).length;
  }
  return 0;
}

function buildBadges(
  normalized: NormalizedSensorReading,
): SensorNormalizationPreviewBadge[] {
  const badges: SensorNormalizationPreviewBadge[] = [
    { label: `Source: ${normalized.source}`, tone: SOURCE_TONE[normalized.source] },
    { label: `Identity: ${normalized.source_identity}`, tone: "muted" },
    { label: `Transport: ${normalized.transport}`, tone: "muted" },
    {
      label: `Confidence: ${normalized.confidence}`,
      tone:
        normalized.confidence >= 75
          ? "info"
          : normalized.confidence >= 40
            ? "neutral"
            : "warning",
    },
  ];
  if (normalized.is_stale) badges.push({ label: "Stale", tone: "warning" });
  if (normalized.source === "invalid") badges.push({ label: "Invalid", tone: "danger" });
  return badges;
}

function buildMetricRows(
  normalized: NormalizedSensorReading,
): SensorNormalizationPreviewMetricRow[] {
  const out: SensorNormalizationPreviewMetricRow[] = [];
  for (const [metric, value] of Object.entries(normalized.metrics)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out.push({ metric, value });
    }
  }
  return out;
}

function buildWarnings(
  normalized: NormalizedSensorReading,
): SensorNormalizationPreviewWarning[] {
  return normalized.warnings.map((code) => ({
    code,
    label: WARNING_LABELS[code] ?? code,
  }));
}

function buildLongFormRows(
  rows: NormalizedSensorLongFormRow[],
): SensorNormalizationPreviewLongFormRow[] {
  return rows.map((r) => ({
    metric: r.metric,
    value: r.value,
    source: r.source,
    source_identity: r.source_identity,
    transport: r.transport,
    confidence: r.confidence,
    captured_at: r.captured_at,
  }));
}

export function buildSensorNormalizationPreviewViewModel(
  input: SensorNormalizationPreviewInput,
): SensorNormalizationPreviewViewModel {
  const normalized = normalizeSensorReading(input.payload, input.options);
  const metricRowsAll = normalizedReadingToLongFormRows(normalized);
  const metricRows = buildMetricRows(normalized);
  const warnings = buildWarnings(normalized);
  const badges = buildBadges(normalized);

  // Tent ID classification (uses existing isUuid helper).
  const rawTentId = input.options.tentId;
  let tentStatus: SensorNormalizationPreviewTentStatus;
  let tentStatusLabel: string;
  if (rawTentId === undefined || rawTentId === null || (typeof rawTentId === "string" && rawTentId.trim() === "")) {
    tentStatus = "missing";
    tentStatusLabel = "Missing tent ID";
  } else if (!isUuid(rawTentId)) {
    tentStatus = "invalid";
    tentStatusLabel = "Invalid tent ID";
  } else {
    tentStatus = "linked_verified";
    tentStatusLabel = "Linked tent verified";
  }

  // Plant ID classification (informational; missing is not an error).
  const rawPlantId = input.options.plantId;
  let plantStatus: SensorNormalizationPreviewPlantStatus;
  let plantStatusLabel: string;
  if (rawPlantId === undefined) {
    plantStatus = "not_applicable";
    plantStatusLabel = "";
  } else if (rawPlantId === null || (typeof rawPlantId === "string" && rawPlantId.trim() === "")) {
    plantStatus = "missing";
    plantStatusLabel = "No plant linked";
  } else if (!isUuid(rawPlantId)) {
    plantStatus = "invalid";
    plantStatusLabel = "Invalid plant ID";
  } else {
    plantStatus = "linked";
    plantStatusLabel = "Linked plant present";
  }

  const longFormPreview =
    tentStatus === "linked_verified" ? buildLongFormRows(metricRowsAll) : [];

  let emptyState: string | null = null;
  if (normalized.source === "invalid") {
    emptyState = SENSOR_NORMALIZATION_PREVIEW_INVALID_NOTICE;
  } else if (tentStatus !== "linked_verified") {
    emptyState = SENSOR_NORMALIZATION_PREVIEW_TENT_MISSING_EMPTY_STATE;
  } else if (longFormPreview.length === 0) {
    emptyState = SENSOR_NORMALIZATION_PREVIEW_EMPTY_STATE;
  }

  const plantIdStatus: "present" | "missing" | "not_applicable" =
    plantStatus === "not_applicable"
      ? "not_applicable"
      : plantStatus === "linked"
        ? "present"
        : "missing";

  return {
    writesEnabled: false,
    disclaimer: SENSOR_NORMALIZATION_PREVIEW_DISCLAIMER,
    emptyState,
    source: normalized.source,
    sourceIdentity: normalized.source_identity,
    transport: normalized.transport,
    confidence: normalized.confidence,
    isStale: normalized.is_stale,
    tentIdStatus: tentStatus === "linked_verified" ? "present" : "missing",
    tentStatus,
    tentStatusLabel,
    plantIdStatus,
    plantStatus,
    plantStatusLabel,
    capturedAtDisplay: normalized.captured_at ?? "—",
    capturedAtPresent: normalized.captured_at !== null,
    badges,
    warnings,
    metricRows,
    longFormRows: longFormPreview,
    longFormRowCount: longFormPreview.length,
    rawPayloadFieldCount: countObjectFields(input.payload),
    rawPayloadNote: SENSOR_NORMALIZATION_PREVIEW_RAW_NOTE,
    normalized,
  };
}
