/**
 * SensorIngestAuditReport — presenter-only. Read-only.
 * - Last-N selector (10 / 25 / 50, default 25), local-only filter unless
 *   parent provides onPageSizeChange to refetch.
 * - Raw-payload preview is collapsed by default; opened previews are
 *   ALWAYS run through buildSafeRawPayloadPreview, which hides anything
 *   that still looks secret after redaction.
 * - Never writes. Never stores or logs raw payloads. Never puts raw
 *   payload in data-* attributes.
 */
import { useMemo, useState } from "react";
import { formatVpdKpa } from "@/lib/vpdCalculationRules";
import {
  buildSensorIngestAuditReportViewModel,
} from "@/lib/sensorIngestAuditReportViewModel";
import {
  AUDIT_REPORT_DEFAULT_PAGE_SIZE,
  AUDIT_REPORT_PAGE_SIZES,
  REJECTED_NOT_PERSISTED_NOTE,
  buildSafeRawPayloadPreview,
  type AuditReportInput,
  type AuditReportPageSize,
} from "@/lib/sensorIngestAuditReportRules";

export interface SensorIngestAuditReportProps {
  input: Omit<AuditReportInput, "pageSize">;
  /** Optional initial page size; defaults to 25. */
  initialPageSize?: AuditReportPageSize;
  /** Optional callback when operator changes page size (for refetch). */
  onPageSizeChange?: (n: AuditReportPageSize) => void;
  className?: string;
}

function isPageSize(n: number): n is AuditReportPageSize {
  return (AUDIT_REPORT_PAGE_SIZES as ReadonlyArray<number>).includes(n);
}

export default function SensorIngestAuditReport({
  input,
  initialPageSize = AUDIT_REPORT_DEFAULT_PAGE_SIZE,
  onPageSizeChange,
  className,
}: SensorIngestAuditReportProps) {
  const [pageSize, setPageSize] = useState<AuditReportPageSize>(initialPageSize);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const vm = useMemo(
    () => buildSensorIngestAuditReportViewModel({ ...input, pageSize }),
    [input, pageSize],
  );

  const rawById = useMemo(() => {
    const m = new Map<string, unknown>();
    for (const r of input.rows) {
      const id = r.id ?? null;
      if (id) m.set(id, r.raw_payload);
    }
    return m;
  }, [input.rows]);

  return (
    <section
      data-testid="sensor-ingest-audit-report"
      data-page-size={pageSize}
      className={["flex flex-col gap-2 p-3 border rounded-md bg-card", className]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Sensor ingest audit</h3>
        <div className="flex items-center gap-2 text-xs">
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
        </div>
      </header>
      <p data-testid="audit-rejected-note" className="text-[11px] text-muted-foreground">
        {REJECTED_NOT_PERSISTED_NOTE}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left p-1">captured_at</th>
              <th className="text-left p-1">accepted</th>
              <th className="text-left p-1">reason</th>
              <th className="text-left p-1">source</th>
              <th className="text-left p-1">provider</th>
              <th className="text-left p-1">transport</th>
              <th className="text-left p-1">tent</th>
              <th className="text-left p-1">plant</th>
              <th className="text-left p-1">metric</th>
              <th className="text-left p-1">vpd</th>
              <th className="text-left p-1">soil%</th>
              <th className="text-left p-1">freshness</th>
              <th className="text-left p-1">raw</th>
            </tr>
          </thead>
          <tbody>
            {vm.report.rows.map((r) => {
              const isOpen = openRowId === r.id;
              const preview = isOpen ? buildSafeRawPayloadPreview(rawById.get(r.id)) : null;
              return (
                <>
                  <tr
                    key={r.id}
                    data-testid={`audit-row-${r.id}`}
                    data-source={r.source}
                    data-provider={r.provider ?? ""}
                    data-freshness={r.freshness}
                    className="border-t border-border/50"
                  >
                    <td className="p-1">{r.capturedAt ?? "—"}</td>
                    <td className="p-1">{r.accepted ? "yes" : "no"}</td>
                    <td className="p-1">{r.reason}</td>
                    <td className="p-1">{r.source}</td>
                    <td className="p-1">{r.provider ?? "—"}</td>
                    <td className="p-1">{r.transport ?? "—"}</td>
                    <td className="p-1">{r.tentId ?? "—"}</td>
                    <td className="p-1">{r.plantId ?? "—"}</td>
                    <td className="p-1">{r.metricSummary}</td>
                    <td className="p-1" data-testid={`audit-row-${r.id}-vpd`}>
                      {r.vpdKpa === null ? "" : formatVpdKpa(r.vpdKpa)}
                    </td>
                    <td className="p-1">{r.soilMoisturePct ?? ""}</td>
                    <td className="p-1">{r.freshness}</td>
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
                      <td colSpan={13} className="p-2 bg-muted/30">
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
