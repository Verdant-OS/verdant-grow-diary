// Pure deterministic CSV builder for EcoWitt dry-run ingest metrics audit export.
// SAFETY: read-only. No network. No Supabase. No Edge calls. No writes.

import { CanonicalEcowittTentSnapshot } from "./ecowittTentSnapshot";
import {
  buildEcowittIngestDryRunFieldMap,
  EcowittDryRunFieldRow,
} from "./ecowittIngestDryRunFieldMap";
import {
  buildEcowittIngestDryRun,
  BuildIngestDryRunOptions,
  EcowittIngestDryRunResult,
} from "./ecowittIngestDryRun";

export const ECOWITT_DRY_RUN_CSV_HEADERS = [
  "metric_key",
  "value",
  "unit",
  "source_field",
  "required",
  "mapping_status",
  "blocking_or_warning",
  "note",
  "not_sent",
  "read_only",
] as const;

const UNIT_BY_METRIC: Record<string, string> = {
  air_temp_f: "F",
  humidity_pct: "%",
  soil_temp_f: "F",
  soil_moisture_pct_primary: "%",
  soil_moisture_pct_secondary: "%",
  captured_at: "iso8601",
  source: "",
  "metadata.root_zone_confidence": "",
  "metadata.degraded_reasons": "count",
  "metadata.invalid_reasons": "count",
};

/** Quote a CSV cell only when it contains a delimiter, quote, or newline. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (s.length === 0) return "";
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function statusForRow(
  row: EcowittDryRunFieldRow,
  dry: EcowittIngestDryRunResult,
): string {
  // blocking trigger?
  const blocking = dry.blocked_reasons.find((b) =>
    b === `missing_required_metric:${row.ingest_key}` ||
    (row.ingest_key === "source" && b === "source_invalid") ||
    (row.ingest_key === "metadata.invalid_reasons" && b.startsWith("invalid_reason:")) ||
    (row.ingest_key === "captured_at" && b.startsWith("stale_snapshot:")),
  );
  if (blocking) return `blocking:${blocking}`;
  const warning = dry.warnings.find((w) =>
    (row.ingest_key === "source" && (w === "source_degraded" || w === "manual_or_csv_not_live")) ||
    (row.ingest_key === "metadata.degraded_reasons" && w.startsWith("degraded_reason:")) ||
    w === `optional_metric_missing:${row.ingest_key}`,
  );
  if (warning) return `warning:${warning}`;
  if (row.status === "missing_required" || row.status === "blocked") {
    return `blocking:${row.status}`;
  }
  if (row.status === "missing_optional" || row.status === "warning") {
    return `warning:${row.status}`;
  }
  return "ok";
}

export interface BuildDryRunCsvOptions extends BuildIngestDryRunOptions {
  /** Allow callers to inject a precomputed dry-run result for determinism in tests. */
  dryRunResult?: EcowittIngestDryRunResult;
}

export function buildEcowittIngestDryRunMetricsCsv(
  snap: CanonicalEcowittTentSnapshot,
  options: BuildDryRunCsvOptions = {},
): string {
  const dry =
    options.dryRunResult ?? buildEcowittIngestDryRun(snap, options);
  const map = buildEcowittIngestDryRunFieldMap(snap);

  const rows: string[] = [];
  rows.push(ECOWITT_DRY_RUN_CSV_HEADERS.map(csvEscape).join(","));

  for (const row of map) {
    const cells = [
      row.ingest_key,
      row.value === null ? "" : String(row.value),
      UNIT_BY_METRIC[row.ingest_key] ?? "",
      row.source_field,
      row.required ? "true" : "false",
      row.status,
      statusForRow(row, dry),
      row.note ?? "",
      "true",
      "true",
    ];
    rows.push(cells.map(csvEscape).join(","));
  }

  // Trailing newline keeps file shape stable in editors.
  return rows.join("\n") + "\n";
}

function safeSlug(s: string | null | undefined, fallback: string): string {
  if (!s) return fallback;
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export function ecowittDryRunMetricsCsvFilename(
  snap: CanonicalEcowittTentSnapshot,
): string {
  const tent = safeSlug(snap.tent_label, "tent");
  const captured = safeSlug(snap.captured_at, "no-captured-at");
  return `ecowitt-dry-run-metrics-${tent}-${captured}.csv`;
}

/**
 * Client-side download. No network. No Supabase. No Edge. No writes.
 */
export function downloadEcowittIngestDryRunMetricsCsv(
  snap: CanonicalEcowittTentSnapshot,
  options: BuildDryRunCsvOptions = {},
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const csv = buildEcowittIngestDryRunMetricsCsv(snap, options);
  const filename = ecowittDryRunMetricsCsvFilename(snap);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
