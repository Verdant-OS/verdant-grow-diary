/**
 * OutcomeFollowUpQueue — grower-facing review surface for completed actions
 * awaiting outcome capture and next-run decisions.
 *
 * SAFETY:
 *  - Presenter only. Data arrives via props (view model built from episodes);
 *    no Supabase, no automation, no device control.
 *  - Categories and ordering are deterministic (view model). No AI ranking.
 *  - No CTA implies automatic execution.
 */
import { Badge } from "@/components/ui/badge";
import { OutcomeFollowUpQueueRow } from "@/components/OutcomeFollowUpQueueRow";
import type { OutcomeQueueViewModel } from "@/lib/outcomeFollowUpQueueViewModel";
import type { SafeEpisodeCta } from "@/lib/plantMemoryEpisodeViewModel";

export interface OutcomeFollowUpQueueProps {
  readonly viewModel: OutcomeQueueViewModel;
  readonly status: "loading" | "ok" | "unavailable";
  readonly onAction: (cta: SafeEpisodeCta, actionQueueId: string) => void;
  /** Optional heading override for the plant-scoped variant. */
  readonly heading?: string;
}

export function OutcomeFollowUpQueue({
  viewModel,
  status,
  onAction,
  heading = "Follow-up review",
}: OutcomeFollowUpQueueProps) {
  if (status === "loading") {
    return (
      <section aria-labelledby="outcome-queue-heading" className="glass rounded-2xl p-4">
        <h2 id="outcome-queue-heading" className="text-lg font-semibold">
          {heading}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading review queue…</p>
      </section>
    );
  }

  if (status === "unavailable") {
    return (
      <section aria-labelledby="outcome-queue-heading" className="glass rounded-2xl p-4">
        <h2 id="outcome-queue-heading" className="text-lg font-semibold">
          {heading}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          The review queue is unavailable right now. Try again shortly.
        </p>
      </section>
    );
  }

  if (viewModel.isEmpty) {
    return (
      <section aria-labelledby="outcome-queue-heading" className="glass rounded-2xl p-4">
        <h2 id="outcome-queue-heading" className="text-lg font-semibold">
          {heading}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No completed actions are awaiting a follow-up yet.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="outcome-queue-heading" className="glass rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="outcome-queue-heading" className="text-lg font-semibold">
          {heading}
        </h2>
        <div className="flex flex-wrap gap-2">
          {viewModel.dueNowCount > 0 ? (
            <Badge aria-label={`${viewModel.dueNowCount} due now`}>
              {viewModel.dueNowCount} due now
            </Badge>
          ) : null}
          {viewModel.needsReviewCount > 0 ? (
            <Badge
              variant="destructive"
              aria-label={`${viewModel.needsReviewCount} need review`}
            >
              {viewModel.needsReviewCount} needs review
            </Badge>
          ) : null}
        </div>
      </div>

      {viewModel.groups.map((group) => (
        <div key={group.category} className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {group.label} ({group.rows.length})
          </h3>
          <ul className="space-y-2">
            {group.rows.map((row) => (
              <OutcomeFollowUpQueueRow key={row.episodeKey} row={row} onAction={onAction} />
            ))}
          </ul>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Verdant suggests follow-ups. You record the response and choose what to do next run —
        nothing is automatic.
      </p>
    </section>
  );
}
