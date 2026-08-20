/**
 * Remembered Quick Log target — suggestion rules (Tranche B+ slice D5, D-B9).
 *
 * A stored recent target may only ever return to the grower as a VISIBLE,
 * explicitly chosen suggestion. It is never a silent default and never a
 * fallback when resolution fails: every failing condition yields no
 * suggestion at all, so an unscoped Quick Log stays a manual selection.
 *
 * Six independent conditions must hold, evaluated with an injectable clock:
 *   1. the stored timestamp parses to a finite instant;
 *   2. it is not in the future (a skewed clock is not evidence);
 *   3. it is at most 14 days old (strictly older → expired);
 *   4. the plant still appears among the grower's own visible rows;
 *   5. that live row still has the grow and tent scope required for a save;
 *   6. that grow is still one of the grower's ACTIVE grows.
 *
 * Condition 6 is not implied by condition 4. `archiveGrow` (`src/lib/db.ts`)
 * updates only the `grows` row, so a plant in a newly archived grow keeps
 * `is_archived: false` and stays in `usePlants()`. Offering it looked
 * harmless and was not: accepting calls `setActiveGrowId(archivedGrowId)`,
 * and `GrowsProvider` — which lists active grows only — replaces an unknown
 * id with `grows[0].id`. The grower would land on a DIFFERENT grow with the
 * remembered plant absent from the filtered options. Fail closed instead.
 *
 * The storage key is namespaced per account, so one browser shared between
 * accounts can never surface another grower's plant. Grow and tent scope are
 * re-derived from the live row rather than trusted from storage.
 *
 * Pure: no storage access, no clock, no I/O.
 */

export const RECENT_TARGET_SUGGESTION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Per-account key prefix. Exported so the diagnostics panel can enumerate the
 * accounts that have a remembered target on this device — a static key list
 * cannot, because the account id is part of the key.
 */
export const RECENT_TARGET_STORAGE_KEY_PREFIX = "verdant.quickLog.lastTarget.v2.";

export interface RecentTargetRecord {
  plantId: string;
  growId: string | null;
  tentId: string | null;
  savedAt: string;
}

export interface RecentTargetVisiblePlant {
  id: string;
  name?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
}

export interface RecentTargetSuggestion {
  plantId: string;
  plantName: string;
  growId: string | null;
  tentId: string | null;
}

export interface RecentTargetVisibleGrow {
  id: string;
}

export interface ResolveRecentTargetSuggestionInput {
  record: RecentTargetRecord | null;
  now: number;
  visiblePlants: readonly RecentTargetVisiblePlant[] | null | undefined;
  /**
   * The grower's ACTIVE grows — the same archived-filtered list the grow
   * picker renders. Absent or empty means "not established", which fails
   * closed: an unverifiable grow is not evidence that the grow is live.
   */
  visibleGrows: readonly RecentTargetVisibleGrow[] | null | undefined;
}

function trimmed(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

/**
 * Per-account storage key. Returns null without a user: an anonymous session
 * has no account to scope a remembered target to, so nothing is stored.
 */
export function buildRecentTargetStorageKey(userId: string | null | undefined): string | null {
  const id = trimmed(userId);
  return id ? `${RECENT_TARGET_STORAGE_KEY_PREFIX}${id}` : null;
}

/**
 * Parse a stored payload defensively. Any malformed shape yields null.
 *
 * `savedAt` must be a timestamp `Date.parse` can actually read, not merely a
 * nonempty string. `resolveRecentTargetSuggestion` rejects an unparseable one
 * anyway, so accepting it here made the parser and the resolver disagree about
 * what a valid record is — and anything reasoning from the parser alone (the
 * diagnostics panel does) would call an unusable record healthy.
 */
export function parseRecentTargetRecord(raw: string | null | undefined): RecentTargetRecord | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  const plantId = trimmed(candidate.plantId);
  const savedAt = trimmed(candidate.savedAt);
  if (!plantId || !savedAt) return null;
  if (!Number.isFinite(Date.parse(savedAt))) return null;
  return {
    plantId,
    growId: trimmed(candidate.growId) || null,
    tentId: trimmed(candidate.tentId) || null,
    savedAt,
  };
}

/**
 * Decide whether a stored target may be offered. Returns null — never an
 * error, never a partial suggestion — whenever any condition fails.
 */
export function resolveRecentTargetSuggestion(
  input: ResolveRecentTargetSuggestionInput,
): RecentTargetSuggestion | null {
  const { record, now, visiblePlants, visibleGrows } = input;
  if (!record) return null;
  if (typeof now !== "number" || !Number.isFinite(now)) return null;

  const savedAtMs = Date.parse(record.savedAt);
  if (!Number.isFinite(savedAtMs)) return null;
  if (savedAtMs > now) return null;
  if (now - savedAtMs > RECENT_TARGET_SUGGESTION_MAX_AGE_MS) return null;

  // Owner revalidation: the plant must still be visible to this grower.
  // Archived PLANTS, merged, deleted, and cross-account targets are all absent
  // here. A plant whose GROW was archived is not — see condition 6 below.
  const plant = (visiblePlants ?? []).find((row) => row && row.id === record.plantId);
  if (!plant) return null;

  const plantName = trimmed(plant.name);
  if (!plantName) return null;
  const growId = trimmed(plant.grow_id);
  const tentId = trimmed(plant.tent_id);
  if (!growId || !tentId) return null;

  // The grow must still be one of the grower's active grows. An archived grow
  // leaves its plants visible, so the plant row alone cannot prove this.
  const growIsActive = (visibleGrows ?? []).some((row) => row && row.id === growId);
  if (!growIsActive) return null;

  return {
    plantId: plant.id,
    plantName,
    // Scope comes from the live row, never from storage.
    growId,
    tentId,
  };
}
