/**
 * sensorHistoryImportAuditEventBuilders — pure helpers that turn successful
 * import adapter results into sanitized audit log inputs.
 *
 * Hard contract:
 *  - Pure. No I/O. No Supabase. No alerts. No Action Queue. No AI.
 *  - Never reads or returns raw_payload, device serials, bridge tokens,
 *    source file contents, internal IDs, or full import batch IDs.
 *  - Returns null when an import should not be audited (blocked / empty).
 */
import type {
  RecordSensorHistoryImportAuditInput,
  SensorHistoryImportSourceAppId,
} from "@/lib/sensorHistoryImportAuditLog";
import type { VerdantGeneticsXlsxInsertRowsResult } from "@/lib/verdantGeneticsXlsxInsertRowsAdapter";
import type { VerdantGeneticsXlsxPreviewViewModel } from "@/lib/verdantGeneticsXlsxPreviewViewModel";
import type { TentOption } from "@/lib/verdantGeneticsXlsxMappingViewModel";
import type { AdapterResult as RegistryAdapterResult } from "@/lib/registryCsvInsertRowsAdapter";

function isoDay(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dateRangeFromRows(
  rows: ReadonlyArray<{ captured_at: string }>,
): { start: string; end: string } | null {
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const r of rows) {
    const t = new Date(r.captured_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < minMs) minMs = t;
    if (t > maxMs) maxMs = t;
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null;
  return {
    start: new Date(minMs).toISOString().slice(0, 10),
    end: new Date(maxMs).toISOString().slice(0, 10),
  };
}

function uniqueTentLabels(
  tentIds: ReadonlyArray<string>,
  tentOptions: ReadonlyArray<TentOption>,
): string[] {
  const lookup = new Map(tentOptions.map((o) => [o.id, o.name]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of tentIds) {
    const label = lookup.get(id);
    if (!label) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export interface BuildXlsxAuditInputArgs {
  previewVm: VerdantGeneticsXlsxPreviewViewModel;
  adapterResult: VerdantGeneticsXlsxInsertRowsResult;
  tentIdBySensorGroup: Record<string, string>;
  tentOptions: ReadonlyArray<TentOption>;
  /** Optional duplicate-aware counts from the batch insert orchestrator. */
  insertedRowCount?: number;
  duplicateRowCount?: number;
}

export function buildVerdantGeneticsXlsxAuditInput(
  args: BuildXlsxAuditInputArgs,
): RecordSensorHistoryImportAuditInput | null {
  const {
    previewVm,
    adapterResult,
    tentIdBySensorGroup,
    tentOptions,
    insertedRowCount,
    duplicateRowCount,
  } = args;
  if (adapterResult.blocked) return null;
  if (adapterResult.acceptedRowCount <= 0) return null;
  const mappedSensorGroups = previewVm.detectedGroups.filter(
    (g) => !!tentIdBySensorGroup[g],
  );
  const mappedTentIds = mappedSensorGroups
    .map((g) => tentIdBySensorGroup[g])
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return {
    sourceAppId: "verdant_genetics_xlsx",
    fileType: "xlsx",
    acceptedRowCount: adapterResult.acceptedRowCount,
    rejectedRowCount: adapterResult.rejectedRowCount,
    ...(typeof insertedRowCount === "number" ? { insertedRowCount } : {}),
    ...(typeof duplicateRowCount === "number" ? { duplicateRowCount } : {}),
    dateRange: previewVm.dateRange ?? null,
    mappedTentLabels: uniqueTentLabels(mappedTentIds, tentOptions),
    mappedSensorGroups,
  };
}

export interface BuildRegistryCsvAuditInputArgs {
  sourceAppId: Extract<
    SensorHistoryImportSourceAppId,
    "spider_farmer" | "vivosun"
  >;
  adapterResult: RegistryAdapterResult;
  tentId: string;
  tentOptions: ReadonlyArray<TentOption>;
  insertedRowCount?: number;
  duplicateRowCount?: number;
}

export function buildRegistryCsvAuditInput(
  args: BuildRegistryCsvAuditInputArgs,
): RecordSensorHistoryImportAuditInput | null {
  const {
    sourceAppId,
    adapterResult,
    tentId,
    tentOptions,
    insertedRowCount,
    duplicateRowCount,
  } = args;
  if (adapterResult.blocked) return null;
  if (adapterResult.acceptedRowCount <= 0) return null;
  const range = dateRangeFromRows(
    adapterResult.rows.map((r) => ({
      captured_at: isoDay(r.captured_at) ? r.captured_at : "",
    })),
  );
  return {
    sourceAppId,
    fileType: "csv",
    acceptedRowCount: adapterResult.acceptedRowCount,
    rejectedRowCount: adapterResult.rejectedRowCount,
    ...(typeof insertedRowCount === "number" ? { insertedRowCount } : {}),
    ...(typeof duplicateRowCount === "number" ? { duplicateRowCount } : {}),
    dateRange: range,
    mappedTentLabels: uniqueTentLabels([tentId], tentOptions),
    mappedSensorGroups: [],
  };
}
