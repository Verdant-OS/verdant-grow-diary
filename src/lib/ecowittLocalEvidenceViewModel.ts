// Pure view model combining local EcoWitt evidence + per-tent normalization
// for the read-only operator preview. No I/O.

import {
  EcowittEvidenceLoadResult,
  ECOWITT_EVIDENCE_FRESHNESS_MS,
  isEcowittEvidenceStale,
  loadEcowittEvidenceSample,
} from "./ecowittLocalEvidence";
import {
  EcowittTentKey,
  normalizeEcowittTentPayload,
} from "./ecowittTentNormalizerRouter";
import {
  buildEcowittTentPreviewViewModel,
  ECOWITT_TENT_PREVIEW_EVIDENCE_COPY,
  ECOWITT_TENT_PREVIEW_READ_ONLY_COPY,
  EcowittTentPreviewViewModel,
} from "./ecowittTentPreviewViewModel";
import {
  EcowittPreviewSampleKey,
} from "@/fixtures/ecowitt-preview-samples";

export const ECOWITT_LOCAL_EVIDENCE_STALE_COPY =
  "Stale evidence: payload age exceeds freshness window." as const;

export interface EcowittLocalEvidencePreviewParams {
  tentKey: EcowittTentKey;
  sampleKey: EcowittPreviewSampleKey;
  now?: Date;
  freshness_ms?: number;
}

export interface EcowittLocalEvidencePreviewViewModel {
  tent_key: EcowittTentKey;
  sample_key: EcowittPreviewSampleKey;
  sample_label: string;
  sample_description: string;
  source_label: EcowittEvidenceLoadResult["source_label"];
  last_loaded_at: string;
  evidence_captured_at: string;
  evidence_age_ms: number;
  is_stale: boolean;
  stale_copy: typeof ECOWITT_LOCAL_EVIDENCE_STALE_COPY | null;
  read_only_copy: typeof ECOWITT_TENT_PREVIEW_READ_ONLY_COPY;
  evidence_copy: typeof ECOWITT_TENT_PREVIEW_EVIDENCE_COPY;
  preview: EcowittTentPreviewViewModel;
}

export function buildEcowittLocalEvidencePreviewViewModel(
  params: EcowittLocalEvidencePreviewParams,
): EcowittLocalEvidencePreviewViewModel {
  const now = params.now ?? new Date();
  const loaded = loadEcowittEvidenceSample(params.sampleKey, { now });
  const snapshot = normalizeEcowittTentPayload(
    loaded.sample.payload,
    params.tentKey,
    {
      now,
      captured_at_ms: loaded.captured_at_ms,
      max_age_ms: params.freshness_ms ?? ECOWITT_EVIDENCE_FRESHNESS_MS,
    },
  );
  const preview = buildEcowittTentPreviewViewModel(snapshot);
  const stale = isEcowittEvidenceStale(loaded, params.freshness_ms);

  return {
    tent_key: params.tentKey,
    sample_key: params.sampleKey,
    sample_label: loaded.sample.label,
    sample_description: loaded.sample.description,
    source_label: loaded.source_label,
    last_loaded_at: now.toISOString(),
    evidence_captured_at: loaded.captured_at_iso,
    evidence_age_ms: loaded.age_ms,
    is_stale: stale,
    stale_copy: stale ? ECOWITT_LOCAL_EVIDENCE_STALE_COPY : null,
    read_only_copy: ECOWITT_TENT_PREVIEW_READ_ONLY_COPY,
    evidence_copy: ECOWITT_TENT_PREVIEW_EVIDENCE_COPY,
    preview,
  };
}
