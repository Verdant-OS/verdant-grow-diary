/**
 * usePhenoKeepers — loads a grower's keepers, their clone lineage, and crosses
 * for a hunt, plus the hunt's candidates (to promote to keeper). Exposes
 * RLS-scoped save functions. Data/record-only: nothing here acts on a plant or
 * device.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { loadPhenoHuntCandidates, type PhenoHuntSummary } from "@/lib/phenoHuntCandidatesService";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import {
  nameKeeper,
  listKeepersForHunt,
  addClone,
  listClonesForKeepers,
  linkClonePlant,
  recordCross,
  listCrossesForHunt,
  updateKeeperStabilityRuns,
  type KeeperRow,
  type CloneRow,
  type CrossRow,
} from "@/lib/phenoKeepersService";
import type { StabilityRun } from "@/lib/phenoStabilityRunRules";
import type { GrowOutPlantInput } from "@/lib/phenoGrowOutHandoffRules";
import { loadGrowOutPlantDetails } from "@/lib/phenoGrowOutPlantsService";
import {
  recordReversal,
  listReversalsForKeepers,
  type ReversalRow,
} from "@/lib/phenoReversalsService";
import type { CrossType, Channel } from "@/lib/genetics/breedingReproductionRules";
import {
  listLatestSexObservationsForHunt,
  type SexObservationRow,
} from "@/lib/phenoSexObservationService";
import {
  listKeeperDecisionHistoryForHunt,
  type KeeperDecisionLogEntry,
} from "@/lib/phenoKeeperDecisionLogService";

export type KeepersStatus = "idle" | "loading" | "ok" | "error";

export interface UsePhenoKeepersState {
  status: KeepersStatus;
  hunt: PhenoHuntSummary | null;
  candidates: PhenoCandidateInput[];
  keepers: KeeperRow[];
  clonesByKeeper: Record<string, CloneRow[]>;
  crosses: CrossRow[];
  /** Full reversal rows for this hunt's keepers (for the activity timeline). */
  reversals: ReversalRow[];
  /** Keeper ids the grower has recorded a reversal for (derived state). */
  reversedKeeperIds: string[];
  /** Latest sex observation per candidate (for the activity timeline). */
  sexByPlant: Record<string, SexObservationRow>;
  /** Keeper decision history per candidate, newest-first (for the timeline). */
  decisionsByPlant: Record<string, KeeperDecisionLogEntry[]>;
  error: string | null;
  saving: boolean;
  /** Retry the hunt, keeper, clone, cross, reversal, and evidence reads. */
  reload: () => void;
  promoteToKeeper: (sourcePlantId: string, keeperName: string) => Promise<boolean>;
  addKeeperClone: (keeperId: string, cloneLabel: string) => Promise<boolean>;
  /** Record a reversal on a keeper (append-only). */
  markReversed: (keeperId: string, method: string) => Promise<boolean>;
  /**
   * Replace a keeper's stability-run ledger (the grower edits the whole set:
   * add a grow-out, remove one). Sanitized + RLS-scoped in the service.
   */
  saveStabilityRuns: (keeperId: string, runs: readonly StabilityRun[]) => Promise<boolean>;
  /**
   * Details for plants the grower linked their clones to, keyed by plant id —
   * the evidence the grow-out handoff pre-fills a proposed run from.
   */
  growOutPlantsById: Record<string, GrowOutPlantInput>;
  /** Link (or unlink, with null) the real plant a clone was grown as. */
  linkGrowOutPlant: (cloneId: string, plantId: string | null) => Promise<boolean>;
  /**
   * Record a cross. Pass a distinct maleKeeperId for a two-parent cross, or
   * null to self (S1) the female keeper. With no `options` the service
   * auto-classifies (standard_f1 / feminized_cross / selfing_s1); pass `options`
   * to record an explicit breeding way + channel from the full taxonomy.
   */
  saveCross: (
    femaleKeeperId: string,
    maleKeeperId: string | null,
    crossName: string,
    options?: SaveCrossOptions,
  ) => Promise<boolean>;
}

/** Explicit taxonomy for saveCross (omit to auto-classify the 3 basic ways). */
export interface SaveCrossOptions {
  crossType?: CrossType | null;
  channel?: Channel | null;
  generation?: number | null;
  recurrentParentId?: string | null;
}

export function usePhenoKeepers(huntId: string | null | undefined): UsePhenoKeepersState {
  const id = typeof huntId === "string" && huntId.trim().length > 0 ? huntId.trim() : null;

  const [status, setStatus] = useState<KeepersStatus>("idle");
  const [hunt, setHunt] = useState<PhenoHuntSummary | null>(null);
  const [candidates, setCandidates] = useState<PhenoCandidateInput[]>([]);
  const [keepers, setKeepers] = useState<KeeperRow[]>([]);
  const [clonesByKeeper, setClonesByKeeper] = useState<Record<string, CloneRow[]>>({});
  const [crosses, setCrosses] = useState<CrossRow[]>([]);
  const [reversals, setReversals] = useState<ReversalRow[]>([]);
  const [reversedKeeperIds, setReversedKeeperIds] = useState<string[]>([]);
  const [sexByPlant, setSexByPlant] = useState<Record<string, SexObservationRow>>({});
  const [decisionsByPlant, setDecisionsByPlant] = useState<
    Record<string, KeeperDecisionLogEntry[]>
  >({});
  const [growOutPlantsById, setGrowOutPlantsById] = useState<Record<string, GrowOutPlantInput>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  // Synchronous in-flight guard: clones, reversals, and crosses are plain
  // append-only inserts with no idempotency key, so a double-click before
  // React state settles would mint duplicate rows. The ref refuses the
  // second call; the saving state remains the presentation signal.
  const savingRef = useRef(false);
  const beginSave = (): boolean => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  };
  const endSave = (): void => {
    savingRef.current = false;
    setSaving(false);
  };

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
      const [keeperRows, crossRows, sexRows, decisionRows] = await Promise.all([
        listKeepersForHunt(id),
        listCrossesForHunt(id),
        listLatestSexObservationsForHunt(id),
        listKeeperDecisionHistoryForHunt(id),
      ]);
      const keeperIds = keeperRows.map((k) => k.id);
      // Scope the reversal read to this hunt's keepers, not every reversal.
      const [clones, reversalRows] = await Promise.all([
        listClonesForKeepers(keeperIds),
        listReversalsForKeepers(keeperIds),
      ]);
      if (cancelled) return;
      const reversedIds = [...new Set(reversalRows.map((r) => r.keeperId))];
      const byKeeper: Record<string, CloneRow[]> = {};
      for (const c of clones) (byKeeper[c.keeperId] ??= []).push(c);
      // Grow-out handoff: details for the plants clones were linked to, so a
      // plant's own recorded traits can be PROPOSED instead of retyped.
      // Best-effort — a failure here just means no suggestions, never a
      // broken keepers page.
      const linkedPlantIds = clones
        .map((c) => (typeof c.clonePlantId === "string" ? c.clonePlantId : ""))
        .filter((v) => v !== "");
      const growOutPlants =
        linkedPlantIds.length > 0
          ? await loadGrowOutPlantDetails(linkedPlantIds).catch(() => ({}))
          : {};
      if (cancelled) return;
      setGrowOutPlantsById(growOutPlants);
      setHunt(result.hunt);
      setCandidates([...result.candidates]);
      setKeepers(keeperRows);
      setClonesByKeeper(byKeeper);
      setCrosses(crossRows);
      setReversals(reversalRows);
      setReversedKeeperIds(reversedIds);
      setSexByPlant(sexRows);
      setDecisionsByPlant(decisionRows);
      setStatus("ok");
    })().catch(() => {
      if (cancelled) return;
      setError("Could not load keepers.");
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [id, reloadTick]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const promoteToKeeper = useCallback(
    async (sourcePlantId: string, keeperName: string) => {
      if (!id) return false;
      if (!beginSave()) return false;
      const res = await nameKeeper({ huntId: id, sourcePlantId, keeperName });
      endSave();
      if (res.ok === true) {
        reload();
        return true;
      }
      setError(res.error);
      return false;
    },
    [id, reload],
  );

  const addKeeperClone = useCallback(
    async (keeperId: string, cloneLabel: string) => {
      if (!beginSave()) return false;
      const res = await addClone({ keeperId, cloneLabel });
      endSave();
      if (res.ok === true) {
        reload();
        return true;
      }
      setError(res.error);
      return false;
    },
    [reload],
  );

  const markReversed = useCallback(
    async (keeperId: string, method: string) => {
      if (!beginSave()) return false;
      const res = await recordReversal({ keeperId, method });
      endSave();
      if (res.ok === true) {
        reload();
        return true;
      }
      setError(res.error);
      return false;
    },
    [reload],
  );

  const linkGrowOutPlant = useCallback(
    async (cloneId: string, plantId: string | null) => {
      if (!beginSave()) return false;
      const res = await linkClonePlant({ cloneId, plantId });
      endSave();
      if (res.ok === true) {
        reload();
        return true;
      }
      setError(res.error);
      return false;
    },
    [reload],
  );

  const saveStabilityRuns = useCallback(
    async (keeperId: string, runs: readonly StabilityRun[]) => {
      if (!beginSave()) return false;
      const res = await updateKeeperStabilityRuns({ keeperId, runs });
      endSave();
      if (res.ok === true) {
        reload();
        return true;
      }
      setError(res.error);
      return false;
    },
    [reload],
  );

  const saveCross = useCallback(
    async (
      femaleKeeperId: string,
      maleKeeperId: string | null,
      crossName: string,
      options?: SaveCrossOptions,
    ) => {
      if (!id) return false;
      if (!beginSave()) return false;
      const res = await recordCross({
        huntId: id,
        femaleKeeperId,
        maleKeeperId,
        crossName: crossName.trim() || null,
        crossType: options?.crossType ?? null,
        channel: options?.channel ?? null,
        generation: options?.generation ?? null,
        recurrentParentId: options?.recurrentParentId ?? null,
      });
      endSave();
      if (res.ok === true) {
        reload();
        return true;
      }
      setError(res.error);
      return false;
    },
    [id, reload],
  );

  return {
    status,
    hunt,
    candidates,
    keepers,
    clonesByKeeper,
    crosses,
    reversals,
    reversedKeeperIds,
    sexByPlant,
    decisionsByPlant,
    error,
    saving,
    reload,
    promoteToKeeper,
    addKeeperClone,
    markReversed,
    saveStabilityRuns,
    growOutPlantsById,
    linkGrowOutPlant,
    saveCross,
  };
}
