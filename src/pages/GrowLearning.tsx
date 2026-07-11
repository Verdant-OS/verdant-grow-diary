/**
 * GrowLearning — grow-level learning review (One-Tent Learning Loop V1).
 * Route: /grows/:growId/learning
 *
 * SAFETY:
 *  - Read-only except for the grower-initiated learning-decision dialog
 *    (routed through saveRunLearningDecision — see PlantMemoryEpisodeCard).
 *  - No effectiveness score, no "best intervention" ranking, no automatic
 *    repeat/avoid promotion.
 */
import { useParams, Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { usePlantMemoryEpisodes } from "@/hooks/usePlantMemoryEpisodes";
import { GrowLearningSummary } from "@/components/GrowLearningSummary";
import { GrowLearningEpisodeList } from "@/components/GrowLearningEpisodeList";
import { NextRunPlaybook } from "@/components/NextRunPlaybook";
import { summarizeGrowLearning } from "@/lib/growLearningReviewViewModel";
import { buildNextRunPlaybook } from "@/lib/nextRunPlaybookRules";
import { growDetailPath } from "@/lib/routes";

export default function GrowLearning() {
  const { growId } = useParams<{ growId: string }>();
  const { state } = usePlantMemoryEpisodes({
    growId: growId ?? null,
    includeSensorEvidence: true,
  });

  if (!growId) {
    return (
      <div className="mx-auto max-w-4xl" data-testid="grow-learning-missing-id">
        <p className="text-sm text-muted-foreground">No grow selected.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl" data-testid="grow-learning-page">
      <PageHeader
        title="Grow learning review"
        description="What changed, what you recorded, and what you decided for next run."
        icon={<GraduationCap className="h-5 w-5" aria-hidden />}
      />
      <p className="mb-4 text-sm">
        <Link to={growDetailPath(growId)} className="text-primary underline underline-offset-2">
          ← Back to grow
        </Link>
      </p>

      {state.status === "loading" || state.status === "idle" ? (
        <p className="text-sm text-muted-foreground" data-testid="grow-learning-loading">
          Loading learning review…
        </p>
      ) : state.status === "unavailable" ? (
        <p role="status" className="text-sm text-muted-foreground" data-testid="grow-learning-unavailable">
          The learning review is unavailable right now. Try again shortly.
        </p>
      ) : state.episodes.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="grow-learning-empty">
          No completed actions yet for this grow. Once you complete an action from the Action
          Queue, it will appear here for follow-up and review.
        </p>
      ) : (
        <div className="space-y-6">
          <GrowLearningSummary summary={summarizeGrowLearning(state.episodes)} />
          <NextRunPlaybook playbook={buildNextRunPlaybook(state.episodes)} />
          <GrowLearningEpisodeList episodes={state.episodes} />
        </div>
      )}
    </div>
  );
}
