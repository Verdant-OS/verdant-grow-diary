/**
 * PlantDetailHarvestWatchCard — read-only Harvest Watch v1.5 surface.
 *
 * Uses the existing Harvest Watch rules/view-model and current Plant Detail
 * context. No writes. No AI calls. No alerts. No Action Queue writes. No
 * automation. No device control. No trichome image analysis.
 */
import { useMemo } from "react";
import { Camera, Clock3, Eye, Leaf, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGrowPlant } from "@/hooks/useGrowData";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { buildPlantDetailHarvestWatchCardViewModel } from "@/lib/plantDetailHarvestWatchCardViewModel";
import { cn } from "@/lib/utils";

interface PlantDetailHarvestWatchCardProps {
  plantId: string | null | undefined;
  hasPlantPhoto?: boolean;
  className?: string;
}

function trendLabel(trend: string): string {
  switch (trend) {
    case "approaching":
      return "Approaching";
    case "holding":
      return "Holding";
    case "early":
      return "Early";
    default:
      return "Context limited";
  }
}

function trendTone(trend: string): string {
  switch (trend) {
    case "approaching":
      return "border-amber-500/40 text-amber-300";
    case "holding":
      return "border-blue-500/40 text-blue-300";
    case "early":
      return "border-emerald-500/40 text-emerald-300";
    default:
      return "border-border text-muted-foreground";
  }
}

export default function PlantDetailHarvestWatchCard({
  plantId,
  hasPlantPhoto = false,
  className,
}: PlantDetailHarvestWatchCardProps) {
  const { data: plant, isLoading: plantLoading } = useGrowPlant(plantId ?? undefined);
  const { data: rawRows, isLoading: activityLoading } = usePlantRecentActivity(plantId ?? null);

  const vm = useMemo(() => {
    if (!plant) return null;
    const rows = buildPlantRecentActivity(rawRows ?? [], {
      plantId: plant.id,
      limit: 20,
    });
    return buildPlantDetailHarvestWatchCardViewModel({
      plant,
      recentActivityRows: rows,
      hasPlantPhoto,
    });
  }, [plant, rawRows, hasPlantPhoto]);

  if (!plantId) return null;

  if (plantLoading || activityLoading || !vm) {
    return (
      <Card
        data-testid="plant-detail-harvest-watch-card-loading"
        className={cn("my-3", className)}
      >
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Leaf className="h-4 w-4 text-primary" /> Harvest Watch
          </CardTitle>
          <p className="text-xs text-muted-foreground">Loading harvest evidence…</p>
        </CardHeader>
      </Card>
    );
  }

  const row = vm.row;

  return (
    <Card
      data-testid="plant-detail-harvest-watch-card"
      className={cn("my-3 border-primary/20 bg-card/50", className)}
    >
      <CardHeader className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Leaf className="h-4 w-4 text-primary" /> Harvest Watch
            </CardTitle>
            <p
              className="mt-1 text-xs text-muted-foreground"
              data-testid="plant-detail-harvest-watch-advisory-copy"
            >
              Evidence tracker only. Verdant does not decide harvest timing.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="gap-1 text-[11px]">
              <ShieldCheck className="h-3 w-3" /> {vm.advisoryLabel}
            </Badge>
            <Badge
              variant="outline"
              className={cn("text-[11px]", trendTone(row.trend))}
              data-testid="plant-detail-harvest-watch-trend"
            >
              {trendLabel(row.trend)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" /> Readiness
            </div>
            <div className="font-medium" data-testid="plant-detail-harvest-watch-readiness">
              {row.readinessDisplay}
            </div>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" /> Watch window
            </div>
            <div className="font-medium" data-testid="plant-detail-harvest-watch-window">
              {row.harvestWindowLabel}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {row.harvestWindow.caption}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Camera className="h-3.5 w-3.5" /> Evidence
            </div>
            <div className="font-medium" data-testid="plant-detail-harvest-watch-evidence">
              {vm.evidenceLabel}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-border/60 bg-secondary/20 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Missing context
          </div>
          <ul
            className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2"
            data-testid="plant-detail-harvest-watch-missing-context"
          >
            {vm.missingContext.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <p
          className="text-xs text-muted-foreground"
          data-testid="plant-detail-harvest-watch-next-observation"
        >
          Next observation: {vm.nextObservation}
        </p>
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="plant-detail-harvest-watch-evidence-only-caution"
        >
          Harvest Watch is evidence-only. Confirm with direct plant inspection before making harvest decisions.
        </p>
      </CardContent>
    </Card>
  );
}
