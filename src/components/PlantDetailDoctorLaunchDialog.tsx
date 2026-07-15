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
  BookText,
} from "lucide-react";
import { useLogAiDoctorReadinessToDiary } from "@/hooks/useLogAiDoctorReadinessToDiary";

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
import { useTimelineMemory, TIMELINE_MEMORY_DEFAULT_LIMIT } from "@/hooks/useTimelineMemory";
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
import { evaluateAiDoctorContextFromSources } from "@/lib/aiDoctorContextViewModel";
import {
  buildAiDoctorReadinessGate,
  buildAiDoctorReadinessBlockedExplanation,
  AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL,
} from "@/lib/aiDoctorReadinessGateViewModel";
import { buildAiDoctorSnapshotStalenessExplanation } from "@/lib/aiDoctorSnapshotStalenessExplanationViewModel";

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
  // State icons are aria-hidden and the badge is visual-only, so the row
  // itself carries the "label: state" coupling for screen readers.
  return (
    <li
      className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5"
      data-testid={`plant-detail-doctor-launch-item-${item.kind}`}
      data-state={item.state}
      aria-label={`${item.label}: ${stateLabel(item.state)}`}
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
  const { items: timelineItems } = useTimelineMemory(
    plantId ? { kind: "plant", plantId } : null,
    TIMELINE_MEMORY_DEFAULT_LIMIT,
  );

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

  const readinessResult = useMemo(
    () =>
      evaluateAiDoctorContextFromSources({
        plant: plantId
          ? {
              id: plantId,
              name: plantName ?? null,
              stage: stage ?? null,
              hasPlantPhoto: !!hasPlantPhoto,
            }
          : null,
        timelineItems,
        now: now ? now.getTime() : undefined,
      }),
    [plantId, plantName, stage, hasPlantPhoto, timelineItems, now],
  );

  const gate = useMemo(
    () =>
      buildAiDoctorReadinessGate({
        readiness: readinessResult.readiness,
        hasSafeAiDoctorFlow: true,
      }),
    [readinessResult.readiness],
  );

  const blocked = readinessResult.readiness === "insufficient";

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

  const blockedExplanation = useMemo(
    () =>
      buildAiDoctorReadinessBlockedExplanation({
        readiness: readinessResult.readiness,
        missing: readinessResult.missing,
        nextActionLabel:
          addContextDecision.kind !== "none"
            ? addContextDecision.label
            : AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL,
      }),
    [readinessResult.readiness, readinessResult.missing, addContextDecision],
  );

  const snapshotStaleness = useMemo(() => {
    const nowMs = now ? now.getTime() : Date.now();
    const fmt = (iso: string) => {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return iso;
      try {
        return d.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
      } catch {
        return d.toISOString();
      }
    };
    return buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: readinessResult.latest.manualSnapshotAt,
      now: nowMs,
      formatDateTime: fmt,
    });
  }, [readinessResult.latest.manualSnapshotAt, now]);

  const { log: logReadiness, logging } = useLogAiDoctorReadinessToDiary();
  const canLogReadiness = typeof growId === "string" && growId.trim().length > 0;

  const handleLogReadinessToDiary = useCallback(() => {
    if (!canLogReadiness || !plantId) return;
    void logReadiness({
      readiness: readinessResult.readiness,
      latestSnapshotAtIso: readinessResult.latest.manualSnapshotAt,
      blockingCodes: blockedExplanation.blockingCodes,
      growId,
      plantId,
      tentId: tentId ?? null,
      now: now ? now.getTime() : undefined,
    });
  }, [
    canLogReadiness,
    plantId,
    readinessResult.readiness,
    readinessResult.latest.manualSnapshotAt,
    blockedExplanation.blockingCodes,
    growId,
    tentId,
    now,
    logReadiness,
  ]);

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
            aria-label="AI Doctor context readiness"
          >
            {preview.items.map((it) => (
              <SummaryRow key={it.kind} item={it} />
            ))}
          </ul>
          <p
            className="text-xs text-muted-foreground leading-snug"
            data-testid="plant-detail-doctor-launch-add-context-helper"
          >
            {ADD_CONTEXT_HELPER_COPY}
          </p>
          <p className="text-xs text-muted-foreground leading-snug">
            {DOCTOR_LAUNCH_HELPER_LINES[1]}
          </p>
          <p
            className={
              blocked
                ? "text-xs text-amber-300 leading-snug font-medium"
                : "text-xs text-muted-foreground leading-snug"
            }
            id="plant-detail-doctor-launch-readiness-notice"
            data-testid="plant-detail-doctor-launch-readiness-notice"
            data-readiness={readinessResult.readiness}
            role="status"
            aria-live="polite"
          >
            {gate.message}
          </p>
          {blocked && blockedExplanation.sentence ? (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 space-y-1"
              data-testid="plant-detail-doctor-launch-blocked-explanation"
              role="status"
              aria-live="polite"
            >
              <p
                className="text-xs text-amber-200 leading-snug"
                id="plant-detail-doctor-launch-blocked-sentence"
                data-testid="plant-detail-doctor-launch-blocked-sentence"
              >
                {blockedExplanation.sentence}
              </p>
              {blockedExplanation.blockingLabels.length > 0 ? (
                <ul
                  className="list-disc pl-4 text-xs text-amber-100/90 space-y-0.5"
                  data-testid="plant-detail-doctor-launch-blocked-list"
                >
                  {blockedExplanation.blockingCodes.map((code, i) => (
                    <li key={code} data-blocking-code={code}>
                      {blockedExplanation.blockingLabels[i]}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {snapshotStaleness.isStale ? (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 space-y-1"
              data-testid="plant-detail-doctor-launch-snapshot-stale-explanation"
              data-cutoff-at={snapshotStaleness.cutoffAtIso}
              data-snapshot-at={snapshotStaleness.snapshotAtIso ?? ""}
              role="status"
              aria-live="polite"
            >
              <p
                className="text-xs text-amber-200 leading-snug"
                data-testid="plant-detail-doctor-launch-snapshot-stale-sentence"
              >
                {snapshotStaleness.sentence}
              </p>
            </div>
          ) : null}
        </div>


        <DialogFooter
          className="gap-2 sm:gap-2 flex-col sm:flex-row"
          data-testid="plant-detail-doctor-launch-footer"
          data-readiness={readinessResult.readiness}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={handleLogReadinessToDiary}
            disabled={!canLogReadiness || logging}
            aria-disabled={!canLogReadiness || logging}
            title={
              canLogReadiness
                ? "Record this readiness check as a diary entry"
                : "A grow is required to log readiness"
            }
            data-testid="plant-detail-doctor-launch-log-readiness-to-diary"
            data-readiness={readinessResult.readiness}
            data-snapshot-freshness={
              snapshotStaleness.isStale
                ? "stale"
                : readinessResult.latest.manualSnapshotAt
                  ? "fresh"
                  : "missing"
            }
          >
            <BookText className="h-3.5 w-3.5" />
            {logging ? "Logging…" : "Log readiness to diary"}
          </Button>
          {addContextDecision.kind !== "none" &&
            (addContextDecision.to ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1"
                data-testid="plant-detail-doctor-launch-add-context"
                data-route-kind={addContextDecision.kind}
              >
                <Link
                  to={addContextDecision.to}
                  onClick={() => setOpen(false)}
                  aria-label={addContextDecision.label}
                >
                  <Plus className="h-3.5 w-3.5" /> {addContextDecision.label}
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddContext}
                className="gap-1"
                data-testid="plant-detail-doctor-launch-add-context"
                data-route-kind={addContextDecision.kind}
              >
                <Plus className="h-3.5 w-3.5" /> {addContextDecision.label}
              </Button>
            ))}
          {blocked ? (
            <Button
              type="button"
              size="sm"
              className="gap-1"
              disabled
              aria-disabled="true"
              title={gate.message}
              aria-describedby={
                blockedExplanation.sentence
                  ? "plant-detail-doctor-launch-readiness-notice plant-detail-doctor-launch-blocked-sentence"
                  : "plant-detail-doctor-launch-readiness-notice"
              }
              data-testid="plant-detail-doctor-launch-continue-blocked"
              data-readiness={readinessResult.readiness}
            >
              Continue to AI Doctor <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              className="gap-1"
              data-testid="plant-detail-doctor-launch-continue"
              data-readiness={readinessResult.readiness}
            >
              <Link to={doctorHref} aria-label="Continue to AI Doctor with plant context">
                Continue to AI Doctor <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
