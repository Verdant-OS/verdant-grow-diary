// Pure presenter view model for the read-only EcoWitt tent preview.
// Converts a canonical snapshot into display-ready rows. No I/O.

import {
  CanonicalEcowittTentSnapshot,
  redactEcowittPayload,
} from "./ecowittTentSnapshot";

export const ECOWITT_TENT_PREVIEW_READ_ONLY_COPY =
  "Read-only preview. No database writes." as const;
export const ECOWITT_TENT_PREVIEW_EVIDENCE_COPY =
  "EcoWitt MQTT sample/local evidence only." as const;

export interface EcowittTentPreviewMetricRow {
  key:
    | "air_temp_f"
    | "humidity_pct"
    | "soil_temp_f"
    | "soil_moisture_pct_primary"
    | "soil_moisture_pct_secondary";
  label: string;
  value: number | null;
  unit: string;
  channel: string | null;
  present: boolean;
}

export interface EcowittTentPreviewViewModel {
  source: CanonicalEcowittTentSnapshot["source"];
  source_label: string;
  provider: string;
  tent_label: string;
  captured_at: string | null;
  metrics: readonly EcowittTentPreviewMetricRow[];
  root_zone_confidence: CanonicalEcowittTentSnapshot["root_zone_confidence"];
  degraded_reasons: readonly string[];
  invalid_reasons: readonly string[];
  read_only_copy: typeof ECOWITT_TENT_PREVIEW_READ_ONLY_COPY;
  evidence_copy: typeof ECOWITT_TENT_PREVIEW_EVIDENCE_COPY;
  redacted_raw_preview: Readonly<Record<string, unknown>>;
}

const METRIC_LABELS: Record<EcowittTentPreviewMetricRow["key"], { label: string; unit: string }> = {
  air_temp_f: { label: "Air temperature", unit: "°F" },
  humidity_pct: { label: "Humidity", unit: "%" },
  soil_temp_f: { label: "Soil temperature", unit: "°F" },
  soil_moisture_pct_primary: { label: "Soil moisture (primary)", unit: "%" },
  soil_moisture_pct_secondary: { label: "Soil moisture (secondary)", unit: "%" },
};

const SOURCE_LABEL: Record<CanonicalEcowittTentSnapshot["source"], string> = {
  live: "LIVE",
  degraded: "DEGRADED",
  invalid: "INVALID",
};

export function buildEcowittTentPreviewViewModel(
  snap: CanonicalEcowittTentSnapshot,
): EcowittTentPreviewViewModel {
  const map = snap.channel_map as Record<string, string | undefined>;
  const rows: EcowittTentPreviewMetricRow[] = (
    Object.keys(METRIC_LABELS) as EcowittTentPreviewMetricRow["key"][]
  ).map((key) => {
    const value = snap.metrics[key];
    const channel = map[key] ?? null;
    return {
      key,
      label: METRIC_LABELS[key].label,
      unit: METRIC_LABELS[key].unit,
      value,
      channel,
      present: channel !== null,
    };
  });

  return {
    source: snap.source,
    source_label: SOURCE_LABEL[snap.source],
    provider: snap.provider,
    tent_label: snap.tent_label,
    captured_at: snap.captured_at,
    metrics: rows,
    root_zone_confidence: snap.root_zone_confidence,
    degraded_reasons: snap.degraded_reasons,
    invalid_reasons: snap.invalid_reasons,
    read_only_copy: ECOWITT_TENT_PREVIEW_READ_ONLY_COPY,
    evidence_copy: ECOWITT_TENT_PREVIEW_EVIDENCE_COPY,
    redacted_raw_preview: redactEcowittPayload(snap.raw_payload),
  };
}
