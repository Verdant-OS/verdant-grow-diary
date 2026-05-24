/**
 * Pure helpers for Tent management UX.
 *
 * Used by EditTentDialog and TentCardActionsMenu so payload shape and
 * delete-guard logic live outside React/Supabase.
 *
 * Out of scope: alerts, Action Queue, sensors, automation, device control.
 */

export interface TentEditableFields {
  name: string;
  brand?: string | null;
  size?: string | null;
  stage?: string;
  light_on?: boolean;
  light_schedule?: string | null;
  light_wattage?: number | null;
}

export interface TentUpdatePayload {
  name: string;
  brand: string | null;
  size: string | null;
  stage: string;
  light_on: boolean;
  light_schedule: string | null;
  light_wattage: number | null;
}

const VALID_STAGES = ["seedling", "veg", "flower", "flush", "harvest", "cure"] as const;

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Build the minimal update payload for editing a tent. user_id and grow_id
 * are intentionally never set — RLS enforces ownership and grow assignment
 * is handled by separate flows.
 */
export function buildTentUpdatePayload(input: TentEditableFields): TentUpdatePayload {
  const stage = (VALID_STAGES as readonly string[]).includes(input.stage ?? "")
    ? (input.stage as string)
    : "seedling";
  const wattageRaw = input.light_wattage;
  const wattage =
    typeof wattageRaw === "number" && Number.isFinite(wattageRaw) && wattageRaw >= 0
      ? Math.round(wattageRaw)
      : null;
  return {
    name: (input.name ?? "").trim(),
    brand: trimOrNull(input.brand),
    size: trimOrNull(input.size),
    stage,
    light_on: input.light_on !== false,
    light_schedule: trimOrNull(input.light_schedule),
    light_wattage: wattage,
  };
}

export function isTentUpdatePayloadValid(p: TentUpdatePayload): boolean {
  return p.name.length > 0;
}

export interface TentDeleteGuardInput {
  tentId: string;
  assignedPlantCount: number;
  archiveSupported?: boolean;
}

export interface TentDeleteGuard {
  canDelete: boolean;
  canArchive: boolean;
  reason: string | null;
  recommendedAction: "delete" | "archive" | "move_plants_first";
}

/**
 * Decide whether a tent can be safely deleted or archived from the UI.
 * Never hard-deletes when plants are still attached.
 */
export function evaluateTentDeleteGuard(input: TentDeleteGuardInput): TentDeleteGuard {
  const archiveSupported = input.archiveSupported !== false;
  if (input.assignedPlantCount > 0) {
    return {
      canDelete: false,
      canArchive: false,
      reason: "Tent has plants assigned. Move or remove them first.",
      recommendedAction: "move_plants_first",
    };
  }
  if (archiveSupported) {
    return {
      canDelete: true,
      canArchive: true,
      reason: null,
      recommendedAction: "archive",
    };
  }
  return {
    canDelete: true,
    canArchive: false,
    reason: null,
    recommendedAction: "delete",
  };
}

export function buildArchiveTentPayload(): { is_archived: true } {
  return { is_archived: true };
}
