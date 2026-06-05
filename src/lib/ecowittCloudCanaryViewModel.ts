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
}

function coerceCodes(
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
    suspicious_flag_codes: coerceCodes(s.suspicious_flag_codes, s.fixture_id),
  }));
  const is_empty = rows.length === 0;
  const aggregate = coerceCodes(verdict.suspicious_flag_codes, "__aggregate__");
  return {
    state: is_empty ? "empty" : "populated",
    is_empty,
    rows,
    suspicious_flag_codes: aggregate,
  };
}

// Re-export the closed vocabulary for tests and presenters that need it.
export {
  ECOWITT_SUSPICIOUS_FLAG_CODES,
  type EcowittSuspiciousFlagCode,
} from "@/constants/ecowittSuspiciousFlags";
