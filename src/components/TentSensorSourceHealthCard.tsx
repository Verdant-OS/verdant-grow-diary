/**
 * TentSensorSourceHealthCard — presenter-only card showing last-received
 * timestamp per sensor source label and marking stale sources.
 *
 * Reads existing sensor_readings (passed via props). No schema changes, no
 * alerts, no mutations.
 */
import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";
import { buildSensorSourceHealthView, type SourceHealthEntry } from "@/lib/sensorSourceHealthRules";

interface ReadingLike {
  ts: string;
  source?: string | null;
}

interface Props {
  readings: ReadingLike[];
}

export default function TentSensorSourceHealthCard({ readings }: Props) {
  const view = useMemo(() => buildSensorSourceHealthView(readings), [readings]);

  if (!view.hasSources) return null;

  return (
    <div className="glass rounded-2xl p-4 mb-6" data-testid="tent-sensor-source-health-card">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-display font-semibold text-sm">Source Health</h2>
      </div>

      <ul className="space-y-2" data-testid="tent-sensor-source-health-list">
        {view.sources.map((entry) => (
          <SourceRow key={entry.source} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

function SourceRow({ entry }: { entry: SourceHealthEntry }) {
  return (
    <li
      className="flex items-center justify-between gap-2 text-sm"
      data-testid="tent-sensor-source-health-row"
      data-source={entry.source}
      data-stale={entry.stale ? "true" : "false"}
    >
      <span className="font-medium truncate">{entry.label}</span>
      <span
        className={cn(
          "text-xs whitespace-nowrap",
          entry.stale ? "text-[hsl(var(--warning))]" : "text-muted-foreground",
        )}
      >
        {formatDistanceToNow(new Date(entry.lastSeenAt), { addSuffix: true })}
        {entry.stale && (
          <span
            className="ml-1.5 rounded-md border border-[hsl(var(--warning))] px-1.5 py-0.5"
            data-testid="tent-sensor-source-stale-badge"
          >
            Stale
          </span>
        )}
      </span>
    </li>
  );
}
