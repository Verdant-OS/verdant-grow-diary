// Read-only view model for the EcoWitt evidence history timeline.
// Pure presenter. No I/O, no writes.

import {
  buildEcowittEvidenceHistory,
  EcowittEvidenceHistoryEntry,
  EcowittEvidenceHistoryParams,
} from "./ecowittEvidenceHistory";
import { EcowittTentKey } from "./ecowittTentNormalizerRouter";

export interface EcowittEvidenceHistoryRowViewModel {
  id: string;
  tent_key: EcowittTentKey;
  tent_label: string;
  sample_key: EcowittEvidenceHistoryEntry["sample_key"];
  sample_label: string;
  source: EcowittEvidenceHistoryEntry["snapshot"]["source"];
  source_label: "LIVE" | "DEGRADED" | "INVALID";
  captured_at: string;
  is_stale: boolean;
  air_temp_f: number | null;
  humidity_pct: number | null;
  soil_temp_f: number | null;
  soil_moisture_pct_primary: number | null;
  soil_moisture_pct_secondary: number | null;
  root_zone_confidence: EcowittEvidenceHistoryEntry["snapshot"]["root_zone_confidence"];
  degraded_reason_count: number;
  invalid_reason_count: number;
}

export interface EcowittEvidenceHistoryViewModel {
  tent_key: EcowittTentKey;
  rows: readonly EcowittEvidenceHistoryRowViewModel[];
}

const SOURCE_LABELS = {
  live: "LIVE",
  degraded: "DEGRADED",
  invalid: "INVALID",
} as const;

export function buildEcowittEvidenceHistoryViewModel(
  params: EcowittEvidenceHistoryParams,
): EcowittEvidenceHistoryViewModel {
  const entries = buildEcowittEvidenceHistory(params);
  const rows: EcowittEvidenceHistoryRowViewModel[] = entries.map((e) => ({
    id: e.id,
    tent_key: e.tent_key,
    tent_label: e.snapshot.tent_label,
    sample_key: e.sample_key,
    sample_label: e.sample_label,
    source: e.snapshot.source,
    source_label: SOURCE_LABELS[e.snapshot.source],
    captured_at: e.captured_at_iso,
    is_stale: e.is_stale,
    air_temp_f: e.snapshot.metrics.air_temp_f,
    humidity_pct: e.snapshot.metrics.humidity_pct,
    soil_temp_f: e.snapshot.metrics.soil_temp_f,
    soil_moisture_pct_primary: e.snapshot.metrics.soil_moisture_pct_primary,
    soil_moisture_pct_secondary: e.snapshot.metrics.soil_moisture_pct_secondary,
    root_zone_confidence: e.snapshot.root_zone_confidence,
    degraded_reason_count: e.snapshot.degraded_reasons.length,
    invalid_reason_count: e.snapshot.invalid_reasons.length,
  }));

  return { tent_key: params.tentKey, rows };
}
