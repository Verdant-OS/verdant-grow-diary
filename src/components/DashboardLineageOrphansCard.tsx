/**
 * DashboardLineageOrphansCard — surfaces unbound tents/plants and offers
 * one-click assign-all to the active grow, plus Lineage Repair deep-link.
 *
 * Writes ONLY tents.grow_id / plants.grow_id via bulkAssignOrphansToGrow.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, Link2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { bulkAssignOrphansToGrow, useLineageOrphans } from "@/hooks/useLineageOrphans";
import { buildDashboardLineageOrphansView, formatBulkAssignResult } from "@/lib/lineageOrphanRules";

export default function DashboardLineageOrphansCard() {
  const { user } = useAuth();
  const { activeGrowId, activeGrow, grows } = useGrows();
  const { unboundTentCount, unboundPlantCount, loading, refresh } = useLineageOrphans();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const view = useMemo(
    () =>
      buildDashboardLineageOrphansView({
        unboundTentCount,
        unboundPlantCount,
        activeGrowId,
        activeGrowName: activeGrow?.name ?? null,
      }),
    [unboundTentCount, unboundPlantCount, activeGrowId, activeGrow?.name],
  );

  if (loading && unboundTentCount === 0 && unboundPlantCount === 0) {
    return null;
  }
  if (!view.visible) return null;

  async function onBulkAssign() {
    if (!user || !activeGrowId || busy || !view.canBulkAssign) return;
    setBusy(true);
    const result = await bulkAssignOrphansToGrow({
      userId: user.id,
      growId: activeGrowId,
      ownedGrowIds: grows.map((g) => g.id),
    });
    setBusy(false);
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    toast.success(
      formatBulkAssignResult({
        tentsUpdated: result.tentsUpdated,
        plantsUpdated: result.plantsUpdated,
      }),
    );
    await refresh();
    qc.invalidateQueries({ queryKey: ["tents"] });
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "tents"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
  }

  return (
    <div
      role="region"
      aria-labelledby="dashboard-lineage-orphans-title"
      data-testid="dashboard-lineage-orphans-card"
      className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--warning))]" aria-hidden />
        <div className="min-w-0 space-y-1">
          <h2
            id="dashboard-lineage-orphans-title"
            className="text-sm font-semibold"
            data-testid="dashboard-lineage-orphans-title"
          >
            {view.title}
          </h2>
          <p
            className="text-xs text-muted-foreground leading-relaxed"
            data-testid="dashboard-lineage-orphans-description"
          >
            {view.description}
          </p>
          <p
            className="text-[11px] text-muted-foreground"
            data-testid="dashboard-lineage-orphans-counts"
          >
            Tents without grow: {view.unboundTentCount} · Plants without grow:{" "}
            {view.unboundPlantCount}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {view.canBulkAssign && view.bulkCtaLabel ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5 gradient-leaf text-primary-foreground"
            disabled={busy}
            onClick={onBulkAssign}
            data-testid="dashboard-lineage-orphans-bulk-assign"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Link2 className="h-3.5 w-3.5" aria-hidden />
            )}
            {view.bulkCtaLabel}
          </Button>
        ) : view.bulkDisabledReason ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="dashboard-lineage-orphans-bulk-disabled"
          >
            {view.bulkDisabledReason}
          </p>
        ) : null}
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link to={view.repairHref} data-testid="dashboard-lineage-orphans-repair-link">
            <Wrench className="h-3.5 w-3.5" aria-hidden />
            {view.repairLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}
