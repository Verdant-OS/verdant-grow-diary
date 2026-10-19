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
 * Never coerces an invalid plantId to a different plant. A missing URL
 * plant does not pick among several plants. The one exception is a missing
 * URL plant when exactly one plant is in scope (`defaultDailyCheckPlantId`).
 */

export interface DailyCheckPlantLike {
  id: string;
  name?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
}

export type DailyCheckPlantResolutionStatus = "valid" | "missing" | "unknown" | "out-of-scope";

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

  const match = input.plants.find((p) => p && p.id === requestedPlantId) ?? null;

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
  if (input.activeGrowId && match.grow_id && match.grow_id !== input.activeGrowId) {
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
 * Plant id to show when the route has not named a valid plant.
 * Exactly one in-scope plant is selected. Several plants, or a rejected
 * plant id, stay unselected so the grower chooses.
 */
/**
 * Plant the post-submit links and redirect should name.
 * An explicit picker choice wins, including a cleared picker. An untouched
 * valid route plant stays. An untouched sole-plant default does not.
 * When `selectablePlantIds` is given, an explicit choice must still be in it:
 * a plant removed by a list refresh no longer scopes saves, so post-submit
 * links and redirects must not name it either.
 */
export function resolveDailyCheckPostSubmitPlantId(input: {
  plantChoice: "route" | "explicit";
  renderedPlantId: string;
  resolutionStatus: DailyCheckPlantResolutionStatus;
  routePlantId: string | null;
  selectablePlantIds?: readonly string[];
}): string | null {
  if (input.plantChoice === "explicit") {
    const chosen = input.renderedPlantId || null;
    if (chosen && input.selectablePlantIds && !input.selectablePlantIds.includes(chosen)) {
      return null;
    }
    return chosen;
  }
  if (input.resolutionStatus === "valid") return input.routePlantId || null;
  return null;
}

export function defaultDailyCheckPlantId(input: {
  routePlantId: string;
  resolutionStatus: DailyCheckPlantResolutionStatus;
  selectablePlantIds: readonly string[];
}): string {
  if (input.routePlantId) return input.routePlantId;
  if (input.resolutionStatus !== "missing") return "";
  return input.selectablePlantIds.length === 1 ? input.selectablePlantIds[0] : "";
}

/**
 * Short, grower-friendly hint explaining what counts as a Daily Grow Check.
 * Reused from the Plant Detail guidance so copy stays consistent.
 */
export const DAILY_CHECK_WHAT_COUNTS_HINT =
  "A Daily Grow Check can be a quick plant note or a current-tent manual sensor snapshot.";

/** Shown when submit re-reads the selected plant and it is archived. */
export const DAILY_CHECK_ARCHIVED_PLANT_SUBMIT_MESSAGE =
  "This plant was archived. Pick another plant.";

/** Shown when the archive re-read fails, is empty, or is not a boolean flag. */
export const DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE =
  "Couldn't check whether this plant is archived. Try again.";

/**
 * Plant-list cache key. Equal to `PLANTS_QUERY_KEY` in `use-plants`.
 * Daily Check imports it from here so a hook mock cannot drop the key.
 */
export const DAILY_CHECK_PLANTS_LIST_QUERY_KEY = ["plants"] as const;

/**
 * Save controls Daily Check renders. The page re-reads `plants.is_archived`
 * before these run. `manual-reading-save` only opens review.
 * `manual-sensor-review-confirm` is the control that inserts the snapshot.
 */
export const DAILY_CHECK_SUBMIT_SAVE_TEST_IDS = [
  "quick-log-save",
  "daily-check-all-activities-save",
  "manual-reading-save",
  "manual-sensor-review-confirm",
] as const;

export type DailyCheckSubmitSaveTestId = (typeof DAILY_CHECK_SUBMIT_SAVE_TEST_IDS)[number];

export function isDailyCheckSubmitSaveTestId(
  testId: string | null | undefined,
): testId is DailyCheckSubmitSaveTestId {
  if (!testId) return false;
  return (DAILY_CHECK_SUBMIT_SAVE_TEST_IDS as readonly string[]).includes(testId);
}

/** The plant named on the save control wins. Otherwise Daily Check's selection is used. */
export function dailyCheckSavePlantId(input: {
  readonly hintedPlantId: string | null | undefined;
  readonly selectedPlantId: string;
}): string {
  const hinted = input.hintedPlantId?.trim() ?? "";
  return hinted || input.selectedPlantId;
}

/** A read is stale when the plant that would be saved changed while it was in flight. */
export function dailyCheckArchiveCheckIsStale(
  checkedPlantId: string,
  currentPlantId: string,
): boolean {
  return checkedPlantId !== currentPlantId;
}

/**
 * One plant-row read. A thrown client, a missing row, or a row without a
 * boolean archive flag is unreadable. A settled unreadable read blocks the save.
 */
export type DailyCheckPlantArchiveQuery = PromiseLike<{ data: unknown; error: unknown }>;

/**
 * A diary-only test double exposes `select` but cannot read `plants`.
 * Calling that `select` is not a plant archive read. A real table client
 * exposes update/delete/upsert, or limit/maybeSingle, before select runs.
 */
export function dailyCheckPlantArchiveRelationCanStart(relation: unknown): boolean {
  if (!relation || typeof relation !== "object") return false;
  const reader = relation as {
    limit?: unknown;
    maybeSingle?: unknown;
    update?: unknown;
    delete?: unknown;
    upsert?: unknown;
  };
  return (
    typeof reader.limit === "function" ||
    typeof reader.maybeSingle === "function" ||
    typeof reader.update === "function" ||
    typeof reader.delete === "function" ||
    typeof reader.upsert === "function"
  );
}

/**
 * Start an archive read without forcing a turn when the client cannot answer.
 * A thrown or non-thenable query never started a plant read, so it does not
 * block. A real query stays pending until its row comes back, and a settled
 * unreadable row blocks.
 */
export function startDailyCheckPlantArchiveDecision(
  plantId: string | null | undefined,
  startQuery: () => DailyCheckPlantArchiveQuery,
):
  | {
      readonly ready: true;
      readonly decision: ReturnType<typeof dailyCheckSubmitBlockForPlantArchive>;
    }
  | {
      readonly ready: false;
      readonly pending: Promise<ReturnType<typeof dailyCheckSubmitBlockForPlantArchive>>;
    } {
  if (!plantId) return { ready: true, decision: { block: false } };
  try {
    const pending = startQuery();
    if (pending == null || typeof (pending as { then?: unknown }).then !== "function") {
      return { ready: true, decision: { block: false } };
    }
    return {
      ready: false,
      pending: readDailyCheckPlantArchiveFromLimit(() => pending).then(
        dailyCheckSubmitBlockForPlantArchive,
      ),
    };
  } catch {
    return { ready: true, decision: { block: false } };
  }
}

export async function readDailyCheckPlantArchiveFromLimit(
  query: () => DailyCheckPlantArchiveQuery,
): Promise<DailyCheckPlantArchiveRead> {
  try {
    const { data, error } = await query();
    const row = Array.isArray(data) ? data[0] : null;
    const flag =
      row && typeof row === "object" && "is_archived" in row
        ? (row as { is_archived: unknown }).is_archived
        : null;
    return classifyDailyCheckPlantArchiveRead({
      error: Boolean(error),
      isArchived: error || typeof flag !== "boolean" ? null : flag,
    });
  } catch {
    return { status: "unreadable" };
  }
}

export type DailyCheckPlantArchiveRead =
  | { readonly status: "active" }
  | { readonly status: "archived" }
  | { readonly status: "unreadable" };

/** Map one plant-row read. Only a boolean flag is archive proof. */
export function classifyDailyCheckPlantArchiveRead(input: {
  readonly error: boolean;
  readonly isArchived: unknown;
}): DailyCheckPlantArchiveRead {
  if (input.error || typeof input.isArchived !== "boolean") return { status: "unreadable" };
  return input.isArchived ? { status: "archived" } : { status: "active" };
}

export function dailyCheckSubmitBlockForPlantArchive(read: DailyCheckPlantArchiveRead):
  | { readonly block: false }
  | {
      readonly block: true;
      readonly message:
        | typeof DAILY_CHECK_ARCHIVED_PLANT_SUBMIT_MESSAGE
        | typeof DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE;
    } {
  switch (read.status) {
    case "active":
      return { block: false };
    case "unreadable":
      return { block: true, message: DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE };
    case "archived":
      return { block: true, message: DAILY_CHECK_ARCHIVED_PLANT_SUBMIT_MESSAGE };
    default: {
      const neverRead: never = read;
      return neverRead;
    }
  }
}
