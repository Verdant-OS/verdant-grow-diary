/**
 * GrowRoomQuickActionsCard — mobile-first launcher for common grow-room
 * tasks. Pure presentational component: it renders entries produced by
 * `buildGrowRoomLauncherEntries` and either navigates (href) or dispatches
 * the existing `verdant:open-quicklog` event. It does NOT perform any
 * writes, device control, or automation.
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
  recordOutcomeAvailable?: boolean;
}

function dispatchQuickLog() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: null }),
  );
}

function renderButton(entry: GrowRoomLauncherEntry) {
  const Icon = ICON[entry.kind];
  const inner = (
    <>
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="text-sm font-medium">{entry.label}</span>
      {entry.href && (
        <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-60" aria-hidden="true" />
      )}
    </>
  );

  if (entry.href) {
    return (
      <Button
        key={entry.kind}
        asChild
        variant="outline"
        className="h-14 w-full justify-start gap-3 px-4"
        data-testid={entry.testId}
        aria-label={entry.label}
      >
        <Link to={entry.href}>{inner}</Link>
      </Button>
    );
  }

  return (
    <Button
      key={entry.kind}
      type="button"
      variant="outline"
      className="h-14 w-full justify-start gap-3 px-4"
      data-testid={entry.testId}
      aria-label={entry.label}
      onClick={dispatchQuickLog}
    >
      {inner}
    </Button>
  );
}

export default function GrowRoomQuickActionsCard({
  scopedGrowId,
  recordOutcomeAvailable = true,
}: Props) {
  const entries = buildGrowRoomLauncherEntries({
    scopedGrowId,
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
