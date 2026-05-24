/**
 * Read-only compact list of recent manual sensor snapshots for a tent.
 *
 * - Pure render. Filtering/grouping/delta logic lives in
 *   `manualSensorSnapshotHistoryListRules.ts` and
 *   `manualSensorSnapshotChangeContextRules.ts`.
 * - Only manual-source rows for the active tent are surfaced — demo,
 *   live, imported, csv, pi_bridge, home_assistant, mqtt, api are excluded
 *   by the rule helpers.
 * - Never implies plant health, quality, or completion.
 * - Never reads or writes notes, alert rows, queued actions, or hardware
 *   control surfaces. No persistence and no privileged backend access.
 */
import { format } from "date-fns";
import { Gauge, History } from "lucide-react";
import type { SensorReadingRow } from "@/lib/db";
import {
  buildManualSnapshotHistoryList,
  DEFAULT_HISTORY_LIMIT,
} from "@/lib/manualSensorSnapshotHistoryListRules";
import type { ChangeContextReading } from "@/lib/manualSensorSnapshotChangeContextRules";

interface Props {
  tentId: string | null | undefined;
  readings: ReadonlyArray<SensorReadingRow>;
  limit?: number;
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return ts;
  return format(d, "MMM d, yyyy · h:mm a");
}

export default function TentManualSnapshotHistoryList({
  tentId,
  readings,
  limit = DEFAULT_HISTORY_LIMIT,
}: Props) {
  if (!tentId) return null;

  const rows: ChangeContextReading[] = readings.map((r) => ({
    ts: r.ts,
    metric: r.metric as string,
    value: r.value as number | null | undefined,
    source: r.source as string | null | undefined,
    tent_id: r.tent_id as string | null | undefined,
  }));

  const entries = buildManualSnapshotHistoryList(rows, { tentId, limit });

  return (
    <div
      className="glass rounded-2xl p-4 mb-6"
      data-testid="tent-manual-snapshot-history"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <History className="h-4 w-4" />
          Recent manual snapshots
        </h2>
      </div>

      {entries.length === 0 ? (
        <p
          className="text-sm text-muted-foreground py-2"
          data-testid="tent-manual-snapshot-history-empty"
        >
          No manual snapshots saved yet for this tent.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li
              key={e.ts}
              data-testid="tent-manual-snapshot-history-item"
              data-first-snapshot={e.firstSnapshot ? "true" : "false"}
              className="rounded-xl border border-border/40 bg-secondary/20 p-3"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className="text-xs text-muted-foreground"
                  data-testid="tent-manual-snapshot-history-ts"
                >
                  {formatTs(e.ts)}
                </span>
                <span
                  className="rounded-md border border-border/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                  data-testid="tent-manual-snapshot-history-source"
                >
                  Manual
                </span>
              </div>

              {e.metrics.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {e.metrics.map((m) => (
                    <span
                      key={m.key}
                      data-testid="tent-manual-snapshot-history-metric"
                      data-metric={m.key}
                      className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[11px]"
                    >
                      <span className="font-medium text-foreground/80">
                        {m.label}
                      </span>
                      <span className="text-muted-foreground">{m.formatted}</span>
                    </span>
                  ))}
                </div>
              )}

              {e.firstSnapshot ? (
                <div
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                  data-testid="tent-manual-snapshot-history-change"
                  data-state="first-snapshot"
                >
                  <Gauge className="h-3 w-3" />
                  First snapshot for this tent
                </div>
              ) : e.deltas.length > 0 ? (
                <div
                  className="mt-2 flex flex-wrap items-center gap-1.5"
                  data-testid="tent-manual-snapshot-history-change"
                  data-state="changed"
                >
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Gauge className="h-3 w-3" />
                    Changed since previous snapshot
                  </span>
                  {e.deltas.map((d) => (
                    <span
                      key={d.key}
                      data-testid="tent-manual-snapshot-history-delta"
                      data-metric={d.key}
                      data-direction={d.direction}
                      className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      <span className="font-medium text-foreground/80">
                        {d.label}
                      </span>
                      <span>{d.formatted}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
