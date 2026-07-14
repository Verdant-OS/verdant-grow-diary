/**
 * HarvestTimelineCard — dedicated presenter for a persisted Harvest
 * entry on the Plant Relative Timeline.
 *
 * Render-only. No writes, no RPC, no fetch, no diagnoses, no
 * recommendations. Never claims final yield, readiness, potency, or
 * plant health. Never surfaces raw JSON, private IDs, tokens, or
 * secrets. Missing fields are hidden — never invented.
 */
import { Scissors } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatHarvestWeightWithOriginal } from "@/lib/harvestDetailsRules";
import type { QuickLogHarvestDetails } from "@/constants/quickLogActivityTypes";

export interface HarvestTimelineCardProps {
  /** Stable id used for testing / list keys. Never rendered as text. */
  entryId: string;
  /** Grower-facing timestamp copy already resolved by upstream helpers. */
  timestampLabel: string;
  /** True when timestampLabel is a fallback (e.g. "Unknown time"). */
  timestampIsFallback?: boolean;
  /** Optional note text — hidden when empty. */
  note?: string | null;
  /** Optional structured harvest details — hidden when null/empty. */
  harvest?: QuickLogHarvestDetails | null;
  /** Optional plant / tent / grow labels, safe strings only. */
  plantContextLabel?: string | null;
  tentContextLabel?: string | null;
  growContextLabel?: string | null;
  /** Optional stage badge label (already resolved upstream). */
  stageLabel?: string | null;
  stageColorToken?: string | null;
  /** Optional plant / stage day copy — hidden when null. */
  plantDayLabel?: string | null;
  stageDayLabel?: string | null;
}

export default function HarvestTimelineCard({
  entryId,
  timestampLabel,
  timestampIsFallback = false,
  note,
  harvest,
  plantContextLabel,
  tentContextLabel,
  growContextLabel,
  stageLabel,
  stageColorToken,
  plantDayLabel,
  stageDayLabel,
}: HarvestTimelineCardProps) {
  const wetDisplay = formatHarvestWeightWithOriginal({
    wetOrDry: "wet",
    details: harvest ?? null,
  });
  const dryDisplay = formatHarvestWeightWithOriginal({
    wetOrDry: "dry",
    details: harvest ?? null,
  });
  const trimmedNote =
    typeof note === "string" && note.trim().length > 0 ? note.trim() : null;
  const hasContext = Boolean(
    plantContextLabel || tentContextLabel || growContextLabel,
  );

  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm focus-within:ring-2 focus-within:ring-ring"
      data-testid="harvest-timeline-card"
      data-entry-id={entryId}
      data-event-type="harvest"
      aria-label="Harvest entry"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="gap-1"
            data-testid="harvest-timeline-card-label"
          >
            <Scissors className="h-3.5 w-3.5" aria-hidden /> Harvest
          </Badge>
          {stageLabel && (
            <Badge
              variant="outline"
              className={
                stageColorToken ? `stage-token-${stageColorToken}` : undefined
              }
              data-testid="harvest-timeline-card-stage"
            >
              {stageLabel}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {plantDayLabel && (
            <span data-testid="harvest-timeline-card-plant-day">
              {plantDayLabel}
            </span>
          )}
          {stageDayLabel && (
            <span data-testid="harvest-timeline-card-stage-day">
              {stageDayLabel}
            </span>
          )}
          <span
            data-testid="harvest-timeline-card-timestamp"
            data-fallback={timestampIsFallback ? "true" : "false"}
            className={cn(timestampIsFallback && "italic text-muted-foreground/70")}
          >
            {timestampLabel}
          </span>
        </div>
      </div>

      <p
        className="mt-1.5 text-sm text-foreground/90"
        data-testid="harvest-timeline-card-headline"
      >
        Harvest logged
      </p>

      {(wetDisplay || dryDisplay) && (
        <dl
          className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs"
          data-testid="harvest-timeline-card-weights"
        >
          {wetDisplay && (
            <div className="flex items-center gap-1.5">
              <dt className="text-muted-foreground">Wet weight:</dt>
              <dd
                className="text-foreground/90"
                data-testid="harvest-timeline-card-wet-weight"
              >
                {wetDisplay}
              </dd>
            </div>
          )}
          {dryDisplay && (
            <div className="flex items-center gap-1.5">
              <dt className="text-muted-foreground">Dry weight:</dt>
              <dd
                className="text-foreground/90"
                data-testid="harvest-timeline-card-dry-weight"
              >
                {dryDisplay}
              </dd>
            </div>
          )}
        </dl>
      )}

      {trimmedNote && (
        <p
          className="mt-2 text-sm text-foreground/90 break-words"
          data-testid="harvest-timeline-card-note"
        >
          <span className="text-muted-foreground mr-1">Note:</span>
          {trimmedNote}
        </p>
      )}

      {hasContext && (
        <p
          className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5"
          data-testid="harvest-timeline-card-context"
        >
          {plantContextLabel && (
            <span data-testid="harvest-timeline-card-context-plant">
              {plantContextLabel}
            </span>
          )}
          {tentContextLabel && (
            <span data-testid="harvest-timeline-card-context-tent">
              {tentContextLabel}
            </span>
          )}
          {growContextLabel && (
            <span data-testid="harvest-timeline-card-context-grow">
              {growContextLabel}
            </span>
          )}
        </p>
      )}
    </li>
  );
}
