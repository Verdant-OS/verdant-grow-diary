/**
 * AI Doctor Imported History Disclosure Panel.
 *
 * Presenter-only. Renders a safe, read-only summary that AI Doctor used
 * imported CSV/XLSX history as historical context.
 *
 * Hard rules:
 *  - No Supabase, no model client, no Edge Function calls.
 *  - No writes, no alerts, no Action Queue mutations, no device control.
 *  - Never renders raw_payload, raw_row, device serials, bridge tokens,
 *    source file names, import batch IDs, or internal IDs.
 */
import * as React from "react";
import type { PlantContextPayload } from "@/lib/aiDoctorContextCompiler";
import {
  buildAiDoctorImportedHistoryDisclosureViewModel,
  type ImportedHistoryDisclosureViewModel,
} from "@/lib/aiDoctorImportedHistoryDisclosureViewModel";

export interface AiDoctorImportedHistoryDisclosurePanelProps {
  context?: Pick<
    PlantContextPayload,
    "imported_sensor_history" | "missingLiveSensorReadings"
  > | null;
  /** Pre-built view model, used by tests and advanced callers. */
  viewModel?: ImportedHistoryDisclosureViewModel;
}

export function AiDoctorImportedHistoryDisclosurePanel({
  context,
  viewModel,
}: AiDoctorImportedHistoryDisclosurePanelProps): JSX.Element | null {
  const vm =
    viewModel ?? buildAiDoctorImportedHistoryDisclosureViewModel(context ?? null);
  if (!vm.visible) return null;

  return (
    <section
      data-testid="ai-doctor-imported-history-disclosure"
      className="rounded-md border border-border bg-muted/30 p-4 space-y-2 text-foreground"
      aria-label={vm.title}
    >
      <h3 className="text-sm font-semibold">{vm.title}</h3>
      <p className="text-sm">{vm.body}</p>

      <dl className="text-xs space-y-1">
        <div>
          <dt className="inline font-medium">Source label: </dt>
          <dd
            className="inline"
            data-testid="ai-doctor-imported-history-source-label"
          >
            {vm.sourceLabel}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Vendors: </dt>
          <dd
            className="inline"
            data-testid="ai-doctor-imported-history-vendors"
          >
            {vm.vendorLabels.length > 0
              ? vm.vendorLabels.join(", ")
              : "unknown vendor"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Date range: </dt>
          <dd
            className="inline"
            data-testid="ai-doctor-imported-history-date-range"
          >
            {vm.dateRange
              ? `${vm.dateRange.earliest} → ${vm.dateRange.latest}`
              : "unknown"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Total readings: </dt>
          <dd
            className="inline"
            data-testid="ai-doctor-imported-history-total-readings"
          >
            {vm.totalReadings}
          </dd>
        </div>
        {vm.showSuspiciousFlags ? (
          <div>
            <dt className="inline font-medium">Suspicious flags: </dt>
            <dd
              className="inline"
              data-testid="ai-doctor-imported-history-suspicious-flags"
            >
              {vm.suspiciousFlagCount}
            </dd>
          </div>
        ) : null}
      </dl>

      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Metrics summarized
        </p>
        {vm.metrics.length === 0 ? (
          <p
            data-testid="ai-doctor-imported-history-metrics-empty"
            className="text-xs italic text-muted-foreground"
          >
            No metric summaries.
          </p>
        ) : (
          <ul
            data-testid="ai-doctor-imported-history-metrics"
            className="list-disc pl-5 text-xs space-y-0.5"
          >
            {vm.metrics.map((m, i) => (
              <li key={`imp-hist-metric-${i}`}>
                {m.metric}
                {m.unit ? ` (${m.unit})` : ""}: min={m.min}, max={m.max}, avg=
                {m.avg}, n={m.count}
              </li>
            ))}
          </ul>
        )}
      </div>

      {vm.showMissingLiveWarning && vm.missingLiveWarning ? (
        <p
          data-testid="ai-doctor-imported-history-missing-live-warning"
          className="text-sm text-foreground"
          role="status"
        >
          {vm.missingLiveWarning}
        </p>
      ) : null}
    </section>
  );
}

export default AiDoctorImportedHistoryDisclosurePanel;
