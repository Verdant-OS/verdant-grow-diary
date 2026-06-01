/**
 * PlantDetailQuickActions — compact action row near the top of Plant
 * Detail. Presentation/routing/event polish only: each entry either
 * dispatches the existing `verdant:open-quicklog` event, links to an
 * existing route, or scrolls to the in-page Plant Relative Timeline
 * anchor. Read-only — no diary writes, no readings, no diagnoses, no
 * alerts, 
 */
import { Link } from "react-router-dom";
import {
  Activity,
  Camera,
  ListOrdered,
  MessageSquare,
  NotebookPen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import {
  buildPlantDetailQuickActions,
  type PlantDetailQuickActionEntry,
  type PlantDetailQuickActionKind,
  type PlantDetailQuickLogEventPayload,
} from "@/lib/plantDetailQuickActions";

const ICON: Record<PlantDetailQuickActionKind, typeof NotebookPen> = {
  quicklog: NotebookPen,
  manual_sensor_snapshot: Activity,
  upload_photo: Camera,
  ask_doctor: MessageSquare,
  view_timeline: ListOrdered,
};

const FOCUS_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface Props {
  plantId: string | null | undefined;
  plantName?: string | null;
  growId?: string | null;
  tentId?: string | null;
  tentName?: string | null;
  hasTimelineSection?: boolean;
}

function dispatchQuickLog(payload: PlantDetailQuickLogEventPayload | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: payload }),
  );
}

function scrollToAnchor(targetId: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(targetId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  // Make the target programmatically focusable for keyboard/SR users.
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  (el as HTMLElement).focus({ preventScroll: true });
}

function ariaLabelFor(entry: PlantDetailQuickActionEntry): string {
  if (entry.disabled && entry.disabledReason) {
    return `${entry.label} (unavailable: ${entry.disabledReason})`;
  }
  return entry.label;
}

function renderEntry(entry: PlantDetailQuickActionEntry) {
  const Icon = ICON[entry.kind];
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{entry.label}</span>
    </>
  );
  const ariaLabel = ariaLabelFor(entry);
  const baseClasses = `gap-1 ${FOCUS_CLASSES}`;

  const descriptionNode = (
    <p
      className="text-[11px] text-muted-foreground px-1"
      data-testid={`${entry.testId}-description`}
    >
      {entry.description}
    </p>
  );

  if (entry.disabled) {
    return (
      <div key={entry.kind} className="flex flex-col gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          aria-disabled="true"
          aria-label={ariaLabel}
          data-testid={entry.testId}
          className={`${baseClasses} opacity-60 cursor-not-allowed`}
        >
          {inner}
        </Button>
        {descriptionNode}
        {entry.disabledReason && (
          <p
            className="text-[11px] text-muted-foreground px-1"
            data-testid={`${entry.testId}-reason`}
          >
            {entry.disabledReason}
          </p>
        )}
      </div>
    );
  }

  if (entry.href) {
    return (
      <div key={entry.kind} className="flex flex-col gap-1">
        <Button
          asChild
          size="sm"
          variant="outline"
          className={baseClasses}
          data-testid={entry.testId}
        >
          <Link to={entry.href} aria-label={ariaLabel}>
            {inner}
          </Link>
        </Button>
        {descriptionNode}
      </div>
    );
  }

  if (entry.event === "open-quicklog") {
    return (
      <div key={entry.kind} className="flex flex-col gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={baseClasses}
          data-testid={entry.testId}
          aria-label={ariaLabel}
          onClick={() => dispatchQuickLog(entry.eventPayload ?? null)}
        >
          {inner}
        </Button>
        {descriptionNode}
      </div>
    );
  }

  if (entry.scrollTargetId) {
    const target = entry.scrollTargetId;
    return (
      <div key={entry.kind} className="flex flex-col gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={baseClasses}
          data-testid={entry.testId}
          aria-label={ariaLabel}
          onClick={() => scrollToAnchor(target)}
        >
          {inner}
        </Button>
        {descriptionNode}
      </div>
    );
  }

  return null;
}

export default function PlantDetailQuickActions({
  plantId,
  plantName = null,
  growId = null,
  tentId = null,
  tentName = null,
  hasTimelineSection = true,
}: Props) {
  const entries = buildPlantDetailQuickActions({
    plantId,
    plantName,
    growId,
    tentId,
    tentName,
    hasTimelineSection,
  });

  return (
    <nav
      aria-label="Plant quick actions"
      data-testid="plant-detail-quick-actions"
      className="my-3 flex flex-wrap items-start gap-2"
    >
      {entries.map(renderEntry)}
    </nav>
  );
}
