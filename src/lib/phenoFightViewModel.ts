/**
 * phenoFightViewModel — pure "fight night": two keepers, head to head, trait by
 * trait. It stages the comparison — who has the edge on each axis, the trait
 * tally, each side's shortlist composite — and stops there.
 *
 * Ethos (refuse to hype; the grower decides): there is deliberately NO `winner`
 * field. Fight night lays the two side by side and hands the call back to the
 * grower — the tally and the composites inform, they never decide. Reuses the
 * canonical Loud scorecard from phenoContendersViewModel so the weights stay a
 * single source of truth.
 *
 * Pure: no I/O, no writes, no ranking authority.
 */
import {
  CONTENDER_AXES,
  contenderScore,
  type AxisKey,
  type ContenderInput,
  type ContenderVerdict,
} from "@/lib/phenoContendersViewModel";

export type FightEdge = "a" | "b" | "tie";

export interface FightAxis {
  readonly key: AxisKey;
  readonly label: string;
  readonly weightPct: number;
  readonly aValue: number;
  readonly bValue: number;
  /** Which side is stronger on this trait — or a tie. Not a verdict. */
  readonly edge: FightEdge;
  readonly margin: number;
}

export interface FightSide {
  readonly id: string;
  readonly name: string;
  readonly verdict: ContenderVerdict;
  readonly aroma: readonly string[];
  readonly score: number;
  /** Traits where this side has the edge (informational). */
  readonly axisWins: number;
}

export interface PhenoFight {
  readonly a: FightSide;
  readonly b: FightSide;
  readonly axes: readonly FightAxis[];
  readonly ties: number;
  // No `winner`, by design — the call is the grower's.
}

function clamp10(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function clampAxes(axes: ContenderInput["axes"]): Record<AxisKey, number> {
  return {
    nose: clamp10(axes?.nose),
    resin: clamp10(axes?.resin),
    structure: clamp10(axes?.structure),
    yield: clamp10(axes?.yield),
    breeding: clamp10(axes?.breeding),
  };
}

function toSide(input: ContenderInput, vals: Record<AxisKey, number>, axisWins: number): FightSide {
  return {
    id: String(input.id),
    name: clean(input.name) ?? String(input.id),
    verdict: input.verdict,
    aroma: (input.aroma ?? []).filter((x): x is string => !!clean(x)),
    score: contenderScore(vals),
    axisWins,
  };
}

/**
 * Stage a head-to-head between two contenders. Returns null if either side is
 * missing. Per-axis edge, each side's trait-win count, and the tie count — but
 * never an overall winner.
 */
export function buildFight(
  a: ContenderInput | null | undefined,
  b: ContenderInput | null | undefined,
): PhenoFight | null {
  if (a == null || a.id == null || b == null || b.id == null) return null;

  const av = clampAxes(a.axes);
  const bv = clampAxes(b.axes);

  let aWins = 0;
  let bWins = 0;
  let ties = 0;

  const axes: FightAxis[] = CONTENDER_AXES.map((ax) => {
    const aValue = av[ax.key];
    const bValue = bv[ax.key];
    const edge: FightEdge = aValue > bValue ? "a" : bValue > aValue ? "b" : "tie";
    if (edge === "a") aWins += 1;
    else if (edge === "b") bWins += 1;
    else ties += 1;
    return {
      key: ax.key,
      label: ax.label,
      weightPct: ax.weightPct,
      aValue,
      bValue,
      edge,
      margin: Math.abs(aValue - bValue),
    };
  });

  return {
    a: toSide(a, av, aWins),
    b: toSide(b, bv, bWins),
    axes,
    ties,
  };
}
