/**
 * PlantDetailDoctorLaunchDialog — lightweight pre-launch context summary
 * shown when the grower taps "Ask Doctor" from Plant Detail.
 *
 * Presentation/routing polish only. NO AI calls, NO writes, NO RPC, NO
 * functions.invoke, NO automation, NO hardware steering, NO scheduling,
 * NO calendar/notification/email side effects.
 *
 * Behavior:
 *   - Trigger renders the "Ask Doctor" button.
 *   - Opening the dialog shows a deterministic Available / Missing /
 *     Stale summary of context AI Doctor would have for this plant.
 *   - "Continue to AI Doctor" routes to /doctor with the plant context
 *     as a query parameter (existing /doctor route ignores unknown
 *     params safely).
 *   - "Add context first" dispatches the existing
 *     `verdant:open-quicklog` event so the grower can add notes/photo
 *     /sensor data without leaving the page.
 *
 * Copy never promises diagnosis certainty and never implies any
 * automation or hardware control. No IDs, tokens, raw payloads,
 * storage paths, or provenance markers are rendered.
 */
import { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Stethoscope,
  ArrowRight,
  CheckCircle2,
  MinusCircle,
  Clock,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import {
  buildPlantDetailDoctorContextPreview,
  type DoctorContextItem,
  type DoctorContextItemState,
} from "@/lib/plantDetailDoctorContextPreview";
import {
  buildPlantDetailDoctorAddContextRoute,
  ADD_CONTEXT_HELPER_COPY,
} from "@/lib/plantDetailDoctorAddContextRouter";

interface Props {
  plantId: string | null | undefined;
  stage?: string | null;
  hasPlantPhoto?: boolean;
  openAlertsCount?: number | null;
  pendingActionsCount?: number | null;
  growId?: string | null;
  tentId?: string | null;
  plantName?: string | null;
  tentName?: string | null;
  /** Test seam: stable "now" timestamp. */
  now?: Date;
}

const DIALOG_TEST_ID = "plant-detail-doctor-launch-dialog";
const TRIGGER_TEST_ID = "plant-detail-doctor-launch-trigger";

export const DOCTOR_LAUNCH_HELPER_LINES = [
  "AI Doctor works best with recent notes, photos, and sensor snapshots.",
  "It may ask for more information if context is missing.",
] as const;

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

function SummaryRow({ item }: { item: DoctorContextItem }) {
  return (
    <li
      className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5"
      data-testid={`plant-detail-doctor-launch-item-${item.kind}`}
      data-state={item.state}
    >
      <div className="min-w-0 flex items-center gap-2">
        {stateIcon(item.state)}
        <span className="text-xs sm:text-sm truncate">{item.label}</span>
      </div>
      <Badge
        variant="outline"
        className="shrink-0 text-[10px] sm:text-xs"
        data-testid={`plant-detail-doctor-launch-item-${item.kind}-state`}
      >
        {stateLabel(item.state)}
      </Badge>
    </li>
  );
}

export default function PlantDetailDoctorLaunchDialog({
  plantId,
  stage,
  hasPlantPhoto,
  openAlertsCount,
  pendingActionsCount,
  growId,
  tentId,
  plantName,
  tentName,
  now,
}: Props) {
  const [open, setOpen] = useState(false);
  const { data: rawRows } = usePlantRecentActivity(plantId);

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

  const addContextDecision = useMemo(() => {
    const stateOf = (kind: DoctorContextItem["kind"]): DoctorContextItemState | null =>
      preview.items.find((i) => i.kind === kind)?.state ?? null;
    const present = (s: DoctorContextItemState | null) => s === "available";
    return buildPlantDetailDoctorAddContextRoute({
      plantId: plantId ?? null,
      plantName: plantName ?? null,
      growId: growId ?? null,
      tentId: tentId ?? null,
      tentName: tentName ?? null,
      hasTimelineOrNote: present(stateOf("timeline")) || present(stateOf("watering_feeding")),
      hasRecentSensorSnapshot: present(stateOf("sensor_snapshot")),
      hasRecentPhoto: present(stateOf("photo")),
    });
  }, [preview.items, plantId, plantName, growId, tentId, tentName]);

  const handleAddContext = useCallback(() => {
    if (typeof window !== "undefined" && addContextDecision.quickLogEvent) {
      window.dispatchEvent(
        new CustomEvent(addContextDecision.quickLogEvent.type, {
          bubbles: true,
          cancelable: true,
          detail: addContextDecision.quickLogEvent.detail,
        }),
      );
    }
    setOpen(false);
  }, [addContextDecision]);

  if (!plantId) return null;

  const doctorHref = `/doctor?plantId=${encodeURIComponent(plantId)}`;
  const missingOrStale = preview.missingCount + preview.staleCount;
  const summaryNote =
    missingOrStale === 0
      ? "All core context is available."
      : `${missingOrStale} item${missingOrStale === 1 ? "" : "s"} missing or stale.`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          data-testid={TRIGGER_TEST_ID}
          aria-label="Ask Doctor about this plant"
        >
          <Stethoscope className="h-3.5 w-3.5" /> Ask Doctor
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        data-testid={DIALOG_TEST_ID}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4 text-[hsl(var(--info))]" aria-hidden="true" />
            Doctor context summary
          </DialogTitle>
          <DialogDescription className="text-xs">
            {DOCTOR_LAUNCH_HELPER_LINES[0]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{summaryNote}</span>
            <Badge
              variant="outline"
              className="text-[10px] sm:text-xs"
              data-testid="plant-detail-doctor-launch-summary"
            >
              {preview.availableCount} / {preview.totalCount} available
            </Badge>
          </div>
          <ul
            className="space-y-1.5"
            data-testid="plant-detail-doctor-launch-list"
          >
            {preview.items.map((it) => (
              <SummaryRow key={it.kind} item={it} />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground leading-snug">
            {DOCTOR_LAUNCH_HELPER_LINES[1]}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddContext}
            className="gap-1"
            data-testid="plant-detail-doctor-launch-add-context"
          >
            <Plus className="h-3.5 w-3.5" /> Add context first
          </Button>
          <Button
            asChild
            size="sm"
            className="gap-1"
            data-testid="plant-detail-doctor-launch-continue"
          >
            <Link to={doctorHref} aria-label="Continue to AI Doctor with plant context">
              Continue to AI Doctor <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
