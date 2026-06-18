/**
 * PlantDetailHarvestWatchCard — read-only Harvest Watch v1.5 surface,
 * extended with v0 evidence-only enhancements:
 *   • v0 readiness state badge + state-specific cautious copy
 *   • Explicit evidence checklist (trichome / pistil / bud / window / photos)
 *   • Grouped recent harvest-related items (photos / notes / snapshots),
 *     newest first, with safe empty states per group
 *   • "Next inspection" CTA that hands off to the existing QuickLog flow
 *     via the existing `verdant:open-quicklog` event with a cautious
 *     prefill — read-only evidence tracking still remains separate.
 *
 * Uses the existing Harvest Watch rules/view-model and current Plant Detail
 * context. No writes. No AI calls. No alerts. No Action Queue writes. No
 * automation. No device control. No trichome image analysis.
 */
import { useCallback, useMemo } from "react";
import {
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  Leaf,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGrowPlant } from "@/hooks/useGrowData";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { buildPlantDetailHarvestWatchCardViewModel } from "@/lib/plantDetailHarvestWatchCardViewModel";
import type {
  HarvestWatchV0ReadinessState,
  NextInspectionPrefill,
} from "@/lib/harvestWatchCardEvidenceRules";
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

function v0StateTone(state: HarvestWatchV0ReadinessState): string {
  switch (state) {
    case "ready_for_manual_review":
      return "border-amber-500/40 text-amber-300";
    case "watch_window":
      return "border-blue-500/40 text-blue-300";
    case "too_early_to_call":
      return "border-emerald-500/40 text-emerald-300";
    case "past_expected_window":
      return "border-rose-500/40 text-rose-300";
    case "not_enough_evidence":
    default:
      return "border-border text-muted-foreground";
  }
}

function dispatchNextInspection(
  prefill: NextInspectionPrefill,
  context: {
    plantId: string;
    plantName?: string | null;
    growId?: string | null;
    tentId?: string | null;
  },
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("verdant:open-quicklog", {
      bubbles: true,
      cancelable: true,
      detail: {
        plantId: context.plantId,
        plantName: context.plantName ?? null,
        growId: context.growId ?? null,
        tentId: context.tentId ?? null,
        eventType: prefill.eventType,
        suggestedAction: prefill.suggestedAction,
        suggestedInspection: prefill.kind,
        notePrefill: prefill.notePrefill,
        source: "harvest-watch-next-inspection",
      },
    }),
  );
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

  const onNextInspection = useCallback(() => {
    if (!vm || !plant) return;
    dispatchNextInspection(vm.nextInspection, {
      plantId: plant.id,
      plantName: plant.name,
      growId: (plant as { growId?: string | null }).growId ?? null,
      tentId: (plant as { tentId?: string | null }).tentId ?? null,
    });
  }, [vm, plant]);

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
            <Badge
              variant="outline"
              className={cn("text-[11px]", v0StateTone(vm.v0ReadinessState))}
              data-testid="plant-detail-harvest-watch-v0-state"
              data-state={vm.v0ReadinessState}
            >
              {vm.v0ReadinessStateLabel}
            </Badge>
          </div>
        </div>
        <p
          className="text-xs text-muted-foreground"
          data-testid="plant-detail-harvest-watch-v0-caution"
        >
          {vm.v0ReadinessCaution}
        </p>
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

        <div
          className="rounded-lg border border-border/50 bg-background/40 p-3"
          data-testid="plant-detail-harvest-watch-checklist"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Evidence checklist
          </div>
          <p
            className="mt-0.5 text-[11px] text-muted-foreground"
            data-testid="plant-detail-harvest-watch-checklist-caution"
          >
            Evidence checklist — not a harvest instruction.
          </p>
          <ul className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
            {vm.evidenceChecklist.map((item) => (
              <li
                key={item.key}
                className="flex items-center gap-2"
                data-testid={`harvest-watch-checklist-${item.key}`}
                data-present={item.present ? "true" : "false"}
              >
                {item.present ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                )}
                <span
                  className={cn(
                    item.present ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
                <span className="sr-only">
                  {item.present ? "present" : "missing"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rounded-lg border border-border/50 bg-background/40 p-3"
          data-testid="plant-detail-harvest-watch-recent-groups"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent harvest-related items
          </div>
          <div className="mt-2 space-y-3">
            {vm.groupedRecent.map((group) => (
              <div
                key={group.key}
                data-testid={`harvest-watch-recent-group-${group.key}`}
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                {group.items.length === 0 ? (
                  <p
                    className="mt-1 text-xs text-muted-foreground"
                    data-testid={`harvest-watch-recent-group-empty-${group.key}`}
                  >
                    {group.emptyCopy}
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-2 text-muted-foreground"
                        data-testid={`harvest-watch-recent-item-${group.key}-${item.id}`}
                      >
                        <span className="shrink-0 text-[11px] tabular-nums">
                          {item.occurredAtLabel || "—"}
                        </span>
                        <span className="flex-1 text-foreground">
                          {item.notePreview || (item.hasPhoto ? "Photo logged" : "Snapshot logged")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p
            className="text-xs text-muted-foreground"
            data-testid="plant-detail-harvest-watch-next-observation"
          >
            Next observation: {vm.nextObservation}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onNextInspection}
            data-testid="plant-detail-harvest-watch-next-inspection-cta"
            data-inspection-kind={vm.nextInspection.kind}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Next inspection: {vm.nextInspection.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

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
