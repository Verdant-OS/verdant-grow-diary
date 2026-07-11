/**
 * ActionFollowUpManualSensorSelector — accessible optional selector for
 * associating an existing Manual sensor snapshot with a follow-up.
 *
 * Presenter-only:
 *  - Renders provided candidates. Does not fetch, mutate, or create.
 *  - Default option is "No sensor snapshot" — never preselects a row.
 *  - Never labels a Manual snapshot as "Live". Provenance is preserved.
 *  - Empty / query-error states never block the outer form.
 */
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

export type ActionFollowUpManualSensorSelectorStatus =
  | "loading"
  | "loaded"
  | "error";

export interface ActionFollowUpManualSensorSelectorProps {
  status: ActionFollowUpManualSensorSelectorStatus;
  candidates: ReadonlyArray<ManualSnapshotTimelineCard>;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const NO_SELECTION = "";

function formatCapturedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Compact metric line (Manual · <time> · key readings). */
function summarizeCard(card: ManualSnapshotTimelineCard): string {
  const parts: string[] = ["Manual", formatCapturedAt(card.capturedAt)];
  const byField = new Map(card.readings.map((r) => [r.field, r]));
  const temp = byField.get("air_temp_c");
  const rh = byField.get("humidity_pct");
  const vpd = byField.get("vpd_kpa");
  if (temp) parts.push(`${temp.value.toFixed(1)}${temp.unit}`);
  if (rh) parts.push(`${rh.value.toFixed(0)}${rh.unit} RH`);
  if (vpd) parts.push(`${vpd.value.toFixed(2)} ${vpd.unit}`);
  return parts.join(" · ");
}

export default function ActionFollowUpManualSensorSelector({
  status,
  candidates,
  value,
  onChange,
  disabled,
  id = "action-followup-manual-sensor",
  className,
}: ActionFollowUpManualSensorSelectorProps) {
  const selectId = `${id}-select`;
  const helperId = `${id}-helper`;
  const statusId = `${id}-status`;

  const showEmpty =
    status === "loaded" && candidates.length === 0;
  const showError = status === "error";

  return (
    <div
      className={cn("space-y-1", className)}
      data-testid="action-followup-manual-sensor-selector"
    >
      <Label htmlFor={selectId} className="flex items-center gap-1">
        Attach a manual sensor snapshot
        <span className="text-xs text-muted-foreground">(optional)</span>
      </Label>
      <select
        id={selectId}
        data-testid="action-followup-manual-sensor-select"
        aria-describedby={`${helperId} ${statusId}`}
        disabled={disabled || status !== "loaded" || candidates.length === 0}
        value={value ?? NO_SELECTION}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next === NO_SELECTION ? null : next);
        }}
        className="flex min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value={NO_SELECTION}>No sensor snapshot</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {summarizeCard(c)}
          </option>
        ))}
      </select>
      <p id={helperId} className="text-xs text-muted-foreground">
        Only your existing Manual snapshots are shown. Sensor values do
        not prove the outcome.
      </p>
      <div
        id={statusId}
        aria-live="polite"
        className="text-xs text-muted-foreground"
        data-testid="action-followup-manual-sensor-status"
      >
        {status === "loading" && "Loading Manual snapshots…"}
        {showEmpty && (
          <span data-testid="action-followup-manual-sensor-empty">
            No eligible Manual snapshots are available for this action.
          </span>
        )}
        {showError && (
          <span data-testid="action-followup-manual-sensor-error">
            Manual snapshots are unavailable right now. You can still
            record the follow-up without one.
          </span>
        )}
      </div>
    </div>
  );
}
