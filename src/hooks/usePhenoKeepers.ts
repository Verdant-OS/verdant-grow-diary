/**
 * usePhenoKeepers — loads a grower's keepers, their clone lineage, and crosses
 * for a hunt, plus the hunt's candidates (to promote to keeper). Exposes
 * RLS-scoped save functions. Data/record-only: nothing here acts on a plant or
 * device.
 */
import { useCallback, useEffect, useState } from "react";
import { loadPhenoHuntCandidates, type PhenoHuntSummary } from "@/lib/phenoHuntCandidatesService";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import {
  nameKeeper,
  listKeepersForHunt,
  addClone,
  listClonesForKeepers,
  recordCross,
  listCrossesForHunt,
  type KeeperRow,
  type CloneRow,
  type CrossRow,
} from "@/lib/phenoKeepersService";

export type KeepersStatus = "idle" | "loading" | "ok" | "error";

export interface UsePhenoKeepersState {
  status: KeepersStatus;
  hunt: PhenoHuntSummary | null;
  candidates: PhenoCandidateInput[];
  keepers: KeeperRow[];
  clonesByKeeper: Record<string, CloneRow[]>;
  crosses: CrossRow[];
  error: string | null;
  saving: boolean;
  promoteToKeeper: (sourcePlantId: string, keeperName: string) => Promise<boolean>;
  addKeeperClone: (keeperId: string, cloneLabel: string) => Promise<boolean>;
  saveCross: (femaleKeeperId: string, maleKeeperId: string, crossName: string) => Promise<boolean>;
}

export function usePhenoKeepers(huntId: string | null | undefined): UsePhenoKeepersState {
  const id = typeof huntId === "string" && huntId.trim().length > 0 ? huntId.trim() : null;

  const [status, setStatus] = useState<KeepersStatus>("idle");
  const [hunt, setHunt] = useState<PhenoHuntSummary | null>(null);
  const [candidates, setCandidates] = useState<PhenoCandidateInput[]>([]);
  const [keepers, setKeepers] = useState<KeeperRow[]>([]);
  const [clonesByKeeper, setClonesByKeeper] = useState<Record<string, CloneRow[]>>({});
  const [crosses, setCrosses] = useState<CrossRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

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
      const [keeperRows, crossRows] = await Promise.all([
        listKeepersForHunt(id),
        listCrossesForHunt(id),
      ]);
      const clones = await listClonesForKeepers(keeperRows.map((k) => k.id));
      if (cancelled) return;
      const byKeeper: Record<string, CloneRow[]> = {};
      for (const c of clones) (byKeeper[c.keeperId] ??= []).push(c);
      setHunt(result.hunt);
      setCandidates([...result.candidates]);
      setKeepers(keeperRows);
      setClonesByKeeper(byKeeper);
      setCrosses(crossRows);
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
      setSaving(true);
      const res = await nameKeeper({ huntId: id, sourcePlantId, keeperName });
      setSaving(false);
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
      setSaving(true);
      const res = await addClone({ keeperId, cloneLabel });
      setSaving(false);
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
    async (femaleKeeperId: string, maleKeeperId: string, crossName: string) => {
      if (!id) return false;
      setSaving(true);
      const res = await recordCross({
        huntId: id,
        femaleKeeperId,
        maleKeeperId,
        crossName: crossName.trim() || null,
      });
      setSaving(false);
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
    error,
    saving,
    promoteToKeeper,
    addKeeperClone,
    saveCross,
  };
}
