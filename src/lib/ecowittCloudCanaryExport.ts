/**
 * Item 3 — Pure serializer for the Cloud Canary preview view-model.
 *
 * Boundary: input is the ID-free view-model ONLY (rows + state). It MUST NOT
 * accept raw summaries, payloads, or mapping config. CSV and JSON are derived
 * from the SAME internal normalized structure so they cannot drift.
 *
 * Output is COUNTS-ONLY. No per-reading rows, no raw_payload, no MAC/UUID,
 * no tent_id/plant_id, no device timestamps.
 *
 * Pure: no I/O, no React, no DOM. Deterministic — row order preserved.
 */

import type { CloudCanaryPreviewViewModel } from "@/lib/ecowittCloudCanaryViewModel";
import {
  isEcowittSuspiciousFlagCode,
  type EcowittSuspiciousFlagCode,
} from "@/constants/ecowittSuspiciousFlags";
import {
  isEcowittMissingMetricCode,
  type EcowittMissingMetricCode,
} from "@/constants/ecowittMissingMetricCodes";

export interface CloudCanaryExportRow {
  fixture_name: string;
  mapped_count: number;
  fresh_class_count: number;
  stale_count: number;
  invalid_count: number;
  unmapped_count: number;
  row_state: "normal" | "zero_mapped_gap";
  /** Closed enum vocabulary only; ID-free by construction. */
  suspicious_flag_codes: EcowittSuspiciousFlagCode[];
  /** Closed enum vocabulary only; ID-free by construction. */
  missing_metric_codes: EcowittMissingMetricCode[];
}

export interface CloudCanaryExportTotals {
  fixture_count: number;
  mapped_count: number;
  fresh_class_count: number;
  stale_count: number;
  invalid_count: number;
  unmapped_count: number;
}

export interface CloudCanaryExport {
  /** Fixture-only / sample canary — honest label, no banned words. */
  source_kind: "fixture_sample_canary";
  preview_state: "empty" | "populated";
  rows: CloudCanaryExportRow[];
  totals: CloudCanaryExportTotals;
  /** Aggregate enum-coded suspicious flags across all fixtures, deduped + sorted. */
  suspicious_flag_codes: EcowittSuspiciousFlagCode[];
  /** Aggregate enum-coded missing-metric codes across all fixtures, deduped + sorted. */
  missing_metric_codes: EcowittMissingMetricCode[];
}

/** Stable column order for both CSV and the conceptual JSON row shape. */
export const CLOUD_CANARY_EXPORT_COLUMNS = [
  "fixture_name",
  "mapped_count",
  "fresh_class_count",
  "stale_count",
  "invalid_count",
  "unmapped_count",
  "row_state",
  "suspicious_flag_codes",
  "missing_metric_codes",
] as const;

/** Fixed filenames per Item 3 LOCKED spec (no timestamp). */
export const CLOUD_CANARY_EXPORT_CSV_FILENAME = "ecowitt-cloud-canary-summary.csv";
export const CLOUD_CANARY_EXPORT_JSON_FILENAME = "ecowitt-cloud-canary-summary.json";

/**
 * Build the normalized, ID-free export object from the view-model.
 * This is the single source of truth that both JSON and CSV format from.
 */
export function buildCloudCanaryExport(
  vm: CloudCanaryPreviewViewModel,
  // Accepted for back-compat; intentionally unused. Payload is deterministic
  // — no timestamps in the file. Run-timing for the UI lives in the panel.
  _opts: { now?: Date } = {},
): CloudCanaryExport {
  // against the closed enum, the export re-checks. This guarantees the file
  // on disk can ONLY contain enum values — never free text.
  const validateSuspiciousCodes = (
    codes: ReadonlyArray<string>,
    where: string,
  ): EcowittSuspiciousFlagCode[] => {
    for (const c of codes) {
      if (!isEcowittSuspiciousFlagCode(c)) {
        throw new Error(
          `[cloud-canary-export] Unknown suspicious flag code "${c}" at ${where}.`,
        );
      }
    }
    return [...codes].sort() as EcowittSuspiciousFlagCode[];
  };
  const validateMissingMetricCodes = (
    codes: ReadonlyArray<string>,
    where: string,
  ): EcowittMissingMetricCode[] => {
    for (const c of codes) {
      if (!isEcowittMissingMetricCode(c)) {
        throw new Error(
          `[cloud-canary-export] Unknown missing metric code "${c}" at ${where}.`,
        );
      }
    }
    return [...codes].sort() as EcowittMissingMetricCode[];
  };

  const rows: CloudCanaryExportRow[] = vm.rows.map((r) => ({
    fixture_name: r.fixture_name,
    mapped_count: r.mapped_count,
    fresh_class_count: r.live_count,
    stale_count: r.stale_count,
    invalid_count: r.invalid_count,
    unmapped_count: r.unmapped_count,
    row_state: r.state,
    suspicious_flag_codes: validateSuspiciousCodes(
      r.suspicious_flag_codes,
      `row "${r.fixture_name}"`,
    ),
    missing_metric_codes: validateMissingMetricCodes(
      r.missing_metric_codes,
      `row "${r.fixture_name}"`,
    ),
  }));
  const totals = rows.reduce<CloudCanaryExportTotals>(
    (acc, r) => ({
      fixture_count: acc.fixture_count + 1,
      mapped_count: acc.mapped_count + r.mapped_count,
      fresh_class_count: acc.fresh_class_count + r.fresh_class_count,
      stale_count: acc.stale_count + r.stale_count,
      invalid_count: acc.invalid_count + r.invalid_count,
      unmapped_count: acc.unmapped_count + r.unmapped_count,
    }),
    {
      fixture_count: 0,
      mapped_count: 0,
      fresh_class_count: 0,
      stale_count: 0,
      invalid_count: 0,
      unmapped_count: 0,
    },
  );
  return {
    source_kind: "fixture_sample_canary",
    preview_state: vm.state,
    rows,
    totals,
    suspicious_flag_codes: validateSuspiciousCodes(
      vm.suspicious_flag_codes,
      "top-level aggregate",
    ),
    missing_metric_codes: validateMissingMetricCodes(
      vm.missing_metric_codes,
      "top-level aggregate",
    ),
  };
}

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Codes are joined with '|' inside one CSV cell — enum values only, no commas. */
function formatCodesCell(codes: ReadonlyArray<string>): string {
  return escapeCsv(codes.join("|"));
}

/** CSV with a header comment line, column header row, fixture rows, and a TOTAL row. */
export function serializeCloudCanaryExportToCsv(exp: CloudCanaryExport): string {
  const lines: string[] = [];
  // Honest, non-banned header line.
  lines.push(
    `# Verdant Cloud Canary — fixture/sample canary summary · counts only · not tent data`,
  );
  lines.push(`# preview_state=${exp.preview_state}`);
  lines.push(CLOUD_CANARY_EXPORT_COLUMNS.join(","));
  for (const r of exp.rows) {
    lines.push(
      CLOUD_CANARY_EXPORT_COLUMNS.map((c) => {
        if (c === "suspicious_flag_codes") return formatCodesCell(r.suspicious_flag_codes);
        if (c === "missing_metric_codes") return formatCodesCell(r.missing_metric_codes);
        return escapeCsv(r[c] as string | number);
      }).join(","),
    );
  }
  lines.push(
    [
      escapeCsv("TOTAL"),
      exp.totals.mapped_count,
      exp.totals.fresh_class_count,
      exp.totals.stale_count,
      exp.totals.invalid_count,
      exp.totals.unmapped_count,
      "",
      formatCodesCell(exp.suspicious_flag_codes),
      formatCodesCell(exp.missing_metric_codes),
    ].join(","),
  );
  return lines.join("\n") + "\n";
}

export function serializeCloudCanaryExportToJson(exp: CloudCanaryExport): string {
  return JSON.stringify(exp, null, 2);
}

