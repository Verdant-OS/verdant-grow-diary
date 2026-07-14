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
import { phenoCandidateDisplayLabel } from "@/lib/phenoCandidateIdentity";
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
    // Clear the prior hunt's activity up front so it can never flash under a new
    // hunt while the reads are in flight (the section renders on entries.length).
    setEntries([]);
    (async () => {
      const [candRes, keepers, crosses, sexByPlant, decisionsByPlant] = await Promise.all([
        loadPhenoHuntCandidates(id),
        listKeepersForHunt(id),
        listCrossesForHunt(id),
        listLatestSexObservationsForHunt(id),
        listKeeperDecisionHistoryForHunt(id),
      ]);
      if (cancelled) return;
      // A failed hunt read is a real error, not "no activity" — surface it
      // instead of silently finishing "ok" with empty labels (matches
      // usePhenoKeepers). `!== true`: strict:false won't narrow the union.
      if (candRes.ok !== true) {
        setEntries([]);
        setStatus("error");
        return;
      }

      // Scope the reversal read to this hunt's keepers, not every reversal.
      const reversals = await listReversalsForKeepers(keepers.map((k) => k.id));
      if (cancelled) return;

      const candidateLabelById: Record<string, string | null> = {};
      if (candRes.ok === true) {
        for (const c of candRes.candidates)
          // Include the candidate number when assigned ("#3 · Sour Zebra");
          // otherwise preserve the "omit who when unlabeled" timeline contract.
          candidateLabelById[c.candidateId] =
            c.candidateNumber != null ? phenoCandidateDisplayLabel(c) : (c.candidateLabel ?? null);
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
