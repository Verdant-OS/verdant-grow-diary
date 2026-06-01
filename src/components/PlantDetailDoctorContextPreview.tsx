/**
 * PlantDetailDoctorContextPreview — read-only preview of what context
 * AI Doctor would have for this plant.
 *
 * Presentation-only. Does NOT call AI, does NOT write, does NOT trigger
 * automation or any hardware steering. Renders deterministic Available
 * / Missing / Stale chips from a pure view-model, plus a safe "Ask
 * Doctor" CTA that routes to the existing /doctor flow with plant
 * context as a query parameter.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Stethoscope, CheckCircle2, MinusCircle, Clock, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import {
  buildPlantDetailDoctorContextPreview,
  DOCTOR_CONTEXT_HELPER_COPY,
  type DoctorContextItem,
  type DoctorContextItemState,
} from "@/lib/plantDetailDoctorContextPreview";

interface Props {
  plantId: string | null | undefined;
  stage?: string | null;
  hasPlantPhoto?: boolean;
  openAlertsCount?: number | null;
  pendingActionsCount?: number | null;
  /** Test seam: stable "now" timestamp. */
  now?: Date;
}

const HEADING_ID = "plant-detail-doctor-context-preview-heading";
const CARD_TEST_ID = "plant-detail-doctor-context-preview-card";

function stateIcon(state: DoctorContextItemState) {
  switch (state) {
    case "available":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />;
    case "stale":
      return <Clock className="h-3.5 w-3.5 text-[hsl(var(--warning))]" aria-hidden="true" />;
    case "missing":
      return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
  }
}

function stateLabel(state: DoctorContextItemState): string {
  switch (state) {
    case "available":
      return "Available";
    case "stale":
      return "Stale";
    case "missing":
      return "Missing";
  }
}

function ItemRow({ item }: { item: DoctorContextItem }) {
  return (
    <li
      className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5"
      data-testid={`plant-detail-doctor-context-item-${item.kind}`}
      data-state={item.state}
    >
      <div className="min-w-0 flex items-center gap-2">
        {stateIcon(item.state)}
        <span className="text-xs sm:text-sm truncate">{item.label}</span>
        {item.detail && (
          <span className="text-[10px] sm:text-xs text-muted-foreground capitalize truncate">
            · {item.detail}
          </span>
        )}
      </div>
      <Badge
        variant="outline"
        className="shrink-0 text-[10px] sm:text-xs"
        data-testid={`plant-detail-doctor-context-item-${item.kind}-state`}
      >
        {stateLabel(item.state)}
      </Badge>
    </li>
  );
}

export default function PlantDetailDoctorContextPreview({
  plantId,
  stage,
  hasPlantPhoto,
  openAlertsCount,
  pendingActionsCount,
  now,
}: Props) {
  const { data: rawRows, isLoading } = usePlantRecentActivity(plantId);

  const preview = useMemo(() => {
    const rows = buildPlantRecentActivity(rawRows ?? [], {
      plantId: plantId ?? null,
      limit: 10,
    });
    return buildPlantDetailDoctorContextPreview({
      stage: stage ?? null,
      hasPlantPhoto: !!hasPlantPhoto,
      recentActivity: rows,
      openAlertsCount: openAlertsCount ?? null,
      pendingActionsCount: pendingActionsCount ?? null,
      now: now ?? new Date(),
    });
  }, [rawRows, plantId, stage, hasPlantPhoto, openAlertsCount, pendingActionsCount, now]);

  if (!plantId) return null;

  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid={CARD_TEST_ID}
      className="my-3 glass rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Stethoscope className="h-4 w-4 text-[hsl(var(--info))]" aria-hidden="true" />
          <h2 id={HEADING_ID} className="text-sm font-semibold tracking-tight">
            Doctor context
          </h2>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] sm:text-xs"
          data-testid="plant-detail-doctor-context-summary"
        >
          {preview.availableCount} / {preview.totalCount} available
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground leading-snug">{DOCTOR_CONTEXT_HELPER_COPY}</p>
      {isLoading ? (
        <div
          className="h-24 rounded-md bg-muted/30 animate-pulse"
          data-testid="plant-detail-doctor-context-loading"
        />
      ) : (
        <ul className="space-y-1.5" data-testid="plant-detail-doctor-context-list">
          {preview.items.map((it) => (
            <ItemRow key={it.kind} item={it} />
          ))}
        </ul>
      )}
      <div
        className="flex items-center justify-end pt-1"
        data-testid="plant-detail-doctor-context-ask-cta"
      >
        <PlantDetailDoctorLaunchDialog
          plantId={plantId}
          stage={stage}
          hasPlantPhoto={hasPlantPhoto}
          openAlertsCount={openAlertsCount}
          pendingActionsCount={pendingActionsCount}
          now={now}
        />
      </div>
    </section>
  );
}
