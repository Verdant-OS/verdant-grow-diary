/**
 * verdantGeneticsXlsxImportEvidenceViewModel — pure view-model that turns
 * post-save state into a read-only evidence summary.
 *
 * Pure. No I/O. No Supabase. No insert/update/delete/upsert/rpc.
 * No alerts. No Action Queue writes. No AI. No device control.
 *
 * This module never exposes raw_payload internals, bridge tokens, device
 * serials, or service role keys.
 */
import type { VerdantGeneticsXlsxPreviewViewModel } from "@/lib/verdantGeneticsXlsxPreviewViewModel";
import type { VerdantGeneticsXlsxInsertRowsResult } from "@/lib/verdantGeneticsXlsxInsertRowsAdapter";
import type { TentOption } from "@/lib/verdantGeneticsXlsxMappingViewModel";

export const IMPORTED_AS_CSV_HISTORY_COPY =
  "Imported as CSV history, not live sensor data." as const;

export const PARTIAL_REJECTION_WARNING_COPY =
  "Some rows were skipped. Review rejected reasons before relying on this history." as const;

export const SOURCE_LABEL = "CSV history" as const;
export const SOURCE_APP_LABEL = "Verdant Genetics XLSX" as const;

export interface MappedGroupEntry {
  sensorGroup: string;
  tentLabel: string | null;
}

export interface RejectionReasonEntry {
  reason: string;
  count: number;
}

export interface VerdantGeneticsXlsxImportEvidenceViewModel {
  acceptedRowCount: number;
  rejectedRowCount: number;
  rejectionReasons: RejectionReasonEntry[];
  hasRejections: boolean;
  mappedGroups: MappedGroupEntry[];
  dateRange: { start: string; end: string } | null;
  dateRangeLabel: string;
  metricsImported: string[];
  sourceLabel: typeof SOURCE_LABEL;
  sourceAppLabel: typeof SOURCE_APP_LABEL;
  importBatchIdTruncated: string;
  csvHistoryCopy: typeof IMPORTED_AS_CSV_HISTORY_COPY;
  partialRejectionWarning: typeof PARTIAL_REJECTION_WARNING_COPY | null;
}

export interface BuildEvidenceInput {
  adapterResult: VerdantGeneticsXlsxInsertRowsResult;
  previewVm: VerdantGeneticsXlsxPreviewViewModel;
  tentIdBySensorGroup: Record<string, string>;
  tentOptions: TentOption[];
  importBatchId: string;
}

function truncateBatchId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function buildTentLabelLookup(
  options: TentOption[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const o of options) {
    map.set(o.id, o.name);
  }
  return map;
}

function uniqueMetricsFromRows(
  result: VerdantGeneticsXlsxInsertRowsResult,
): string[] {
  const set = new Set<string>();
  for (const r of result.rows) {
    if (r.metric) set.add(r.metric);
  }
  return Array.from(set).sort();
}

export function buildVerdantGeneticsXlsxImportEvidenceViewModel(
  input: BuildEvidenceInput,
): VerdantGeneticsXlsxImportEvidenceViewModel {
  const {
    adapterResult,
    previewVm,
    tentIdBySensorGroup,
    tentOptions,
    importBatchId,
  } = input;

  const lookup = buildTentLabelLookup(tentOptions);
  const mappedGroups: MappedGroupEntry[] = previewVm.detectedGroups.map(
    (g) => ({
      sensorGroup: g,
      tentLabel: lookup.get(tentIdBySensorGroup[g]) ?? null,
    }),
  );

  const rejectionReasons: RejectionReasonEntry[] = Object.entries(
    adapterResult.rejectionReasons,
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, count]) => ({ reason, count }));

  const metricsImported =
    adapterResult.rows.length > 0
      ? uniqueMetricsFromRows(adapterResult)
      : [];

  return {
    acceptedRowCount: adapterResult.acceptedRowCount,
    rejectedRowCount: adapterResult.rejectedRowCount,
    rejectionReasons,
    hasRejections: adapterResult.rejectedRowCount > 0,
    mappedGroups,
    dateRange: previewVm.dateRange,
    dateRangeLabel: previewVm.dateRange
      ? `${fmtDate(previewVm.dateRange.start)} → ${fmtDate(previewVm.dateRange.end)}`
      : "—",
    metricsImported,
    sourceLabel: SOURCE_LABEL,
    sourceAppLabel: SOURCE_APP_LABEL,
    importBatchIdTruncated: truncateBatchId(importBatchId),
    csvHistoryCopy: IMPORTED_AS_CSV_HISTORY_COPY,
    partialRejectionWarning:
      adapterResult.rejectedRowCount > 0 ? PARTIAL_REJECTION_WARNING_COPY : null,
  };
}
