/**
 * verdantGeneticsXlsxPreviewViewModel — pure view-model that turns a
 * CellGrid into the copy + counts the Verdant Genetics XLSX preview panel
 * renders.
 *
 * Pure. No I/O. No Supabase. No insert/update/delete/upsert/rpc.
 * No alerts. No Action Queue writes. No AI. No device control.
 *
 * Persistence is intentionally disabled for the verdant_genetics_xlsx
 * source app; this module is preview-only.
 */
import {
  parseVerdantGeneticsXlsx,
  VERDANT_GENETICS_SOURCE_APP,
  VERDANT_GENETICS_SOURCE_TAG,
  type CellGrid,
  type VerdantGeneticsParseResult,
  type VerdantGeneticsRejectedColumn,
  type VerdantGeneticsSuspiciousFlag,
} from "@/lib/verdantGeneticsXlsxParser";

/** Re-export so the parser is exposed through the documented preview name. */
export const parseVerdantGeneticsXlsxPreview = parseVerdantGeneticsXlsx;

export const VERDANT_GENETICS_FORMAT_LABEL =
  "Verdant Genetics multi-tent XLSX export" as const;

export const VERDANT_GENETICS_CSV_HISTORY_COPY =
  "This XLSX export will be treated as CSV history, not live sensor data." as const;

export const VERDANT_GENETICS_IMPORT_DISABLED_COPY =
  "Preview only. Saving rows from this XLSX source is not enabled yet." as const;

export const UNKNOWN_XLSX_COPY =
  "Unknown XLSX format. Review mapping before importing." as const;

export interface VerdantGeneticsXlsxPreviewViewModel {
  sourceApp: typeof VERDANT_GENETICS_SOURCE_APP;
  formatLabel: typeof VERDANT_GENETICS_FORMAT_LABEL;
  canonicalSourceLabel: "CSV history";
  canonicalSourceTag: typeof VERDANT_GENETICS_SOURCE_TAG;
  csvHistoryCopy: typeof VERDANT_GENETICS_CSV_HISTORY_COPY;
  detectedGroups: string[];
  dateRange: { start: string; end: string } | null;
  timestampRowCount: number;
  mappedMetricCount: number;
  rejectedMetricCount: number;
  suspiciousCount: number;
  suspicious: VerdantGeneticsSuspiciousFlag[];
  rejected: VerdantGeneticsRejectedColumn[];
  unknownShape: boolean;
  unknownShapeCopy: typeof UNKNOWN_XLSX_COPY | null;
  importEnabled: false;
  importDisabledReason: typeof VERDANT_GENETICS_IMPORT_DISABLED_COPY;
  /** Raw parser result for testability — UI must not render raw payloads. */
  raw: VerdantGeneticsParseResult;
}

export function buildVerdantGeneticsXlsxPreviewViewModel(
  grid: CellGrid,
): VerdantGeneticsXlsxPreviewViewModel {
  const raw = parseVerdantGeneticsXlsxPreview(grid);
  const unknownShape =
    raw.summary.detected_groups.length === 0 &&
    raw.summary.mapped_metric_count === 0 &&
    raw.summary.reading_group_count === 0;
  return {
    sourceApp: VERDANT_GENETICS_SOURCE_APP,
    formatLabel: VERDANT_GENETICS_FORMAT_LABEL,
    canonicalSourceLabel: "CSV history",
    canonicalSourceTag: VERDANT_GENETICS_SOURCE_TAG,
    csvHistoryCopy: VERDANT_GENETICS_CSV_HISTORY_COPY,
    detectedGroups: raw.summary.detected_groups,
    dateRange: raw.summary.date_range,
    timestampRowCount: raw.summary.reading_group_count,
    mappedMetricCount: raw.summary.mapped_metric_count,
    rejectedMetricCount: raw.summary.rejected_metric_count,
    suspiciousCount: raw.summary.suspicious_count,
    suspicious: raw.suspicious,
    rejected: raw.rejected,
    unknownShape,
    unknownShapeCopy: unknownShape ? UNKNOWN_XLSX_COPY : null,
    importEnabled: false,
    importDisabledReason: VERDANT_GENETICS_IMPORT_DISABLED_COPY,
    raw,
  };
}
