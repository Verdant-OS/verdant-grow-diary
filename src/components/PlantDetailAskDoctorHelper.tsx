/**
 * PlantDetailAskDoctorHelper — compact helper copy shown near the Ask
 * Doctor action on Plant Detail.
 *
 * Presentation-only. Does NOT call AI, does NOT write, does NOT trigger
 * automation or any hardware steering. Renders deterministic helper copy
 * from a pure view-model. The Ask Doctor action remains fully available
 * regardless of context level.
 */
import { useMemo } from "react";
import { Info, AlertCircle, CheckCircle2 } from "lucide-react";

import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { classifyTimelineEntry } from "@/lib/timelineEntryClassification";
import {
  buildPlantDetailAskDoctorHelper,
  type AskDoctorHelperLevel,
  type PlantDetailAskDoctorHelperInput,
} from "@/lib/plantDetailAskDoctorHelper";

interface Props {
  plantId: string | null | undefined;
  stage?: string | null;
  hasPlantPhoto?: boolean;
  /** Test seam: stable "now" timestamp. */
  now?: Date;
}

const TEST_ID = "plant-detail-ask-doctor-helper";

function deriveSignals(
  plantId: string | null | undefined,
  hasPlantPhoto: boolean,
  rawRows: readonly unknown[] | null | undefined,
): Pick<
  PlantDetailAskDoctorHelperInput,
  "hasTimelineEntries" | "hasRecentPhoto" | "hasSensorSnapshot" | "hasRecentWateringOrFeed"
> {
  const rows = buildPlantRecentActivity(rawRows ?? [], { plantId: plantId ?? null, limit: 10 });

  const hasTimelineEntries = rows.length > 0;
  let hasRecentPhoto = hasPlantPhoto;
  let hasSensorSnapshot = false;
  let hasRecentWateringOrFeed = false;

  for (const r of rows) {
    if (r.hasPhoto) hasRecentPhoto = true;
    if (r.hasSnapshot) hasSensorSnapshot = true;
    const cat = classifyTimelineEntry({ eventType: r.eventType });
    if (cat === "watering" || cat === "feeding") hasRecentWateringOrFeed = true;
  }

  return { hasTimelineEntries, hasRecentPhoto, hasSensorSnapshot, hasRecentWateringOrFeed };
}

function levelIcon(level: AskDoctorHelperLevel) {
  switch (level) {
    case "has_context":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />;
    case "partial":
      return <Info className="h-3.5 w-3.5 text-[hsl(var(--info))]" aria-hidden="true" />;
    case "none":
      return <AlertCircle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" aria-hidden="true" />;
  }
}

export default function PlantDetailAskDoctorHelper({
  plantId,
  stage,
  hasPlantPhoto = false,
  now,
}: Props) {
  const { data: rawRows, isLoading } = usePlantRecentActivity(plantId ?? null);

  const signals = useMemo(() => {
    return deriveSignals(plantId, hasPlantPhoto, rawRows ?? []);
  }, [plantId, hasPlantPhoto, rawRows]);

  const result = useMemo(() => {
    return buildPlantDetailAskDoctorHelper({ stage, ...signals });
  }, [stage, signals]);

  if (!plantId) return null;

  return (
    <div
      data-testid={TEST_ID}
      className="my-2 flex items-start gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2"
    >
      {isLoading ? (
        <div className="h-4 w-4 rounded-full bg-muted/40 animate-pulse" aria-hidden="true" />
      ) : (
        levelIcon(result.level)
      )}
      <p
        className="text-xs text-muted-foreground leading-snug"
        data-testid="plant-detail-ask-doctor-helper-copy"
      >
        {isLoading ? "Checking plant context…" : result.copy}
      </p>
    </div>
  );
}
