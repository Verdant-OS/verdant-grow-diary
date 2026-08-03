/**
 * phenoEvidenceHandoffRules — gate "Record <goal> evidence" before the global
 * Quick Log opens.
 *
 * Product contract: a Pheno workspace handoff must only open Quick Log when the
 * stored plant/grow/tent triangle is write-ready under the CANONICAL Quick Log
 * prefill integrity rules. Tentless (or otherwise blocked) candidates must not
 * open a dead dialog that cannot mint a trustworthy evidence receipt.
 *
 * This module:
 *   - reuses resolveQuickLogPrefillTarget (no second rule table)
 *   - never fabricates active grow or tent
 *   - never writes diary / Action Queue / devices
 *   - never opens Quick Log itself (presenter dispatches only on "ready")
 *
 * Pure. No I/O, no React, no time, no randomness.
 */
import {
  buildPhenoEvidenceGoalQuickLogPrefill,
  type PhenoEvidenceGoalQuickLogPrefill,
  type PhenoEvidenceGoalQuickLogPrefillInput,
} from "@/lib/phenoEvidenceQuickLogPrefill";
import {
  QUICK_LOG_TARGET_BLOCKED_COPY,
  resolveQuickLogPrefillTarget,
  type QuickLogResolvedTarget,
  type QuickLogTargetBlockReason,
  type QuickLogTargetPlant,
  type QuickLogTargetTent,
} from "@/lib/quickLogTargetIntegrityRules";

export type PhenoEvidenceHandoffCatalogStatus = "pending" | "ready" | "error";

export type PhenoEvidenceHandoffCtaKind =
  | "none"
  | "assign_tent"
  | "open_plant"
  | "retry_catalog"
  | "finish_setup";

export interface PhenoEvidenceHandoffCta {
  kind: PhenoEvidenceHandoffCtaKind;
  label: string;
  /** Plant-detail path for assign/review; null for retry/none. */
  href: string | null;
}

export type PhenoEvidenceHandoffDecision =
  | Readonly<{ kind: "pending"; title: string; description: string }>
  | Readonly<{
      kind: "catalog_error";
      title: string;
      description: string;
      cta: PhenoEvidenceHandoffCta;
    }>
  | Readonly<{ kind: "goal_unavailable"; title: string; description: string }>
  | Readonly<{
      kind: "ready";
      prefill: PhenoEvidenceGoalQuickLogPrefill;
      target: QuickLogResolvedTarget;
    }>
  | Readonly<{
      kind: "blocked";
      reason: QuickLogTargetBlockReason;
      title: string;
      description: string;
      cta: PhenoEvidenceHandoffCta;
    }>;

export interface ResolvePhenoEvidenceHandoffInput {
  catalogStatus: PhenoEvidenceHandoffCatalogStatus;
  /** Full plant catalog (must include the candidate). */
  plants: ReadonlyArray<QuickLogTargetPlant> | null | undefined;
  /** Active tent catalog used by Quick Log integrity (non-archived preferred). */
  tents: ReadonlyArray<QuickLogTargetTent> | null | undefined;
  prefillInput: PhenoEvidenceGoalQuickLogPrefillInput;
}

function plantHref(plantId: string): string {
  return `/plants/${plantId}`;
}

function ctaForBlockedReason(
  reason: QuickLogTargetBlockReason,
  plantId: string | null,
): PhenoEvidenceHandoffCta {
  const href = plantId ? plantHref(plantId) : null;
  switch (reason) {
    case "plant_tent_unassigned":
    case "plant_grow_unassigned":
      return {
        kind: "assign_tent",
        label: "Assign tent",
        href,
      };
    case "tent_inactive":
    case "tent_not_found":
    case "selected_tent_mismatch":
    case "prefill_tent_mismatch":
    case "prefill_grow_mismatch":
    case "active_grow_mismatch":
    case "plant_inactive":
    case "plant_not_found":
    case "missing_plant":
      return {
        kind: "open_plant",
        label: "Review plant assignment",
        href,
      };
    case "tent_grow_unassigned":
    case "tent_grow_mismatch":
      return {
        kind: "finish_setup",
        label: "Review tent setup",
        href: href ?? "/grows?intent=one_tent_activation",
      };
    case "missing_active_grow":
    case "prefill_target_pending":
      return { kind: "none", label: "", href: null };
    default: {
      const _exhaustive: never = reason;
      void _exhaustive;
      return { kind: "none", label: "", href: null };
    }
  }
}

function blockedTitle(reason: QuickLogTargetBlockReason): string {
  switch (reason) {
    case "plant_tent_unassigned":
      return "Assign a tent before recording evidence";
    case "plant_grow_unassigned":
      return "Finish plant setup before recording evidence";
    case "tent_inactive":
      return "Assigned tent is archived";
    case "tent_not_found":
      return "Assigned tent is unavailable";
    case "tent_grow_mismatch":
    case "tent_grow_unassigned":
      return "Plant and tent setup do not match";
    case "plant_not_found":
    case "plant_inactive":
      return "This candidate is not available for logging";
    case "prefill_grow_mismatch":
    case "prefill_tent_mismatch":
      return "Plant context changed";
    default:
      return "Cannot open evidence Quick Log yet";
  }
}

function blockedDescription(reason: QuickLogTargetBlockReason): string {
  // Prefer canonical integrity copy so JSX never maintains a second table.
  const base = QUICK_LOG_TARGET_BLOCKED_COPY[reason];
  if (reason === "plant_tent_unassigned") {
    return `${base} Pheno evidence receipts need a tent-bound plant so Quick Log can save a trustworthy observation.`;
  }
  if (reason === "tent_inactive") {
    return `${base} Reassign this candidate to an active tent, then return here to record evidence.`;
  }
  if (reason === "tent_not_found") {
    return `${base} The tent catalog does not include this plant's tent (it may be archived or missing).`;
  }
  return base;
}

/**
 * Resolve whether "Record <goal> evidence" may open Quick Log.
 *
 * Order:
 *   1. Catalog pending → do not guess
 *   2. Catalog error → retry (never mislabeled as missing setup)
 *   3. Goal/hunt prefill builder → fail closed if goal not configured
 *   4. Canonical Quick Log prefill target integrity on STORED plant rows
 *   5. Ready → prefill rewritten with exact resolved plant/grow/tent ids
 */
export function resolvePhenoEvidenceHandoff(
  input: ResolvePhenoEvidenceHandoffInput,
): PhenoEvidenceHandoffDecision {
  if (input.catalogStatus === "pending") {
    return {
      kind: "pending",
      title: "Confirming plant and tent…",
      description:
        "Waiting for the plant and tent catalog before opening Quick Log. Nothing is guessed from the active grow.",
    };
  }

  if (input.catalogStatus === "error") {
    return {
      kind: "catalog_error",
      title: "Could not load plant or tent assignment",
      description:
        "The plant/tent catalog failed to load. Retry the load — this is a load failure, not incomplete plant assignment.",
      cta: { kind: "retry_catalog", label: "Retry", href: null },
    };
  }

  const draft = buildPhenoEvidenceGoalQuickLogPrefill(input.prefillInput);
  if (!draft) {
    return {
      kind: "goal_unavailable",
      title: "That evidence goal is not available",
      description:
        "The clicked goal is not currently configured on this hunt, or the candidate identity is incomplete.",
    };
  }

  // Integrity uses STORED plant.grow_id / plant.tent_id — never fabricates them.
  // Prefill grow/tent hints are only mismatch guards when present.
  const resolution = resolveQuickLogPrefillTarget({
    prefill: {
      plantId: draft.plantId,
      growId: draft.growId,
      tentId: draft.tentId,
    },
    plants: input.plants,
    tents: input.tents,
  });

  if (resolution.status === "blocked") {
    return {
      kind: "blocked",
      reason: resolution.reason,
      title: blockedTitle(resolution.reason),
      description: blockedDescription(resolution.reason),
      cta: ctaForBlockedReason(resolution.reason, draft.plantId),
    };
  }

  const target = resolution.target;
  // Rewrite prefill to the exact proven identity (stored plant wins).
  const prefill: PhenoEvidenceGoalQuickLogPrefill = {
    ...draft,
    plantId: target.plantId,
    growId: target.growId,
    tentId: target.tentId,
    suggestSnapshot: true,
  };

  return { kind: "ready", prefill, target };
}
