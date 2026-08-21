/**
 * Remembered Quick Log target — suggestion rules (Tranche B+ slice D5, D-B9).
 *
 * A stored recent target may only ever return to the grower as a VISIBLE,
 * explicitly chosen suggestion. It is never a silent default and never a
 * fallback when resolution fails: every failing condition yields no
 * suggestion at all, so an unscoped Quick Log stays a manual selection.
 *
 * Seven independent conditions must hold, evaluated with an injectable clock:
 *   1. the stored timestamp parses to a finite instant;
 *   2. it is not in the future (a skewed clock is not evidence);
 *   3. it is at most 14 days old (strictly older → expired);
 *   4. the plant still appears among the grower's own visible rows;
 *   5. that live row still has the grow and tent scope required for a save;
 *   6. that grow is still one of the grower's ACTIVE grows;
 *   7. that tent is still live and still belongs to that same grow.
 *
 * Condition 6 is not implied by condition 4. `archiveGrow` (`src/lib/db.ts`)
 * updates only the `grows` row, so a plant in a newly archived grow keeps
 * `is_archived: false` and stays in `usePlants()`. Offering it looked
 * harmless and was not: accepting calls `setActiveGrowId(archivedGrowId)`,
 * and `GrowsProvider` — which lists active grows only — replaces an unknown
 * id with `grows[0].id`. The grower would land on a DIFFERENT grow with the
 * remembered plant absent from the filtered options. Fail closed instead.
 *
 * Condition 7 closes the same shape one level down. A nonempty `tent_id` on the
 * plant row is not proof the tent is live: `useTents()` excludes archived
 * tents, and `resolveQuickLogWriteTarget` blocks the save as `tent_not_found`,
 * `tent_inactive`, `tent_grow_unassigned`, or `tent_grow_mismatch`. Offering a
 * target the write path will refuse is worse than offering nothing, so the
 * suggestion mirrors those checks rather than trusting the id.
 *
 * The general rule, since conditions 5-7 were each added separately after the
 * previous one turned out not to cover the next field: THE STORED RECORD PROVES
 * NOTHING. Every relationship it names must be re-derived from a live,
 * RLS-filtered list that the write path also sees. A stored id is a lookup key,
 * never evidence that the thing it names still exists, is still active, or is
 * still related the way it was when the record was written. Any field added
 * here later inherits that obligation.
 *
 * The storage key is namespaced per account, so one browser shared between
 * accounts can never surface another grower's plant. Grow and tent scope are
 * re-derived from the live row rather than trusted from storage.
 *
 * Validity and OFFERABILITY are separate questions. `resolveRecentTargetSuggestion`
 * answers the first — is this target still real and still savable? — with no view
 * of how Quick Log was opened. `recentTargetSuggestionFitsPrefillScope` answers the
 * second, against the launcher's own scope. Keeping them apart is what lets a
 * grow-scoped open reuse the identical validity contract instead of a relaxed copy
 * of it.
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

export interface RecentTargetVisibleTent {
  id: string;
  grow_id?: string | null;
  is_archived?: boolean | null;
  archived_at?: string | null;
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
  /**
   * The grower's live tents — the same archived-filtered list `useTents()`
   * returns and `resolveQuickLogWriteTarget` validates against. Absent or
   * empty fails closed, for the same reason as `visibleGrows`.
   */
  visibleTents: readonly RecentTargetVisibleTent[] | null | undefined;
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
  const { record, now, visiblePlants, visibleGrows, visibleTents } = input;
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

  // Mirror the write path's tent checks (`resolveQuickLogWriteTarget`): the
  // tent must exist in the live list, not be archived, and belong to the same
  // grow as the plant. Anything else is a target the save would refuse.
  const tent = (visibleTents ?? []).find((row) => row && row.id === tentId);
  if (!tent) return null;
  if (tent.is_archived === true || trimmed(tent.archived_at)) return null;
  if (trimmed(tent.grow_id) !== growId) return null;

  return {
    plantId: plant.id,
    plantName,
    // Scope comes from the live row, never from storage.
    growId,
    tentId,
  };
}

/**
 * The scope a launcher asked for. `QuickLogPrefillTargetRequest` in
 * `quickLogTargetIntegrityRules` is structurally identical; this module states
 * its own shape so the pure rules stay independent of the editor's target types.
 */
export interface RecentTargetPrefillScope {
  plantId?: string | null;
  growId?: string | null;
  tentId?: string | null;
}

/**
 * Decide whether an already-valid suggestion may be OFFERED for this open.
 *
 * A prefill that names a PLANT is the target. Offering a remembered plant
 * beside it would put two competing answers on screen for a question the
 * launcher already settled, so those opens never see the chip — the same
 * behaviour this rule replaced.
 *
 * A prefill that names only a GROW or a TENT is different: it fixes a scope and
 * then leaves the grower an empty plant Select. `GrowRecoveryPrompt` dispatches
 * exactly that (`{ growId }`), and the approved S6 target for Dashboard and Grow
 * Detail is "3 taps + exactly one explicit plant choice inside the grow-scoped
 * dialog", with the D5 chip named as what reduces that choice to one tap.
 * Withholding the chip there is not a safety property — it is the S6 gap.
 *
 * Offering it is safe because the suggestion's `growId` / `tentId` are re-derived
 * from live rows by `resolveRecentTargetSuggestion`, never read from storage. A
 * scope match therefore means the remembered plant genuinely lives inside the
 * scope the grower just chose. Anything else — including a scope this rule cannot
 * compare — yields no offer, so the grow-scoped dialog degrades to the manual
 * selection it performs today rather than to a guess.
 *
 * An activity-only prefill (`{ eventType: "feeding" }`, sent by AppShell's
 * context-free Fast Add) names no target at all and is fully unscoped: it
 * preselects a FORM. Testing the prefill object for truthiness would withhold
 * the chip on exactly the open that needs it most.
 */
export function recentTargetSuggestionFitsPrefillScope(
  suggestion: RecentTargetSuggestion | null,
  prefill?: RecentTargetPrefillScope | null,
): boolean {
  if (!suggestion) return false;
  // A named plant is the target; never compete with it.
  if (trimmed(prefill?.plantId)) return false;

  const requestedGrowId = trimmed(prefill?.growId);
  if (requestedGrowId && requestedGrowId !== suggestion.growId) return false;

  const requestedTentId = trimmed(prefill?.tentId);
  if (requestedTentId && requestedTentId !== suggestion.tentId) return false;

  return true;
}
