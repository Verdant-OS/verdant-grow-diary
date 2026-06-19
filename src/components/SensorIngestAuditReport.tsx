/**
 * SensorIngestAuditReport — presenter-only. Read-only.
 * Consumes the pure audit view model. Never writes. Redacts raw payloads.
 */
import { formatVpdKpa } from "@/lib/vpdCalculationRules";
import {
  buildSensorIngestAuditReportViewModel,
} from "@/lib/sensorIngestAuditReportViewModel";
import {
  REJECTED_NOT_PERSISTED_NOTE,
  type AuditReportInput,
} from "@/lib/sensorIngestAuditReportRules";

export interface SensorIngestAuditReportProps {
  input: AuditReportInput;
  onPageSizeChange?: (n: number) => void;
  className?: string;
}

export default function SensorIngestAuditReport({
  input,
  onPageSizeChange,
  className,
}: SensorIngestAuditReportProps) {
  const vm = buildSensorIngestAuditReportViewModel(input);
  return (
    <section
      data-testid="sensor-ingest-audit-report"
      className={["flex flex-col gap-2 p-3 border rounded-md bg-card", className]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Sensor ingest audit</h3>
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="audit-page-size" className="text-muted-foreground">
            Show
          </label>
          <select
            id="audit-page-size"
            data-testid="audit-page-size"
            className="bg-background border rounded px-1 py-0.5"
            value={vm.report.pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
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
            </tr>
          </thead>
          <tbody>
            {vm.report.rows.map((r) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
