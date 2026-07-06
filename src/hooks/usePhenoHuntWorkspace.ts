/**
 * usePhenoHuntWorkspace — loads a grower's own hunt (candidates + saved trait
 * scores + keeper decisions) and exposes RLS-scoped save functions. Read/write,
 * but suggest-only: saving a score or decision persists the grower's own data
 * and acts on nothing. No AI, no Action Queue, no automation.
 */
import { useCallback, useEffect, useState } from "react";
import { loadPhenoHuntCandidates, type PhenoHuntSummary } from "@/lib/phenoHuntCandidatesService";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import {
  upsertCandidateScore,
  listCandidateScoresForHunt,
  type CandidateScoreRow,
} from "@/lib/phenoCandidateScoresService";
import {
  recordKeeperDecision,
  listKeeperDecisionsForHunt,
  type KeeperDecisionRow,
} from "@/lib/phenoKeeperDecisionService";
import {
  upsertScoreRound,
  listScoreRoundsForHunt,
  type ScoreRoundRow,
  type PhenoScoreRound,
} from "@/lib/phenoScoreRoundsService";
import type { PhenoKeeperDecision } from "@/lib/phenoKeeperDecisionModel";

export type WorkspaceStatus = "idle" | "loading" | "ok" | "error";

export interface UsePhenoHuntWorkspaceState {
  status: WorkspaceStatus;
  hunt: PhenoHuntSummary | null;
  candidates: PhenoCandidateInput[];
  scoresByPlant: Record<string, CandidateScoreRow>;
  decisionsByPlant: Record<string, KeeperDecisionRow>;
  /** Per-round cards keyed "plantId:round". */
  roundsByKey: Record<string, ScoreRoundRow>;
  error: string | null;
  saving: string | null;
  saveScore: (
    plantId: string,
    traits: Record<string, number>,
    note?: string | null,
  ) => Promise<boolean>;
  saveDecision: (
    plantId: string,
    decision: PhenoKeeperDecision,
    note?: string | null,
  ) => Promise<boolean>;
  saveRound: (
    plantId: string,
    round: PhenoScoreRound,
    payload: {
      loudTraits: Record<string, number>;
      aromaDescriptors?: readonly string[];
      noseNote?: string | null;
      note?: string | null;
    },
  ) => Promise<boolean>;
}

export function usePhenoHuntWorkspace(
  huntId: string | null | undefined,
): UsePhenoHuntWorkspaceState {
  const id = typeof huntId === "string" && huntId.trim().length > 0 ? huntId.trim() : null;

  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [hunt, setHunt] = useState<PhenoHuntSummary | null>(null);
  const [candidates, setCandidates] = useState<PhenoCandidateInput[]>([]);
  const [scoresByPlant, setScoresByPlant] = useState<Record<string, CandidateScoreRow>>({});
  const [decisionsByPlant, setDecisionsByPlant] = useState<Record<string, KeeperDecisionRow>>({});
  const [roundsByKey, setRoundsByKey] = useState<Record<string, ScoreRoundRow>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    (async () => {
      const result = await loadPhenoHuntCandidates(id);
      if (cancelled) return;
      if (result.ok !== true) {
        setError(result.error);
        setStatus("error");
        return;
      }
      const [scores, decisions, rounds] = await Promise.all([
        listCandidateScoresForHunt(id),
        listKeeperDecisionsForHunt(id),
        listScoreRoundsForHunt(id),
      ]);
      if (cancelled) return;
      setHunt(result.hunt);
      setCandidates([...result.candidates]);
      setScoresByPlant(scores);
      setDecisionsByPlant(decisions);
      setRoundsByKey(rounds);
      setStatus("ok");
    })().catch(() => {
      if (cancelled) return;
      setError("Could not load this hunt.");
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const saveScore = useCallback(
    async (plantId: string, traits: Record<string, number>, note?: string | null) => {
      if (!id) return false;
      setSaving(plantId);
      const res = await upsertCandidateScore({ huntId: id, plantId, traits, note });
      setSaving(null);
      if (res.ok === true) {
        setScoresByPlant((prev) => ({
          ...prev,
          [plantId]: { plantId, traits, note: note ?? null },
        }));
        return true;
      }
      setError(res.error);
      return false;
    },
    [id],
  );

  const saveDecision = useCallback(
    async (plantId: string, decision: PhenoKeeperDecision, note?: string | null) => {
      if (!id) return false;
      setSaving(plantId);
      const res = await recordKeeperDecision({ huntId: id, plantId, decision, note });
      setSaving(null);
      if (res.ok === true) {
        setDecisionsByPlant((prev) => ({
          ...prev,
          [plantId]: { plantId, decision, note: note ?? null, decidedAt: new Date().toISOString() },
        }));
        return true;
      }
      setError(res.error);
      return false;
    },
    [id],
  );

  const saveRound = useCallback(
    async (
      plantId: string,
      round: PhenoScoreRound,
      payload: {
        loudTraits: Record<string, number>;
        aromaDescriptors?: readonly string[];
        noseNote?: string | null;
        note?: string | null;
      },
    ) => {
      if (!id) return false;
      setSaving(plantId);
      const res = await upsertScoreRound({
        huntId: id,
        plantId,
        round,
        loudTraits: payload.loudTraits,
        aromaDescriptors: payload.aromaDescriptors,
        noseNote: payload.noseNote,
        note: payload.note,
      });
      setSaving(null);
      if (res.ok === true) {
        setRoundsByKey((prev) => ({
          ...prev,
          [`${plantId}:${round}`]: {
            plantId,
            round,
            traits: {},
            loudTraits: payload.loudTraits,
            aromaDescriptors: [...(payload.aromaDescriptors ?? [])],
            noseNote: payload.noseNote ?? null,
            note: payload.note ?? null,
            observedAt: new Date().toISOString(),
          },
        }));
        return true;
      }
      setError(res.error);
      return false;
    },
    [id],
  );

  return {
    status,
    hunt,
    candidates,
    scoresByPlant,
    decisionsByPlant,
    roundsByKey,
    error,
    saving,
    saveScore,
    saveDecision,
    saveRound,
  };
}
