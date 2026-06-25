/**
 * AlertsEmptyStateSnapshotCta — read-only wrapper that loads the latest
 * sensor snapshot for the given grow and renders a stale/context-only
 * CTA when applicable. Returns nothing when the snapshot is fresh and
 * eligible for persistence.
 *
 * Safety:
 *  - No writes. No automation. No alert/device control.
 *  - Tone copy is derived from the same gate the alert engine uses.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGrowTents } from "@/hooks/useGrowData";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { emptyStateSnapshotCta } from "@/lib/alertFreshnessContext";

interface Props {
  growId: string;
}

export default function AlertsEmptyStateSnapshotCta({ growId }: Props) {
  const { data: tents = [] } = useGrowTents(growId);
  const tentIds = tents.map((t) => t.id);
  const sensorState = useLatestSensorSnapshot(growId, tentIds);

  const cta = useMemo(
    () =>
      emptyStateSnapshotCta({
        snapshot: sensorState.status === "ok" ? sensorState.snapshot : null,
        status: sensorState.status,
      }),
    [sensorState.status, sensorState.snapshot],
  );

  if (!cta) return null;

  return (
    <div
      className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-center text-[11px] text-amber-800 dark:text-amber-200"
      data-testid="alerts-empty-state-snapshot-cta"
      data-kind={cta.kind}
      role="status"
    >
      <p>{cta.message}</p>
      {cta.showAddManualSnapshot ? (
        <div className="mt-1">
          <Button
            size="sm"
            variant="outline"
            asChild
            data-testid="alerts-empty-state-snapshot-cta-add"
          >
            <Link to="/sensors#manual-reading">Add Manual Snapshot</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
