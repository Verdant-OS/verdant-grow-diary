/**
 * phenoCureTimelineViewModel — pure timeline of where a keeper was EARNED: the
 * grow rounds it was scored across, the cure (the decisive checkpoint), and the
 * re-grows that held it stable.
 *
 * Ethos (the demo's whole thesis): a keeper is earned at the cure and across
 * re-grow stability, not won on points. Every other surface says so in a caveat;
 * this one SHOWS it — the cure node and the re-grows are drawn, not asserted.
 *
 * Pure: no I/O, no writes, no ranking authority.
 */

export type RoundKey = "veg" | "early_flower" | "mid_flower" | "late_flower" | "post_cure";

const ROUND_ORDER: readonly RoundKey[] = [
  "veg",
  "early_flower",
  "mid_flower",
  "late_flower",
  "post_cure",
];

const ROUND_LABEL: Record<RoundKey, string> = {
  veg: "Veg",
  early_flower: "Early flower",
  mid_flower: "Mid flower",
  late_flower: "Late flower",
  post_cure: "Cure",
};

export interface CureTimelineInput {
  readonly id: string | number;
  readonly name?: string | null;
  readonly rounds?: readonly RoundKey[] | null;
  readonly stabilityRunCount?: number | null;
  readonly reversed?: boolean;
  readonly reversalMethods?: readonly string[] | null;
}

export type StageKind = "round" | "cure" | "regrow";

export interface TimelineStage {
  readonly key: string;
  readonly label: string;
  readonly kind: StageKind;
  /** The cure and the re-grows are the decisive, "earned" part of the line. */
  readonly decisive: boolean;
}

export interface CureTimeline {
  readonly id: string;
  readonly name: string;
  readonly stages: readonly TimelineStage[];
  readonly reachedCure: boolean;
  readonly stabilityRuns: number;
  readonly reversed: boolean;
  readonly reversalMethods: readonly string[];
  /** Earned = made it through the cure AND held across at least one re-grow. */
  readonly earned: boolean;
}

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Build a keeper's cure/stability timeline: grow rounds in canonical order, the
 * cure checkpoint (if reached), then one node per stability re-grow.
 */
export function buildCureTimeline(
  input: CureTimelineInput | null | undefined,
): CureTimeline | null {
  if (input == null || input.id == null) return null;

  const present = new Set<RoundKey>(
    (input.rounds ?? []).filter((r): r is RoundKey => ROUND_ORDER.includes(r as RoundKey)),
  );
  const reachedCure = present.has("post_cure");
  const stabilityRuns = Math.max(0, Math.trunc(input.stabilityRunCount ?? 0));

  const stages: TimelineStage[] = [];
  for (const r of ROUND_ORDER) {
    if (r === "post_cure") continue; // becomes the Cure node below
    if (present.has(r)) {
      stages.push({ key: r, label: ROUND_LABEL[r], kind: "round", decisive: false });
    }
  }
  if (reachedCure) {
    stages.push({ key: "cure", label: "Cure", kind: "cure", decisive: true });
  }
  for (let i = 1; i <= stabilityRuns; i += 1) {
    stages.push({ key: `regrow-${i}`, label: `Re-grow ${i}`, kind: "regrow", decisive: true });
  }

  return {
    id: String(input.id),
    name: clean(input.name) ?? String(input.id),
    stages,
    reachedCure,
    stabilityRuns,
    reversed: input.reversed === true,
    reversalMethods: (input.reversalMethods ?? []).filter((m): m is string => !!clean(m)),
    earned: reachedCure && stabilityRuns > 0,
  };
}
