/**
 * DashboardPendingOutcomeReviewsCard — compact Dashboard nudge listing
 * completed actions that are >24h old and still missing a grower-recorded
 * outcome. Read-only; links to ActionDetail's existing outcome flow.
 *
 * Copy stays observational: "Record what changed after completed actions."
 * No claim that an action fixed, healed, or resolved any issue.
 */
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actionDetailPath } from "@/lib/routes";
import { useDashboardPendingOutcomeReviews } from "@/hooks/useDashboardPendingOutcomeReviews";

interface Props {
  scopedGrowId: string | null | undefined;
}

export default function DashboardPendingOutcomeReviewsCard({
  scopedGrowId,
}: Props) {
  const state = useDashboardPendingOutcomeReviews(scopedGrowId ?? null);
  if (state.status !== "ok" || state.items.length === 0) return null;

  const items = state.items.slice(0, 3);
  const total = state.items.length;

  return (
    <section
      className="glass rounded-2xl p-4 my-3"
      aria-label="Record action outcomes"
      data-testid="pending-outcome-reviews-card"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted p-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-sm">
            Record what changed after completed actions
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Grower observation only — no automation is triggered.
          </p>
          <p
            className="text-xs text-muted-foreground mt-1"
            data-testid="pending-outcome-reviews-count"
          >
            {total} completed {total === 1 ? "action is" : "actions are"}{" "}
            waiting for a recorded outcome.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2" data-testid="pending-outcome-reviews-list">
        {items.map((item) => (
          <li
            key={item.action_queue_id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm truncate">
                {item.suggested_change ?? "Completed action"}
              </p>
              <p className="text-xs text-muted-foreground">
                Completed ~{item.hours_since_completed}h ago
              </p>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link
                to={actionDetailPath(item.action_queue_id)}
                data-testid="pending-outcome-review-cta"
              >
                Record outcome <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
