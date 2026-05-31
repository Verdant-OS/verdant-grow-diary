/**
 * GrowRoomQuickActionsCard — mobile-first launcher for common grow-room
 * tasks. Pure presentational component: it renders entries produced by
 * `buildGrowRoomLauncherEntries` and either navigates (href) or dispatches
 * the existing `verdant:open-quicklog` event with already-known scoped
 * context as the event detail. It does NOT perform any writes, device
 * control, or automation, and never looks up additional context.
 */
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ClipboardCheck,
  MessageSquare,
  NotebookPen,
  Siren,
  Thermometer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import {
  buildGrowRoomLauncherEntries,
  type GrowRoomLauncherEntry,
  type GrowRoomLauncherKind,
  type GrowRoomQuickLogEventPayload,
} from "@/lib/growRoomQuickActionLauncher";

const ICON: Record<GrowRoomLauncherKind, typeof NotebookPen> = {
  quicklog: NotebookPen,
  manual_sensor_snapshot: Thermometer,
  ask_doctor: MessageSquare,
  review_alerts: Siren,
  record_outcome: ClipboardCheck,
};

interface Props {
  scopedGrowId: string | null;
  /**
   * Already-known plant id from existing route/context (no new lookup).
   * Forwarded as part of the QuickLog event payload.
   */
  scopedPlantId?: string | null;
  recordOutcomeAvailable?: boolean;
}

// Visible focus ring tuned for keyboard + mobile tap-and-hold.
const FOCUS_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function dispatchQuickLog(payload: GrowRoomQuickLogEventPayload | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: payload }),
  );
}

function ariaLabelFor(entry: GrowRoomLauncherEntry): string {
  if (entry.disabled && entry.disabledReason) {
    return `${entry.label} (unavailable: ${entry.disabledReason})`;
  }
  return entry.label;
}

function renderButton(entry: GrowRoomLauncherEntry) {
  const Icon = ICON[entry.kind];
  const ariaLabel = ariaLabelFor(entry);
  const inner = (
    <>
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="text-sm font-medium">{entry.label}</span>
      {entry.href && !entry.disabled && (
        <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-60" aria-hidden="true" />
      )}
    </>
  );

  const baseClasses = `h-14 w-full justify-start gap-3 px-4 ${FOCUS_CLASSES}`;

  if (entry.disabled) {
    return (
      <div
        key={entry.kind}
        data-testid={`${entry.testId}-disabled`}
        className="space-y-1"
      >
        <Button
          type="button"
          variant="outline"
          disabled
          aria-disabled="true"
          aria-label={ariaLabel}
          data-testid={entry.testId}
          className={`${baseClasses} opacity-60 cursor-not-allowed`}
        >
          {inner}
        </Button>
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
      <Button
        key={entry.kind}
        asChild
        variant="outline"
        className={baseClasses}
        data-testid={entry.testId}
      >
        <Link to={entry.href} aria-label={ariaLabel}>
          {inner}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      key={entry.kind}
      type="button"
      variant="outline"
      className={baseClasses}
      data-testid={entry.testId}
      aria-label={ariaLabel}
      onClick={() => dispatchQuickLog(entry.eventPayload ?? null)}
    >
      {inner}
    </Button>
  );
}

export default function GrowRoomQuickActionsCard({
  scopedGrowId,
  scopedPlantId = null,
  recordOutcomeAvailable = true,
}: Props) {
  const entries = buildGrowRoomLauncherEntries({
    scopedGrowId,
    scopedPlantId,
    recordOutcomeAvailable,
  });

  return (
    <Card className="p-4 space-y-3" data-testid="grow-room-quick-actions-card">
      <div>
        <h2 className="text-base font-semibold">Grow Room Mode</h2>
        <p className="text-xs text-muted-foreground">
          Quick links to the actions you reach most in the grow room. Verdant
          never executes equipment changes.
        </p>
      </div>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        data-testid="grow-room-quick-actions-grid"
      >
        {entries.map(renderButton)}
      </div>
    </Card>
  );
}
