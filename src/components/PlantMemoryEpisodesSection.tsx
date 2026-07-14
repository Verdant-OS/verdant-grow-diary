/**
 * PlantMemoryEpisodesSection — read-only list of this plant's completed
 * Plant Memory Episodes on PlantDetail.
 *
 * Deliberately NOT another follow-up nudge/CTA card (PlantDetail already
 * hosts several — see OneTentLoopNextStepCard, PlantDetailWhatsMissing,
 * PlantDetailAskDoctorHelper, PlantDetailHarvestWatchCard,
 * DailyGrowCheckOnboardingCard). The grower-facing review queue lives once,
 * on GrowDetail (GrowFollowUpReviewSection). This section only fulfills
 * "Plant Detail shows the complete episode" — full detail, no extra prompts.
 */
import { usePlantMemoryEpisodes } from "@/hooks/usePlantMemoryEpisodes";
import { PlantMemoryEpisodeCard } from "@/components/PlantMemoryEpisodeCard";

export interface PlantMemoryEpisodesSectionProps {
  readonly growId: string | null | undefined;
  readonly plantId: string;
}

export function PlantMemoryEpisodesSection({
  growId,
  plantId,
}: PlantMemoryEpisodesSectionProps) {
  const { state, reload } = usePlantMemoryEpisodes({
    growId,
    plantId,
    includeSensorEvidence: true,
  });

  if (state.status !== "ok" || state.episodes.length === 0) return null;

  return (
    <section aria-labelledby="plant-memory-episodes-heading" className="space-y-3">
      <h2 id="plant-memory-episodes-heading" className="text-base font-semibold tracking-tight">
        Learning episodes
      </h2>
      <ul className="grid grid-cols-1 gap-3">
        {state.episodes.map((episode) => (
          <li key={episode.episodeKey}>
            <PlantMemoryEpisodeCard episode={episode} onDecisionSaved={reload} />
          </li>
        ))}
      </ul>
    </section>
  );
}
