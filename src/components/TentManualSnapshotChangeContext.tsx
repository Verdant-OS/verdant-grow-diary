/**
 * Read-only "what moved since the previous manual snapshot" badge for a
 * tent. Renders nothing when there are no manual snapshots for the tent.
 *
 * - Pure render. All delta/math logic lives in
 *   `manualSensorSnapshotChangeContextRules.ts`.
 * - Compares only same-tent manual snapshots.
 * - Never implies plant health, quality, or completion.
 * - Never reads or writes notes, alert rows, queued actions, or hardware
 *   control surfaces. No persistence, no RPC, no service_role.
 */
import { Gauge } from "lucide-react";
import type { SensorReadingRow } from "@/lib/db";
import {
  deriveChangeContextFromReadings,
  type ChangeContextReading,
} from "@/lib/manualSensorSnapshotChangeContextRules";

interface Props {
  tentId: string | null | undefined;
  readings: ReadonlyArray<SensorReadingRow>;
}

export default function TentManualSnapshotChangeContext({ tentId, readings }: Props) {
  if (!tentId) return null;

  const rows: ChangeContextReading[] = readings.map((r) => ({
    ts: r.ts,
    metric: r.metric as string,
    value: r.value as number | null | undefined,
    source: r.source as string | null | undefined,
    tent_id: r.tent_id as string | null | undefined,
  }));

  // Only render anything if at least one manual snapshot exists for this tent.
  const hasAnyManual = rows.some(
    (r) => r.source === "manual" && r.tent_id === tentId,
  );
  if (!hasAnyManual) return null;

  const ctx = deriveChangeContextFromReadings(rows, { tentId });

  if (ctx.firstSnapshot) {
    return (
      <div
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground"
        data-testid="tent-manual-snapshot-change-context"
        data-state="first-snapshot"
      >
        <Gauge className="h-3 w-3" />
        First snapshot for this tent
      </div>
    );
  }

  if (ctx.deltas.length === 0) return null;

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      data-testid="tent-manual-snapshot-change-context"
      data-state="changed"
    >
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Gauge className="h-3 w-3" />
        Changed since previous snapshot
      </span>
      {ctx.deltas.map((d) => (
        <span
          key={d.key}
          data-testid="tent-manual-snapshot-change-context-delta"
          data-metric={d.key}
          data-direction={d.direction}
          className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <span className="font-medium text-foreground/80">{d.label}</span>
          <span>{d.formatted}</span>
        </span>
      ))}
    </div>
  );
}
