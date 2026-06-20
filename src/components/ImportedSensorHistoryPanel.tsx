/**
 * ImportedSensorHistoryPanel
 *
 * Read-only presenter for the Tent Detail "Imported sensor history"
 * section. Renders the CSV-imported subset of the tent's sensor
 * readings with clear CSV/imported/Not-live labels.
 *
 * Local-only metric filtering. No new queries, no query params, no
 * route changes. Logic lives in importedSensorHistoryViewModel.
 *
 * Safety:
 *   - Never reads or renders `raw_payload`.
 *   - Never classifies imported readings as live.
 *   - No writes. No automation. No alerts. No Action Queue.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  IMPORTED_SENSOR_HISTORY_ALL_METRICS,
  IMPORTED_SENSOR_HISTORY_ANCHOR_ID,
  IMPORTED_SENSOR_HISTORY_EMPTY_COPY,
  IMPORTED_SENSOR_HISTORY_NOT_LIVE_COPY,
  buildImportedSensorHistoryViewModel,
  type ImportedSensorHistoryInputRow,
  type ImportedSensorHistoryMetricFilter,
} from "@/lib/importedSensorHistoryViewModel";

interface Props {
  tentId: string | null | undefined;
  readings: ReadonlyArray<ImportedSensorHistoryInputRow>;
  /** Optional cap for the recent-rows table. Defaults to view-model default. */
  limit?: number;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ImportedSensorHistoryPanel({
  tentId,
  readings,
  limit,
}: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const [selectedMetric, setSelectedMetric] =
    useState<ImportedSensorHistoryMetricFilter>(
      IMPORTED_SENSOR_HISTORY_ALL_METRICS,
    );

  useEffect(() => {
    if (location.hash !== `#${IMPORTED_SENSOR_HISTORY_ANCHOR_ID}`) return;
    const el = sectionRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.focus?.();
    }
  }, [location.hash]);

  const vm = useMemo(
    () =>
      buildImportedSensorHistoryViewModel({
        readings,
        limit,
        selectedMetric,
      }),
    [readings, limit, selectedMetric],
  );

  // Safe empty render when no tent context. Still keeps the anchor target
  // present so the CTA navigation does not 404 the scroll.
  if (!tentId) {
    return (
      <section
        id={IMPORTED_SENSOR_HISTORY_ANCHOR_ID}
        ref={sectionRef}
        tabIndex={-1}
        aria-label="Imported sensor history"
        data-testid="imported-sensor-history-panel"
        className="border rounded-md p-4 space-y-2"
      >
        <h2 className="text-base font-semibold">Imported sensor history</h2>
        <p className="text-sm text-muted-foreground">
          {IMPORTED_SENSOR_HISTORY_EMPTY_COPY}
        </p>
      </section>
    );
  }

  return (
    <section
      id={IMPORTED_SENSOR_HISTORY_ANCHOR_ID}
      ref={sectionRef}
      tabIndex={-1}
      aria-label="Imported sensor history"
      data-testid="imported-sensor-history-panel"
      className="border rounded-md p-4 space-y-3"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Imported sensor history</h2>
        <Badge variant="secondary" data-testid="imported-history-source-badge">
          Source: CSV
        </Badge>
        <Badge variant="outline" data-testid="imported-history-not-live-badge">
          {IMPORTED_SENSOR_HISTORY_NOT_LIVE_COPY}
        </Badge>
      </header>
      <div
        role="note"
        data-testid="imported-history-readonly-banner"
        className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200"
      >
        Read-only CSV history. These readings are shown only when explicitly
        labeled as csv. They are historical context, not live sensor data, and
        they do not write new readings or control equipment.
      </div>

      {vm.isEmpty ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="imported-history-empty"
        >
          {IMPORTED_SENSOR_HISTORY_EMPTY_COPY}
        </p>
      ) : (
        <>
          <dl
            className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"
            data-testid="imported-history-summary"
          >
            <div>
              <dt className="text-xs text-muted-foreground">Total readings</dt>
              <dd
                className="font-medium"
                data-testid="imported-history-total"
              >
                {vm.totalCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Visible</dt>
              <dd
                className="font-medium"
                data-testid="imported-history-visible"
              >
                {vm.visibleCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Earliest</dt>
              <dd data-testid="imported-history-earliest">
                {formatTimestamp(vm.earliestCapturedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Latest</dt>
              <dd data-testid="imported-history-latest">
                {formatTimestamp(vm.latestCapturedAt)}
              </dd>
            </div>
          </dl>

          {vm.metrics.length > 0 ? (
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Filter imported readings by metric"
              data-testid="imported-history-metric-filters"
            >
              {vm.metricOptions.map((opt) => {
                const isActive = vm.selectedMetric === opt.id;
                return (
                  <Button
                    key={opt.id}
                    type="button"
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    aria-pressed={isActive}
                    data-testid={`imported-history-metric-filter-${opt.id}`}
                    onClick={() => setSelectedMetric(opt.id)}
                  >
                    {opt.label}
                    <span className="ml-1 text-xs opacity-70">({opt.count})</span>
                  </Button>
                );
              })}
            </div>
          ) : null}

          <div
            className="overflow-x-auto"
            data-testid="imported-history-recent-rows"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">Captured at</th>
                  <th className="py-1 pr-2">Metric</th>
                  <th className="py-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {vm.recentRows.map((r, i) => (
                  <tr
                    key={`${r.capturedAt}-${r.metric}-${i}`}
                    className="border-t border-border/40"
                  >
                    <td className="py-1 pr-2">{formatTimestamp(r.capturedAt)}</td>
                    <td className="py-1 pr-2">{r.metric}</td>
                    <td className="py-1">{r.value ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Read-only view of CSV-imported sensor history. {IMPORTED_SENSOR_HISTORY_NOT_LIVE_COPY}.
          </p>
        </>
      )}
    </section>
  );
}
