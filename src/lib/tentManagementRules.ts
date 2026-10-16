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

/**
 * `storedSize` is the tent's saved size: when the edit leaves it unchanged
 * it is not re-validated, so a size saved before BUG-012 never blocks a
 * rename (CodeRabbit review on #1683).
 */
export function isTentUpdatePayloadValid(
  p: TentUpdatePayload,
  storedSize?: string | null,
): boolean {
  return p.name.length > 0 && tentSizeEditValidationMessage(storedSize, p.size) === null;
}

export const TENT_SIZE_MAX_LENGTH = 40;
/** Largest accepted dimension when the size names no unit at all. */
export const TENT_SIZE_MAX_DIMENSION = 10000;
/** Largest plausible tent/room dimension once converted to centimetres (100 m). */
export const TENT_SIZE_MAX_CM = 10000;

/** Centimetres per unit; `'` and `"` are feet and inches ("5' x 5'"). */
const TENT_SIZE_UNIT_CM: Record<string, number> = {
  mm: 0.1,
  cm: 1,
  m: 100,
  meter: 100,
  meters: 100,
  metre: 100,
  metres: 100,
  in: 2.54,
  inch: 2.54,
  inches: 2.54,
  '"': 2.54,
  "\u2033": 2.54,
  ft: 30.48,
  foot: 30.48,
  feet: 30.48,
  "'": 30.48,
  "\u2032": 30.48,
};

/** A number, then the unit written right after it, if any ("4", "120 cm", "5'"). */
const TENT_SIZE_DIMENSION_RE =
  /(\d+(?:[.,]\d+)?)(?:\s*(mm|cm|met(?:er|re)s?|m|inch(?:es)?|in|feet|foot|ft|'|"|\u2032|\u2033)(?![A-Za-z]))?/gi;

/**
 * Each dimension with the unit it is written in. A number without its own
 * unit takes the next unit written after it ("120x120 cm", "2-3 ft"), else
 * the one before it; with no unit anywhere the unit is unknown (null).
 */
function tentSizeDimensions(value: string): Array<{ n: number; cmPerUnit: number | null }> {
  const parsed = Array.from(value.matchAll(TENT_SIZE_DIMENSION_RE), (m) => ({
    n: Number(m[1].replace(",", ".")),
    cmPerUnit: m[2] ? (TENT_SIZE_UNIT_CM[m[2].toLowerCase()] ?? null) : null,
  }));
  return parsed.map((d, i) => {
    if (d.cmPerUnit !== null) return d;
    const next = parsed.slice(i + 1).find((o) => o.cmPerUnit !== null);
    const previous = parsed
      .slice(0, i)
      .reverse()
      .find((o) => o.cmPerUnit !== null);
    return { n: d.n, cmPerUnit: (next ?? previous)?.cmPerUnit ?? null };
  });
}

export const TENT_SIZE_INVALID_MESSAGE =
  "Tent size must use positive dimensions, like 4x4, 2x4 ft, or 120x120 cm.";
export const TENT_SIZE_TOO_LONG_MESSAGE = `Keep tent size under ${TENT_SIZE_MAX_LENGTH} characters, like 4x4 or 120x120 cm.`;

/**
 * Tent size stays free text ("4x4", "5' x 5'", "120x120 cm"), but a value
 * that cannot describe a real tent is rejected before save: a negative,
 * zero, or absurd dimension (QA 2026-09-24, BUG-012: "-999999x0" was saved).
 * The maximum applies after unit conversion, so "10000x10000 ft" is rejected
 * while a 12 m room written in millimetres is not (Codex review on #1683).
 * Returns null when acceptable (including empty/absent).
 */
export function tentSizeValidationMessage(size: string | null | undefined): string | null {
  const value = typeof size === "string" ? size.trim() : "";
  if (value === "") return null;
  if (value.length > TENT_SIZE_MAX_LENGTH) return TENT_SIZE_TOO_LONG_MESSAGE;
  // A minus between two digits is a range ("2-3 ft", "4 - 5 ft"); set those
  // aside first. Any other minus directly before a number is a negative
  // dimension, including right after the "x" separator ("4x-4") and before
  // a leading decimal ("4x-.5", "4x-,5").
  const withoutRanges = value.replace(/(\d)\s*[-\u2212]\s*(?=\d)/g, "$1 ");
  if (/(^|[^0-9A-Za-z]|[xX]\s*)[-\u2212]\s*[.,]?\d/.test(withoutRanges)) {
    return TENT_SIZE_INVALID_MESSAGE;
  }
  for (const { n, cmPerUnit } of tentSizeDimensions(value)) {
    const tooLarge =
      cmPerUnit === null ? n > TENT_SIZE_MAX_DIMENSION : n * cmPerUnit > TENT_SIZE_MAX_CM;
    if (!Number.isFinite(n) || n <= 0 || tooLarge) return TENT_SIZE_INVALID_MESSAGE;
  }
  return null;
}

/**
 * Edit Tent's size check: an unchanged stored size is accepted as is, and
 * only a changed size is validated.
 */
export function tentSizeEditValidationMessage(
  storedSize: string | null | undefined,
  nextSize: string | null | undefined,
): string | null {
  const stored = typeof storedSize === "string" ? storedSize.trim() : "";
  const next = typeof nextSize === "string" ? nextSize.trim() : "";
  return next === stored ? null : tentSizeValidationMessage(next);
}

export interface TentDeleteGuardInput {
  tentId: string;
  /** Null means the assignment query has not produced trustworthy current data. */
  assignedPlantCount: number | null;
  archiveSupported?: boolean;
}

export interface PlantAssignmentQueryLike<T> {
  data?: readonly T[] | null;
  isLoading?: boolean;
  isPending?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  isPlaceholderData?: boolean;
}

/**
 * Resolve the count used by destructive Tent guards only from fully current,
 * include-archived assignment data. A cached value being refreshed is useful
 * for display but cannot authorize archive/delete.
 */
export function resolveVerifiedAssignedPlantCount<T>(
  query: PlantAssignmentQueryLike<T>,
  isAssigned: (row: T) => boolean = () => true,
): number | null {
  if (
    !Array.isArray(query.data) ||
    query.isLoading === true ||
    query.isPending === true ||
    query.isFetching === true ||
    query.isError === true ||
    query.isPlaceholderData === true
  ) {
    return null;
  }

  return query.data.filter(isAssigned).length;
}

export interface TentDeleteGuard {
  canDelete: boolean;
  canArchive: boolean;
  reason: string | null;
  recommendedAction: "delete" | "archive" | "move_plants_first" | "retry_plant_count";
}

/**
 * Decide whether a tent can be safely deleted or archived from the UI.
 * Never hard-deletes when plants are still attached.
 */
export function evaluateTentDeleteGuard(input: TentDeleteGuardInput): TentDeleteGuard {
  const archiveSupported = input.archiveSupported !== false;
  if (
    input.assignedPlantCount === null ||
    !Number.isInteger(input.assignedPlantCount) ||
    input.assignedPlantCount < 0
  ) {
    return {
      canDelete: false,
      canArchive: false,
      reason: "Plant assignments unavailable. Retry before deleting or archiving this tent.",
      recommendedAction: "retry_plant_count",
    };
  }
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
