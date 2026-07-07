/**
 * usePhenoHuntWorkspace — loads a grower's own hunt (candidates + saved trait
 * scores + keeper decisions) and exposes RLS-scoped save functions. Read/write,
 * but suggest-only: saving a score or decision persists the grower's own data
 * and acts on nothing. No AI, no Action Queue, no automation.
 */
import { useCallback, useEffect, useState } from "react";
import { loadPhenoHuntCandidates, type PhenoHuntSummary } from "@/lib/phenoHuntCandidatesService";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import { listKeepersForHunt } from "@/lib/phenoKeepersService";
import { listReversalsForKeepers } from "@/lib/phenoReversalsService";
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
import {
  appendKeeperDecision,
  listKeeperDecisionHistoryForHunt,
  type KeeperDecisionLogEntry,
} from "@/lib/phenoKeeperDecisionLogService";
import {
  appendSexObservation,
  listLatestSexObservationsForHunt,
  type SexObservationRow,
} from "@/lib/phenoSexObservationService";
import {
  upsertSmokeTest,
  listSmokeTestsForHunt,
  type SmokeTestRow,
} from "@/lib/phenoSmokeTestService";
import {
  upsertLabResult,
  listLabResultsForHunt,
  type LabResultRow,
  type PhenoLabSource,
  type TerpeneReading,
} from "@/lib/phenoLabResultsService";
import type { PhenoKeeperDecision } from "@/lib/phenoKeeperDecisionModel";
import type { PhenoSexObservation } from "@/lib/phenoSexObservationModel";

export type WorkspaceStatus = "idle" | "loading" | "ok" | "error";

export interface UsePhenoHuntWorkspaceState {
  status: WorkspaceStatus;
  hunt: PhenoHuntSummary | null;
  candidates: PhenoCandidateInput[];
  scoresByPlant: Record<string, CandidateScoreRow>;
  decisionsByPlant: Record<string, KeeperDecisionRow>;
  /** Per-round cards keyed "plantId:round". */
  roundsByKey: Record<string, ScoreRoundRow>;
  /** Append-only decision history keyed by plant id, newest first. */
  decisionHistoryByPlant: Record<string, KeeperDecisionLogEntry[]>;
  /** Latest recorded sex observation per plant. */
  sexByPlant: Record<string, SexObservationRow>;
  /**
   * Source-plant ids of candidates whose keeper has a recorded chemical reversal.
   * Used to suppress the herm/cull nudge on a reversed female (pollen expected).
   */
  reversedPlantIds: Set<string>;
  /** Post-cure smoke test per plant. */
  smokeByPlant: Record<string, SmokeTestRow>;
  /** Lab results keyed "plantId:source". */
  labByKey: Record<string, LabResultRow>;
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
    reason?: string | null,
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
  saveSex: (plantId: string, sex: PhenoSexObservation, note?: string | null) => Promise<boolean>;
  saveSmokeTest: (
    plantId: string,
    payload: {
      flavorDescriptors: readonly string[];
      effectDescriptors: readonly string[];
      smoothness: number | null;
      potencyImpression: number | null;
      verdict: string | null;
    },
  ) => Promise<boolean>;
  saveLabResult: (
    plantId: string,
    source: PhenoLabSource,
    payload: {
      thcPct: number | null;
      cbdPct: number | null;
      totalCannabinoidsPct: number | null;
      dominantTerpenes: readonly TerpeneReading[];
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
  const [decisionHistoryByPlant, setDecisionHistoryByPlant] = useState<
    Record<string, KeeperDecisionLogEntry[]>
  >({});
  const [sexByPlant, setSexByPlant] = useState<Record<string, SexObservationRow>>({});
  const [reversedPlantIds, setReversedPlantIds] = useState<Set<string>>(new Set());
  const [smokeByPlant, setSmokeByPlant] = useState<Record<string, SmokeTestRow>>({});
  const [labByKey, setLabByKey] = useState<Record<string, LabResultRow>>({});
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
      const [scores, decisions, rounds, history, sexes, smokes, labs, keepers] = await Promise.all([
        listCandidateScoresForHunt(id),
        listKeeperDecisionsForHunt(id),
        listScoreRoundsForHunt(id),
        listKeeperDecisionHistoryForHunt(id),
        listLatestSexObservationsForHunt(id),
        listSmokeTestsForHunt(id),
        listLabResultsForHunt(id),
        // A candidate promoted to keeper may have a recorded chemical reversal
        // (pheno_reversals) — needed to suppress the herm/cull nudge on the
        // reversed-female-herm landmine (pollen sacs are EXPECTED on a
        // deliberately reversed breeding female).
        listKeepersForHunt(id),
      ]);
      if (cancelled) return;
      // Reversed-keeper ids -> their SOURCE PLANT id (candidates are keyed by
      // plantId, reversals by keeperId; a keeper's sourcePlantId is the bridge).
      const reversedKeeperIds = new Set(
        (await listReversalsForKeepers(keepers.map((k) => k.id))).map((r) => r.keeperId),
      );
      if (cancelled) return;
      const reversedPlants = new Set(
        keepers.filter((k) => reversedKeeperIds.has(k.id)).map((k) => k.sourcePlantId),
      );
      setHunt(result.hunt);
      setCandidates([...result.candidates]);
      setScoresByPlant(scores);
      setDecisionsByPlant(decisions);
      setRoundsByKey(rounds);
      setDecisionHistoryByPlant(history);
      setSexByPlant(sexes);
      setReversedPlantIds(reversedPlants);
      setSmokeByPlant(smokes);
      setLabByKey(labs);
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
    async (plantId: string, decision: PhenoKeeperDecision, reason?: string | null) => {
      if (!id) return false;
      setSaving(plantId);
      const at = new Date().toISOString();
      // Current-decision store (flat, one row per candidate) …
      const flat = await recordKeeperDecision({ huntId: id, plantId, decision, note: reason });
      // … plus an immutable audit-trail row with the reason (append-only log).
      const logged = await appendKeeperDecision({ huntId: id, plantId, decision, reason });
      setSaving(null);
      if (flat.ok === true && logged.ok === true) {
        setDecisionsByPlant((prev) => ({
          ...prev,
          [plantId]: { plantId, decision, note: reason ?? null, decidedAt: at },
        }));
        const entry: KeeperDecisionLogEntry = {
          plantId,
          decision,
          reason: reason?.trim() || `Recorded ${decision}`,
          note: null,
          decidedAt: at,
        };
        setDecisionHistoryByPlant((prev) => ({
          ...prev,
          [plantId]: [entry, ...(prev[plantId] ?? [])],
        }));
        return true;
      }
      setError(
        (flat.ok === false && flat.error) ||
          (logged.ok === false && logged.error) ||
          "Could not record this decision.",
      );
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

  const saveSex = useCallback(
    async (plantId: string, sex: PhenoSexObservation, note?: string | null) => {
      if (!id) return false;
      setSaving(plantId);
      const res = await appendSexObservation({ huntId: id, plantId, sex, note });
      setSaving(null);
      if (res.ok === true) {
        setSexByPlant((prev) => ({
          ...prev,
          [plantId]: {
            plantId,
            sex,
            hermObserved: sex === "hermaphrodite",
            note: note ?? null,
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

  const saveSmokeTest = useCallback(
    async (
      plantId: string,
      payload: {
        flavorDescriptors: readonly string[];
        effectDescriptors: readonly string[];
        smoothness: number | null;
        potencyImpression: number | null;
        verdict: string | null;
      },
    ) => {
      if (!id) return false;
      setSaving(plantId);
      const res = await upsertSmokeTest({ huntId: id, plantId, ...payload });
      setSaving(null);
      if (res.ok === true) {
        setSmokeByPlant((prev) => ({ ...prev, [plantId]: { plantId, ...payload } }));
        return true;
      }
      setError(res.error);
      return false;
    },
    [id],
  );

  const saveLabResult = useCallback(
    async (
      plantId: string,
      source: PhenoLabSource,
      payload: {
        thcPct: number | null;
        cbdPct: number | null;
        totalCannabinoidsPct: number | null;
        dominantTerpenes: readonly TerpeneReading[];
      },
    ) => {
      if (!id) return false;
      setSaving(plantId);
      const res = await upsertLabResult({ huntId: id, plantId, source, ...payload });
      setSaving(null);
      if (res.ok === true) {
        setLabByKey((prev) => ({
          ...prev,
          [`${plantId}:${source}`]: {
            plantId,
            source,
            ...payload,
            labVerified: source === "coa",
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
    decisionHistoryByPlant,
    sexByPlant,
    reversedPlantIds,
    smokeByPlant,
    labByKey,
    error,
    saving,
    saveScore,
    saveDecision,
    saveRound,
    saveSex,
    saveSmokeTest,
    saveLabResult,
  };
}
