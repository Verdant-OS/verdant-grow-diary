/**
 * phenoContendersViewModel — pure "contenders board": the hunt's shortlist made
 * comparable across candidates on the James Loud axes (nose / resin / structure
 * / yield / breeding).
 *
 * Ethos (refuse to hype; reproducibility is the product): this SORTS the pack so
 * a grower can compare merits at a glance — it never declares a winner. The
 * composite is a shortlist number, and the per-axis "leads" markers show WHERE a
 * pheno is strong, not that it should be kept. Culls are dropped from the board
 * (they're already out); the keeper decision stays with the grower and the cure.
 *
 * Pure: no I/O, no writes, no ranking authority. Deterministic ordering.
 *
 * Comparability (autoflower/photoperiod plan, 2026-07-21): a board whose
 * contenders mix plant types, include an unknown type, or sit further apart
 * than the locked stage tolerance is marked not_comparable — the sorted
 * payload is still produced (organizing only), but presenters must strike the
 * rank/score/leads visuals and show the non-comparable banner.
 */
import {
  areComparable,
  normalizePlantType,
  plantStageRank,
  type ComparabilityReason,
  type PlantType,
} from "@/lib/plantTypeRules";

export type AxisKey = "nose" | "resin" | "structure" | "yield" | "breeding";
export type ContenderVerdict = "keep" | "maybe" | "cull";

/**
 * Axis values are 0–10, or null when the trait was never scored. Missingness
 * is load-bearing (keeper contract: "missingness stays visible") — a null must
 * never be coerced to 0, because the board SORTS by composite and a fabricated
 * zero would silently rank an unscored plant below a deliberately low-scored
 * one.
 */
export interface ContenderAxisInput {
  readonly nose: number | null;
  readonly resin: number | null;
  readonly structure: number | null;
  readonly yield: number | null;
  readonly breeding: number | null;
}

export interface ContenderInput {
  readonly id: string | number;
  readonly name?: string | null;
  readonly verdict: ContenderVerdict;
  readonly aroma?: readonly string[] | null;
  readonly axes: ContenderAxisInput;
  /** Declared plant type; absent/unrecognized = unknown (never comparable). */
  readonly plantType?: string | null;
  /** Plants-table stage (for the locked stage-distance tolerance). */
  readonly stage?: string | null;
}

export interface AxisDef {
  readonly key: AxisKey;
  readonly label: string;
  /** Contribution to the 0–100 composite at a max (10/10) axis score. */
  readonly weightPct: number;
}

/** The canonical James Loud scorecard: weights sum to 100. */
export const CONTENDER_AXES: readonly AxisDef[] = [
  { key: "nose", label: "Nose", weightPct: 30 },
  { key: "resin", label: "Resin", weightPct: 25 },
  { key: "structure", label: "Structure", weightPct: 15 },
  { key: "yield", label: "Yield", weightPct: 15 },
  { key: "breeding", label: "Breeding", weightPct: 15 },
];

export interface ContenderAxis {
  readonly key: AxisKey;
  readonly label: string;
  /** 0–10 clamped, or null when this trait was never scored. */
  readonly value: number | null;
  readonly weightPct: number;
  /** Leads this trait among the contenders. Ties are all flagged — honest.
   * Never true for a missing (null) value. */
  readonly leader: boolean;
}

export interface ContenderRow {
  readonly id: string;
  readonly name: string;
  readonly verdict: ContenderVerdict;
  readonly aroma: readonly string[];
  /**
   * 0–100 shortlist composite over the SCORED axes only, renormalized by the
   * present axes' weights. Null when no axis is scored — an unscored plant has
   * no composite, it is not a 0. Sorts the board; never a verdict on its own.
   */
  readonly score: number | null;
  /**
   * 1-based shortlist position by score among SCORED contenders (NOT a ranking
   * of worth). Null for unscored contenders, which list after the scored ones.
   */
  readonly rank: number | null;
  /** How many of the five Loud axes carry a real score (0–5). */
  readonly scoredAxisCount: number;
  readonly axes: readonly ContenderAxis[];
  /** Normalized declared type — presenters render a persistent badge. */
  readonly plantType: PlantType;
}

export type BoardComparability = "comparable" | "not_comparable";

export interface ContendersBoard {
  readonly axes: readonly AxisDef[];
  /** Non-culls: scored contenders by composite descending, then unscored
   * contenders (score null) by name — never silently ranked as zeros. */
  readonly contenders: readonly ContenderRow[];
  readonly culledCount: number;
  /** Highest composite on the board, for scaling the score bar. */
  readonly maxScore: number;
  /**
   * Cross-candidate comparability. "not_comparable" when any pair of
   * contenders mixes types, includes an unknown type, or exceeds the locked
   * stage tolerance. The sorted payload above is still emitted (organizing
   * only) — presenters must strike rank/score/leads visuals when set.
   */
  readonly comparability: BoardComparability;
  /** Deduped reasons in fixed precedence order; empty when comparable. */
  readonly comparabilityReasons: readonly ComparabilityReason[];
}

/**
 * Human copy for each comparability reason. Honest and non-deciding: the
 * banner explains why ranking is hidden, never who would have won.
 */
export const COMPARABILITY_REASON_MESSAGES: Readonly<Record<ComparabilityReason, string>> = {
  type_unknown:
    "Plant type is unknown for at least one plant — set Autoflower or Photoperiod on each plant to compare them.",
  type_mismatch:
    "Autoflowers and photoperiods run on different clocks — scores don't compare across types.",
  stage_mismatch:
    "These plants are more than one stage apart — traits don't read the same across stages.",
};

/** Clamp a present value to 0–10; a missing/non-finite value stays null. */
function clamp10OrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Guard, not decoration: the composite math assumes the shared weights total
 * 100. Throwing on drift keeps a silently mis-scaled composite from ever
 * rendering; deterministic, and any weight edit that breaks it fails every
 * board test immediately.
 */
function assertWeightsSumTo100(): void {
  const total = CONTENDER_AXES.reduce((sum, a) => sum + a.weightPct, 0);
  if (total !== 100) {
    throw new Error(`CONTENDER_AXES weights must sum to 100 (got ${total}).`);
  }
}

/**
 * Composite over the SCORED axes only (0–100), renormalized by the present
 * axes' weights so a 4-of-5 card is not depressed by the missing axis. With
 * all five axes present this equals the original full-weight formula. Returns
 * null when no axis is scored — an unscored plant has no composite.
 */
export function contenderScore(axes: Record<AxisKey, number | null>): number | null {
  let weighted = 0;
  let presentWeight = 0;
  for (const a of CONTENDER_AXES) {
    const v = clamp10OrNull(axes[a.key]);
    if (v === null) continue;
    weighted += v * a.weightPct;
    presentWeight += a.weightPct;
  }
  if (presentWeight === 0) return null;
  return round1((weighted / presentWeight) * 10);
}

/**
 * Build the contenders board. Culls are excluded; the rest are scored on the
 * shared Loud weights, sorted by composite (desc), and every axis leader is
 * flagged (ties included). Deterministic tie-break: score, then name, then id.
 */
export function buildContenders(
  input: readonly ContenderInput[] | null | undefined,
): ContendersBoard {
  assertWeightsSumTo100();
  const list = (Array.isArray(input) ? input : []).filter(
    (c) => c != null && c.id !== undefined && c.id !== null,
  );
  const inRunning = list.filter((c) => c.verdict !== "cull");
  const culledCount = list.length - inRunning.length;

  const clamped = inRunning.map((c) => {
    const vals = {
      nose: clamp10OrNull(c.axes?.nose),
      resin: clamp10OrNull(c.axes?.resin),
      structure: clamp10OrNull(c.axes?.structure),
      yield: clamp10OrNull(c.axes?.yield),
      breeding: clamp10OrNull(c.axes?.breeding),
    } as Record<AxisKey, number | null>;
    return { raw: c, vals };
  });

  // Per-axis maximum among the SCORED values — the "leads" threshold. A
  // missing value never competes and never leads.
  const maxByAxis = {} as Record<AxisKey, number>;
  for (const a of CONTENDER_AXES) {
    maxByAxis[a.key] = clamped.reduce((m, x) => Math.max(m, x.vals[a.key] ?? 0), 0);
  }

  const unranked = clamped.map(({ raw, vals }) => {
    const axes: ContenderAxis[] = CONTENDER_AXES.map((a) => ({
      key: a.key,
      label: a.label,
      value: vals[a.key],
      weightPct: a.weightPct,
      leader: vals[a.key] !== null && maxByAxis[a.key] > 0 && vals[a.key] === maxByAxis[a.key],
    }));
    return {
      id: String(raw.id),
      name: clean(raw.name) ?? String(raw.id),
      verdict: raw.verdict,
      aroma: (raw.aroma ?? []).filter((x): x is string => !!clean(x)),
      score: contenderScore(vals),
      scoredAxisCount: axes.filter((a) => a.value !== null).length,
      axes,
      plantType: normalizePlantType(raw.plantType),
    };
  });

  // Scored contenders sort by composite (desc) and take 1-based ranks;
  // unscored contenders follow, unranked — visible, never rank-last-zero.
  const byNameThenId = (a: { name: string; id: string }, b: { name: string; id: string }) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const scoredRows = unranked
    .filter((r) => r.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || byNameThenId(a, b))
    .map((r, i) => ({ ...r, rank: (i + 1) as number | null }));
  const unscoredRows = unranked
    .filter((r) => r.score === null)
    .sort(byNameThenId)
    .map((r) => ({ ...r, rank: null as number | null }));
  const rows = [...scoredRows, ...unscoredRows];

  const maxScore = rows.reduce((m, r) => Math.max(m, r.score ?? 0), 0);

  // Pairwise comparability over the in-running pack. Every failing pair
  // contributes its reason; reasons are deduped into a fixed precedence
  // order so the payload is deterministic.
  const subjects = inRunning.map((c) => ({
    plantType: c.plantType ?? null,
    stageRank: plantStageRank(c.stage ?? null),
  }));
  const seenReasons = new Set<ComparabilityReason>();
  for (let i = 0; i < subjects.length; i++) {
    for (let j = i + 1; j < subjects.length; j++) {
      const verdict = areComparable(subjects[i], subjects[j]);
      if (!verdict.comparable && verdict.reason) seenReasons.add(verdict.reason);
    }
  }
  const comparabilityReasons = (
    ["type_unknown", "type_mismatch", "stage_mismatch"] as const
  ).filter((r) => seenReasons.has(r));

  return {
    axes: CONTENDER_AXES,
    contenders: rows,
    culledCount,
    maxScore,
    comparability: comparabilityReasons.length > 0 ? "not_comparable" : "comparable",
    comparabilityReasons,
  };
}
