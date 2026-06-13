/**
 * verdantGeneticsXlsxInsertRowsAdapter — pure adapter that converts
 * verdantGeneticsXlsxParser preview rows into sensor_readings insert-row
 * objects using Verdant's canonical CSV history model.
 *
 * Hard contract:
 *  - Pure. No React, no Supabase, no fetch, no rpc, no insert/update/
 *    delete/upsert calls, no alerts, no Action Queue writes, no AI, no
 *    device control.
 *  - Canonical source = "csv". raw_payload.source_app = "verdant_genetics_xlsx".
 *  - Adapter-only. NOT wired into any save handler; callers are still
 *    responsible for persistence (currently disabled for this source app).
 *  - CSV history is never live.
 */
import {
  VERDANT_GENETICS_SOURCE_APP,
  VERDANT_GENETICS_SOURCE_TAG,
  type VerdantGeneticsMetric,
  type VerdantGeneticsParseResult,
  type VerdantGeneticsPreviewMetricRow,
  type VerdantGeneticsSuspiciousFlag,
} from "@/lib/verdantGeneticsXlsxParser";

/** Metrics the production DB trigger accepts for CSV-shaped inserts. */
const SUPPORTED_METRICS: ReadonlySet<VerdantGeneticsMetric> = new Set([
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "soil_moisture_pct",
]);

export type VerdantGeneticsXlsxRejectionReason =
  | "missing_tent_mapping"
  | "unsupported_metric"
  | "non_numeric_value";

export interface VerdantGeneticsXlsxInsertRawPayload {
  csv_import: true;
  source_app: typeof VERDANT_GENETICS_SOURCE_APP;
  sensor_group: string;
  original_metric_label: string;
  original_value: string | number | null;
  original_unit: string | null;
  import_batch_id: string;
  grow_id?: string;
  calculated?: boolean;
  extras?: Record<string, string | number>;
  suspicious_flags?: Array<{
    kind: VerdantGeneticsSuspiciousFlag["kind"];
    note: string;
  }>;
}

export interface SensorReadingInsertRow {
  tent_id: string;
  metric: VerdantGeneticsMetric;
  value: number;
  captured_at: string;
  source: typeof VERDANT_GENETICS_SOURCE_TAG;
  quality: "ok";
  raw_payload: VerdantGeneticsXlsxInsertRawPayload;
}

export interface BuildVerdantGeneticsXlsxInsertRowsInput {
  tentIdBySensorGroup: Record<string, string>;
  growId?: string;
  importBatchId: string;
  preview: VerdantGeneticsParseResult;
}

export interface VerdantGeneticsXlsxInsertRowsResult {
  rows: SensorReadingInsertRow[];
  acceptedRowCount: number;
  rejectedRowCount: number;
  rejectionReasons: Record<string, number>;
  blocked: boolean;
  blockedReason?: "no_readable_sensor_rows" | "missing_tent_mapping";
}

export function buildVerdantGeneticsXlsxInsertRows(
  input: BuildVerdantGeneticsXlsxInsertRowsInput,
): VerdantGeneticsXlsxInsertRowsResult {
  const { tentIdBySensorGroup, growId, importBatchId, preview } = input;
  const previewRows = preview?.rows ?? [];

  if (previewRows.length === 0) {
    return {
      rows: [],
      acceptedRowCount: 0,
      rejectedRowCount: 0,
      rejectionReasons: {},
      blocked: true,
      blockedReason: "no_readable_sensor_rows",
    };
  }

  // Index suspicious flags by (sensor_group|captured_at|metric) for attachment.
  const flagIndex = new Map<
    string,
    Array<{ kind: VerdantGeneticsSuspiciousFlag["kind"]; note: string }>
  >();
  for (const f of preview.suspicious ?? []) {
    if (!f.sensor_group || !f.captured_at || !f.metric) continue;
    const key = `${f.sensor_group}|${f.captured_at}|${f.metric}`;
    const arr = flagIndex.get(key) ?? [];
    arr.push({ kind: f.kind, note: f.note });
    flagIndex.set(key, arr);
  }

  const rows: SensorReadingInsertRow[] = [];
  const rejectionReasons: Record<string, number> = {};
  let rejectedRowCount = 0;

  const bump = (reason: VerdantGeneticsXlsxRejectionReason) => {
    rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
    rejectedRowCount += 1;
  };

  for (const r of previewRows) {
    if (!SUPPORTED_METRICS.has(r.metric)) {
      bump("unsupported_metric");
      continue;
    }
    if (typeof r.value !== "number" || !Number.isFinite(r.value)) {
      bump("non_numeric_value");
      continue;
    }
    const tentId = tentIdBySensorGroup?.[r.sensor_group];
    if (!tentId || typeof tentId !== "string" || tentId.trim() === "") {
      bump("missing_tent_mapping");
      continue;
    }

    rows.push({
      tent_id: tentId,
      metric: r.metric,
      value: r.value,
      captured_at: r.captured_at,
      source: VERDANT_GENETICS_SOURCE_TAG,
      quality: "ok",
      raw_payload: buildRawPayload(r, importBatchId, growId, flagIndex),
    });
  }

  if (rows.length === 0) {
    // All rows rejected. If the dominant reason is missing tent mapping,
    // surface that as the blocker.
    const blockedReason: "missing_tent_mapping" | undefined =
      (rejectionReasons.missing_tent_mapping ?? 0) > 0
        ? "missing_tent_mapping"
        : undefined;
    return {
      rows: [],
      acceptedRowCount: 0,
      rejectedRowCount,
      rejectionReasons: sortKeys(rejectionReasons),
      blocked: blockedReason != null,
      blockedReason,
    };
  }

  return {
    rows,
    acceptedRowCount: rows.length,
    rejectedRowCount,
    rejectionReasons: sortKeys(rejectionReasons),
    blocked: false,
  };
}

function buildRawPayload(
  r: VerdantGeneticsPreviewMetricRow,
  importBatchId: string,
  growId: string | undefined,
  flagIndex: Map<
    string,
    Array<{ kind: VerdantGeneticsSuspiciousFlag["kind"]; note: string }>
  >,
): VerdantGeneticsXlsxInsertRawPayload {
  const payload: VerdantGeneticsXlsxInsertRawPayload = {
    csv_import: true,
    source_app: VERDANT_GENETICS_SOURCE_APP,
    sensor_group: r.sensor_group,
    original_metric_label: r.raw_payload.original_metric_label,
    original_value: r.raw_payload.original_value,
    original_unit: r.raw_payload.original_unit,
    import_batch_id: importBatchId,
  };
  if (growId) payload.grow_id = growId;
  if (r.calculated || r.raw_payload.calculated) payload.calculated = true;
  if (r.raw_payload.extras && Object.keys(r.raw_payload.extras).length > 0) {
    payload.extras = { ...r.raw_payload.extras };
  }
  const flags = flagIndex.get(`${r.sensor_group}|${r.captured_at}|${r.metric}`);
  if (flags && flags.length > 0) payload.suspicious_flags = flags;
  return payload;
}

function sortKeys(o: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(o).sort()) out[k] = o[k];
  return out;
}
