/**
 * phenoGrowOutHandoffRules — pure model for the keeper → next-grow handoff.
 *
 * THE GAP THIS CLOSES: the stability ledger records grow-outs the grower
 * retypes by hand — a run label and trait numbers typed twice, once on the
 * plant and again on the keeper. That hand-copy is where the ledger's honesty
 * leaks: a mistyped number silently changes a hold/drift read-out, and a run
 * the grower forgets to copy simply never counts.
 *
 * This module closes the loop WITHOUT acting for the grower. Given a keeper's
 * clones that have been linked to a real plant (pheno_keeper_clones.
 * clone_plant_id), plus whatever traits that plant already has recorded, it
 * PROPOSES a stability run pre-filled from the grower's own observations. The
 * grower reviews and accepts; nothing is ever written automatically.
 *
 * SUGGEST-ONLY DOCTRINE:
 *  - Proposes, never writes. The caller persists only on an explicit accept.
 *  - Pre-fills ONLY from traits the grower actually recorded on that plant.
 *    A plant with no recorded traits still yields a proposal, but an honest
 *    one that says so — it never invents, guesses, or interpolates a value.
 *  - A plant already represented in the ledger is never proposed again, so
 *    accepting twice cannot double-count a single grow-out.
 *  - Never ranks clones or keepers against each other; each proposal stands
 *    alone and describes only its own plant.
 *
 * PURE: no I/O, no Supabase, no React, no fetch, no AI, no randomness, no
 * module-level clock. Deterministic and null-safe.
 */

import { LOUD_TRAIT_AXES, type PhenoTraitAxis } from "@/lib/phenoExpressionRules";
import { STABILITY_RUN_LABEL_MAX, type StabilityRun } from "@/lib/phenoStabilityRunRules";

const AXIS_BY_KEY: ReadonlyMap<string, PhenoTraitAxis> = new Map(
  LOUD_TRAIT_AXES.map((a) => [a.key, a]),
);

/** A keeper clone that may or may not be linked to a real plant yet. */
export interface GrowOutCloneInput {
  readonly cloneId: string;
  readonly cloneLabel: string;
  /** The plant this clone was realized as, or null when never linked. */
  readonly clonePlantId: string | null;
}

/** The minimum a linked plant must tell us to be describable. */
export interface GrowOutPlantInput {
  readonly plantId: string;
  readonly plantName: string | null;
  readonly growName: string | null;
  /** Traits the grower recorded on THIS plant (any hunt). Unknown axes dropped. */
  readonly traits: Readonly<Record<string, number>> | null;
}

export interface GrowOutSuggestion {
  readonly cloneId: string;
  readonly cloneLabel: string;
  readonly plantId: string;
  readonly plantLabel: string;
  /** True when the linked plant carries at least one usable recorded trait. */
  readonly hasRecordedTraits: boolean;
  /** The run to add if the grower accepts — pre-filled, never auto-saved. */
  readonly proposedRun: StabilityRun;
  /** One honest line about what this proposal is (and is not) based on. */
  readonly detail: string;
}

/** Keep only in-range values on known axes — never guess or clamp. */
function usableTraits(input: Readonly<Record<string, number>> | null): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(input)) {
    const axis = AXIS_BY_KEY.get(key);
    if (!axis) continue;
    const v = typeof raw === "number" ? raw : NaN;
    if (!Number.isFinite(v) || v < axis.min || v > axis.max) continue;
    out[key] = v;
  }
  return out;
}

function nonEmpty(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Build the run label from what the grower already named things: the plant's
 * own name preferred, then its grow, then the clone label. Never invented.
 */
function proposedLabel(plant: GrowOutPlantInput, cloneLabel: string): string {
  const name = nonEmpty(plant.plantName);
  const grow = nonEmpty(plant.growName);
  const base = name || cloneLabel || "Grow-out";
  const label = grow && grow !== base ? `${base} · ${grow}` : base;
  return label.slice(0, STABILITY_RUN_LABEL_MAX);
}

function detailFor(hasTraits: boolean, traitCount: number, plantLabel: string): string {
  if (!hasTraits) {
    return `${plantLabel} has no recorded trait scores yet. You can still add it as a grow-out, but it will not count toward the stability comparison until you record traits.`;
  }
  return `Pre-filled from the ${traitCount} trait ${traitCount === 1 ? "score" : "scores"} you recorded on ${plantLabel}. Review before adding.`;
}

/**
 * Propose grow-out runs for a keeper's plant-linked clones.
 *
 * Only clones linked to a plant are considered, and a plant already present
 * in `existingRuns` (matched on sourcePlantId) is skipped so the same
 * grow-out is never counted twice. Ordered by clone label for a stable,
 * non-ranking presentation.
 */
export function buildGrowOutSuggestions(input: {
  readonly clones: readonly GrowOutCloneInput[];
  readonly plantsById: Readonly<Record<string, GrowOutPlantInput>>;
  readonly existingRuns: readonly StabilityRun[];
}): GrowOutSuggestion[] {
  const clones = Array.isArray(input?.clones) ? input.clones : [];
  const plantsById = input?.plantsById ?? {};
  const existing = Array.isArray(input?.existingRuns) ? input.existingRuns : [];

  // Plants already represented in the ledger — never propose them again.
  const alreadyLedgered = new Set(
    existing
      .map((r) => (r && typeof r.sourcePlantId === "string" ? r.sourcePlantId : ""))
      .filter((id) => id !== ""),
  );

  const out: GrowOutSuggestion[] = [];
  const seenPlants = new Set<string>();
  for (const clone of clones) {
    if (!clone || typeof clone.cloneId !== "string" || clone.cloneId === "") continue;
    const plantId = typeof clone.clonePlantId === "string" ? clone.clonePlantId.trim() : "";
    if (plantId === "") continue; // not linked to a plant → nothing to hand off
    if (alreadyLedgered.has(plantId)) continue; // already recorded as a grow-out
    if (seenPlants.has(plantId)) continue; // two clones on one plant → one proposal
    const plant = plantsById[plantId];
    if (!plant) continue; // linked plant not readable (deleted / not owned)
    seenPlants.add(plantId);

    const cloneLabel = nonEmpty(clone.cloneLabel) || "clone";
    const traits = usableTraits(plant.traits);
    const traitCount = Object.keys(traits).length;
    const hasRecordedTraits = traitCount > 0;
    const plantLabel = nonEmpty(plant.plantName) || cloneLabel;

    out.push({
      cloneId: clone.cloneId,
      cloneLabel,
      plantId,
      plantLabel,
      hasRecordedTraits,
      proposedRun: {
        runLabel: proposedLabel(plant, cloneLabel),
        observedAt: null,
        traits,
        note: null,
        sourcePlantId: plantId,
      },
      detail: detailFor(hasRecordedTraits, traitCount, plantLabel),
    });
  }

  // Stable, structural order (clone label, then id) — never by trait quality.
  out.sort(
    (a, b) => a.cloneLabel.localeCompare(b.cloneLabel) || a.cloneId.localeCompare(b.cloneId),
  );
  return out;
}

export const GROW_OUT_HANDOFF_CAVEAT =
  "These are grow-outs Verdant can pre-fill from plants you linked to this keeper's clones. Nothing is added until you accept it, and the numbers are only the ones you recorded yourself.";

export const GROW_OUT_HANDOFF_EMPTY_COPY =
  "No linked grow-outs to add. Link a clone to the plant you grew it as, and its recorded traits can be carried into this ledger.";

export const GROW_OUT_LINK_HELP_COPY =
  "Linking a clone to the plant you grew it as lets Verdant carry that plant's recorded traits into this ledger, instead of you typing them twice.";
