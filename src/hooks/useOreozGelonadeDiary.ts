/**
 * Owner-scoped read model for the authenticated Oreoz/Gelonade diary views.
 * Plant rows come from the existing active-plant query; phenotype score cards
 * are fetched only for matching plants that belong to a Pheno Hunt.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePlants } from "@/hooks/use-plants";
import { useAuth } from "@/store/auth";
import {
  listCandidateScoresForPlants,
  type CandidateScoreForPlantRow,
  type CandidateScorePlantRef,
} from "@/lib/phenoCandidateScoresService";
import {
  buildOreozGelonadeDiaryView,
  matchOreozGelonadeCultivar,
  type OreozGelonadeDiaryView,
  type OreozGelonadePlantRow,
} from "@/lib/oreozGelonadeDiaryRules";

export const OREOZ_GELONADE_SCORE_QUERY_KEY = "oreoz-gelonade-diary-scores";

export interface UseOreozGelonadeDiaryResult {
  readonly status: "loading" | "ready" | "error";
  readonly view: OreozGelonadeDiaryView;
  readonly scoresByPlant: Readonly<Record<string, CandidateScoreForPlantRow>>;
  readonly scoresReady: boolean;
  readonly error: string | null;
  readonly refreshScores: () => Promise<unknown>;
}

export function useOreozGelonadeDiary(): UseOreozGelonadeDiaryResult {
  const { user } = useAuth();
  const plantsQuery = usePlants();

  const matchingPlants = useMemo(
    () =>
      ((plantsQuery.data ?? []) as OreozGelonadePlantRow[]).filter((plant) =>
        Boolean(matchOreozGelonadeCultivar(plant.strain)),
      ),
    [plantsQuery.data],
  );

  const refs = useMemo<CandidateScorePlantRef[]>(
    () =>
      matchingPlants
        .flatMap((plant) =>
          plant.pheno_hunt_id ? [{ plantId: plant.id, huntId: plant.pheno_hunt_id }] : [],
        )
        .sort((a, b) => a.plantId.localeCompare(b.plantId) || a.huntId.localeCompare(b.huntId)),
    [matchingPlants],
  );
  const signature = refs.map((ref) => `${ref.plantId}:${ref.huntId}`).join("|");

  const scoresQuery = useQuery({
    queryKey: [OREOZ_GELONADE_SCORE_QUERY_KEY, user?.id ?? "signed-out", signature],
    queryFn: () => listCandidateScoresForPlants(refs),
    enabled: Boolean(user?.id) && !plantsQuery.isPending && !plantsQuery.isError && refs.length > 0,
    staleTime: 30_000,
  });

  const scoresByPlant = useMemo<Readonly<Record<string, CandidateScoreForPlantRow>>>(
    () => (refs.length === 0 ? {} : (scoresQuery.data ?? {})),
    [refs.length, scoresQuery.data],
  );
  const scoresReady = refs.length === 0 || scoresQuery.isSuccess;
  const view = useMemo(
    () => buildOreozGelonadeDiaryView(matchingPlants, scoresByPlant),
    [matchingPlants, scoresByPlant],
  );

  const status =
    plantsQuery.isPending || (refs.length > 0 && scoresQuery.isPending)
      ? "loading"
      : plantsQuery.isError || (refs.length > 0 && scoresQuery.isError)
        ? "error"
        : "ready";

  return {
    status,
    view,
    scoresByPlant,
    scoresReady,
    error:
      status === "error"
        ? "Could not load the current phenotype records. Editing stays unavailable until the read succeeds."
        : null,
    refreshScores: scoresQuery.refetch,
  };
}
