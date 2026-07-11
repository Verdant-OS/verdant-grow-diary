/**
 * ActionResponseMemoryCard — the shared read-only presenter for a canonical
 * Action Response Memory (Milestone 5), used by Timeline and Plant Detail
 * (Action Detail's evidence card consumes the same canonical model through
 * its established, test-pinned DOM).
 *
 * Presenter-only: every label/tone/line comes from the view model; no rule
 * tables live here. This component does not write, upload, call AI, create
 * alerts, execute anything, or offer edit/complete/approve controls.
 *
 * Internal ids and durable storage references are used only for the link
 * href and the photo slot — never rendered as visible or accessible text.
 */

import React from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import SensorSourceBadge from "@/components/sensor/SensorSourceBadge";
import { actionDetailPath } from "@/lib/routes";
import {
  ACTION_RESPONSE_PHOTO_UNAVAILABLE_COPY,
  ACTION_RESPONSE_VIEW_ACTION_LABEL,
  sensorBadgeSource,
  type ActionResponseMemoryCardViewModel,
} from "@/lib/actionResponseMemoryViewModel";
import type { ActionFollowUpOutcomeTone } from "@/lib/actionFollowUpEvidenceViewModel";

const TONE_CLASS: Record<ActionFollowUpOutcomeTone, string> = {
  positive: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  neutral: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  muted: "bg-secondary/30 text-muted-foreground border-border/40",
};

export interface ActionResponseMemoryCardProps {
  viewModel: ActionResponseMemoryCardViewModel;
  /** Compact variant for the Timeline row (no photo slot, no link row). */
  variant?: "full" | "compact";
  /** Optional slot for read-only associated photo evidence. */
  photoEvidenceSlot?: React.ReactNode;
  /** Render the internal "View action" link (full variant only). */
  showActionLink?: boolean;
  className?: string;
}

export default function ActionResponseMemoryCard({
  viewModel,
  variant = "full",
  photoEvidenceSlot,
  showActionLink = true,
  className,
}: ActionResponseMemoryCardProps) {
  const compact = variant === "compact";
  return (
    <div
      data-testid="action-response-memory-card"
      data-variant={variant}
      data-outcome={viewModel.outcome}
      className={`rounded-xl border border-border/40 bg-secondary/20 ${
        compact ? "p-3 space-y-1.5" : "p-4 space-y-2"
      } ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
          {viewModel.title}
        </span>
        <span
          data-testid="action-response-memory-outcome"
          className={`text-[11px] px-2 py-0.5 rounded-full border ${TONE_CLASS[viewModel.outcomeTone]}`}
        >
          {viewModel.outcomeLabel}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {viewModel.recordedCopy} ·{" "}
        <span data-testid="action-response-memory-recorded-at">
          {viewModel.recordedAtLabel}
        </span>
      </p>

      {viewModel.actionSummary && (
        <p
          data-testid="action-response-memory-action-summary"
          className="text-sm break-words"
        >
          {viewModel.actionSummary}
        </p>
      )}

      {viewModel.noteExcerpt && (
        <p
          data-testid="action-response-memory-note"
          className="text-sm text-muted-foreground whitespace-pre-wrap break-words"
        >
          {viewModel.noteExcerpt}
        </p>
      )}

      {viewModel.sensorLine && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span data-testid="action-response-memory-sensor-line">
            {viewModel.sensorLine}
          </span>
          {viewModel.sensorState === "available" && (
            <SensorSourceBadge
              source={sensorBadgeSource(viewModel.sensorTrustState)}
              testId="action-response-memory-sensor-source"
            />
          )}
        </div>
      )}

      {viewModel.photoState === "unavailable" && (
        <p
          data-testid="action-response-memory-photo-unavailable"
          className="text-xs text-muted-foreground"
        >
          {ACTION_RESPONSE_PHOTO_UNAVAILABLE_COPY}
        </p>
      )}
      {!compact && viewModel.photoState === "available" && photoEvidenceSlot}

      <p
        role="note"
        data-testid="action-response-memory-historical-note"
        className="text-[11px] text-amber-300/90"
      >
        {viewModel.historicalCopy}
      </p>

      {!compact && showActionLink && (
        <Link
          to={actionDetailPath(viewModel.actionId)}
          data-testid="action-response-memory-view-action"
          className="inline-flex items-center min-h-11 text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {ACTION_RESPONSE_VIEW_ACTION_LABEL} →
        </Link>
      )}
    </div>
  );
}
