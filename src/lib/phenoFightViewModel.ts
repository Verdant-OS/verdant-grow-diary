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
import {
  areComparable,
  normalizePlantType,
  plantStageRank,
  type ComparabilityVerdict,
  type PlantType,
} from "@/lib/plantTypeRules";

/** "unknown" = at least one side never scored this trait — no edge is real. */
export type FightEdge = "a" | "b" | "tie" | "unknown";

export interface FightAxis {
  readonly key: AxisKey;
  readonly label: string;
  readonly weightPct: number;
  /** 0–10, or null when that side never scored this trait. */
  readonly aValue: number | null;
  readonly bValue: number | null;
  /** Which side is stronger on this trait — a tie, or unknown when either
   * side's value is missing. Not a verdict; a missing value never "loses". */
  readonly edge: FightEdge;
  /** Absolute margin when both sides are scored; null otherwise. */
  readonly margin: number | null;
}

export interface FightSide {
  readonly id: string;
  readonly name: string;
  readonly verdict: ContenderVerdict;
  readonly aroma: readonly string[];
  /** Renormalized composite over this side's scored axes; null if unscored. */
  readonly score: number | null;
  /** Traits where this side has the edge (informational; both sides scored). */
  readonly axisWins: number;
  /** Normalized declared type — presenters render a persistent badge. */
  readonly plantType: PlantType;
}

export interface PhenoFight {
  readonly a: FightSide;
  readonly b: FightSide;
  readonly axes: readonly FightAxis[];
  readonly ties: number;
  /** Axes where either side is unscored — surfaced, never counted as losses. */
  readonly unknownAxes: number;
  /**
   * Pair comparability (autoflower/photoperiod plan, 2026-07-21): mixed or
   * unknown types, or stages beyond the locked tolerance, mark the fight
   * not comparable — presenters strike the tally/composite visuals and show
   * the banner. Axis values stay visible (organizing only).
   */
  readonly comparability: ComparabilityVerdict;
  // No `winner`, by design — the call is the grower's.
}

/** Clamp a present value to 0–10; a missing value stays null (never a 0). */
function clamp10OrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function clampAxes(axes: ContenderInput["axes"]): Record<AxisKey, number | null> {
  return {
    nose: clamp10OrNull(axes?.nose),
    resin: clamp10OrNull(axes?.resin),
    structure: clamp10OrNull(axes?.structure),
    yield: clamp10OrNull(axes?.yield),
    breeding: clamp10OrNull(axes?.breeding),
  };
}

function toSide(
  input: ContenderInput,
  vals: Record<AxisKey, number | null>,
  axisWins: number,
): FightSide {
  return {
    id: String(input.id),
    name: clean(input.name) ?? String(input.id),
    verdict: input.verdict,
    aroma: (input.aroma ?? []).filter((x): x is string => !!clean(x)),
    score: contenderScore(vals),
    axisWins,
    plantType: normalizePlantType(input.plantType),
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
  let unknownAxes = 0;

  const axes: FightAxis[] = CONTENDER_AXES.map((ax) => {
    const aValue = av[ax.key];
    const bValue = bv[ax.key];
    // A missing value produces NO edge: an unscored trait is unknown, not a
    // 10–0 loss. Only both-scored axes enter the tally.
    let edge: FightEdge;
    if (aValue === null || bValue === null) {
      edge = "unknown";
      unknownAxes += 1;
    } else if (aValue > bValue) {
      edge = "a";
      aWins += 1;
    } else if (bValue > aValue) {
      edge = "b";
      bWins += 1;
    } else {
      edge = "tie";
      ties += 1;
    }
    return {
      key: ax.key,
      label: ax.label,
      weightPct: ax.weightPct,
      aValue,
      bValue,
      edge,
      margin: aValue !== null && bValue !== null ? Math.abs(aValue - bValue) : null,
    };
  });

  return {
    a: toSide(a, av, aWins),
    b: toSide(b, bv, bWins),
    axes,
    ties,
    unknownAxes,
    comparability: areComparable(
      { plantType: a.plantType ?? null, stageRank: plantStageRank(a.stage ?? null) },
      { plantType: b.plantType ?? null, stageRank: plantStageRank(b.stage ?? null) },
    ),
  };
}
