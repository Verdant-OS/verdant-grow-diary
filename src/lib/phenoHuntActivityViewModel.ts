/**
 * phenoHuntActivityViewModel — pure adapter that shapes a hunt's raw activity
 * reads (latest sex observation per plant, keeper-decision history per plant,
 * reversals, crosses) into ordered pheno timeline entries for the grow-diary
 * timeline. Thin wrapper over buildPhenoTimelineEntries — it exists only to
 * bridge the plant-keyed service outputs (which carry no row id) to the
 * view-model's row-shaped inputs, resolving candidate labels for display.
 *
 * Pure: no React, no Supabase, no I/O. Deterministic and null-safe.
 *
 * Read-only presentation. Nothing here writes, infers, or acts on a plant or
 * device — it mirrors the rest of the pheno surface.
 */
import {
  buildPhenoTimelineEntries,
  type PhenoTimelineEntry,
  type SexObservationInput,
  type KeeperDecisionInput,
  type ReversalInput,
  type CrossInput,
} from "@/lib/phenoTimelineEntriesViewModel";

/** Latest sex observation for one candidate (from listLatestSexObservationsForHunt). */
export interface SexObservationByPlant {
  readonly plantId: string;
  readonly sex: string;
  readonly hermObserved?: boolean | null;
  readonly note?: string | null;
  readonly observedAt?: string | null;
}

/** One decision-log row for a candidate (from listKeeperDecisionHistoryForHunt). */
export interface KeeperDecisionByPlant {
  readonly decision: string;
  readonly reason?: string | null;
  readonly note?: string | null;
  readonly decidedAt?: string | null;
}

export interface PhenoHuntActivityInput {
  /** Latest sex observation keyed by plant id. */
  readonly sexByPlant?: Record<string, SexObservationByPlant>;
  /** Decision history keyed by plant id, each list newest-first. */
  readonly decisionsByPlant?: Record<string, ReadonlyArray<KeeperDecisionByPlant>>;
  readonly reversals?: ReadonlyArray<ReversalInput>;
  readonly crosses?: ReadonlyArray<CrossInput>;
  /** Resolve a candidate/plant id → its label (e.g. "GMO #1"). */
  readonly candidateLabelById?: Record<string, string | null | undefined>;
  /** Resolve a keeper id → its name (for reversals/crosses). */
  readonly keeperNameById?: Record<string, string | null | undefined>;
}

/** Non-blank candidate label for a plant id, or null. */
function labelForPlant(input: PhenoHuntActivityInput, plantId: string): string | null {
  const l = input.candidateLabelById?.[plantId];
  return l && l.trim() !== "" ? l : null;
}

/**
 * Adapt the hunt's activity reads into timeline entries, most-recent first.
 *
 * Sex + decision rows are plant-keyed and carry no row id, so entries are keyed
 * by plant id — one sex entry (the latest observation) and one decision entry
 * (the newest decision) per candidate. Their entry ids never collide because
 * buildPhenoTimelineEntries prefixes by kind ("sex:" vs "decision:"). Reversals
 * and crosses already have row ids and pass straight through.
 */
export function buildPhenoHuntActivityEntries(input: PhenoHuntActivityInput): PhenoTimelineEntry[] {
  const sexObservations: SexObservationInput[] = Object.values(input.sexByPlant ?? {})
    .filter((o) => o && typeof o.plantId === "string" && o.plantId !== "")
    .map((o) => ({
      id: o.plantId,
      sex: o.sex,
      hermObserved: o.hermObserved ?? null,
      note: o.note ?? null,
      observedAt: o.observedAt ?? null,
    }));

  const keeperDecisions: KeeperDecisionInput[] = [];
  for (const [plantId, history] of Object.entries(input.decisionsByPlant ?? {})) {
    if (!plantId) continue;
    const latest = (history ?? [])[0]; // service returns newest-first
    if (!latest) continue;
    keeperDecisions.push({
      id: plantId,
      decision: latest.decision,
      candidateLabel: labelForPlant(input, plantId),
      // The log's reason is always present; fall back to it so a decision
      // entry always carries context even when the optional note is blank.
      note: latest.note ?? latest.reason ?? null,
      decidedAt: latest.decidedAt ?? null,
    });
  }

  return buildPhenoTimelineEntries({
    sexObservations,
    keeperDecisions,
    reversals: input.reversals,
    crosses: input.crosses,
    keeperName: (kid) => input.keeperNameById?.[kid] ?? null,
  });
}
