/**
 * AI Doctor — Sensor Summary Drilldown (read-only).
 *
 * Presenter-only. Renders all 9 metrics in canonical order with their
 * latest value, source, captured-at, and freshness state. Source
 * breakdown is rendered in canonical enum order. Missing values are
 * shown as "No trusted value" — never invented.
 *
 * No fetch, no Supabase, no model calls. No device control.
 */
import * as React from "react";
import {
  AI_DOCTOR_METRIC_ORDER,
  AI_DOCTOR_SOURCE_ORDER,
  buildSensorSummaryRows,
  buildSourceBreakdownRows,
  NO_TRUSTED_VALUE_LABEL,
} from "@/lib/aiDoctorPhase1ResultViewModel";
import type { AiDoctorContextPayload } from "@/lib/aiDoctorEnginePhase1Foundation";

export interface AiDoctorSensorSummaryDrilldownProps {
  context: AiDoctorContextPayload;
}

const FRESHNESS_TONE: Record<string, string> = {
  ok: "text-muted-foreground",
  degraded: "text-muted-foreground",
  stale: "text-destructive",
  invalid: "text-destructive",
  missing: "text-muted-foreground",
};

export function AiDoctorSensorSummaryDrilldown(
  props: AiDoctorSensorSummaryDrilldownProps,
): JSX.Element {
  const rows = buildSensorSummaryRows(props.context);
  const sourceRows = buildSourceBreakdownRows(props.context);

  return (
    <section
      data-testid="ai-doctor-sensor-summary-drilldown"
      aria-label="Sensor summary"
      className="rounded-md border border-border bg-card p-4 text-sm"
    >
      <header className="mb-3">
        <h3 className="text-base font-semibold text-foreground">
          Sensor summary
        </h3>
        <p className="text-xs text-muted-foreground">
          Read-only. Missing readings are shown as &ldquo;{NO_TRUSTED_VALUE_LABEL}
          &rdquo; — Verdant never invents values.
        </p>
      </header>

      <ul
        data-testid="ai-doctor-sensor-summary-metrics"
        data-metric-order={AI_DOCTOR_METRIC_ORDER.join(",")}
        className="divide-y divide-border"
      >
        {rows.map((row) => (
          <li
            key={row.metric}
            data-testid={`ai-doctor-metric-row-${row.metric}`}
            data-metric={row.metric}
            data-freshness={row.freshness.kind}
            className="grid grid-cols-1 gap-1 py-2 md:grid-cols-4"
          >
            <div className="font-medium text-foreground">{row.label}</div>
            <div className="text-foreground" data-testid={`ai-doctor-metric-value-${row.metric}`}>
              {row.latestValueDisplay}
            </div>
            <div className="text-muted-foreground" data-testid={`ai-doctor-metric-source-${row.metric}`}>
              {row.latestSourceDisplay}
            </div>
            <div
              className={FRESHNESS_TONE[row.freshness.kind] ?? "text-muted-foreground"}
              data-testid={`ai-doctor-metric-freshness-${row.metric}`}
            >
              {row.freshness.label}
              {row.latestCapturedAtDisplay !== NO_TRUSTED_VALUE_LABEL && (
                <span className="ml-1 text-xs text-muted-foreground">
                  · {row.latestCapturedAtDisplay}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div
        data-testid="ai-doctor-source-breakdown"
        data-source-order={AI_DOCTOR_SOURCE_ORDER.join(",")}
        className="mt-4 border-t border-border pt-3"
      >
        <h4 className="mb-2 text-sm font-semibold text-foreground">
          Source breakdown (7d)
        </h4>
        <ul className="flex flex-wrap gap-2">
          {sourceRows.map((row) => (
            <li
              key={row.source}
              data-testid={`ai-doctor-source-row-${row.source}`}
              data-source={row.source}
              className="rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              {row.label}: {row.count}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
