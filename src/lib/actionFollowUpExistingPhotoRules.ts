/**
 * actionFollowUpExistingPhotoRules — pure candidate filter/sort for
 * existing owned diary photos that a grower may optionally associate
 * with an Action Queue follow-up.
 *
 * SAFETY:
 *  - Pure. No I/O, no React, no Supabase, no crypto side effects.
 *  - Reuses `parsePlantProfilePhotoReference` (the durable
 *    `storage://diary-photos/<owner>/…` parser) as the single source
 *    of truth for the accepted bucket + ownership contract.
 *  - Rejects signed URLs, blob:, data:, and http(s) references.
 *  - Never creates, uploads, or resolves storage objects.
 *
 * PLANT SCOPE RULE (documented):
 *  - When the action has a plant: include photos linked to the exact
 *    plant AND grow/tent-level photos with no plant (treated as valid
 *    plant context by the existing diary-photo model). Exclude photos
 *    linked to a different plant.
 *  - When the action has no plant: include grow/tent-level photos
 *    with no plant. Exclude photos linked to a specific plant.
 */
import { parsePlantProfilePhotoReference } from "@/lib/plantProfilePhotoStorageRules";

export interface ExistingPhotoCandidate {
  id: string;
  durableReference: string;
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
  capturedAt: string | null;
  label?: string | null;
}

export interface ActionFollowUpPhotoContext {
  authenticatedUserId: string;
  growId: string;
  tentId: string | null;
  plantId: string | null;
}

function isValidId(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidTimestamp(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  return Number.isFinite(Date.parse(v));
}

/**
 * Deterministic candidate filter. Applies:
 *  - Durable-reference validation via existing parser.
 *  - Owner match against `authenticatedUserId` (path-first-segment).
 *  - Grow match.
 *  - Tent match when both action + candidate carry a tent.
 *  - Plant scope per documented rule.
 *  - Timestamp validity.
 *
 * Sorted by capturedAt desc, then id asc, then reference asc.
 * Deduplicated by durable reference.
 */
export function filterActionFollowUpExistingPhotoCandidates(
  candidates: readonly ExistingPhotoCandidate[] | null | undefined,
  context: ActionFollowUpPhotoContext | null | undefined,
): ExistingPhotoCandidate[] {
  if (!context || !isValidId(context.authenticatedUserId) || !isValidId(context.growId)) {
    return [];
  }
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const kept: ExistingPhotoCandidate[] = [];
  const seenRef = new Set<string>();

  for (const c of candidates) {
    if (!c || !isValidId(c.id) || typeof c.durableReference !== "string") continue;
    if (!isValidTimestamp(c.capturedAt)) continue;
    if (seenRef.has(c.durableReference)) continue;

    const parsed = parsePlantProfilePhotoReference(c.durableReference, {
      viewerUserId: context.authenticatedUserId,
    });
    if (parsed.kind !== "storage") continue;

    if (c.growId !== context.growId) continue;
    if (context.tentId && c.tentId && c.tentId !== context.tentId) continue;

    if (context.plantId) {
      if (c.plantId && c.plantId !== context.plantId) continue;
    } else {
      if (c.plantId) continue;
    }

    seenRef.add(c.durableReference);
    kept.push(c);
  }

  kept.sort((a, b) => {
    const ta = Date.parse(a.capturedAt as string);
    const tb = Date.parse(b.capturedAt as string);
    if (tb !== ta) return tb - ta;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    if (a.durableReference !== b.durableReference) {
      return a.durableReference < b.durableReference ? -1 : 1;
    }
    return 0;
  });

  return kept;
}

/**
 * Convenience: exposed for the persistence layer + selector — the
 * durable-reference validator. Returns true only for accepted
 * `storage://diary-photos/<owner>/…` references owned by the viewer.
 */
export function isAcceptedActionFollowUpPhotoReference(
  reference: unknown,
  viewerUserId: string | null | undefined,
): boolean {
  if (typeof reference !== "string" || reference.length === 0) return false;
  if (!isValidId(viewerUserId)) return false;
  const parsed = parsePlantProfilePhotoReference(reference, {
    viewerUserId: viewerUserId as string,
  });
  return parsed.kind === "storage";
}
