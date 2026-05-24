/**
 * Pure rules for resolving the `?plantId=` query param on the Daily Check
 * route into a safe selection.
 *
 * Read-only. No I/O. No writes. No persistence.
 *
 * Categories returned:
 *   - "valid"        → plant exists, is active, and is in scope.
 *   - "missing"      → no plantId in URL. UI should show the picker.
 *   - "unknown"      → plantId is present but not found in the active list.
 *                      This collapses three real-world cases the UI cannot
 *                      tell apart from the active query alone: deleted,
 *                      archived, or merged. We refuse to silently pick a
 *                      different plant in any of these cases.
 *   - "out-of-scope" → plant exists but belongs to a different grow than
 *                      the one currently scoped in the URL, and is NOT a
 *                      legacy null-grow_id plant. Legacy null-grow_id
 *                      plants are intentionally allowed through to stay
 *                      consistent with quickLogPlantOptionRules and
 *                      plantDropdownEligibilityRules.
 *
 * Never coerces an invalid plantId to a different plant. Never auto-picks
 * "the first plant" — the caller should render the picker for `missing` and
 * a rejection banner for `unknown` / `out-of-scope`.
 */

export interface DailyCheckPlantLike {
  id: string;
  name?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
}

export type DailyCheckPlantResolutionStatus =
  | "valid"
  | "missing"
  | "unknown"
  | "out-of-scope";

export interface DailyCheckPlantResolution {
  status: DailyCheckPlantResolutionStatus;
  /** The matched, active, in-scope plant when status === "valid". */
  plant: DailyCheckPlantLike | null;
  /** The raw plantId from the URL, normalized. */
  requestedPlantId: string | null;
  /** Short, grower-friendly explanation for non-"valid" states. */
  message: string | null;
}

export interface DailyCheckPlantResolutionInput {
  /** Raw value of the `plantId` URL query param. */
  plantIdParam: string | null | undefined;
  /**
   * Active plants currently available to the viewer. Callers should pass
   * the same list the picker uses (e.g. `usePlants()` already filters
   * `is_archived = false`). Archived/merged plants must NOT be in here.
   */
  plants: ReadonlyArray<DailyCheckPlantLike>;
  /**
   * Currently scoped grow id (null when viewing "all grows"). Pass the
   * resolved scoped grow, not the raw URL param.
   */
  activeGrowId: string | null;
}

function normalize(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = String(id).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveDailyCheckPlantSelection(
  input: DailyCheckPlantResolutionInput,
): DailyCheckPlantResolution {
  const requestedPlantId = normalize(input.plantIdParam);

  if (!requestedPlantId) {
    return {
      status: "missing",
      plant: null,
      requestedPlantId: null,
      message: null,
    };
  }

  const match =
    input.plants.find((p) => p && p.id === requestedPlantId) ?? null;

  if (!match) {
    // The plant either doesn't exist, is archived, was merged, or the
    // viewer can't see it. We collapse those into one safe message and
    // never auto-pick a different plant.
    return {
      status: "unknown",
      plant: null,
      requestedPlantId,
      message:
        "That plant isn't available for a Daily Grow Check. It may have been archived, merged, or removed. Pick another plant below.",
    };
  }

  // Grow-scope check. Legacy null-grow_id plants pass through to stay
  // consistent with the wider eligibility rules.
  if (
    input.activeGrowId &&
    match.grow_id &&
    match.grow_id !== input.activeGrowId
  ) {
    return {
      status: "out-of-scope",
      plant: null,
      requestedPlantId,
      message:
        "That plant belongs to a different grow than the one you're viewing. Switch grow or pick a plant from this grow below.",
    };
  }

  return {
    status: "valid",
    plant: match,
    requestedPlantId,
    message: null,
  };
}

/**
 * Short, grower-friendly hint explaining what counts as a Daily Grow Check.
 * Reused from the Plant Detail guidance so copy stays consistent.
 */
export const DAILY_CHECK_WHAT_COUNTS_HINT =
  "A Daily Grow Check can be a quick plant note or a current-tent manual sensor snapshot.";
