/**
 * phenoPedigreeViewModel — pure "family tree" for a pheno hunt's breeding graph.
 *
 * Unifies keepers (mothers), their reversals + clone lineage, and the crosses
 * between them into one honest pedigree a UI can render. Composes with
 * phenoCloneTreeViewModel (clone tree per keeper) and reuses the canonical cross
 * display + classification helpers so lineage semantics never diverge.
 *
 * Ethos (refuse to hype; reproducibility is the product): the tree is only as
 * good as its provenance, so it FLAGS what it can't back up — an unknown pollen
 * parent, a parent not in this hunt, an unrecorded generation or origin — rather
 * than drawing clean lines it can't defend. It invents nothing and changes
 * nothing (no I/O, no writes, no automation).
 */
import { crossLineageBadge, crossDonorLabel } from "@/lib/phenoCrossFormViewModel";

export interface PedigreeKeeperInput {
  readonly id: string;
  readonly name?: string | null;
  readonly sourceCandidateLabel?: string | null;
  readonly reversed?: boolean;
  readonly reversalMethods?: readonly string[] | null;
  readonly cloneCount?: number | null;
  readonly stabilityRunCount?: number | null;
}

export interface PedigreeCrossInput {
  readonly id: string;
  readonly crossName?: string | null;
  readonly crossType: string;
  readonly channel?: string | null;
  readonly generation?: number | null;
  readonly femaleKeeperId?: string | null;
  readonly maleKeeperId?: string | null;
  readonly recurrentParentId?: string | null;
  readonly crossedAt?: string | null;
}

export type ProvenanceCode =
  | "unknown_pollen_parent"
  | "parent_not_in_hunt"
  | "generation_unrecorded"
  | "origin_unrecorded";

export interface ProvenanceFlag {
  readonly code: ProvenanceCode;
  readonly message: string;
}

export interface PedigreeKeeperNode {
  readonly id: string;
  readonly name: string;
  readonly sourceCandidateLabel: string | null;
  readonly reversed: boolean;
  readonly reversalMethods: readonly string[];
  readonly cloneCount: number;
  readonly stabilityRunCount: number;
  readonly flags: readonly ProvenanceFlag[];
}

export interface PedigreeCrossNode {
  readonly id: string;
  readonly name: string;
  readonly badge: string;
  readonly femaleKeeperId: string | null;
  readonly femaleName: string | null;
  readonly maleKeeperId: string | null;
  readonly donorLabel: string;
  readonly generation: number | null;
  readonly recurrentParentId: string | null;
  readonly crossedAt: string | null;
  readonly flags: readonly ProvenanceFlag[];
}

export type PedigreeEdgeKind = "female" | "male" | "backcross";

export interface PedigreeEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: PedigreeEdgeKind;
}

export interface PhenoPedigree {
  readonly keepers: readonly PedigreeKeeperNode[];
  readonly crosses: readonly PedigreeCrossNode[];
  readonly edges: readonly PedigreeEdge[];
  /** Aggregate of every node's flags — the honest "what we can't back up" list. */
  readonly flags: readonly ProvenanceFlag[];
}

const FLAG_MESSAGES: Record<ProvenanceCode, string> = {
  unknown_pollen_parent: "Pollen parent not recorded — lineage below this cross is unverified",
  parent_not_in_hunt: "A parent isn't a keeper in this hunt — can't verify the line",
  generation_unrecorded: "Generation not recorded — F/BX depth is unknown",
  origin_unrecorded: "No source candidate recorded for this keeper",
};

/** Cross types where a NULL pollen parent is honest, not a gap. */
const SELF_TYPES = new Set(["selfing_s1", "selfing_sn"]);
/** Cross types that carry a meaningful generation (F#, BX#). */
const GENERATION_TYPES = new Set(["filial", "backcross", "feminized_bx"]);

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function flag(code: ProvenanceCode): ProvenanceFlag {
  return { code, message: FLAG_MESSAGES[code] };
}

/**
 * Build the honest family tree. `keepers` are this hunt's keepers; `crosses`
 * are the recorded crosses. Deterministic ordering; every parent reference is
 * validated against the keeper set and flagged when it can't be backed up.
 */
export function buildPhenoPedigree(
  keepers: readonly PedigreeKeeperInput[] | null | undefined,
  crosses: readonly PedigreeCrossInput[] | null | undefined,
): PhenoPedigree {
  const keeperList = (Array.isArray(keepers) ? keepers : []).filter(
    (k) => k && clean(k.id),
  );
  const crossList = (Array.isArray(crosses) ? crosses : []).filter(
    (c) => c && clean(c.id) && clean(c.crossType),
  );

  const nameById = new Map<string, string>();
  const idSet = new Set<string>();
  for (const k of keeperList) {
    idSet.add(k.id);
    nameById.set(k.id, clean(k.name) ?? k.id);
  }

  const allFlags: ProvenanceFlag[] = [];

  const keeperNodes: PedigreeKeeperNode[] = keeperList
    .map((k) => {
      const src = clean(k.sourceCandidateLabel);
      const nodeFlags: ProvenanceFlag[] = [];
      if (!src) nodeFlags.push(flag("origin_unrecorded"));
      allFlags.push(...nodeFlags);
      return {
        id: k.id,
        name: nameById.get(k.id)!,
        sourceCandidateLabel: src,
        reversed: k.reversed === true,
        reversalMethods: (k.reversalMethods ?? []).filter((m): m is string => !!clean(m)),
        cloneCount: Math.max(0, Math.trunc(k.cloneCount ?? 0)),
        stabilityRunCount: Math.max(0, Math.trunc(k.stabilityRunCount ?? 0)),
        flags: nodeFlags,
      };
    })
    .sort((a, b) => (a.name !== b.name ? (a.name < b.name ? -1 : 1) : a.id < b.id ? -1 : 1));

  const edges: PedigreeEdge[] = [];

  const crossNodes: PedigreeCrossNode[] = crossList
    .map((c) => {
      const female = clean(c.femaleKeeperId);
      const male = clean(c.maleKeeperId);
      const recurrent = clean(c.recurrentParentId);
      const gen = typeof c.generation === "number" ? c.generation : null;
      const type = c.crossType;
      const nodeFlags: ProvenanceFlag[] = [];

      // Unknown pollen parent (honest for self / open pollination).
      if (male == null && !SELF_TYPES.has(type) && type !== "open_pollination") {
        nodeFlags.push(flag("unknown_pollen_parent"));
      }
      // Parents must be keepers in THIS hunt (else we can't verify the line).
      if ((female != null && !idSet.has(female)) ||
          (male != null && !idSet.has(male)) ||
          (recurrent != null && !idSet.has(recurrent))) {
        nodeFlags.push(flag("parent_not_in_hunt"));
      }
      // Generation-bearing types need a recorded generation.
      if (GENERATION_TYPES.has(type) && gen == null) {
        nodeFlags.push(flag("generation_unrecorded"));
      }
      allFlags.push(...nodeFlags);

      // Edges only for parents we can actually back up (in the keeper set).
      if (female != null && idSet.has(female)) edges.push({ from: female, to: c.id, kind: "female" });
      if (male != null && idSet.has(male)) edges.push({ from: male, to: c.id, kind: "male" });
      if (recurrent != null && idSet.has(recurrent)) edges.push({ from: c.id, to: recurrent, kind: "backcross" });

      return {
        id: c.id,
        name: clean(c.crossName) ?? "Cross",
        badge: crossLineageBadge(type, gen, clean(c.channel)),
        femaleKeeperId: female,
        femaleName: female != null ? nameById.get(female) ?? null : null,
        maleKeeperId: male,
        donorLabel: crossDonorLabel(
          { maleKeeperId: male, crossType: type },
          male != null ? nameById.get(male) ?? null : null,
        ),
        generation: gen,
        recurrentParentId: recurrent,
        crossedAt: clean(c.crossedAt),
        flags: nodeFlags,
      };
    })
    .sort((a, b) => {
      const at = a.crossedAt ?? "";
      const bt = b.crossedAt ?? "";
      if (at && bt && at !== bt) return at < bt ? -1 : 1;
      if (at && !bt) return -1;
      if (!at && bt) return 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  return { keepers: keeperNodes, crosses: crossNodes, edges, flags: allFlags };
}
