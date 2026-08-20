/**
 * Quick Log target ordering — Tranche B+ PR-B1.
 *
 * One pure contract for the ordering decision the legacy Quick Log editor
 * makes: a NAMED REQUEST (an explicit prefill/intent, or route context) wins
 * over the grower's own selection, unless the grower dismissed that request.
 * There is deliberately **no remembered-default tier**: a stored recent target
 * may only ever reappear as a visible, explicitly-chosen suggestion, never as
 * a silent fallback.
 *
 * ## What this module does NOT yet do, stated plainly
 *
 * The efficiency design describes a three-tier order — explicit intent →
 * route context → grower selection. This module encodes **two** tiers, because
 * two is all it can honestly enforce today: `AppShell` collapses "explicit
 * intent" and "route context" into a single `prefill` prop before Quick Log
 * ever sees them (`setPrefill(detail)` on the intent event,
 * `setPrefill({ plantId: resolvePlantQuickLogRouteTarget(...) })` on the FAB),
 * so the editor receives one already-decided named request and cannot tell the
 * two apart. Exporting a three-tier list here would advertise an ordering
 * nothing consults.
 *
 * Splitting `named-request` into its two sources means having `AppShell` pass
 * both candidates instead of collapsing them — `AppShell.tsx` is Tranche A
 * slice A5's edit surface, so that is a later slice's change, not this one's.
 * When it happens, the split goes here and every caller keeps working: the
 * plan already reports which tier it acted on.
 *
 * Scope is likewise narrow on the target shape: this orders **plant** targets
 * for the legacy editor. The V2 sheet's tent targets are not represented and
 * are not claimed; a V2 surface adopting this contract is a separate slice.
 *
 * This module decides ORDER, not validity. Proving that a named target belongs
 * to the grower stays with `resolveQuickLogPrefillTarget`
 * (quickLogTargetIntegrityRules); this consumes that result. Pure,
 * deterministic, no I/O, no storage.
 */

export const QUICK_LOG_TARGET_PRECEDENCE = ["named-request", "explicit-grower-selection"] as const;

export type QuickLogTargetPrecedenceTier = (typeof QUICK_LOG_TARGET_PRECEDENCE)[number];

/** The shape `resolveQuickLogPrefillTarget` returns, narrowed to what ordering needs. */
export type QuickLogPrefillResolution =
  | { status: "ready"; target: { plantId: string; growId: string; tentId?: string | null } }
  | { status: "blocked"; reason: string };

export interface QuickLogTargetPlanInput {
  /** Identity of the current named request, or null for unscoped launchers. */
  requestKey: string | null;
  prefillResolution: QuickLogPrefillResolution;
  /** The request key the grower explicitly dismissed, if any. */
  dismissedBlockedPrefillKey: string | null;
  /** The plant the grower has selected in the editor. */
  manualPlantId: string | null | undefined;
}

/**
 * Every plan reports the tier it acted on, so the precedence list above is
 * something the function consults rather than something it merely declares.
 */
export type QuickLogTargetPlan =
  | {
      step: "apply-named";
      tier: "named-request";
      plantId: string;
      growId: string;
      holdActive: true;
      editorPlantId: string;
    }
  | { step: "hold-empty"; tier: "named-request"; holdActive: true; editorPlantId: "" }
  | {
      step: "manual-selection";
      tier: "explicit-grower-selection";
      holdActive: false;
      editorPlantId: string;
    }
  | {
      step: "keep-current";
      tier: "explicit-grower-selection";
      holdActive: false;
      editorPlantId: string;
    };

function normalizeId(value: string | null | undefined): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "";
}

/** Position in the declared order. Lower wins. */
function rank(tier: QuickLogTargetPrecedenceTier): number {
  return QUICK_LOG_TARGET_PRECEDENCE.indexOf(tier);
}

/**
 * Decide how the editor should treat its target on this render.
 *
 * - `apply-named`      a proven named target: adopt it (and its grow).
 * - `hold-empty`       a named target that cannot be proven: hold empty and
 *                      show the calm blocked card. Never guess a substitute.
 * - `manual-selection` an unscoped launcher: begin empty, grower chooses.
 * - `keep-current`     the grower dismissed this blocked request: leave their
 *                      own selection alone.
 */
export function resolveQuickLogTargetPlan(input: QuickLogTargetPlanInput): QuickLogTargetPlan {
  const requestKey = normalizeId(input.requestKey) || null;
  const manualPlantId = normalizeId(input.manualPlantId);

  // A named request outranks the grower's own selection, but only while it is
  // live: no request, or one the grower dismissed, drops to the lower tier.
  const named = requestKey !== null && input.dismissedBlockedPrefillKey !== requestKey;

  if (rank(named ? "named-request" : "explicit-grower-selection") > rank("named-request")) {
    const tier = "explicit-grower-selection" as const;
    return requestKey === null
      ? { step: "manual-selection", tier, holdActive: false, editorPlantId: manualPlantId }
      : { step: "keep-current", tier, holdActive: false, editorPlantId: manualPlantId };
  }

  const resolution = input.prefillResolution;
  if (resolution.status === "ready") {
    const plantId = normalizeId(resolution.target.plantId);
    const growId = normalizeId(resolution.target.growId);
    // Both ids must be present: a half-resolved target is not proven.
    if (plantId && growId) {
      return {
        step: "apply-named",
        tier: "named-request",
        plantId,
        growId,
        holdActive: true,
        editorPlantId: plantId,
      };
    }
  }
  return { step: "hold-empty", tier: "named-request", holdActive: true, editorPlantId: "" };
}
