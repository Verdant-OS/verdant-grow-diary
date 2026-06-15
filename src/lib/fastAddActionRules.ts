/**
 * fastAddActionRules — pure rules for Verdant's Quick Log menu.
 *
 * Deterministic. Presenter helpers only:
 *  - Defines the 8 Quick Log presets in stable order.
 *  - Resolves each preset against the current selection context into a
 *    safe intent: navigate, open-quicklog (event dispatch), or
 *    needs-context (calm copy).
 *
 * Hard constraints:
 *  - No I/O. No Supabase writes. No alerts. No Action Queue writes.
 *  - No model/API calls. No device control. No automation strings.
 *  - The Diagnosis preset navigates to the AI Doctor surface only;
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
  { id: "diary_note", label: "Note", quickLogEventType: "observation" },
  { id: "photo", label: "Photo", quickLogEventType: "photo" },
  { id: "watering", label: "Watering", quickLogEventType: "watering" },
  { id: "feeding", label: "Feeding", quickLogEventType: "feeding" },
  { id: "environment", label: "Environment", quickLogEventType: "environment" },
  { id: "training", label: "Training", quickLogEventType: "training" },
  { id: "diagnosis", label: "Diagnosis", quickLogEventType: null },
  { id: "harvest", label: "Harvest", quickLogEventType: "harvest" },
] as const;

export const FAST_ADD_NO_CONTEXT_COPY =
  "Select a plant or tent before logging this action.";

export const FAST_ADD_PICKER_CTAS = [
  { id: "choose_plant", label: "Choose plant", to: "/plants" },
  { id: "choose_tent", label: "Choose tent", to: "/tents" },
] as const;
export type FastAddPickerCtaId = (typeof FAST_ADD_PICKER_CTAS)[number]["id"];

export interface FastAddSelectionContext {
  plantId: string | null;
  plantName?: string | null;
  tentId: string | null;
  tentName?: string | null;
  growId: string | null;
}

export interface FastAddTimestampDefaults {
  occurred_at?: string;
  captured_at?: string;
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
    occurred_at?: string;
    captured_at?: string;
  };
}
export interface FastAddNeedsContextIntent {
  kind: "needs-context";
  message: typeof FAST_ADD_NO_CONTEXT_COPY;
  ctas: typeof FAST_ADD_PICKER_CTAS;
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
export interface ResolveFastAddOptions {
  /** Injectable clock for deterministic tests. Defaults to () => new Date(). */
  now?: () => Date;
}

export function resolveFastAddIntent(
  actionId: FastAddActionId,
  ctx: FastAddSelectionContext | null | undefined,
  options: ResolveFastAddOptions = {},
): FastAddIntent {
  if (!hasContext(ctx)) {
    return {
      kind: "needs-context",
      message: FAST_ADD_NO_CONTEXT_COPY,
      ctas: FAST_ADD_PICKER_CTAS,
    };
  }
  const context = ctx as FastAddSelectionContext;
  const def = FAST_ADD_ACTIONS.find((a) => a.id === actionId);
  if (!def) {
    return {
      kind: "needs-context",
      message: FAST_ADD_NO_CONTEXT_COPY,
      ctas: FAST_ADD_PICKER_CTAS,
    };
  }

  if (def.id === "diagnosis") {
    const to = context.plantId
      ? `/plants/${encodeURIComponent(context.plantId)}#ai-doctor`
      : "/doctor";
    return { kind: "navigate", to };
  }

  const defaults = buildFastAddTimestampDefaults(actionId, options.now);

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
      ...defaults,
    },
  };
}

/**
 * Compute sensible default timestamps for a Fast Add action.
 *
 * Pure helper — does NOT persist or dispatch anything. The QuickLog form
 * still owns the actual write; this only seeds initial values.
 *
 * Rules:
 *  - All logging actions set `occurred_at = now`.
 *  - Environment Check additionally sets `captured_at = now`.
 *  - Diagnosis is navigation-only and returns {}.
 */
export function buildFastAddTimestampDefaults(
  actionId: FastAddActionId,
  now: (() => Date) | undefined = () => new Date(),
): FastAddTimestampDefaults {
  if (actionId === "diagnosis") return {};
  const iso = now().toISOString();
  if (actionId === "environment") {
    return { occurred_at: iso, captured_at: iso };
  }
  return { occurred_at: iso };
}

/**
 * Merge Fast Add timestamp defaults into an existing prefill without
 * overwriting any user-edited values already present.
 */
export function applyFastAddTimestampDefaults<
  T extends { occurred_at?: string | null; captured_at?: string | null },
>(existing: T, defaults: FastAddTimestampDefaults): T {
  const out: T = { ...existing };
  if (defaults.occurred_at && !existing.occurred_at) {
    (out as { occurred_at?: string }).occurred_at = defaults.occurred_at;
  }
  if (defaults.captured_at && !existing.captured_at) {
    (out as { captured_at?: string }).captured_at = defaults.captured_at;
  }
  return out;
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

