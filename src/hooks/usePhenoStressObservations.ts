/**
 * usePhenoStressObservations — loads persisted PHENOHUNT stress testing
 * observations for a hunt, exposes a save function bound to the current
 * owner, and derives per-candidate summaries. RLS-scoped reads/writes.
 *
 * No AI, no Action Queue, no automation, no device control, no sensor
 * ingest.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteStressObservation,
  insertStressObservation,
  listDiaryOptionsForOwner,
  listStressObservationsForHunt,
  updateStressObservation,
  type DiaryOptionRow,
  type PhenoStressObservationRow,
  type PhenoStressUpdateInput,
} from "@/lib/pheno/phenoStressObservationsApi";
import {
  summarizeStressForCandidate,
  type PhenoStressSummary,
} from "@/lib/pheno/phenoStressSummary";
import type { PhenoStressPersistDraft } from "@/components/PhenoStressTestingSection";

export interface PhenoStressWorkspaceState {
  readonly rows: readonly PhenoStressObservationRow[];
  readonly summariesByPlant: Record<string, PhenoStressSummary>;
  readonly diaryOptions: readonly { id: string; label: string }[];
  readonly save: (draft: PhenoStressPersistDraft) => Promise<boolean>;
  readonly update: (id: string, input: PhenoStressUpdateInput) => Promise<boolean>;
  readonly remove: (id: string) => Promise<boolean>;
  readonly refresh: () => Promise<void>;
  readonly loading: boolean;
  readonly error: string | null;
}

export function usePhenoStressObservations(
  huntId: string | null | undefined,
): PhenoStressWorkspaceState {
  const [rows, setRows] = useState<PhenoStressObservationRow[]>([]);
  const [diary, setDiary] = useState<DiaryOptionRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!huntId) return;
    setLoading(true);
    setError(null);
    try {
      const [obs, diaryRows, userRes] = await Promise.all([
        listStressObservationsForHunt(huntId),
        listDiaryOptionsForOwner(50),
        supabase.auth.getUser(),
      ]);
      setRows([...obs]);
      setDiary([...diaryRows]);
      setUserId(userRes.data.user?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [huntId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (draft: PhenoStressPersistDraft): Promise<boolean> => {
      if (!huntId || !userId) return false;
      try {
        const inserted = await insertStressObservation({
          userId,
          huntId,
          plantId: draft.plantId,
          stressFactor: draft.stressFactor,
          status: draft.status,
          startDate: draft.startDate,
          endDate: draft.endDate,
          intensity: draft.intensity,
          plantResponse: draft.plantResponse,
          recoveryNotes: draft.recoveryNotes,
          yieldImpactNotes: draft.yieldImpactNotes,
          diseasePestNotes: draft.diseasePestNotes,
          recommendation: draft.recommendation,
          linkedDiaryEntryId: draft.linkedDiaryEntryId,
          notes: draft.notes,
        });
        setRows((prev) => [inserted, ...prev]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [huntId, userId],
  );

  const update = useCallback(
    async (id: string, input: PhenoStressUpdateInput): Promise<boolean> => {
      try {
        const updated = await updateStressObservation(id, input);
        setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      await deleteStressObservation(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  const summariesByPlant = useMemo(() => {
    const map: Record<string, PhenoStressSummary> = {};
    const plantIds = new Set(rows.map((r) => r.plantId));
    for (const pid of plantIds) {
      map[pid] = summarizeStressForCandidate(pid, rows);
    }
    return map;
  }, [rows]);

  const diaryOptions = useMemo(
    () =>
      diary.map((d) => ({
        id: d.id,
        label: [
          d.entryAt ? new Date(d.entryAt).toISOString().slice(0, 10) : "unknown date",
          d.plantId ? `plant ${d.plantId.slice(0, 8)}` : "no plant",
          d.notePreview ? `"${d.notePreview}"` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    [diary],
  );

  return {
    rows,
    summariesByPlant,
    diaryOptions,
    save,
    refresh,
    loading,
    error,
  };
}
