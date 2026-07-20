/**
 * phenoIdIngestMapping — pure transform layer for the PhenoID → Verdant ingest
 * (Phase 2 of the PhenoID integration).
 *
 * PhenoID (offline Meta Ray-Ban pheno-hunt app) exports capture rows; Verdant
 * ingests them, DUAL-WRITING: shared per-axis evidence into the canonical
 * `pheno_*` tables (doctrine intact — no composite, no ranking) and PhenoID's
 * ranking/extras into the gated `phenoid_*` add-on layer (nothing dropped).
 *
 * This module is the single source of truth for the deterministic mapping. It
 * is pure (no I/O, no Supabase, no JSX) so both the server ingest and the tests
 * share one definition. See docs on the PhenoID side:
 *   docs/VERDANT_INTEGRATION_PHASE1_CONTRACT.md
 */

// ---------------------------------------------------------------------------
// Verdant vocab
// ---------------------------------------------------------------------------

/** pheno_score_rounds.round CHECK domain. */
export type PhenoRound =
  | "veg"
  | "early_flower"
  | "mid_flower"
  | "late_flower"
  | "post_cure";

/** pheno_keeper_decisions.decision CHECK domain. */
export type KeeperDecision = "keep" | "cull" | "hold" | "undecided";

/** PhenoID verdicts (VERDICT_KEEP/MAYBE/CULL). */
export type PhenoIdVerdict = "keep" | "maybe" | "cull";

// ---------------------------------------------------------------------------
// Stage → round  (verified from PhenoID capture chips, incl. the added
// "Early flower" chip; stage is free-text so a fallback is load-bearing)
// ---------------------------------------------------------------------------

const STAGE_TO_ROUND: Record<string, PhenoRound> = {
  veg: "veg",
  "early flower": "early_flower",
  flower: "mid_flower",
  "late flower": "late_flower",
  flush: "late_flower",
  dry: "post_cure",
};

/** Default round for `Unknown` / blank / any unrecognized free-text stage. */
export const DEFAULT_ROUND: PhenoRound = "mid_flower";

/** Map a PhenoID stage string to a Verdant score round (case-insensitive). */
export function stageToRound(stage: string | null | undefined): PhenoRound {
  const key = (stage ?? "").trim().toLowerCase();
  return STAGE_TO_ROUND[key] ?? DEFAULT_ROUND;
}

/** True when the stage was not one of the known chips (round came from fallback). */
export function isStageFallback(stage: string | null | undefined): boolean {
  const key = (stage ?? "").trim().toLowerCase();
  return !(key in STAGE_TO_ROUND);
}

// ---------------------------------------------------------------------------
// Score rescale  (PhenoID 0–10 axes → Verdant 1–5 per-axis quality)
// ---------------------------------------------------------------------------

/**
 * Rescale a raw 0–10 axis to Verdant's 1–5 quality scale:
 *   v = clamp(1 + round(raw × 0.4), 1, 5)   → 0→1, 5→3, 10→5.
 * `nose` is NOT rescaled — it maps directly to loud_traits.nose_loudness (0–10).
 */
export function rescale0to10to1to5(raw: number): number {
  const clamped = Math.min(10, Math.max(0, raw));
  return Math.min(5, Math.max(1, 1 + Math.round(clamped * 0.4)));
}

/** PhenoID Loud scorecard weights (nose 30 · resin 25 · structure 15 · yield 15 · breeding 15). */
export const LOUD_WEIGHTS = {
  nose: 0.3,
  resin: 0.25,
  structure: 0.15,
  yield: 0.15,
  breeding: 0.15,
} as const;

export interface LoudAxes {
  nose: number;
  resin: number;
  structure: number;
  yield: number;
  breeding: number;
}

/**
 * Recompute the 0–100 weighted composite the way PhenoID does. The imported
 * `winner_score` is authoritative and stored verbatim; this exists only to
 * cross-check drift. Verdant core NEVER computes or ranks by this.
 */
export function winnerScoreFromAxes(a: LoudAxes): number {
  const c = (n: number) => Math.min(10, Math.max(0, n));
  const composite =
    c(a.nose) * LOUD_WEIGHTS.nose * 10 +
    c(a.resin) * LOUD_WEIGHTS.resin * 10 +
    c(a.structure) * LOUD_WEIGHTS.structure * 10 +
    c(a.yield) * LOUD_WEIGHTS.yield * 10 +
    c(a.breeding) * LOUD_WEIGHTS.breeding * 10;
  return Math.round(composite);
}

// ---------------------------------------------------------------------------
// Verdict → keeper decision
// ---------------------------------------------------------------------------

/** keep→keep, maybe→hold, cull→cull. Unknown/blank → undecided. */
export function verdictToDecision(verdict: string | null | undefined): KeeperDecision {
  switch ((verdict ?? "").trim().toLowerCase()) {
    case "keep":
      return "keep";
    case "maybe":
      return "hold";
    case "cull":
      return "cull";
    default:
      return "undecided";
  }
}

// ---------------------------------------------------------------------------
// Tag classification  (herm → sex observation, agronomic → stress, else note)
// ---------------------------------------------------------------------------

export type TagRoute =
  | { kind: "herm" }
  | { kind: "stress"; factor: "foxtail" | "mold" | "pests" }
  | { kind: "note"; text: string };

/** Route a PhenoID field tag to its Verdant destination. */
export function classifyTag(tag: string): TagRoute {
  const t = tag.trim().toLowerCase();
  if (t === "herm" || t === "herms" || t === "nanner" || t === "nanners") {
    return { kind: "herm" };
  }
  if (t === "foxtail" || t === "foxtailing") return { kind: "stress", factor: "foxtail" };
  if (t === "mold" || t === "mold risk" || t === "mould") return { kind: "stress", factor: "mold" };
  if (t === "pest" || t === "pests") return { kind: "stress", factor: "pests" };
  return { kind: "note", text: tag.trim() };
}

/** Stress recommendation derived from the grower's verdict. */
export function verdictToStressRecommendation(
  verdict: string | null | undefined,
): "keep" | "watch" | "reject" {
  switch ((verdict ?? "").trim().toLowerCase()) {
    case "cull":
      return "reject";
    case "maybe":
      return "watch";
    default:
      return "keep";
  }
}

// ---------------------------------------------------------------------------
// Candidate identity
// ---------------------------------------------------------------------------

export interface CandidateIdentity {
  /** Assigned when the label parses to a positive integer. */
  candidateNumber: number | null;
  /** Used when the label is not a positive integer. */
  candidateLabel: string | null;
}

/**
 * A numeric `plant_label` becomes `candidate_number`; anything else becomes a
 * free-text `candidate_label` (the ingest then auto-allocates `max+1` for the
 * number). Never both.
 */
export function resolveCandidateIdentity(plantLabel: string | null | undefined): CandidateIdentity {
  const raw = (plantLabel ?? "").trim();
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return { candidateNumber: n, candidateLabel: null };
  }
  return { candidateNumber: null, candidateLabel: raw === "" ? null : raw };
}

// ---------------------------------------------------------------------------
// End-to-end candidate plan
// ---------------------------------------------------------------------------

export interface PhenoIdCandidateInput {
  phenoid_uuid: string;
  plant_label?: string | null;
  stage?: string | null;
  verdict?: PhenoIdVerdict | string | null;
  traits?: Record<string, number> | null;
  loud?: Partial<LoudAxes> | null;
  winner_score?: number | null;
  rating?: number | null;
  tags?: string[] | null;
  mother_candidate?: boolean | null;
  cut_status?: string | null;
  pack?: { label?: string; index?: number; size?: number } | null;
  capture?: { mode?: string; stack_id?: string; frame_index?: number; model_id?: string; model_version?: string } | null;
  scored_by?: string | null;
  loud_shortlist?: boolean | null;
  notes?: string | null;
}

/** The `phenoid_candidate_extras` row (add-on layer), preserving everything. */
export interface PhenoidExtrasRow {
  phenoid_uuid: string;
  winner_score: number | null;
  nose_score: number | null;
  resin_score: number | null;
  structure_score: number | null;
  yield_score: number | null;
  breeding_score: number | null;
  rating: number | null;
  scored_by: string;
  cut_status: "none" | "vault" | "flowering" | "retired";
  loud_shortlist: boolean;
  pack_label: string;
  pack_index: number;
  pack_size: number;
  capture_mode: string;
  stack_id: string;
  frame_index: number;
  model_id: string;
  model_version: string;
  source: "phenoid";
}

const CUT_STATUS = new Set(["none", "vault", "flowering", "retired"]);

/** Build the add-on-layer row (nothing dropped; raw axes + composite verbatim). */
export function buildPhenoidExtras(c: PhenoIdCandidateInput): PhenoidExtrasRow {
  const cut = (c.cut_status ?? "none").trim().toLowerCase();
  return {
    phenoid_uuid: c.phenoid_uuid,
    winner_score: c.winner_score ?? null,
    nose_score: c.loud?.nose ?? null,
    resin_score: c.loud?.resin ?? null,
    structure_score: c.loud?.structure ?? null,
    yield_score: c.loud?.yield ?? null,
    breeding_score: c.loud?.breeding ?? null,
    rating: c.rating ?? null,
    scored_by: c.scored_by ?? "",
    cut_status: (CUT_STATUS.has(cut) ? cut : "none") as PhenoidExtrasRow["cut_status"],
    loud_shortlist: c.loud_shortlist ?? false,
    pack_label: c.pack?.label ?? "",
    pack_index: c.pack?.index ?? 0,
    pack_size: c.pack?.size ?? 0,
    capture_mode: c.capture?.mode ?? "standard",
    stack_id: c.capture?.stack_id ?? "",
    frame_index: c.capture?.frame_index ?? 0,
    model_id: c.capture?.model_id ?? "",
    model_version: c.capture?.model_version ?? "",
    source: "phenoid",
  };
}

/** The core loud_traits object (nose direct 0–10; other axes rescaled 1–5). */
export function buildCoreLoudTraits(loud: Partial<LoudAxes> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (loud?.nose != null) out.nose_loudness = Math.min(10, Math.max(0, loud.nose));
  if (loud?.resin != null) out.resin = rescale0to10to1to5(loud.resin);
  if (loud?.structure != null) out.structure = rescale0to10to1to5(loud.structure);
  if (loud?.yield != null) out.yield = rescale0to10to1to5(loud.yield);
  if (loud?.breeding != null) out.breeding = rescale0to10to1to5(loud.breeding);
  return out;
}
