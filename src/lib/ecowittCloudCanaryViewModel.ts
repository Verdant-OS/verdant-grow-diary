/**
 * Pure view-model for the Operator Cloud Canary preview (Item 4 + Item 2 + Thread 2).
 *
 * Boundary: takes `runEcowittCloudCanary` output and emits render-ready rows
 * carrying COUNTS + fixture name + enum-coded suspicious-flag codes ONLY.
 * The view-model is ID-free by construction — it never exposes MACs, tent_ids,
 * plant_ids, UUIDs, or raw payload values.
 *
 * Thread 2: surfaces row-level + top-level `suspicious_flag_codes` from the
 * closed `ECOWITT_SUSPICIOUS_FLAG_CODES` vocabulary. Verdict strings outside
 * that vocabulary cause a thrown error rather than being passed through as
 * free text. `missing_metric_count` is intentionally NOT surfaced here — the
 * verdict does not yet expose a per-reading missing-metric tally; a separate
 * slice must extend slice-1 first.
 *
 * No I/O. No React. No DB. Deterministic — input ordering + sorted codes.
 */

import type { EcowittCloudCanaryVerdict } from "@/lib/ecowittCloudCanaryVerdict";
import {
  ECOWITT_SUSPICIOUS_FLAG_CODES,
  isEcowittSuspiciousFlagCode,
  type EcowittSuspiciousFlagCode,
} from "@/constants/ecowittSuspiciousFlags";
import {
  ECOWITT_MISSING_METRIC_CODES,
  isEcowittMissingMetricCode,
  type EcowittMissingMetricCode,
} from "@/constants/ecowittMissingMetricCodes";

export type CloudCanaryRowState = "normal" | "zero_mapped_gap";

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
  /**
   * Row state, decided here (NOT in the component).
   * - "zero_mapped_gap": mapped_count === 0 (readings may exist but none routed)
   * - "normal": at least one row routed to a tent
   */
  state: CloudCanaryRowState;
  /**
   * Closed-vocabulary suspicious-flag codes for this fixture, deduped + sorted.
   * Codes are from ECOWITT_SUSPICIOUS_FLAG_CODES only — never free text.
   */
  suspicious_flag_codes: EcowittSuspiciousFlagCode[];
  /**
   * Closed-vocabulary missing-metric codes for this fixture, deduped + sorted.
   * Codes are from ECOWITT_MISSING_METRIC_CODES only — never free text.
   * Distinct surface from `captured_at_*` (timestamp) signals.
   */
  missing_metric_codes: EcowittMissingMetricCode[];
}

export type CloudCanaryPreviewState = "empty" | "populated";

export interface CloudCanaryPreviewViewModel {
  /** Discriminator for the whole preview surface. */
  state: CloudCanaryPreviewState;
  /** True iff there are no fixtures to summarize. Distinct from a routing gap. */
  is_empty: boolean;
  rows: CloudCanaryPreviewRow[];
  /** Aggregate enum-coded suspicious flags across all fixtures, deduped + sorted. */
  suspicious_flag_codes: EcowittSuspiciousFlagCode[];
  /** Aggregate enum-coded missing-metric codes across all fixtures, deduped + sorted. */
  missing_metric_codes: EcowittMissingMetricCode[];
}

function coerceSuspiciousCodes(
  raw: ReadonlyArray<string>,
  fixtureName: string,
): EcowittSuspiciousFlagCode[] {
  const out = new Set<EcowittSuspiciousFlagCode>();
  for (const c of raw) {
    if (!isEcowittSuspiciousFlagCode(c)) {
      throw new Error(
        `[cloud-canary-view-model] Unknown suspicious flag code "${c}" on fixture "${fixtureName}". ` +
          `Add it to ECOWITT_SUSPICIOUS_FLAG_CODES before surfacing.`,
      );
    }
    out.add(c);
  }
  // Stable order so JSON/CSV/UI are deterministic.
  return [...out].sort();
}

function coerceMissingMetricCodes(
  raw: ReadonlyArray<string>,
  fixtureName: string,
): EcowittMissingMetricCode[] {
  const out = new Set<EcowittMissingMetricCode>();
  for (const c of raw) {
    if (!isEcowittMissingMetricCode(c)) {
      throw new Error(
        `[cloud-canary-view-model] Unknown missing metric code "${c}" on fixture "${fixtureName}". ` +
          `Add it to ECOWITT_MISSING_METRIC_CODES before surfacing.`,
      );
    }
    out.add(c);
  }
  return [...out].sort();
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
    state: s.mapped_count === 0 ? "zero_mapped_gap" : "normal",
    suspicious_flag_codes: coerceSuspiciousCodes(
      s.suspicious_flag_codes,
      s.fixture_id,
    ),
    missing_metric_codes: coerceMissingMetricCodes(
      s.missing_metric_codes,
      s.fixture_id,
    ),
  }));
  const is_empty = rows.length === 0;
  const suspicious_aggregate = coerceSuspiciousCodes(
    verdict.suspicious_flag_codes,
    "__aggregate__",
  );
  // Verdict has no top-level missing_metric_codes aggregate yet — derive it
  // here as the union of per-row codes (deduped + sorted), mirroring Slice A.
  const missing_union = new Set<EcowittMissingMetricCode>();
  for (const r of rows) for (const c of r.missing_metric_codes) missing_union.add(c);
  return {
    state: is_empty ? "empty" : "populated",
    is_empty,
    rows,
    suspicious_flag_codes: suspicious_aggregate,
    missing_metric_codes: [...missing_union].sort(),
  };
}

// Re-export the closed vocabularies for tests and presenters that need them.
export {
  ECOWITT_SUSPICIOUS_FLAG_CODES,
  type EcowittSuspiciousFlagCode,
} from "@/constants/ecowittSuspiciousFlags";
export {
  ECOWITT_MISSING_METRIC_CODES,
  type EcowittMissingMetricCode,
} from "@/constants/ecowittMissingMetricCodes";

