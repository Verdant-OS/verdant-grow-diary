/**
 * ManualSensorTrendChart — read-only presenter for the
 * "PPFD and environment context" trend view.
 *
 * Renders a calm, accessible table summarizing recent PPFD readings
 * alongside temperature, humidity, and VPD context. No chart library
 * coupling and no canvas; the table is screen-reader-first and the
 * visual hierarchy comes from semantic markup + Tailwind tokens.
 *
 * Strict safety contract:
 *  - No writes, no Supabase calls, no AI/model/provider calls.
 *  - No alerts, Action Queue, or device control.
 *  - No raw payloads, tokens, private IDs, MACs, or bridge IDs.
 *  - Source labels are kept visible. Stale/invalid/demo readings are
 *    flagged, never treated as healthy.
 */
import {
  buildManualSensorTrendChartViewModel,
  type ManualSensorTrendInputRow,
} from "@/lib/manualSensorTrendChartViewModel";

export interface ManualSensorTrendChartProps {
  readings: ReadonlyArray<ManualSensorTrendInputRow>;
  testId?: string;
}

function formatCapturedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ManualSensorTrendChart({
  readings,
  testId = "manual-sensor-trend-chart",
}: ManualSensorTrendChartProps) {
  const vm = buildManualSensorTrendChartViewModel({ readings });

  return (
    <section
      data-testid={testId}
      className="rounded-lg border border-border bg-card p-4"
      aria-labelledby={`${testId}-title`}
    >
      <header className="mb-3">
        <h3
          id={`${testId}-title`}
          className="text-base font-semibold text-foreground"
        >
          {vm.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{vm.description}</p>
      </header>

      {vm.emptyMessage && (
        <p
          data-testid={`${testId}-empty`}
          data-state={vm.state}
          className="text-sm text-muted-foreground"
        >
          {vm.emptyMessage}
        </p>
      )}

      {vm.state === "ready" && (
        <div className="overflow-x-auto" data-testid={`${testId}-table-wrapper`}>
          <table
            data-testid={`${testId}-table`}
            className="w-full text-left text-sm"
          >
            <caption className="sr-only">
              {vm.title}: {vm.description}
            </caption>
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="py-1 pr-3 font-medium">
                  When
                </th>
                {vm.series.map((s) => (
                  <th
                    key={s.metric}
                    scope="col"
                    className="py-1 pr-3 font-medium"
                    data-testid={`${testId}-header-${s.metric}`}
                  >
                    {s.label}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({s.unit})
                    </span>
                  </th>
                ))}
                <th scope="col" className="py-1 font-medium">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {buildRows(vm.series).map((row) => (
                <tr
                  key={row.key}
                  className="border-t border-border"
                  data-testid={`${testId}-row`}
                >
                  <td className="py-1 pr-3 text-foreground">
                    {formatCapturedAt(row.capturedAt)}
                  </td>
                  {vm.series.map((s) => {
                    const cell = row.byMetric[s.metric];
                    return (
                      <td
                        key={s.metric}
                        className="py-1 pr-3 text-foreground"
                        data-testid={`${testId}-cell-${s.metric}`}
                      >
                        {cell ? cell.display : "—"}
                      </td>
                    );
                  })}
                  <td className="py-1 text-foreground">
                    {row.sourceLabel ?? row.source ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vm.flagged.length > 0 && (
        <div
          className="mt-3 rounded-md border border-dashed border-border p-2"
          data-testid={`${testId}-flagged`}
        >
          <p className="text-xs font-medium text-muted-foreground">
            Flagged readings (not used as trend context):
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {vm.flagged.map((p, idx) => (
              <li
                key={`${p.capturedAt}-${p.metric}-${idx}`}
                data-testid={`${testId}-flagged-item`}
                data-source={p.source}
              >
                <span className="font-medium uppercase">{p.source}</span> ·{" "}
                {p.metric} · {p.display} ·{" "}
                <time dateTime={p.capturedAt}>
                  {formatCapturedAt(p.capturedAt)}
                </time>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface BuiltRow {
  key: string;
  capturedAt: string;
  source: string | null;
  sourceLabel: string | null;
  byMetric: Record<
    string,
    { display: string } | undefined
  >;
}

function buildRows(
  series: ReturnType<typeof buildManualSensorTrendChartViewModel>["series"],
): BuiltRow[] {
  const byTs = new Map<string, BuiltRow>();
  for (const s of series) {
    for (const p of s.points) {
      const existing = byTs.get(p.capturedAt);
      if (existing) {
        existing.byMetric[p.metric] = { display: p.display };
        // Prefer a non-null source label if not already set.
        if (!existing.sourceLabel && p.sourceLabel) {
          existing.sourceLabel = p.sourceLabel;
        }
      } else {
        byTs.set(p.capturedAt, {
          key: p.capturedAt,
          capturedAt: p.capturedAt,
          source: p.source,
          sourceLabel: p.sourceLabel ?? null,
          byMetric: { [p.metric]: { display: p.display } },
        });
      }
    }
  }
  return Array.from(byTs.values()).sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
}

export default ManualSensorTrendChart;
