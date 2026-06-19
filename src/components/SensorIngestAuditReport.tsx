/**
 * SensorIngestAuditReport — presenter-only. Read-only.
 * - Local-only filters: provider, captured_at range, device/station
 *   search (safe display id only). Filtering operates ONLY on rows
 *   already supplied to the component — never triggers a refetch.
 * - Last-N selector (10 / 25 / 50, default 25).
 * - Raw-payload preview is collapsed by default; opened previews are
 *   ALWAYS run through buildSafeRawPayloadPreview, which hides anything
 *   that still looks secret after redaction.
 * - Operator-only CSV export (gated by `operatorMode` prop). Export
 *   uses the currently filtered/selected rows; rejected ingest attempts
 *   are never persisted and therefore never exported.
 * - Never writes. Never stores or logs raw payloads. Never puts raw
 *   payload in data-* attributes.
 */
import { useMemo, useState } from "react";
import { formatVpdKpa } from "@/lib/vpdCalculationRules";
import CanonicalSourceBadge from "@/components/CanonicalSourceBadge";
import {
  buildSensorIngestAuditReportViewModel,
  AUDIT_REPORT_EMPTY_NO_READINGS,
  AUDIT_REPORT_EMPTY_HINT,
  AUDIT_REPORT_EMPTY_FILTERS,
} from "@/lib/sensorIngestAuditReportViewModel";
import {
  AUDIT_REPORT_DEFAULT_PAGE_SIZE,
  AUDIT_REPORT_PAGE_SIZES,
  REJECTED_NOT_PERSISTED_NOTE,
  buildSafeRawPayloadPreview,
  type AuditReportInput,
  type AuditReportPageSize,
  type AuditReportFilters,
} from "@/lib/sensorIngestAuditReportRules";
import {
  AUDIT_CSV_FILENAME,
  buildSensorIngestAuditCsv,
} from "@/lib/sensorIngestAuditReportCsvExport";

export interface SensorIngestAuditReportProps {
  input: Omit<AuditReportInput, "pageSize" | "filters">;
  /** Optional initial page size; defaults to 25. */
  initialPageSize?: AuditReportPageSize;
  /** Optional callback when operator changes page size (for refetch). */
  onPageSizeChange?: (n: AuditReportPageSize) => void;
  /** Enables CSV export. Pass true ONLY from operator-gated surfaces. */
  operatorMode?: boolean;
  className?: string;
}

function isPageSize(n: number): n is AuditReportPageSize {
  return (AUDIT_REPORT_PAGE_SIZES as ReadonlyArray<number>).includes(n);
}

export default function SensorIngestAuditReport({
  input,
  initialPageSize = AUDIT_REPORT_DEFAULT_PAGE_SIZE,
  onPageSizeChange,
  operatorMode = false,
  className,
}: SensorIngestAuditReportProps) {
  const [pageSize, setPageSize] = useState<AuditReportPageSize>(initialPageSize);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [capturedFrom, setCapturedFrom] = useState<string>("");
  const [capturedTo, setCapturedTo] = useState<string>("");
  const [deviceQuery, setDeviceQuery] = useState<string>("");

  const filters: AuditReportFilters = {
    provider: providerFilter,
    capturedFromIso: capturedFrom ? new Date(capturedFrom).toISOString() : null,
    capturedToIso: capturedTo ? new Date(capturedTo).toISOString() : null,
    deviceStationQuery: deviceQuery || null,
  };

  const vm = useMemo(
    () => buildSensorIngestAuditReportViewModel({ ...input, pageSize, filters }),
    [input, pageSize, providerFilter, capturedFrom, capturedTo, deviceQuery],
  );

  const rawById = useMemo(() => {
    const m = new Map<string, unknown>();
    for (const r of input.rows) {
      const id = r.id ?? null;
      if (id) m.set(id, r.raw_payload);
    }
    return m;
  }, [input.rows]);

  function handleCsvExport() {
    const { csv, filename } = buildSensorIngestAuditCsv(vm.report.rows, {
      filename: AUDIT_CSV_FILENAME,
    });
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Operator surfaces have no fallback I/O; quietly no-op.
    }
  }

  return (
    <section
      data-testid="sensor-ingest-audit-report"
      data-page-size={pageSize}
      data-operator-mode={operatorMode ? "true" : "false"}
      data-filtered-total={vm.filteredTotal}
      className={["flex flex-col gap-2 p-3 border rounded-md bg-card", className]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Sensor ingest audit</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label htmlFor="audit-provider-filter" className="text-muted-foreground">
            Provider
          </label>
          <select
            id="audit-provider-filter"
            data-testid="audit-provider-filter"
            className="bg-background border rounded px-1 py-0.5"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <option value="all">all</option>
            {vm.availableProviders.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label htmlFor="audit-from" className="text-muted-foreground">
            From
          </label>
          <input
            id="audit-from"
            data-testid="audit-captured-from"
            type="datetime-local"
            className="bg-background border rounded px-1 py-0.5"
            value={capturedFrom}
            onChange={(e) => setCapturedFrom(e.target.value)}
          />
          <label htmlFor="audit-to" className="text-muted-foreground">
            To
          </label>
          <input
            id="audit-to"
            data-testid="audit-captured-to"
            type="datetime-local"
            className="bg-background border rounded px-1 py-0.5"
            value={capturedTo}
            onChange={(e) => setCapturedTo(e.target.value)}
          />
          <label htmlFor="audit-device" className="text-muted-foreground">
            Device
          </label>
          <input
            id="audit-device"
            data-testid="audit-device-query"
            type="search"
            placeholder="safe display id"
            className="bg-background border rounded px-1 py-0.5"
            value={deviceQuery}
            onChange={(e) => setDeviceQuery(e.target.value)}
          />
          <label htmlFor="audit-page-size" className="text-muted-foreground">
            Show last
          </label>
          <select
            id="audit-page-size"
            data-testid="audit-page-size"
            className="bg-background border rounded px-1 py-0.5"
            value={pageSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (isPageSize(n)) {
                setPageSize(n);
                onPageSizeChange?.(n);
              }
            }}
          >
            {vm.availablePageSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {operatorMode && (
            <button
              type="button"
              data-testid="audit-csv-export"
              onClick={handleCsvExport}
              className="border rounded px-2 py-0.5 text-muted-foreground hover:text-foreground"
            >
              Export CSV
            </button>
          )}
        </div>
      </header>
      <p data-testid="audit-rejected-note" className="text-[11px] text-muted-foreground">
        {REJECTED_NOT_PERSISTED_NOTE}
      </p>
      {vm.isEmptyInput && (
        <div
          data-testid="audit-empty-no-readings"
          className="rounded border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1"
        >
          <p className="font-medium text-foreground">{AUDIT_REPORT_EMPTY_NO_READINGS}</p>
          <p>{AUDIT_REPORT_EMPTY_HINT}</p>
          <p>Unknown state needs verification before being treated as healthy.</p>
        </div>
      )}
      {vm.isEmptyAfterFilters && (
        <p
          data-testid="audit-empty-after-filters"
          className="text-xs text-muted-foreground"
        >
          {AUDIT_REPORT_EMPTY_FILTERS}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left p-1">captured_at</th>
              <th className="text-left p-1">accepted</th>
              <th className="text-left p-1">reason</th>
              <th className="text-left p-1">source</th>
              <th className="text-left p-1">transport</th>
              <th className="text-left p-1">tent</th>
              <th className="text-left p-1">plant</th>
              <th className="text-left p-1">metric</th>
              <th className="text-left p-1">vpd</th>
              <th className="text-left p-1">soil%</th>
              <th className="text-left p-1">humidity%</th>
              <th className="text-left p-1">temp°C</th>
              <th className="text-left p-1">freshness</th>
              <th className="text-left p-1">device</th>
              <th className="text-left p-1">raw</th>
            </tr>
          </thead>
          <tbody>
            {vm.report.rows.map((r) => {
              const isOpen = openRowId === r.id;
              const preview = isOpen ? buildSafeRawPayloadPreview(rawById.get(r.id)) : null;
              return (
                <Fragment key={r.id}>
                  <tr
                    data-testid={`audit-row-${r.id}`}
                    data-source={r.source}
                    data-provider={r.provider ?? ""}
                    data-freshness={r.freshness}
                    className="border-t border-border/50"
                  >
                    <td className="p-1">{r.capturedAt ?? "—"}</td>
                    <td className="p-1">{r.accepted ? "yes" : "no"}</td>
                    <td className="p-1">{r.reason}</td>
                    <td className="p-1">
                      <CanonicalSourceBadge
                        testId={`audit-row-${r.id}-source-badge`}
                        source={r.source}
                        provider={r.provider}
                      />
                    </td>
                    <td className="p-1">{r.transport ?? "—"}</td>
                    <td className="p-1">{r.tentId ?? "—"}</td>
                    <td className="p-1">{r.plantId ?? "—"}</td>
                    <td className="p-1">{r.metricSummary}</td>
                    <td className="p-1" data-testid={`audit-row-${r.id}-vpd`}>
                      {r.vpdKpa === null ? "" : formatVpdKpa(r.vpdKpa)}
                    </td>
                    <td className="p-1">{r.soilMoisturePct ?? ""}</td>
                    <td className="p-1">{r.humidityPct ?? ""}</td>
                    <td className="p-1">{r.airTemperatureC ?? ""}</td>
                    <td className="p-1">{r.freshness}</td>
                    <td className="p-1" data-testid={`audit-row-${r.id}-device`}>
                      {r.deviceStationDisplayId ?? "Not available"}
                    </td>
                    <td className="p-1">
                      <button
                        type="button"
                        data-testid={`audit-row-${r.id}-toggle-raw`}
                        className="underline text-muted-foreground hover:text-foreground"
                        onClick={() => setOpenRowId(isOpen ? null : r.id)}
                      >
                        {isOpen ? "hide" : "preview"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && preview && (
                    <tr data-testid={`audit-row-${r.id}-raw`}>
                      <td colSpan={15} className="p-2 bg-muted/30">
                        {preview.safe ? (
                          <>
                            <p className="text-[10px] text-muted-foreground mb-1">
                              {preview.reason}
                            </p>
                            <pre
                              data-testid={`audit-row-${r.id}-raw-preview`}
                              className="text-[10px] whitespace-pre-wrap break-all"
                            >
                              {preview.preview}
                            </pre>
                          </>
                        ) : (
                          <p
                            data-testid={`audit-row-${r.id}-raw-hidden`}
                            className="text-[11px] text-amber-300"
                          >
                            {preview.reason}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
