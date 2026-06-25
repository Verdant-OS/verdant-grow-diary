// Pure read-only EcoWitt evidence history.
// Builds a deterministic list of canonical snapshots from local fixture samples
// for the operator preview timeline. NO Supabase, NO Edge, NO writes.

import {
  ECOWITT_PREVIEW_SAMPLES,
  EcowittPreviewSample,
  EcowittPreviewSampleKey,
} from "@/fixtures/ecowitt-preview-samples";
import {
  EcowittTentKey,
  normalizeEcowittTentPayload,
  SUPPORTED_TENT_KEYS,
} from "./ecowittTentNormalizerRouter";
import {
  CanonicalEcowittTentSnapshot,
} from "./ecowittTentSnapshot";
import { ECOWITT_EVIDENCE_FRESHNESS_MS } from "./ecowittLocalEvidence";

export interface EcowittEvidenceHistoryEntry {
  id: string;
  tent_key: EcowittTentKey;
  sample_key: EcowittPreviewSampleKey;
  sample_label: string;
  captured_at_ms: number;
  captured_at_iso: string;
  age_ms: number;
  is_stale: boolean;
  snapshot: CanonicalEcowittTentSnapshot;
}

export interface EcowittEvidenceHistoryParams {
  tentKey: EcowittTentKey;
  now?: Date;
  freshness_ms?: number;
  /** Optional subset of sample keys; defaults to all bundled samples. */
  sampleKeys?: readonly EcowittPreviewSampleKey[];
}

export function buildEcowittEvidenceHistory(
  params: EcowittEvidenceHistoryParams,
): readonly EcowittEvidenceHistoryEntry[] {
  if (!SUPPORTED_TENT_KEYS.includes(params.tentKey)) {
    return [];
  }
  const now = (params.now ?? new Date()).getTime();
  const freshness = params.freshness_ms ?? ECOWITT_EVIDENCE_FRESHNESS_MS;
  const samples = (params.sampleKeys
    ? ECOWITT_PREVIEW_SAMPLES.filter((s) => params.sampleKeys!.includes(s.key))
    : ECOWITT_PREVIEW_SAMPLES) as readonly EcowittPreviewSample[];

  const entries: EcowittEvidenceHistoryEntry[] = samples.map((sample) => {
    const captured_at_ms = now - sample.captured_age_ms;
    const snapshot = normalizeEcowittTentPayload(
      sample.payload,
      params.tentKey,
      {
        now: new Date(now),
        captured_at_ms,
        max_age_ms: freshness,
      },
    );
    return {
      id: `${params.tentKey}:${sample.key}`,
      tent_key: params.tentKey,
      sample_key: sample.key,
      sample_label: sample.label,
      captured_at_ms,
      captured_at_iso: new Date(captured_at_ms).toISOString(),
      age_ms: sample.captured_age_ms,
      is_stale: sample.captured_age_ms > freshness,
      snapshot,
    };
  });

  // Deterministic newest-first; tiebreak by sample key for stability.
  entries.sort((a, b) => {
    if (b.captured_at_ms !== a.captured_at_ms) {
      return b.captured_at_ms - a.captured_at_ms;
    }
    return a.sample_key.localeCompare(b.sample_key);
  });

  return entries;
}
