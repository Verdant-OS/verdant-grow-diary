/**
 * usePhenoHuntActivity — read-only loader for a hunt's pheno activity timeline
 * (latest sex observation per candidate, newest keeper decision per candidate,
 * reversals, and crosses), shaped into ordered timeline entries.
 *
 * Read-only: every call here is a SELECT via an RLS-scoped service. Nothing
 * writes, infers, or acts on a plant or device. Safe to mount on the grow-diary
 * timeline for the currently-selected hunt.
 */
import { useEffect, useState } from "react";
import { loadPhenoHuntCandidates } from "@/lib/phenoHuntCandidatesService";
import { listKeepersForHunt, listCrossesForHunt } from "@/lib/phenoKeepersService";
import { listReversalsForKeepers } from "@/lib/phenoReversalsService";
import { listLatestSexObservationsForHunt } from "@/lib/phenoSexObservationService";
import { listKeeperDecisionHistoryForHunt } from "@/lib/phenoKeeperDecisionLogService";
import {
  buildPhenoHuntActivityEntries,
  type PhenoHuntActivityInput,
} from "@/lib/phenoHuntActivityViewModel";
import type { PhenoTimelineEntry } from "@/lib/phenoTimelineEntriesViewModel";

export type PhenoHuntActivityStatus = "idle" | "loading" | "ok" | "error";

export interface UsePhenoHuntActivityState {
  status: PhenoHuntActivityStatus;
  entries: PhenoTimelineEntry[];
}

export function usePhenoHuntActivity(huntId: string | null | undefined): UsePhenoHuntActivityState {
  const id = typeof huntId === "string" && huntId.trim().length > 0 ? huntId.trim() : null;

  const [status, setStatus] = useState<PhenoHuntActivityStatus>("idle");
  const [entries, setEntries] = useState<PhenoTimelineEntry[]>([]);

  useEffect(() => {
    if (!id) {
      setStatus("idle");
      setEntries([]);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const [candRes, keepers, crosses, sexByPlant, decisionsByPlant] = await Promise.all([
        loadPhenoHuntCandidates(id),
        listKeepersForHunt(id),
        listCrossesForHunt(id),
        listLatestSexObservationsForHunt(id),
        listKeeperDecisionHistoryForHunt(id),
      ]);
      // Scope the reversal read to this hunt's keepers, not every reversal.
      const reversals = await listReversalsForKeepers(keepers.map((k) => k.id));
      if (cancelled) return;

      const candidateLabelById: Record<string, string | null> = {};
      // `=== true` narrowing: strict:false means `!candRes.ok` won't narrow the union.
      if (candRes.ok === true) {
        for (const c of candRes.candidates)
          candidateLabelById[c.candidateId] = c.candidateLabel ?? null;
      }
      const keeperNameById: Record<string, string> = {};
      for (const k of keepers) keeperNameById[k.id] = k.keeperName;

      const input: PhenoHuntActivityInput = {
        sexByPlant,
        decisionsByPlant,
        reversals,
        crosses,
        candidateLabelById,
        keeperNameById,
      };
      setEntries(buildPhenoHuntActivityEntries(input));
      setStatus("ok");
    })().catch(() => {
      if (cancelled) return;
      setEntries([]);
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { status, entries };
}
