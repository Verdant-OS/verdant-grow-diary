/**
 * PlantPendingOutcomeNotice — calm, read-only PlantDetail notice for
 * completed actions scoped to this plant that still need a grower-recorded
 * follow-up outcome.
 *
 * Presenter only: links to the existing ActionDetail outcome section.
 * No mutation, no approve/complete control, no outcome capture here.
 * Renders nothing when the filtered list is empty.
 */

import { useMemo } from "react";
import { Link } from "@/lib/react-router-compat";
import { ArrowRight, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardPendingOutcomeReviews } from "@/hooks/useDashboardPendingOutcomeReviews";
import { buildPlantPendingOutcomeNoticeViewModel } from "@/lib/plantPendingOutcomeNoticeRules";

export interface PlantPendingOutcomeNoticeProps {
  readonly growId: string | null | undefined;
  readonly plantId: string | null | undefined;
}

export default function PlantPendingOutcomeNotice({
  growId,
  plantId,
}: PlantPendingOutcomeNoticeProps) {
  const state = useDashboardPendingOutcomeReviews(growId ?? null);

  const viewModel = useMemo(() => {
    if (state.status !== "ok") {
      return buildPlantPendingOutcomeNoticeViewModel({
        plantId,
        pendingReviews: [],
      });
    }
    return buildPlantPendingOutcomeNoticeViewModel({
      plantId,
      pendingReviews: state.items,
    });
  }, [state, plantId]);

  if (viewModel.items.length === 0) return null;

  const count = viewModel.items.length;

  return (
    <section
      className="glass rounded-2xl p-4 my-3"
      aria-label="Pending follow-up outcomes for this plant"
      data-testid="plant-pending-outcome-notice"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted p-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-semibold">
            Record what changed after completed actions
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Grower observation only — no automation is triggered.
          </p>
          <p
            className="mt-1 text-xs text-muted-foreground"
            data-testid="plant-pending-outcome-notice-count"
          >
            {count} completed {count === 1 ? "action is" : "actions are"} waiting for a recorded
            outcome on this plant.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2" data-testid="plant-pending-outcome-notice-list">
        {viewModel.items.map((item) => (
          <li
            key={item.actionId}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
            data-testid="plant-pending-outcome-notice-item"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{item.suggestedChange ?? "Completed action"}</p>
              {item.hoursSinceCompleted !== null ? (
                <p className="text-xs text-muted-foreground">
                  Completed ~{item.hoursSinceCompleted}h ago
                </p>
              ) : null}
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link to={item.href} data-testid="plant-pending-outcome-notice-cta">
                Record outcome <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
