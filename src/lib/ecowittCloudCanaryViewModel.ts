/**
 * Pure view-model for the Operator Cloud Canary preview (Item 4).
 *
 * Boundary: takes `runEcowittCloudCanary` output and emits render-ready rows
 * carrying COUNTS + fixture name ONLY. The view-model is ID-free by
 * construction — it never exposes MACs, tent_ids, plant_ids, UUIDs, or raw
 * payload values. The presenter component cannot render an identifier
 * because the view-model does not carry one.
 *
 * No I/O. No React. No DB. Deterministic — input ordering is preserved.
 */

import type { EcowittCloudCanaryVerdict } from "@/lib/ecowittCloudCanaryVerdict";

export interface CloudCanaryPreviewRow {
  /** Fixture declaration name (e.g. "happy_multi_channel"). Not an identifier. */
  fixture_name: string;
  /** Mapped rows classified as fresh/"live-class" by the normalizer. */
  live_count: number;
  /** Mapped rows that were too old to be fresh. */
  stale_count: number;
  /** Mapped rows that failed validation. */
  invalid_count: number;
  /** Total mapped = live + stale + invalid. */
  mapped_count: number;
  /** Channels with no mapping — shown as a SEPARATE column, never merged. */
  unmapped_count: number;
}

export interface CloudCanaryPreviewViewModel {
  rows: CloudCanaryPreviewRow[];
}

export function buildCloudCanaryPreviewViewModel(
  verdict: EcowittCloudCanaryVerdict,
): CloudCanaryPreviewViewModel {
  const rows: CloudCanaryPreviewRow[] = verdict.summaries.map((s) => ({
    fixture_name: s.fixture_id,
    live_count: s.live_count,
    stale_count: s.stale_count,
    invalid_count: s.invalid_count,
    mapped_count: s.mapped_count,
    unmapped_count: s.unmapped_count,
  }));
  return { rows };
}
