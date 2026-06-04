/**
 * fastAddActionRules — pure rules for Verdant's Global Fast Add menu.
 *
 * Deterministic. Presenter helpers only:
 *  - Defines the 8 Fast Add actions in stable order.
 *  - Resolves each action against the current selection context into a
 *    safe intent: navigate, open-quicklog (event dispatch), or
 *    needs-context (calm copy).
 *
 * Hard constraints:
 *  - No I/O. No Supabase writes. No alerts. No Action Queue writes.
 *  - No model/API calls. No device control. No automation strings.
 *  - The Diagnosis action navigates to the AI Doctor surface only;
 *    it must never trigger a model call by itself.
 */

import { PLANT_QUICKLOG_PREFILL_EVENT } from "./plantQuickLogPrefillRules";

export type FastAddActionId =
  | "diary_note"
  | "watering"
  | "feeding"
  | "training"
  | "photo"
  | "environment"
  | "diagnosis"
  | "harvest";

export interface FastAddActionDef {
  id: FastAddActionId;
  label: string;
  /** Diary event_type forwarded to QuickLog when applicable. */
  quickLogEventType:
    | "observation"
    | "watering"
    | "feeding"
    | "training"
    | "photo"
    | "environment"
    | "harvest"
    | null;
}

export const FAST_ADD_ACTIONS: readonly FastAddActionDef[] = [
  { id: "diary_note", label: "Diary Note", quickLogEventType: "observation" },
  { id: "watering", label: "Watering", quickLogEventType: "watering" },
  { id: "feeding", label: "Feeding", quickLogEventType: "feeding" },
  { id: "training", label: "Training", quickLogEventType: "training" },
  { id: "photo", label: "Photo", quickLogEventType: "photo" },
  { id: "environment", label: "Environment Check", quickLogEventType: "environment" },
  { id: "diagnosis", label: "Diagnosis", quickLogEventType: null },
  { id: "harvest", label: "Harvest", quickLogEventType: "harvest" },
] as const;

export const FAST_ADD_NO_CONTEXT_COPY =
  "Select a plant or tent before logging this action.";

export interface FastAddSelectionContext {
  plantId: string | null;
  plantName?: string | null;
  tentId: string | null;
  tentName?: string | null;
  growId: string | null;
}

export interface FastAddNavigateIntent {
  kind: "navigate";
  to: string;
}
export interface FastAddOpenQuickLogIntent {
  kind: "open-quicklog";
  eventName: typeof PLANT_QUICKLOG_PREFILL_EVENT;
  prefill: {
    plantId: string | null;
    plantName: string | null;
    tentId: string | null;
    tentName: string | null;
    growId: string | null;
    eventType: NonNullable<FastAddActionDef["quickLogEventType"]>;
  };
}
export interface FastAddNeedsContextIntent {
  kind: "needs-context";
  message: typeof FAST_ADD_NO_CONTEXT_COPY;
}

export type FastAddIntent =
  | FastAddNavigateIntent
  | FastAddOpenQuickLogIntent
  | FastAddNeedsContextIntent;

function hasContext(ctx: FastAddSelectionContext | null | undefined): boolean {
  if (!ctx) return false;
  return Boolean(ctx.plantId || ctx.tentId);
}

/**
 * Resolve a Fast Add action against the current selection context.
 *
 * - All actions require a plant or tent to be selected.
 * - Diagnosis routes to the AI Doctor surface (scoped to the plant when
 *   available) — never triggers a model call directly.
 * - All other actions request the existing Quick Log sheet via the
 *   already-wired window event. The grower still confirms + saves.
 */
export function resolveFastAddIntent(
  actionId: FastAddActionId,
  ctx: FastAddSelectionContext | null | undefined,
): FastAddIntent {
  if (!hasContext(ctx)) {
    return { kind: "needs-context", message: FAST_ADD_NO_CONTEXT_COPY };
  }
  const context = ctx as FastAddSelectionContext;
  const def = FAST_ADD_ACTIONS.find((a) => a.id === actionId);
  if (!def) {
    return { kind: "needs-context", message: FAST_ADD_NO_CONTEXT_COPY };
  }

  if (def.id === "diagnosis") {
    // Navigate to AI Doctor surface; scope to plant when known.
    const to = context.plantId
      ? `/plants/${encodeURIComponent(context.plantId)}#ai-doctor`
      : "/doctor";
    return { kind: "navigate", to };
  }

  return {
    kind: "open-quicklog",
    eventName: PLANT_QUICKLOG_PREFILL_EVENT,
    prefill: {
      plantId: context.plantId ?? null,
      plantName: context.plantName ?? null,
      tentId: context.tentId ?? null,
      tentName: context.tentName ?? null,
      growId: context.growId ?? null,
      eventType: def.quickLogEventType!,
    },
  };
}

/**
 * Derive a best-effort selection context from a router pathname.
 * Pure. Returns null when no plant/tent segment matches.
 */
export function deriveSelectionContextFromPathname(
  pathname: string | null | undefined,
  growId: string | null = null,
): FastAddSelectionContext | null {
  if (!pathname) return null;
  const plant = pathname.match(/^\/plants\/([^/?#]+)/);
  if (plant) {
    return { plantId: decodeURIComponent(plant[1]), tentId: null, growId };
  }
  const tent = pathname.match(/^\/tents\/([^/?#]+)/);
  if (tent) {
    return { plantId: null, tentId: decodeURIComponent(tent[1]), growId };
  }
  return null;
}
