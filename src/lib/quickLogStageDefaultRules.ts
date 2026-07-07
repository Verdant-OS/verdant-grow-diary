/**
 * Slice A2 — Quick Log stage defaulting (pure rules).
 *
 * The legacy Quick Log used to initialize its stage as
 * `activeGrow?.stage || "veg"`, which had two bugs:
 *   1. It never consulted the SELECTED PLANT, so logging on a plant that is
 *      flowering opened the form pre-set to Vegetative.
 *   2. Unknown context silently collapsed to "veg" — a Flower plant with a
 *      missing/blank grow stage was mislabeled Vegetative on save.
 *
 * These pure helpers fix the defaulting logic in one testable place:
 *   - Prefer the selected plant's stage.
 *   - Fall back to the active grow's stage only when the plant stage is
 *     unavailable.
 *   - If neither is a recognized stage, return "" (UNKNOWN) — never "veg".
 *
 * Every returned non-empty value is a CANONICAL stage value from
 * `STAGES` in src/lib/grow.ts, so the same string drives the Select, the
 * preview, and the saved payload. No new stage labels are introduced.
 *
 * Pure: no React, no Supabase, no I/O.
 */
import { STAGES } from "@/lib/grow";

/** Canonical stage value used when the stage is genuinely unknown. */
export const UNKNOWN_STAGE = "" as const;

/**
 * Normalize an arbitrary stored/observed stage into a canonical `STAGES`
 * value, or `null` when it is not a recognized stage.
 *
 * Matches case-insensitively against BOTH the canonical value (e.g. "flower")
 * and the human label (e.g. "Flowering" / "Drying / Curing"), so it is robust
 * whether a plant row stores the value or the label. Anything else — empty
 * string, whitespace, unknown text, non-strings — normalizes to `null`.
 */
export function normalizeQuickLogStage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const needle = raw.trim().toLowerCase();
  if (needle === "") return null;
  const match = STAGES.find(
    (s) => s.value.toLowerCase() === needle || s.label.toLowerCase() === needle,
  );
  return match ? match.value : null;
}

/** True when `raw` is a recognized canonical/label stage. */
export function isKnownQuickLogStage(raw: unknown): boolean {
  return normalizeQuickLogStage(raw) !== null;
}

/**
 * Should stage defaulting be re-armed for a plant-selection change?
 *
 * TRUE only when the grower moves between two DIFFERENT real plants — i.e. a
 * genuine switch. Callers must pass the last NON-EMPTY plant id as
 * `prevPlantId` so a switch that passes through the cleared "Choose a plant…"
 * state (A → "" → B) is still recognized as A→B, not two fresh auto-selects.
 *
 * FALSE for:
 *  - the initial "" → plant auto-select (prevPlantId === ""): keep any stage
 *    the grower picked before the plant resolved,
 *  - clearing the selection (nextPlantId === ""): nothing to default to yet,
 *  - re-selecting the same plant.
 */
export function isUserDrivenPlantSwitch(prevPlantId: string, nextPlantId: string): boolean {
  return prevPlantId !== "" && nextPlantId !== "" && prevPlantId !== nextPlantId;
}

/**
 * Resolve the stage the Quick Log form should default to.
 *
 * Priority: selected plant stage → active grow stage → UNKNOWN ("").
 * The result is always either a canonical `STAGES` value or "" — it is NEVER
 * silently coerced to "veg".
 */
export function resolveQuickLogStageDefault(input: {
  plantStage?: unknown;
  growStage?: unknown;
}): string {
  const plant = normalizeQuickLogStage(input.plantStage);
  if (plant) return plant;
  const grow = normalizeQuickLogStage(input.growStage);
  if (grow) return grow;
  return UNKNOWN_STAGE;
}
