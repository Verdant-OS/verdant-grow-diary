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
 * checked by the canonical `resolveQuickLogPrefillTarget`, fed the SAME live
 * plant and tent catalogs Quick Log reads (`usePlants` / `useTents`). The
 * candidate row loaded with the workspace is never trusted for grow/tent: a
 * plant moved after the page loaded would otherwise pass here and then be
 * rejected by Quick Log's own check, recreating the dead handoff (Codex on
 * #1825). The plant's grow must
 * also be in the active-grow list Quick Log targets (an archived grow is
 * blocked). It never invents an active grow, never falls back to another
 * tent, and never assigns a tent.
 *
 * Tentless candidates get an Assign tent step before this evidence handoff
 * (#1005 owner decision, issuecomment-5998044976). Ordinary Quick Log's
 * tent-optional observation rule (#1824) remains unchanged; this gate blocks
 * the Pheno evidence entry point until the live plant row has a valid tent.
 * Assignment stays in the existing Plant Detail flow, chosen by the grower.
 *
 * Pure. No React, no I/O, no clock, no randomness.
 */
import {
  resolveQuickLogPrefillTarget,
  type QuickLogTargetBlockReason,
  type QuickLogTargetPlant,
  type QuickLogTargetTent,
} from "@/lib/quickLogTargetIntegrityRules";
import { isInactiveQuickLogPlant } from "@/lib/quickLogPlantOptionRules";

/**
 * Quick Log's live plant catalog (non-archived plants), with its read state.
 * The plant's CURRENT grow/tent come from here, never from the workspace's
 * candidate snapshot.
 */
export type PhenoEvidencePlantCatalog =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "ready"; plants: ReadonlyArray<QuickLogTargetPlant> }>;

/** The tent catalog Quick Log resolves against, with its read state. */
export type PhenoEvidenceTentCatalog =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "ready"; tents: ReadonlyArray<QuickLogTargetTent> }>;

/**
 * The ACTIVE grows Quick Log can target (GrowsProvider lists non-archived
 * grows only), with its read state. A plant whose grow is archived or missing
 * cannot be resolved by Quick Log, so its handoff is blocked (Codex on #1825).
 */
export type PhenoEvidenceGrowCatalog =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "ready"; growIds: ReadonlySet<string> }>;

/**
 * Catalog read-state adapters (#1825 review P2-3). Same precedence as Quick
 * Log's named-prefill check: an ERROR wins over cached data (a failed
 * background refetch keeps `data`, but Quick Log holds the target empty), and
 * anything not yet loaded is `loading` (fail closed).
 */
export function phenoEvidenceTentCatalogFromQuery(query: {
  readonly isError?: boolean;
  readonly data?: ReadonlyArray<QuickLogTargetTent> | null;
}): PhenoEvidenceTentCatalog {
  if (query.isError) return { status: "error" };
  if (Array.isArray(query.data)) return { status: "ready", tents: query.data };
  return { status: "loading" };
}

export function phenoEvidencePlantCatalogFromQuery(query: {
  readonly isError?: boolean;
  readonly data?: ReadonlyArray<QuickLogTargetPlant> | null;
}): PhenoEvidencePlantCatalog {
  if (query.isError) return { status: "error" };
  if (Array.isArray(query.data)) return { status: "ready", plants: query.data };
  return { status: "loading" };
}

/** Active grows from GrowsProvider. Missing provider/state is `loading`. */
export function phenoEvidenceGrowCatalogFromProvider(ctx: {
  readonly error?: unknown;
  readonly loading?: boolean;
  readonly grows?: ReadonlyArray<{ readonly id: string }> | null;
}): PhenoEvidenceGrowCatalog {
  if (ctx.error) return { status: "error" };
  if (ctx.loading || !Array.isArray(ctx.grows)) return { status: "loading" };
  return { status: "ready", growIds: new Set(ctx.grows.map((g) => g.id)) };
}

export type PhenoEvidenceQuickLogTargetKind =
  | "ready"
  | "pending"
  | "catalog_error"
  | "plant_unavailable"
  | "needs_assignment"
  | "needs_tent_assignment"
  | "grow_unavailable"
  | "tent_unavailable"
  | "mismatch";

export type PhenoEvidenceQuickLogTarget =
  | Readonly<{
      kind: "ready";
      plantId: string;
      growId: string;
      /** The validated tent from the live plant catalog. */
      tentId: string | null;
    }>
  | Readonly<{ kind: Exclude<PhenoEvidenceQuickLogTargetKind, "ready"> }>;

/** Status copy per blocked state. Data, not JSX, so tests pin exact strings. */
export const PHENO_EVIDENCE_TARGET_COPY = {
  pending: "Checking where this evidence will be saved…",
  catalog_error: "Couldn't confirm this plant's grow and tent right now.",
  plant_unavailable: "This plant is no longer available, so evidence can't be recorded here.",
  needs_assignment: "Assign this plant to a grow before recording evidence.",
  needs_tent_assignment: "Assign this plant to a tent before recording evidence.",
  grow_unavailable: "This plant's grow is archived or no longer available.",
  tent_unavailable: "This plant's tent is archived or no longer available.",
  mismatch: "This plant's tent belongs to a different grow. Review the plant before recording.",
} as const satisfies Record<Exclude<PhenoEvidenceQuickLogTargetKind, "ready">, string>;

export const PHENO_EVIDENCE_TARGET_RETRY_LABEL = "Retry" as const;
export const PHENO_EVIDENCE_TARGET_REVIEW_PLANT_LABEL = "Review plant" as const;
export const PHENO_EVIDENCE_TARGET_ASSIGN_TENT_LABEL = "Assign tent" as const;

/** Blocked states whose repair is on the plant itself (link to Plant Detail). */
export function phenoEvidenceTargetNeedsPlantRepair(
  kind: PhenoEvidenceQuickLogTargetKind,
): boolean {
  return (
    kind === "needs_assignment" ||
    kind === "needs_tent_assignment" ||
    kind === "grow_unavailable" ||
    kind === "tent_unavailable" ||
    kind === "mismatch"
  );
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
      return "needs_assignment";
    case "plant_tent_unassigned":
      return "needs_tent_assignment";
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
    case "grow_archived":
      return "grow_unavailable";
  }
}

export function resolvePhenoEvidenceQuickLogTarget(input: {
  plantId: string | null | undefined;
  /** Live plants. Missing → pending: never trust the candidate snapshot. */
  plants: PhenoEvidencePlantCatalog | null | undefined;
  catalog: PhenoEvidenceTentCatalog | null | undefined;
  /** Active grows. Missing → pending: never assume a grow is active. */
  grows: PhenoEvidenceGrowCatalog | null | undefined;
}): PhenoEvidenceQuickLogTarget {
  const plantId = cleanId(input.plantId);
  if (!plantId) return { kind: "plant_unavailable" };

  const plants = input.plants;
  if (!plants || plants.status === "loading") return { kind: "pending" };
  if (plants.status === "error") return { kind: "catalog_error" };
  const row = plants.plants.find((p) => cleanId(p?.id) === plantId);
  // Not in the live (non-archived) list, archived or merged: Quick Log can't
  // target it either.
  if (!row || isInactiveQuickLogPlant(row)) return { kind: "plant_unavailable" };

  const growId = cleanId(row.grow_id);
  if (!growId) return { kind: "needs_assignment" };

  // The plant's grow must be one Quick Log can target, tentless or not.
  const grows = input.grows;
  if (!grows || grows.status === "loading") return { kind: "pending" };
  if (grows.status === "error") return { kind: "catalog_error" };
  if (!grows.growIds.has(growId)) return { kind: "grow_unavailable" };

  // Never infer anything until the tent catalog has been read — tentless
  // plants included: Quick Log blocks EVERY named prefill while its tent
  // query is pending or errored (QuickLog.tsx `namedPrefillQuery*`), so a
  // tentless handoff fired now would open without a target (Codex on #1825).
  const catalog = input.catalog;
  if (!catalog || catalog.status === "loading") return { kind: "pending" };
  if (catalog.status === "error") return { kind: "catalog_error" };

  const tentId = cleanId(row.tent_id);
  // Require the owner's Assign tent step before the Pheno evidence handoff.
  if (!tentId) return { kind: "needs_tent_assignment" };

  const resolution = resolveQuickLogPrefillTarget({
    prefill: { plantId, growId, tentId },
    plants: plants.plants,
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
