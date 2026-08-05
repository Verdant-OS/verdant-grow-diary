/**
 * Editable pheno evidence reads must distinguish an honestly empty result from
 * a database failure. Returning an empty map after an RLS/transport failure can
 * make the editor overwrite an existing score, decision, sex observation,
 * smoke test, lab result, or staged score round with defaults.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown; error: unknown };

const results: Record<string, QueryResult> = {};

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    builder[method] = () => builder;
  }
  (builder as { then: unknown }).then = (resolve: (result: QueryResult) => unknown) =>
    resolve(results[table] ?? { data: [], error: null });
  return builder;
}

vi.mock("@/integrations/supabase/phenoTables", () => ({
  phenoDb: { from: (table: string) => makeBuilder(table) },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: vi.fn() } },
}));

import { listCandidateScoresForHunt } from "@/lib/phenoCandidateScoresService";
import { listKeeperDecisionsForHunt } from "@/lib/phenoKeeperDecisionService";
import { listLabResultsForHunt } from "@/lib/phenoLabResultsService";
import { listScoreRoundsForHunt } from "@/lib/phenoScoreRoundsService";
import { listSmokeTestsForHunt } from "@/lib/phenoSmokeTestService";
import { listLatestSexObservationsForHunt } from "@/lib/phenoSexObservationService";

beforeEach(() => {
  for (const table of Object.keys(results)) delete results[table];
});

describe("editable pheno evidence reads", () => {
  it.each([
    [
      "candidate scores",
      "pheno_candidate_scores",
      "candidate_scores",
      () => listCandidateScoresForHunt("hunt-1", ["plant-1"]),
    ],
    [
      "keeper decisions",
      "pheno_keeper_decisions",
      "keeper_decisions",
      () => listKeeperDecisionsForHunt("hunt-1", ["plant-1"]),
    ],
    [
      "smoke tests",
      "pheno_smoke_tests",
      "smoke_tests",
      () => listSmokeTestsForHunt("hunt-1", ["plant-1"]),
    ],
    [
      "lab results",
      "pheno_lab_results",
      "lab_results",
      () => listLabResultsForHunt("hunt-1", ["plant-1"]),
    ],
    [
      "score rounds",
      "pheno_score_rounds",
      "score_rounds",
      () => listScoreRoundsForHunt("hunt-1", "mid_flower"),
    ],
  ])("throws a typed read error when %s fail", async (_label, table, source, read) => {
    results[table] = {
      data: null,
      error: { code: "42501", message: `permission denied for ${table}` },
    };

    await expect(read()).rejects.toMatchObject({
      name: "PhenoEvidenceReadError",
      source,
    });
  });

  it("throws a typed read error when both latest-sex and deploy-skew fallback reads fail", async () => {
    results["pheno_sex_observations_latest"] = {
      data: null,
      error: { code: "42P01", message: "view missing" },
    };
    results["pheno_sex_observations"] = {
      data: null,
      error: { code: "42501", message: "permission denied" },
    };

    await expect(listLatestSexObservationsForHunt("hunt-1", ["plant-1"])).rejects.toMatchObject({
      name: "PhenoEvidenceReadError",
      source: "sex_observations",
    });
  });

  it("still returns an empty map for a successful read with no rows", async () => {
    results["pheno_candidate_scores"] = { data: [], error: null };

    await expect(listCandidateScoresForHunt("hunt-1", ["plant-1"])).resolves.toEqual({});
  });
});
