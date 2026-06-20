// Pure helpers for loading local EcoWitt evidence into the read-only preview.
// No I/O. No Supabase. No Edge calls. Deterministic given options.

import {
  ECOWITT_PREVIEW_SAMPLES,
  EcowittPreviewSample,
  EcowittPreviewSampleKey,
  getEcowittPreviewSample,
} from "@/fixtures/ecowitt-preview-samples";

export type EcowittEvidenceSourceLabel = "sample" | "local evidence";

export interface EcowittEvidenceLoadOptions {
  /** Defaults to "sample" for the bundled fixtures. */
  source_label?: EcowittEvidenceSourceLabel;
  /** Now timestamp, injectable for deterministic tests. */
  now?: Date;
}

export interface EcowittEvidenceLoadResult {
  sample: EcowittPreviewSample;
  source_label: EcowittEvidenceSourceLabel;
  captured_at_ms: number;
  captured_at_iso: string;
  age_ms: number;
}

export const ECOWITT_EVIDENCE_FRESHNESS_MS = 10 * 60 * 1000; // 10 minutes

export function listEcowittPreviewSampleKeys(): readonly EcowittPreviewSampleKey[] {
  return ECOWITT_PREVIEW_SAMPLES.map((s) => s.key);
}

export function loadEcowittEvidenceSample(
  key: EcowittPreviewSampleKey,
  options: EcowittEvidenceLoadOptions = {},
): EcowittEvidenceLoadResult {
  const sample = getEcowittPreviewSample(key);
  const now = (options.now ?? new Date()).getTime();
  const captured_at_ms = now - sample.captured_age_ms;
  return {
    sample,
    source_label: options.source_label ?? "sample",
    captured_at_ms,
    captured_at_iso: new Date(captured_at_ms).toISOString(),
    age_ms: sample.captured_age_ms,
  };
}

export function isEcowittEvidenceStale(
  result: EcowittEvidenceLoadResult,
  freshness_ms: number = ECOWITT_EVIDENCE_FRESHNESS_MS,
): boolean {
  return result.age_ms > freshness_ms;
}
