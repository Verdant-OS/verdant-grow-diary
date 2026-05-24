/**
 * Grow-Room Mode — pure quick-action routing rules.
 *
 * Deterministic helpers that turn a tent (+ its plants) into:
 *  - a primary plant choice (if any)
 *  - QuickLog prefill payloads for each quick action
 *  - href targets for Daily Check / Tent / Plant navigation
 *  - empty-state copy for "no tents" or "no plants in tent"
 *
 * NO REACT. NO I/O. NO SUPABASE. NO DEVICE CONTROL.
 *  - Never returns a write payload.
 *  - Never invents data.
 *  - Never produces an executable device command surface.
 */

export type QuickActionKind =
  | "quick_log"
  | "watering"
  | "feeding"
  | "photo"
  | "daily_check"
  | "view_tent";

export interface QuickActionPlantLite {
  id: string;
  name: string | null;
  tent_id: string | null;
  is_archived?: boolean | null;
  created_at?: string | null;
}

export interface QuickActionTentLite {
  id: string;
  name: string;
  grow_id: string | null;
}

export interface QuickLogPrefillPayload {
  tentId: string;
  growId: string | null;
  plantId: string | null;
  /** Maps 1:1 to EVENT_TYPES.value in src/lib/diary.ts. */
  eventType: "observation" | "watering" | "feeding" | "photo";
}

export interface QuickActionLink {
  kind: QuickActionKind;
  label: string;
  /** When defined → open QuickLog with this prefill. */
  quickLogPrefill?: QuickLogPrefillPayload;
  /** When defined → navigate to this route instead of opening QuickLog. */
  href?: string;
}

export interface BuildQuickActionLinksInput {
  tent: QuickActionTentLite;
  plantId?: string | null;
}

/**
 * Pick a deterministic primary plant for plant-scoped quick actions.
 * - Filters out archived plants.
 * - Only considers plants attached to this tent.
 * - Stable order: created_at ascending, id ascending tie-break.
 * - Returns null if no eligible plant exists.
 */
export function getPrimaryPlantForTent(
  tentId: string,
  plants: QuickActionPlantLite[],
): QuickActionPlantLite | null {
  const eligible = plants
    .filter((p) => !p.is_archived && p.tent_id === tentId)
    .slice()
    .sort((a, b) => {
      const at = a.created_at ? Date.parse(a.created_at) : 0;
      const bt = b.created_at ? Date.parse(b.created_at) : 0;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });
  return eligible[0] ?? null;
}

/** A plant-scoped quick action is safe to open only when a real plant id is selected. */
export function canOpenPlantScopedAction(
  plant: QuickActionPlantLite | null | undefined,
): boolean {
  return !!plant && !plant.is_archived && typeof plant.id === "string" && plant.id.length > 0;
}

/**
 * Build the full quick-action set for a tent card.
 *
 * Quick Log / Watering / Feeding / Photo all reuse the existing QuickLog
 * modal via prefill — no new write path is introduced. Daily Check and
 * View Tent are navigation only.
 */
export function buildGrowRoomQuickActionLinks(
  input: BuildQuickActionLinksInput,
): QuickActionLink[] {
  const { tent, plantId } = input;
  const safePlantId = typeof plantId === "string" && plantId.length > 0 ? plantId : null;
  const base = {
    tentId: tent.id,
    growId: tent.grow_id ?? null,
    plantId: safePlantId,
  };

  return [
    {
      kind: "quick_log",
      label: "Quick Log",
      quickLogPrefill: { ...base, eventType: "observation" },
    },
    {
      kind: "watering",
      label: "Log Watering",
      quickLogPrefill: { ...base, eventType: "watering" },
    },
    {
      kind: "feeding",
      label: "Log Feeding",
      quickLogPrefill: { ...base, eventType: "feeding" },
    },
    {
      kind: "photo",
      label: "Add Photo",
      quickLogPrefill: { ...base, eventType: "photo" },
    },
    {
      kind: "daily_check",
      label: "Daily Check",
      href: safePlantId
        ? `/daily-check?plantId=${encodeURIComponent(safePlantId)}`
        : "/daily-check",
    },
    {
      kind: "view_tent",
      label: "View Tent",
      href: `/tents/${encodeURIComponent(tent.id)}`,
    },
  ];
}

export type GrowRoomEmptyStateKind = "no_tents" | "no_plants_in_tent" | "ok";

export interface GrowRoomEmptyState {
  kind: GrowRoomEmptyStateKind;
  title: string;
  description: string;
  ctaLabel: string | null;
  ctaHref: string | null;
}

export function getGrowRoomEmptyState(input: {
  tentCount: number;
  plantsInTent?: number;
  tentId?: string | null;
}): GrowRoomEmptyState {
  if (input.tentCount === 0) {
    return {
      kind: "no_tents",
      title: "No tents yet",
      description: "Create a tent to start daily grow checks.",
      ctaLabel: "Create a tent",
      ctaHref: "/tents",
    };
  }
  if ((input.plantsInTent ?? 0) === 0 && input.tentId) {
    return {
      kind: "no_plants_in_tent",
      title: "No plants in this tent yet.",
      description: "Add a plant to enable plant-scoped quick logs.",
      ctaLabel: "Add Plant to This Tent",
      ctaHref: `/tents/${encodeURIComponent(input.tentId)}`,
    };
  }
  return {
    kind: "ok",
    title: "",
    description: "",
    ctaLabel: null,
    ctaHref: null,
  };
}
