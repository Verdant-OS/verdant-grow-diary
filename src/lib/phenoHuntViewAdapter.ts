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
 *  - A missing trait is 0, never invented. `hold` / `undecided` decisions map to
 *    "maybe" (still in triage), never to "keep".
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
  /** pheno_candidate_scores.traits (0–10 per axis). */
  readonly traits?: Record<string, number> | null;
  /** pheno_smoke_tests.flavor_descriptors, or grower aroma tags. */
  readonly aroma?: readonly string[] | null;
  readonly tags?: readonly string[] | null;
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

/** Read exactly the five Loud axes; clamp to 0–10; a missing trait is 0. */
export function traitsToLoudAxes(
  traits: Record<string, number> | null | undefined,
): Record<AxisKey, number> {
  const t = traits ?? {};
  const read = (k: AxisKey): number => {
    const v = Number(t[k]);
    return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 0;
  };
  return {
    nose: read("nose"),
    resin: read("resin"),
    structure: read("structure"),
    yield: read("yield"),
    breeding: read("breeding"),
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
      axes: traitsToLoudAxes(c.traits),
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
