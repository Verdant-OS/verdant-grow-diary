/**
 * GrowFollowUpReviewSection — container that wires the episode hook, the
 * follow-up queue presenter, and the learning-decision dialog for one grow.
 *
 * This is the single mount point for the review queue (audit: PlantDetail
 * already carries several competing prompt cards). It stays quiet when there
 * is nothing to review.
 *
 * SAFETY: the only write is the grower-initiated learning decision, routed
 * through saveRunLearningDecision. No automation, no device control.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlantMemoryEpisodes } from "@/hooks/usePlantMemoryEpisodes";
import { saveRunLearningDecision } from "@/lib/plantMemoryEpisodeService";
import { buildOutcomeFollowUpQueue } from "@/lib/outcomeFollowUpQueueViewModel";
import { OutcomeFollowUpQueue } from "@/components/OutcomeFollowUpQueue";
import { LearningDecisionDialog } from "@/components/LearningDecisionDialog";
import { actionDetailPath } from "@/lib/routes";
import type { PlantMemoryEpisode } from "@/lib/plantMemoryEpisodeRules";
import type { SafeEpisodeCta } from "@/lib/plantMemoryEpisodeViewModel";

export interface GrowFollowUpReviewSectionProps {
  readonly growId: string;
  readonly plantId?: string | null;
  readonly heading?: string;
}

export function GrowFollowUpReviewSection({
  growId,
  plantId,
  heading,
}: GrowFollowUpReviewSectionProps) {
  const navigate = useNavigate();
  const { state, reload } = usePlantMemoryEpisodes({
    growId,
    plantId: plantId ?? null,
    includeSensorEvidence: false,
  });
  const [decisionEpisode, setDecisionEpisode] = useState<PlantMemoryEpisode | null>(null);

  const episodes = state.status === "ok" ? state.episodes : [];
  const viewModel = useMemo(() => buildOutcomeFollowUpQueue(episodes), [episodes]);
  const status = state.status === "ok" ? "ok" : state.status === "unavailable" ? "unavailable" : "loading";

  const handleAction = (cta: SafeEpisodeCta, actionQueueId: string) => {
    if (cta === "choose_decision") {
      const episode = episodes.find((e) => e.action.actionQueueId === actionQueueId);
      if (episode) setDecisionEpisode(episode);
      return;
    }
    // Every other CTA routes to the completed action, where the grower records
    // the response and reviews evidence. Nothing executes automatically.
    navigate(actionDetailPath(actionQueueId));
  };

  return (
    <>
      <OutcomeFollowUpQueue
        viewModel={viewModel}
        status={status}
        onAction={handleAction}
        heading={heading}
      />
      {decisionEpisode ? (
        <LearningDecisionDialog
          open={decisionEpisode !== null}
          onOpenChange={(open) => {
            if (!open) setDecisionEpisode(null);
          }}
          episode={decisionEpisode}
          nowIso={new Date().toISOString()}
          onSave={async (draft) => {
            const result = await saveRunLearningDecision(draft);
            if (result.ok) {
              reload();
              return { ok: true };
            }
            const reason = (result as { ok: false; reason: string }).reason;
            return {
              ok: false,
              message:
                reason === "needs_review_duplicates"
                  ? "Multiple decisions already exist for this action. Review them before editing."
                  : "Could not save this decision. Try again shortly.",
            };
          }}
        />
      ) : null}
    </>
  );
}
