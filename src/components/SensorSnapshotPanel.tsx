/**
 * SensorSnapshotPanel — read-only display of sensor snapshots for a tent.
 *
 * - Accepts an explicit `snapshots` prop, or falls back to mock data when
 *   `mode="mock"` and no snapshots are provided.
 * - Clearly labels mock-backed data as "Mock data".
 * - Scopes all rendered rows to the provided `tentId`.
 * - Loading state rendered when `mode="loading"`.
 * - Empty state rendered when no snapshots match the active tent.
 * - No write, control, or device-action affordances of any kind.
 */
import { Gauge } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { sensorReadings, type SensorReading } from "@/mock";

export interface SensorSnapshotItem {
  ts: string;
  tentId: string;
  temp: number | null;
  rh: number | null;
  vpd: number | null;
  co2: number | null;
  soil?: number | null;
}

interface Props {
  tentId: string;
  mode: "mock" | "live" | "loading";
  snapshots?: SensorSnapshotItem[];
}

function toItem(r: SensorReading): SensorSnapshotItem {
  return {
    ts: r.ts,
    tentId: r.tentId,
    temp: r.temp,
    rh: r.rh,
    vpd: r.vpd,
    co2: r.co2,
    soil: r.soil,
  };
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return ts;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function SensorSnapshotPanel({ tentId, mode, snapshots }: Props) {
  if (mode === "loading") {
    return (
      <div
        className="glass rounded-2xl p-4"
        data-testid="sensor-snapshot-panel"
        data-mode="loading"
      >
        <p className="text-sm text-muted-foreground" data-testid="sensor-snapshot-panel-loading">
          Loading sensor snapshots…
        </p>
      </div>
    );
  }

  const source: SensorSnapshotItem[] =
    snapshots !== undefined ? snapshots : mode === "mock" ? sensorReadings.map(toItem) : [];

  const items = source.filter((s) => s.tentId === tentId);

  return (
    <div className="glass rounded-2xl p-4" data-testid="sensor-snapshot-panel" data-mode={mode}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2
          className="font-display font-semibold flex items-center gap-2"
          data-testid="sensor-snapshot-panel-title"
        >
          <Gauge className="h-4 w-4" />
          Sensor Snapshots
        </h2>

        {mode === "mock" ? (
          <span
            className="rounded-md border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
            data-testid="sensor-snapshot-panel-mock-badge"
          >
            Mock data
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2" data-testid="sensor-snapshot-panel-empty">
          No sensor snapshots available for this tent.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="sensor-snapshot-panel-list">
          {items.map((item) => (
            <li
              key={item.ts}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/40 bg-secondary/20 p-2 text-xs"
              data-testid="sensor-snapshot-panel-row"
              data-tent-id={item.tentId}
            >
              <span className="text-muted-foreground" data-testid="sensor-snapshot-panel-row-ts">
                {formatTs(item.ts)}
              </span>
              {item.temp !== null && item.temp !== undefined ? (
                <span data-testid="sensor-snapshot-panel-row-temp">{item.temp.toFixed(1)} °C</span>
              ) : null}
              {item.rh !== null && item.rh !== undefined ? (
                <span data-testid="sensor-snapshot-panel-row-rh">{item.rh.toFixed(0)} %</span>
              ) : null}
              {item.vpd !== null && item.vpd !== undefined ? (
                <span data-testid="sensor-snapshot-panel-row-vpd">{item.vpd.toFixed(2)} kPa</span>
              ) : null}
              {item.co2 !== null && item.co2 !== undefined ? (
                <span data-testid="sensor-snapshot-panel-row-co2">{Math.round(item.co2)} ppm</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
