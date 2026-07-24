/**
 * usePhenoHuntWorkspace — loads a grower's own hunt in BOUNDED PAGES (candidate
 * list + that page's trait scores, keeper decisions, sex, smoke, and lab rows)
 * and exposes RLS-scoped save functions. Read/write, but suggest-only: saving a
 * score or decision persists the grower's own data and acts on nothing. No AI,
 * no Action Queue, no automation.
 *
 * Scale-up: the candidate list is read one bounded, deterministically-ordered
 * page at a time (never an unbounded initial read), evidence is fetched only for
 * the visible page, the hunt-wide "comparison ready" gate is derived from a
 * bounded summary, filters are server-side and reset pagination, and stale page
 * responses can never overwrite newer filter/page state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadPhenoHuntSummary,
  loadPhenoHuntCandidatePage,
  loadPhenoHuntComparisonSummary,
  type PhenoHuntSummary,
  type PhenoCandidatePageFilters,
  type PhenoHuntComparisonSummary,
} from "@/lib/phenoHuntCandidatesService";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import {
  assignPhenoCandidateNumber,
  type AssignCandidateNumberResult,
} from "@/lib/phenoCandidateNumberService";
import { listClonesForKeepers, listKeepersForHunt } from "@/lib/phenoKeepersService";
import { listReversedKeeperIdsForKeepers } from "@/lib/phenoReversalsService";
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
  listKeeperDecisionHistoryForPlant,
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

/** Explicit page size for the bounded candidate read. */
export const CANDIDATE_PAGE_SIZE = 30;

/** Server-side filters (identity/strain/stage push to WHERE; decision/sex via
 * candidate-id intersection). Readiness is a computed refinement done in the
 * presenter, never here. */
export type PhenoWorkspaceFilters = PhenoCandidatePageFilters;

export interface UsePhenoHuntWorkspaceState {
  status: WorkspaceStatus;
  hunt: PhenoHuntSummary | null;
  /** Loaded candidates so far (accumulates as pages load). */
  candidates: PhenoCandidateInput[];
  /** Honest server total for the active filters, or null if unavailable. */
  totalCandidateCount: number | null;
  /** True while an additional page is being fetched. */
  loadingMore: boolean;
  /** True when more pages remain for the active filters. */
  hasMore: boolean;
  /** Load the next bounded page (append). No-op while one is in flight. */
  loadNextPage: () => void;
  /** Active server-side filters. */
  filters: PhenoWorkspaceFilters;
  /** Patch the filters; resets pagination to page 0 with stale-response guard. */
  setFilter: (patch: Partial<PhenoWorkspaceFilters>) => void;
  /** Clear all server-side filters. */
  resetFilters: () => void;
  /** Bounded hunt-wide comparison-ready signals (never the full evidence set). */
  comparisonSummary: PhenoHuntComparisonSummary | null;
  scoresByPlant: Record<string, CandidateScoreRow>;
  decisionsByPlant: Record<string, KeeperDecisionRow>;
  /** Per-round cards keyed "plantId:round", loaded on demand via loadRound. */
  roundsByKey: Record<string, ScoreRoundRow>;
  /**
   * Append-only decision history keyed by plant id, newest first. Populated
   * on demand per candidate via loadDecisionHistory (a hunt-wide fetch is
   * unbounded at commercial scale) plus optimistic appends after saves.
   */
  decisionHistoryByPlant: Record<string, KeeperDecisionLogEntry[]>;
  /** Fetch one candidate's decision history on demand (idempotent per plant). */
  loadDecisionHistory: (plantId: string) => Promise<void>;
  /** Fetch one scoring round's cards on demand (idempotent per round). */
  loadRound: (round: PhenoScoreRound) => Promise<void>;
  /** Latest recorded sex observation per plant. */
  sexByPlant: Record<string, SexObservationRow>;
  /**
   * Source-plant ids of candidates whose keeper has a recorded chemical reversal.
   * Used to suppress the herm/cull nudge on a reversed female (pollen expected).
   */
  reversedPlantIds: Set<string>;
  /**
   * Source-plant ids of candidates with at least one recorded clone (via
   * their keeper's pheno_keeper_clones rows). Drives the clone-insurance
   * banner and the clone_readiness evidence goal. Records only — Verdant
   * never takes or culls a clone for anyone.
   */
  clonedPlantIds: Set<string>;
  /** Post-cure smoke test per plant. */
  smokeByPlant: Record<string, SmokeTestRow>;
  /** Lab results keyed "plantId:source". */
  labByKey: Record<string, LabResultRow>;
  error: string | null;
  saving: string | null;
  /** Owner-only candidate-number assignment (DB trigger is authoritative). */
  assignCandidateNumber: (
    plantId: string,
    candidateNumber: number,
  ) => Promise<AssignCandidateNumberResult>;
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

/** Fetch the five editable evidence maps for exactly one page of candidates. */
async function loadPageEvidence(huntId: string, plantIds: string[]) {
  const [scores, decisions, sexes, smokes, labs] = await Promise.all([
    listCandidateScoresForHunt(huntId, plantIds),
    listKeeperDecisionsForHunt(huntId, plantIds),
    listLatestSexObservationsForHunt(huntId, plantIds),
    listSmokeTestsForHunt(huntId, plantIds),
    listLabResultsForHunt(huntId, plantIds),
  ]);
  return { scores, decisions, sexes, smokes, labs };
}

export function usePhenoHuntWorkspace(
  huntId: string | null | undefined,
): UsePhenoHuntWorkspaceState {
  const id = typeof huntId === "string" && huntId.trim().length > 0 ? huntId.trim() : null;

  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [hunt, setHunt] = useState<PhenoHuntSummary | null>(null);
  const [candidates, setCandidates] = useState<PhenoCandidateInput[]>([]);
  const [totalCandidateCount, setTotalCandidateCount] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFiltersState] = useState<PhenoWorkspaceFilters>({});
  const [comparisonSummary, setComparisonSummary] = useState<PhenoHuntComparisonSummary | null>(
    null,
  );
  const [scoresByPlant, setScoresByPlant] = useState<Record<string, CandidateScoreRow>>({});
  const [decisionsByPlant, setDecisionsByPlant] = useState<Record<string, KeeperDecisionRow>>({});
  const [roundsByKey, setRoundsByKey] = useState<Record<string, ScoreRoundRow>>({});
  const [decisionHistoryByPlant, setDecisionHistoryByPlant] = useState<
    Record<string, KeeperDecisionLogEntry[]>
  >({});
  const [sexByPlant, setSexByPlant] = useState<Record<string, SexObservationRow>>({});
  const [reversedPlantIds, setReversedPlantIds] = useState<Set<string>>(new Set());
  const [clonedPlantIds, setClonedPlantIds] = useState<Set<string>>(new Set());
  const [smokeByPlant, setSmokeByPlant] = useState<Record<string, SmokeTestRow>>({});
  const [labByKey, setLabByKey] = useState<Record<string, LabResultRow>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // Pagination + stale-response guard. requestRef is bumped on every reset
  // (mount / filter change); a page response tagged with an old id is dropped.
  const pageRef = useRef<number>(0);
  const requestRef = useRef<number>(0);
  // On-demand fetch guards: which plants' histories / which rounds are loaded
  // (or in flight). Reset when the hunt/filters change.
  const historyLoadedRef = useRef<Set<string>>(new Set());
  const roundsLoadedRef = useRef<Set<PhenoScoreRound>>(new Set());

  // Reset + load page 0 whenever the hunt or the server-side filters change.
  useEffect(() => {
    if (!id) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    const reqId = ++requestRef.current;
    setStatus("loading");
    setError(null);
    historyLoadedRef.current = new Set();
    roundsLoadedRef.current = new Set();
    setDecisionHistoryByPlant({});
    setRoundsByKey({});
    (async () => {
      const [summaryRes, comparison, pageRes] = await Promise.all([
        loadPhenoHuntSummary(id),
        loadPhenoHuntComparisonSummary(id),
        loadPhenoHuntCandidatePage({ huntId: id, page: 0, pageSize: CANDIDATE_PAGE_SIZE, filters }),
      ]);
      if (cancelled || reqId !== requestRef.current) return;
      if (summaryRes.ok === false) {
        setError(summaryRes.error);
        setStatus("error");
        return;
      }
      if (pageRes.ok === false) {
        setError(pageRes.error);
        setStatus("error");
        return;
      }
      const pageIds = pageRes.candidates.map((c) => c.candidateId);
      const [{ scores, decisions, sexes, smokes, labs }, keepers] = await Promise.all([
        loadPageEvidence(id, pageIds),
        listKeepersForHunt(id),
      ]);
      if (cancelled || reqId !== requestRef.current) return;
      const keeperIds = keepers.map((k) => k.id);
      const [reversedKeeperIdList, cloneRows] = await Promise.all([
        listReversedKeeperIdsForKeepers(keeperIds),
        listClonesForKeepers(keeperIds),
      ]);
      const reversedKeeperIds = new Set(reversedKeeperIdList);
      if (cancelled || reqId !== requestRef.current) return;
      pageRef.current = 0;
      setHunt(summaryRes.hunt);
      setComparisonSummary(comparison);
      setTotalCandidateCount(pageRes.total);
      setCandidates(pageRes.candidates);
      setScoresByPlant(scores);
      setDecisionsByPlant(decisions);
      setSexByPlant(sexes);
      setSmokeByPlant(smokes);
      setLabByKey(labs);
      setReversedPlantIds(
        new Set(keepers.filter((k) => reversedKeeperIds.has(k.id)).map((k) => k.sourcePlantId)),
      );
      // A candidate is clone-insured when its keeper has >=1 recorded clone.
      const clonedKeeperIds = new Set(cloneRows.map((c) => c.keeperId));
      setClonedPlantIds(
        new Set(keepers.filter((k) => clonedKeeperIds.has(k.id)).map((k) => k.sourcePlantId)),
      );
      setStatus("ok");
    })().catch(() => {
      if (cancelled || reqId !== requestRef.current) return;
      setError("Could not load this hunt.");
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [id, filters]);

  const hasMore =
    status === "ok" && totalCandidateCount != null && candidates.length < totalCandidateCount;

  const loadNextPage = useCallback(() => {
    if (!id || loadingMore || status !== "ok") return;
    if (totalCandidateCount != null && candidates.length >= totalCandidateCount) return;
    const reqId = requestRef.current; // must match the active reset context
    const nextPage = pageRef.current + 1;
    setLoadingMore(true);
    (async () => {
      const pageRes = await loadPhenoHuntCandidatePage({
        huntId: id,
        page: nextPage,
        pageSize: CANDIDATE_PAGE_SIZE,
        filters,
      });
      // A filter reset happened while this page was in flight — drop it so a
      // stale page can never overwrite newer state.
      if (reqId !== requestRef.current) {
        setLoadingMore(false);
        return;
      }
      if (!pageRes.ok) {
        setLoadingMore(false);
        return;
      }
      const pageIds = pageRes.candidates.map((c) => c.candidateId);
      const { scores, decisions, sexes, smokes, labs } = await loadPageEvidence(id, pageIds);
      if (reqId !== requestRef.current) {
        setLoadingMore(false);
        return;
      }
      pageRef.current = nextPage;
      setTotalCandidateCount(pageRes.total);
      setCandidates((prev) => [...prev, ...pageRes.candidates]);
      setScoresByPlant((prev) => ({ ...prev, ...scores }));
      setDecisionsByPlant((prev) => ({ ...prev, ...decisions }));
      setSexByPlant((prev) => ({ ...prev, ...sexes }));
      setSmokeByPlant((prev) => ({ ...prev, ...smokes }));
      setLabByKey((prev) => ({ ...prev, ...labs }));
      setLoadingMore(false);
    })().catch(() => setLoadingMore(false));
  }, [id, loadingMore, status, totalCandidateCount, candidates.length, filters]);

  const setFilter = useCallback((patch: Partial<PhenoWorkspaceFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);
  const resetFilters = useCallback(() => setFiltersState({}), []);

  const loadDecisionHistory = useCallback(
    async (plantId: string) => {
      if (!id || !plantId || historyLoadedRef.current.has(plantId)) return;
      historyLoadedRef.current.add(plantId);
      const entries = await listKeeperDecisionHistoryForPlant(id, plantId);
      // Optimistic entries appended by saves while the fetch was in flight
      // are a subset of what the server returns (the save wrote them), so the
      // fetched list is authoritative — but keep any existing entries when the
      // fetch returned nothing (offline / error path returns []).
      setDecisionHistoryByPlant((prev) =>
        entries.length > 0 ? { ...prev, [plantId]: entries } : prev,
      );
    },
    [id],
  );

  const loadRound = useCallback(
    async (round: PhenoScoreRound) => {
      if (!id || roundsLoadedRef.current.has(round)) return;
      roundsLoadedRef.current.add(round);
      const cards = await listScoreRoundsForHunt(id, round);
      setRoundsByKey((prev) => ({ ...cards, ...prev }));
    },
    [id],
  );

  const assignCandidateNumber = useCallback(
    async (plantId: string, candidateNumber: number): Promise<AssignCandidateNumberResult> => {
      const res = await assignPhenoCandidateNumber({ plantId, candidateNumber });
      if (res.ok) {
        // Optimistic: show the number immediately. Canonical re-ordering by
        // number happens on the next reload (assignment is a rare, once-per
        // candidate action, so we don't reshuffle the loaded pages here).
        setCandidates((prev) =>
          prev.map((c) =>
            c.candidateId === plantId ? { ...c, candidateNumber: res.candidateNumber } : c,
          ),
        );
      }
      return res;
    },
    [],
  );

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
      // Dirty-check (scale audit C2): the Save button fires decision + sex
      // together on every click; only append to the immutable audit log when
      // the value actually changed, otherwise each save mints redundant
      // append-only rows forever.
      const existingDecision = decisionsByPlant[plantId];
      const normalizedReason = reason?.trim() || null;
      if (
        existingDecision &&
        existingDecision.decision === decision &&
        (existingDecision.note?.trim() || null) === normalizedReason
      ) {
        return true;
      }
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
    [id, decisionsByPlant],
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
      // Dirty-check (scale audit C2): skip the append when the latest
      // recorded observation already matches.
      const existingSex = sexByPlant[plantId];
      const normalizedNote = note?.trim() || null;
      if (
        existingSex &&
        existingSex.sex === sex &&
        (existingSex.note?.trim() || null) === normalizedNote
      ) {
        return true;
      }
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
    [id, sexByPlant],
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
    totalCandidateCount,
    loadingMore,
    hasMore,
    loadNextPage,
    filters,
    setFilter,
    resetFilters,
    comparisonSummary,
    scoresByPlant,
    decisionsByPlant,
    roundsByKey,
    decisionHistoryByPlant,
    sexByPlant,
    reversedPlantIds,
    clonedPlantIds,
    smokeByPlant,
    labByKey,
    error,
    saving,
    assignCandidateNumber,
    loadDecisionHistory,
    loadRound,
    saveScore,
    saveDecision,
    saveRound,
    saveSex,
    saveSmokeTest,
    saveLabResult,
  };
}
