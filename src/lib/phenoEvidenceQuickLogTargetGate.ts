/**
 * Pheno evidence → Quick Log target gate (#1005).
 *
 * "Record <goal> evidence" used to dispatch a Quick Log prefill built from the
 * HUNT's grow/tent, whatever the candidate plant's own stored relationships
 * were. A plant moved to another tent, an archived or missing tent, or a
 * tent/grow mismatch therefore opened a dead or misleading handoff.
 *
 * This gate decides, per candidate, whether the handoff may fire and with
 * which ids. It never builds its own rule table: the grow/tent triangle is
 * checked by the canonical `resolveQuickLogPrefillTarget`, fed the plant's
 * STORED ids and the same tent catalog Quick Log reads. It never invents an
 * active grow, never falls back to another tent, and never assigns a tent.
 *
 * Tentless candidates are deliberately NOT decided here. Whether a tentless
 * plant may save an observation is owned by Quick Log's own tent gating (open
 * PR #1824 makes "observation" tent-optional for in-grow plants). The gate
 * passes the exact stored plant + grow with `tentId: null`, and Quick Log's
 * gating decides, so this surface follows that decision instead of competing
 * with it.
 *
 * Pure. No React, no I/O, no clock, no randomness.
 */
import {
  resolveQuickLogPrefillTarget,
  type QuickLogTargetBlockReason,
  type QuickLogTargetTent,
} from "@/lib/quickLogTargetIntegrityRules";

/** The candidate plant's own stored relationships (plants.grow_id / tent_id). */
export interface PhenoEvidenceTargetPlant {
  readonly plantId: string | null | undefined;
  readonly growId: string | null | undefined;
  readonly tentId: string | null | undefined;
}

/** The tent catalog Quick Log resolves against, with its read state. */
export type PhenoEvidenceTentCatalog =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "ready"; tents: ReadonlyArray<QuickLogTargetTent> }>;

export type PhenoEvidenceQuickLogTargetKind =
  | "ready"
  | "pending"
  | "catalog_error"
  | "plant_unavailable"
  | "needs_assignment"
  | "tent_unavailable"
  | "mismatch";

export type PhenoEvidenceQuickLogTarget =
  | Readonly<{
      kind: "ready";
      plantId: string;
      growId: string;
      /** null = tentless; Quick Log's own tent gating decides (see header). */
      tentId: string | null;
    }>
  | Readonly<{ kind: Exclude<PhenoEvidenceQuickLogTargetKind, "ready"> }>;

/** Status copy per blocked state. Data, not JSX, so tests pin exact strings. */
export const PHENO_EVIDENCE_TARGET_COPY = {
  pending: "Checking where this evidence will be saved…",
  catalog_error: "Couldn't confirm this plant's tent right now.",
  plant_unavailable: "This plant is no longer available, so evidence can't be recorded here.",
  needs_assignment: "Assign this plant to a grow before recording evidence.",
  tent_unavailable: "This plant's tent is archived or no longer available.",
  mismatch: "This plant's tent belongs to a different grow. Review the plant before recording.",
} as const satisfies Record<Exclude<PhenoEvidenceQuickLogTargetKind, "ready">, string>;

export const PHENO_EVIDENCE_TARGET_RETRY_LABEL = "Retry" as const;
export const PHENO_EVIDENCE_TARGET_REVIEW_PLANT_LABEL = "Review plant" as const;

/** Blocked states whose repair is on the plant itself (link to Plant Detail). */
export function phenoEvidenceTargetNeedsPlantRepair(
  kind: PhenoEvidenceQuickLogTargetKind,
): boolean {
  return kind === "needs_assignment" || kind === "tent_unavailable" || kind === "mismatch";
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function kindForBlockReason(
  reason: QuickLogTargetBlockReason,
): Exclude<PhenoEvidenceQuickLogTargetKind, "ready"> {
  switch (reason) {
    case "missing_plant":
    case "plant_not_found":
    case "plant_inactive":
      return "plant_unavailable";
    case "plant_grow_unassigned":
    case "plant_tent_unassigned":
      return "needs_assignment";
    case "tent_not_found":
    case "tent_inactive":
      return "tent_unavailable";
    case "prefill_target_pending":
      return "pending";
    case "tent_grow_unassigned":
    case "tent_grow_mismatch":
    case "prefill_grow_mismatch":
    case "prefill_tent_mismatch":
    case "selected_tent_mismatch":
    case "active_grow_mismatch":
    case "missing_active_grow":
      return "mismatch";
  }
}

export function resolvePhenoEvidenceQuickLogTarget(input: {
  plant: PhenoEvidenceTargetPlant | null | undefined;
  catalog: PhenoEvidenceTentCatalog | null | undefined;
}): PhenoEvidenceQuickLogTarget {
  const plantId = cleanId(input.plant?.plantId);
  if (!plantId) return { kind: "plant_unavailable" };
  const growId = cleanId(input.plant?.growId);
  if (!growId) return { kind: "needs_assignment" };
  const tentId = cleanId(input.plant?.tentId);
  // Tentless: exact stored plant + grow, tent decided by Quick Log (header).
  if (!tentId) return { kind: "ready", plantId, growId, tentId: null };

  // A tent is named: never infer anything until the catalog has been read.
  const catalog = input.catalog;
  if (!catalog || catalog.status === "loading") return { kind: "pending" };
  if (catalog.status === "error") return { kind: "catalog_error" };

  const resolution = resolveQuickLogPrefillTarget({
    prefill: { plantId, growId, tentId },
    plants: [{ id: plantId, grow_id: growId, tent_id: tentId }],
    tents: catalog.tents,
  });
  if (resolution.status === "blocked") return { kind: kindForBlockReason(resolution.reason) };
  return {
    kind: "ready",
    plantId: resolution.target.plantId,
    growId: resolution.target.growId,
    tentId: resolution.target.tentId,
  };
}
