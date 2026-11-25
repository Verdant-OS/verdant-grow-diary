/**
 * New plant: which tent the Tent field starts on when the dialog was not
 * opened from a tent. Pure, deterministic, null-safe.
 *
 * The dialog tells the grower "This will live in your current setup", so a
 * plant created inside a setup with exactly one tent belongs in that tent.
 * Starting on "No tent" there left the new plant's Quick Log, Upload Photo
 * and Harvest locked until the grower found and fixed the tent (QA walks
 * FA-20261123-M1 and FA-20261125-M1, issue #3063).
 *
 * It never guesses between several tents, and it never overrides a tent the
 * caller supplied: that path stays with `resolveInitialPlantTentId`, which
 * fails closed on purpose (#642, #645). Same rule as the mobile Tent tab
 * (`mobileTentNavRules`): the only tent in the grower's setup, otherwise none.
 *
 * Returns the tent id to start on, or null to keep "No tent".
 */

export interface CreatePlantCurrentTentCandidate {
  id?: unknown;
  grow_id?: unknown;
}

export interface ResolveCreatePlantCurrentTentInput {
  /** Tent the dialog was opened from, if any. A supplied tent always wins. */
  suppliedTentId?: string | null;
  /** Setup (grow) the new plant will be written to. */
  targetGrowId?: string | null;
  /** The tents the dialog offers in its Tent field. */
  selectableTents?: ReadonlyArray<CreatePlantCurrentTentCandidate | null | undefined> | null;
  /** True only after a tent read finished and no refetch is running. */
  tentsSettled?: boolean;
  /** True when the tent read failed. */
  tentsReadFailed?: boolean;
}

function trimmedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCreatePlantCurrentTentId(
  input: ResolveCreatePlantCurrentTentInput,
): string | null {
  if (trimmedId(input.suppliedTentId)) return null;
  if (input.tentsSettled !== true || input.tentsReadFailed === true) return null;

  const growId = trimmedId(input.targetGrowId)?.toLowerCase() ?? null;
  if (!growId) return null;

  const inSetup = new Map<string, string>();
  for (const tent of input.selectableTents ?? []) {
    const id = trimmedId(tent?.id);
    const tentGrowId = trimmedId(tent?.grow_id)?.toLowerCase() ?? null;
    if (!id || tentGrowId !== growId) continue;
    inSetup.set(id.toLowerCase(), id);
  }

  if (inSetup.size !== 1) return null;
  const [only] = inSetup.values();
  return only;
}
