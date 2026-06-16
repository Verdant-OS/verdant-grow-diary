/**
 * ImportedSensorHistoryPanel
 *
 * Read-only presenter for the Tent Detail "Imported sensor history"
 * section. Renders the CSV-imported subset of the tent's sensor
 * readings with clear CSV/imported/Not-live labels.
 *
 * Safety:
 *   - Never reads or renders `raw_payload`.
 *   - Never classifies imported readings as live.
 *   - No writes. No automation. No alerts. No Action Queue.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  IMPORTED_SENSOR_HISTORY_ANCHOR_ID,
  IMPORTED_SENSOR_HISTORY_EMPTY_COPY,
  IMPORTED_SENSOR_HISTORY_NOT_LIVE_COPY,
  buildImportedSensorHistoryViewModel,
  type ImportedSensorHistoryInputRow,
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

  useEffect(() => {
    if (location.hash !== `#${IMPORTED_SENSOR_HISTORY_ANCHOR_ID}`) return;
    const el = sectionRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.focus?.();
    }
  }, [location.hash]);

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

  const vm = buildImportedSensorHistoryViewModel({ readings, limit });

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
            <div>
              <dt className="text-xs text-muted-foreground">Metrics</dt>
              <dd
                className="text-xs"
                data-testid="imported-history-metrics"
              >
                {vm.metrics.length > 0 ? vm.metrics.join(", ") : "—"}
              </dd>
            </div>
          </dl>

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
