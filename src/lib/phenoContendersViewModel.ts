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
 */

export type AxisKey = "nose" | "resin" | "structure" | "yield" | "breeding";
export type ContenderVerdict = "keep" | "maybe" | "cull";

export interface ContenderAxisInput {
  readonly nose: number;
  readonly resin: number;
  readonly structure: number;
  readonly yield: number;
  readonly breeding: number;
}

export interface ContenderInput {
  readonly id: string | number;
  readonly name?: string | null;
  readonly verdict: ContenderVerdict;
  readonly aroma?: readonly string[] | null;
  readonly axes: ContenderAxisInput;
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
  readonly value: number; // 0–10 clamped
  readonly weightPct: number;
  /** Leads this trait among the contenders. Ties are all flagged — honest. */
  readonly leader: boolean;
}

export interface ContenderRow {
  readonly id: string;
  readonly name: string;
  readonly verdict: ContenderVerdict;
  readonly aroma: readonly string[];
  /** 0–100 shortlist composite. Sorts the board; never a verdict on its own. */
  readonly score: number;
  /** 1-based shortlist position by score (NOT a ranking of worth). */
  readonly rank: number;
  readonly axes: readonly ContenderAxis[];
}

export interface ContendersBoard {
  readonly axes: readonly AxisDef[];
  /** Non-culls, sorted by composite score descending. */
  readonly contenders: readonly ContenderRow[];
  readonly culledCount: number;
  /** Highest composite on the board, for scaling the score bar. */
  readonly maxScore: number;
}

function clamp10(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
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

/** Composite from clamped axis values, using the shared weights (0–100). */
export function contenderScore(axes: Record<AxisKey, number>): number {
  return round1(CONTENDER_AXES.reduce((sum, a) => sum + (axes[a.key] * a.weightPct) / 10, 0));
}

/**
 * Build the contenders board. Culls are excluded; the rest are scored on the
 * shared Loud weights, sorted by composite (desc), and every axis leader is
 * flagged (ties included). Deterministic tie-break: score, then name, then id.
 */
export function buildContenders(
  input: readonly ContenderInput[] | null | undefined,
): ContendersBoard {
  const list = (Array.isArray(input) ? input : []).filter(
    (c) => c != null && c.id !== undefined && c.id !== null,
  );
  const inRunning = list.filter((c) => c.verdict !== "cull");
  const culledCount = list.length - inRunning.length;

  const clamped = inRunning.map((c) => {
    const vals = {
      nose: clamp10(c.axes?.nose),
      resin: clamp10(c.axes?.resin),
      structure: clamp10(c.axes?.structure),
      yield: clamp10(c.axes?.yield),
      breeding: clamp10(c.axes?.breeding),
    } as Record<AxisKey, number>;
    return { raw: c, vals };
  });

  // Per-axis maximum among the contenders — the "leads" threshold.
  const maxByAxis = {} as Record<AxisKey, number>;
  for (const a of CONTENDER_AXES) {
    maxByAxis[a.key] = clamped.reduce((m, x) => Math.max(m, x.vals[a.key]), 0);
  }

  const rows = clamped
    .map(({ raw, vals }) => {
      const axes: ContenderAxis[] = CONTENDER_AXES.map((a) => ({
        key: a.key,
        label: a.label,
        value: vals[a.key],
        weightPct: a.weightPct,
        leader: maxByAxis[a.key] > 0 && vals[a.key] === maxByAxis[a.key],
      }));
      return {
        id: String(raw.id),
        name: clean(raw.name) ?? String(raw.id),
        verdict: raw.verdict,
        aroma: (raw.aroma ?? []).filter((x): x is string => !!clean(x)),
        score: contenderScore(vals),
        axes,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const maxScore = rows.reduce((m, r) => Math.max(m, r.score), 0);

  return { axes: CONTENDER_AXES, contenders: rows, culledCount, maxScore };
}
