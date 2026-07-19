/**
 * PhenoCureTimeline — presenter for the pure phenoCureTimelineViewModel.
 *
 * A keeper's journey as a horizontal timeline: the grow rounds run neutral, then
 * the cure and each re-grow light up emerald — the stretch where the keeper was
 * actually EARNED. Reversal (the pollen milestone) and an "earned" summary sit in
 * the header.
 *
 * Responsive (scrolls on narrow screens), theme-aware, and gently animated in
 * (motion-safe only). Presentational only: no I/O, no writes.
 */
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { CureTimeline, TimelineStage } from "@/lib/phenoCureTimelineViewModel";

export interface PhenoCureTimelineProps {
  readonly timeline: CureTimeline;
  readonly className?: string;
}

function StageNode({ stage }: { stage: TimelineStage }) {
  if (stage.kind === "cure") {
    return <span className="h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />;
  }
  if (stage.kind === "regrow") {
    return <span className="h-3 w-3 rounded-full bg-emerald-500/80 ring-2 ring-background" />;
  }
  return (
    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 ring-2 ring-background" />
  );
}

export default function PhenoCureTimeline({ timeline, className }: PhenoCureTimelineProps) {
  const { id, name, stages, earned, reversed, reversalMethods, stabilityRuns, reachedCure } =
    timeline;

  return (
    <div
      data-testid={`pheno-cure-timeline-${id}`}
      aria-label={`${name} cure and stability timeline`}
      className={cn("rounded-lg border border-border bg-card p-3", className)}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{name}</span>
        {reversed && (
          <Badge
            variant="outline"
            className="border-violet-500/40 bg-violet-500/10 text-[9px] text-violet-700 dark:text-violet-300"
          >
            Reversed{reversalMethods.length ? ` · ${reversalMethods.join(", ")}` : ""}
          </Badge>
        )}
        {earned ? (
          <Badge
            variant="outline"
            data-testid={`pheno-cure-earned-${id}`}
            className="border-emerald-500/40 bg-emerald-500/10 text-[9px] text-emerald-700 dark:text-emerald-300"
          >
            Earned — cured + {stabilityRuns} re-grow{stabilityRuns === 1 ? "" : "s"}
          </Badge>
        ) : (
          <span
            data-testid={`pheno-cure-earned-${id}`}
            className="text-[10px] text-muted-foreground"
          >
            {reachedCure ? "Cured — needs a re-grow to earn it" : "Not yet cured"}
          </span>
        )}
      </div>

      {stages.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No rounds recorded yet.</p>
      ) : (
        <ol
          className="flex items-start overflow-x-auto pb-1"
          data-testid={`pheno-cure-stages-${id}`}
        >
          {stages.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "mt-[9px] h-0.5 w-6 shrink-0 sm:w-9",
                    s.decisive ? "bg-emerald-500/50" : "bg-border",
                  )}
                />
              )}
              <li
                data-testid={`pheno-cure-stage-${id}-${s.key}`}
                className="flex w-14 shrink-0 flex-col items-center motion-safe:animate-in motion-safe:fade-in-50 sm:w-16"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <span className="flex h-5 items-center">
                  <StageNode stage={s} />
                </span>
                <span
                  className={cn(
                    "mt-0.5 text-center text-[10px] leading-tight",
                    s.decisive
                      ? "font-medium text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </li>
            </Fragment>
          ))}
        </ol>
      )}
    </div>
  );
}
