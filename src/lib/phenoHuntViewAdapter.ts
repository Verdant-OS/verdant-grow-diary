/**
 * phenoHuntViewAdapter — pure bridge from a REAL pheno hunt's rows to the inputs
 * the new demo surfaces already consume (contenders board, fight night, cure
 * timeline, family tree). It's the one place live data becomes view-model input.
 *
 * WHY A SEPARATE ADAPTER: the surfaces (phenoContendersViewModel, phenoFight-
 * ViewModel, phenoCureTimelineViewModel, phenoPedigreeViewModel) are pure and
 * source-agnostic — they take plain inputs. The live feature already reads the
 * pheno_* tables through usePhenoHuntWorkspace + the keeper/cross reads. This
 * adapter maps those rows onto the surface inputs, so a live page renders a real
 * hunt through the SAME components the demo uses, with the demo fixture as the
 * only fallback.
 *
 * Ethos + honesty:
 *  - The Loud shortlist scores the STANDING PLANT: nose / resin / structure /
 *    yield / breeding. CONFIRMED (James Loud): flavor and potency are
 *    CURE-DECIDED — earned at the smoke test, not on the shortlist — and vigor
 *    shows through structure/breeding, so it's not its own axis. The live card's
 *    flavor / potency / vigor are therefore recorded but NEVER folded into the
 *    composite. Scoring the smoke before the cure is the hype shortcut the
 *    scorecard exists to refuse.
 *  - A missing trait stays MISSING (null) — never coerced to 0, never invented.
 *    `hold` / `undecided` decisions map to "maybe" (still in triage), never to
 *    "keep".
 *
 * Trait vocabulary bridge: pheno_candidate_scores.traits is written in the
 * canonical EXPRESSION vocabulary (phenoExpressionRules.LOUD_TRAIT_AXES —
 * nose_loudness on 0–10, quality axes on 1–5; the PhenoID ingest's
 * buildCoreLoudTraits writes the same shape). The shortlist surfaces read five
 * Loud axes on 0–10, so this adapter is the single place the projection
 * happens: nose_loudness passes through; 1–5 quality axes project linearly to
 * 0–10 via (v − 1) × 2.5 (the inverse of the ingest's rescale0to10to1to5).
 *
 * Pure: no I/O, no Supabase, no React.
 */
import type { ContenderInput, ContenderVerdict, AxisKey } from "@/lib/phenoContendersViewModel";
import type { PedigreeKeeperInput, PedigreeCrossInput } from "@/lib/phenoPedigreeViewModel";
import type { CloneInput } from "@/lib/phenoCloneTreeViewModel";
import type { CureTimelineInput, RoundKey } from "@/lib/phenoCureTimelineViewModel";
import { normalizeKeeperDecision } from "@/lib/phenoKeeperDecisionModel";

/** The five trait keys that ARE the Loud shortlist (the standing plant). Confirmed
 * scorecard: flavor/potency are cure-decided and vigor folds in — not shortlist axes. */
export const LOUD_AXIS_KEYS: readonly AxisKey[] = [
  "nose",
  "resin",
  "structure",
  "yield",
  "breeding",
];

const ROUND_KEYS: ReadonlySet<RoundKey> = new Set([
  "veg",
  "early_flower",
  "mid_flower",
  "late_flower",
  "post_cure",
]);

/**
 * Minimal source shapes — the subset of the live rows the surfaces need. A hook
 * (usePhenoHuntWorkspace + keeper/cross reads) projects the real rows onto these;
 * keeping the adapter on its own contract keeps it decoupled and testable.
 */
export interface HuntCandidateSource {
  /** plants.candidate_number (owner-assigned); falls back to name for a key. */
  readonly candidateNumber: number | null;
  readonly name: string;
  /** pheno_keeper_decisions.decision: keep | cull | hold | undecided. */
  readonly decision?: string | null;
  /** pheno_candidate_scores.traits in the canonical expression vocabulary
   * (nose_loudness 0–10; quality axes 1–5). Bridged via traitsToLoudAxes. */
  readonly traits?: Record<string, number> | null;
  /** Pre-projected 0–10 Loud axes. When present, used verbatim instead of the
   * traits bridge — the demo fixture path, whose axes are already 0–10. */
  readonly axes?: Record<AxisKey, number | null> | null;
  /** pheno_smoke_tests.flavor_descriptors, or grower aroma tags. */
  readonly aroma?: readonly string[] | null;
  readonly tags?: readonly string[] | null;
  /** plants.plant_type (declared; absent = unknown, never inferred). */
  readonly plantType?: string | null;
  /** plants.stage — feeds the locked stage-distance comparability check. */
  readonly stage?: string | null;
}

export interface HuntKeeperSource {
  readonly id: string;
  readonly name?: string | null;
  readonly sourceCandidateLabel?: string | null;
  readonly reversed?: boolean;
  readonly reversalMethods?: readonly string[] | null;
  readonly cloneCount?: number | null;
  readonly stabilityRunCount?: number | null;
  /** Scored rounds present for this keeper's source plant (pheno_score_rounds). */
  readonly rounds?: readonly string[] | null;
}

export interface PhenoHuntViewData {
  readonly contenders: ContenderInput[];
  readonly keepers: PedigreeKeeperInput[];
  readonly crosses: PedigreeCrossInput[];
  readonly clones: CloneInput[];
  readonly cureTimelines: CureTimelineInput[];
}

/** keep → keep, cull → cull, everything else (hold/undecided/unknown) → maybe. */
export function decisionToVerdict(decision: string | null | undefined): ContenderVerdict {
  const d = normalizeKeeperDecision(decision);
  if (d === "keep") return "keep";
  if (d === "cull") return "cull";
  return "maybe";
}

/** A finite number, or null. Never coerces absence to 0. */
function finiteOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Project a 1–5 quality score onto 0–10: (v − 1) × 2.5 (1→0, 3→5, 5→10). */
function quality5To10(v: number | null): number | null {
  if (v === null) return null;
  const clamped = Math.max(1, Math.min(5, v));
  return (clamped - 1) * 2.5;
}

/**
 * Bridge the stored trait card (canonical expression vocabulary) onto the five
 * Loud axes, 0–10 each, null when unscored:
 *
 *   nose      ← nose_loudness (0–10, direct; legacy `nose` accepted)
 *   resin     ← resin | trichome_coverage   (1–5 → 0–10)
 *   structure ← structure                   (1–5 → 0–10)
 *   yield     ← yield | yield_impression    (1–5 → 0–10)
 *   breeding  ← breeding                    (1–5 → 0–10; the workspace card
 *               has no breeding axis, so workspace-scored candidates carry
 *               breeding = null — shown as unscored, never as 0)
 *
 * A missing trait stays null. The board/fight models keep nulls visible.
 */
export function traitsToLoudAxes(
  traits: Record<string, number> | null | undefined,
): Record<AxisKey, number | null> {
  const t = traits ?? {};
  const nose = finiteOrNull(t.nose_loudness) ?? finiteOrNull(t.nose);
  const firstQuality = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = finiteOrNull(t[k]);
      if (v !== null) return quality5To10(v);
    }
    return null;
  };
  return {
    nose: nose === null ? null : Math.max(0, Math.min(10, nose)),
    resin: firstQuality("resin", "trichome_coverage"),
    structure: firstQuality("structure"),
    yield: firstQuality("yield", "yield_impression"),
    breeding: firstQuality("breeding"),
  };
}

function toRounds(rounds: readonly string[] | null | undefined): RoundKey[] {
  return (rounds ?? []).filter((r): r is RoundKey => ROUND_KEYS.has(r as RoundKey));
}

function cleanStrings(v: readonly string[] | null | undefined): string[] {
  return (v ?? []).map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0);
}

/** Candidates → contender/fight/pack inputs. */
export function adaptContenders(
  candidates: readonly HuntCandidateSource[] | null | undefined,
): ContenderInput[] {
  return (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c != null && typeof c.name === "string" && c.name.trim().length > 0)
    .map((c) => ({
      id: c.candidateNumber ?? c.name,
      name: c.name,
      verdict: decisionToVerdict(c.decision),
      aroma: cleanStrings(c.aroma),
      // Pre-projected axes (demo fixture, already 0–10) pass through; stored
      // trait cards go through the canonical vocabulary bridge.
      axes: c.axes ?? traitsToLoudAxes(c.traits),
      plantType: c.plantType ?? null,
      stage: c.stage ?? null,
    }));
}

/** Keepers → the family tree's keeper inputs (shape already aligns). */
export function adaptKeepers(
  keepers: readonly HuntKeeperSource[] | null | undefined,
): PedigreeKeeperInput[] {
  return (Array.isArray(keepers) ? keepers : [])
    .filter((k) => k != null && typeof k.id === "string" && k.id.length > 0)
    .map((k) => ({
      id: k.id,
      name: k.name ?? null,
      sourceCandidateLabel: k.sourceCandidateLabel ?? null,
      reversed: k.reversed === true,
      reversalMethods: cleanStrings(k.reversalMethods),
      cloneCount: Math.max(0, Math.trunc(k.cloneCount ?? 0)),
      stabilityRunCount: Math.max(0, Math.trunc(k.stabilityRunCount ?? 0)),
    }));
}

/** Keepers → per-keeper cure/stability timeline inputs. */
export function adaptCureTimelines(
  keepers: readonly HuntKeeperSource[] | null | undefined,
): CureTimelineInput[] {
  return (Array.isArray(keepers) ? keepers : [])
    .filter((k) => k != null && typeof k.id === "string" && k.id.length > 0)
    .map((k) => ({
      id: k.id,
      name: k.name ?? null,
      rounds: toRounds(k.rounds),
      stabilityRunCount: Math.max(0, Math.trunc(k.stabilityRunCount ?? 0)),
      reversed: k.reversed === true,
      reversalMethods: cleanStrings(k.reversalMethods),
    }));
}

/**
 * Compose the full bundle. Crosses and clones already match the pedigree/clone
 * input contracts (they come straight from pheno_crosses / pheno_keeper_clones),
 * so they pass through — the honest-provenance flagging happens downstream in
 * buildPhenoPedigree, exactly as it does for the demo.
 */
export function buildPhenoHuntView(source: {
  candidates?: readonly HuntCandidateSource[] | null;
  keepers?: readonly HuntKeeperSource[] | null;
  crosses?: readonly PedigreeCrossInput[] | null;
  clones?: readonly CloneInput[] | null;
}): PhenoHuntViewData {
  return {
    contenders: adaptContenders(source.candidates),
    keepers: adaptKeepers(source.keepers),
    crosses: (source.crosses ?? []).filter((c) => c != null),
    clones: (source.clones ?? []).filter((c) => c != null),
    cureTimelines: adaptCureTimelines(source.keepers),
  };
}
