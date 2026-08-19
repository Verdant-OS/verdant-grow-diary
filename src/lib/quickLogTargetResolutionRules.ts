/**
 * Shared Quick Log target precedence — Tranche B+ PR-B1.
 *
 * One pure contract for the ordering decision every Quick Log surface makes:
 * an explicit prefill/intent wins, then route context, then the grower's own
 * selection. There is deliberately **no remembered-default tier**: a stored
 * recent target may only ever reappear as a visible, explicitly-chosen
 * suggestion, never as a silent fallback.
 *
 * This module decides ORDER, not validity. Proving that a named target
 * belongs to the grower stays with `resolveQuickLogPrefillTarget`
 * (quickLogTargetIntegrityRules); this consumes that result. Pure,
 * deterministic, no I/O, no storage.
 */

export const QUICK_LOG_TARGET_PRECEDENCE = [
  "explicit-prefill-or-intent",
  "route-context",
  "explicit-grower-selection",
] as const;

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

export type QuickLogTargetPlan =
  | {
      step: "apply-named";
      plantId: string;
      growId: string;
      holdActive: true;
      editorPlantId: string;
    }
  | { step: "hold-empty"; holdActive: true; editorPlantId: "" }
  | { step: "manual-selection"; holdActive: false; editorPlantId: string }
  | { step: "keep-current"; holdActive: false; editorPlantId: string };

function normalizeId(value: string | null | undefined): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "";
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

  if (requestKey === null) {
    return { step: "manual-selection", holdActive: false, editorPlantId: manualPlantId };
  }

  const holdActive = input.dismissedBlockedPrefillKey !== requestKey;
  if (!holdActive) {
    return { step: "keep-current", holdActive: false, editorPlantId: manualPlantId };
  }

  const resolution = input.prefillResolution;
  if (resolution.status === "ready") {
    const plantId = normalizeId(resolution.target.plantId);
    const growId = normalizeId(resolution.target.growId);
    // Both ids must be present: a half-resolved target is not proven.
    if (plantId && growId) {
      return { step: "apply-named", plantId, growId, holdActive: true, editorPlantId: plantId };
    }
  }
  return { step: "hold-empty", holdActive: true, editorPlantId: "" };
}
