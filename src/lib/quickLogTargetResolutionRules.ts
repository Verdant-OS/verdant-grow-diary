/**
 * Shared Quick Log target precedence — Tranche B+ PR-B1.
 *
 * One pure contract for the ordering decision every Quick Log surface makes:
 * an explicit prefill/intent wins, then route context, then the grower's own
 * selection. There is deliberately **no remembered-default tier**: a stored
 * recent target may only ever reappear as a visible, explicitly-chosen
 * suggestion, never as a silent fallback.
 *
 * This module decides ORDER, not ownership. Existing surface-specific
 * resolvers prove whether a target belongs to the grower; each candidate
 * carries that resolver result into this shared decision. Pure,
 * deterministic, no I/O, no storage.
 */

export const QUICK_LOG_TARGET_PRECEDENCE = [
  "explicit-prefill-or-intent",
  "route-context",
  "explicit-grower-selection",
] as const;

export type QuickLogTargetPrecedenceTier = (typeof QUICK_LOG_TARGET_PRECEDENCE)[number];
type QuickLogNamedTargetTier = Exclude<QuickLogTargetPrecedenceTier, "explicit-grower-selection">;

/**
 * Common target shape for the legacy plant picker and the V2 plant/tent
 * picker. Optional context is normalized to null so consumers never have to
 * infer whether an omitted property was intentional.
 */
export type QuickLogTarget =
  | {
      type: "plant";
      plantId: string;
      tentId: string | null;
      growId: string | null;
    }
  | {
      type: "tent";
      plantId: null;
      tentId: string;
      growId: string | null;
    };

export type QuickLogTargetCandidateResolution =
  { status: "ready"; target: QuickLogTarget } | { status: "blocked"; reason: string };

/** A source-specific candidate plus its stable identity for dismissal. */
export interface QuickLogTargetCandidate {
  requestKey: string | null;
  resolution: QuickLogTargetCandidateResolution;
}

export interface QuickLogTargetPlanInput {
  explicitPrefillOrIntent?: QuickLogTargetCandidate | null;
  routeContext?: QuickLogTargetCandidate | null;
  explicitGrowerSelection?: QuickLogTargetCandidate | null;
  /** The named request key the grower explicitly dismissed, if any. */
  dismissedBlockedPrefillKey: string | null;
}

export type QuickLogTargetPlan =
  | {
      step: "apply-named";
      tier: QuickLogNamedTargetTier;
      target: QuickLogTarget;
      holdActive: true;
      editorPlantId: string;
    }
  | {
      step: "hold-empty";
      tier: QuickLogNamedTargetTier;
      reason: string;
      holdActive: true;
      editorPlantId: "";
    }
  | {
      step: "manual-selection";
      tier: "explicit-grower-selection" | null;
      target: QuickLogTarget | null;
      holdActive: false;
      editorPlantId: string;
    }
  | {
      step: "keep-current";
      tier: "explicit-grower-selection" | null;
      target: QuickLogTarget | null;
      holdActive: false;
      editorPlantId: string;
    };

function normalizeId(value: string | null | undefined): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "";
}

function normalizeTarget(target: QuickLogTarget): QuickLogTarget | null {
  const growId = normalizeId(target.growId) || null;
  if (target.type === "plant") {
    const plantId = normalizeId(target.plantId);
    if (!plantId) return null;
    return {
      type: "plant",
      plantId,
      tentId: normalizeId(target.tentId) || null,
      growId,
    };
  }

  const tentId = normalizeId(target.tentId);
  if (!tentId) return null;
  return { type: "tent", plantId: null, tentId, growId };
}

function namedTargetHasRequiredContext(target: QuickLogTarget): boolean {
  // A named target may change active grow state, so it must carry the proven
  // grow relationship. Explicit grower selection remains presenter-owned and
  // is validated again at the write fence.
  return normalizeId(target.growId).length > 0;
}

function targetRequestKey(target: QuickLogTarget): string {
  return target.type === "plant" ? `plant:${target.plantId}` : `tent:${target.tentId}`;
}

function selectionPlan(
  step: "manual-selection" | "keep-current",
  target: QuickLogTarget | null,
): QuickLogTargetPlan {
  return {
    step,
    tier: target ? "explicit-grower-selection" : null,
    target,
    holdActive: false,
    editorPlantId: target?.type === "plant" ? target.plantId : "",
  };
}

/**
 * Select one target source using the published precedence contract.
 *
 * A blocked or malformed named candidate never falls through to an unrelated
 * lower-priority target. It holds empty until the grower dismisses that exact
 * request key. Once dismissed, the resolver may consider the next tier. This
 * preserves the legacy fail-closed fence while making the ordering executable
 * for future plant- and tent-scoped consumers.
 */
export function resolveQuickLogTargetPlan(input: QuickLogTargetPlanInput): QuickLogTargetPlan {
  const candidates: Record<
    QuickLogTargetPrecedenceTier,
    QuickLogTargetCandidate | null | undefined
  > = {
    "explicit-prefill-or-intent": input.explicitPrefillOrIntent,
    "route-context": input.routeContext,
    "explicit-grower-selection": input.explicitGrowerSelection,
  };
  let dismissedNamedCandidate = false;

  for (const tier of QUICK_LOG_TARGET_PRECEDENCE) {
    const candidate = candidates[tier];
    if (!candidate) continue;

    const readyTarget =
      candidate.resolution.status === "ready" ? normalizeTarget(candidate.resolution.target) : null;
    const requestKey =
      normalizeId(candidate.requestKey) || (readyTarget ? targetRequestKey(readyTarget) : null);

    if (tier !== "explicit-grower-selection") {
      if (!requestKey) {
        // A malformed named request cannot be held safely because it has no
        // stable dismissal identity. Treat the launch as unscoped and ask.
        return selectionPlan("manual-selection", null);
      }
      if (input.dismissedBlockedPrefillKey === requestKey) {
        dismissedNamedCandidate = true;
        continue;
      }
      if (
        candidate.resolution.status === "blocked" ||
        !readyTarget ||
        !namedTargetHasRequiredContext(readyTarget)
      ) {
        return {
          step: "hold-empty",
          tier,
          reason:
            candidate.resolution.status === "blocked"
              ? candidate.resolution.reason
              : "invalid_target_context",
          holdActive: true,
          editorPlantId: "",
        };
      }
      return {
        step: "apply-named",
        tier,
        target: readyTarget,
        holdActive: true,
        editorPlantId: readyTarget.type === "plant" ? readyTarget.plantId : "",
      };
    }

    // The final tier is always an explicit grower choice. Invalid/blocked
    // selection state means the presenter should ask for a selection; it must
    // never resurrect a remembered or stale target.
    const selectedTarget = candidate.resolution.status === "ready" ? readyTarget : null;
    return selectionPlan(
      dismissedNamedCandidate ? "keep-current" : "manual-selection",
      selectedTarget,
    );
  }

  return selectionPlan(dismissedNamedCandidate ? "keep-current" : "manual-selection", null);
}
