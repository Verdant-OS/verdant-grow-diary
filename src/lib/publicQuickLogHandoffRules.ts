/**
 * publicQuickLogHandoffRules — pure rules for the AUTHENTICATED consume-once
 * handoff of the public Quick Log Starter draft (/quick-log → signup →
 * "Continue your Quick Log" → prefilled Quick Log → explicit save).
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no time reads (callers pass `now`).
 *  - Fail closed: missing/malformed/unsupported drafts arrive here as null
 *    (the store's parser already rejects them); expired drafts resolve to
 *    "stale" and are never auto-prefilled.
 *  - The public nickname is NOT authoritative plant identity: a plant is
 *    only suggested when the choice is unambiguous, and the suggestion is
 *    always shown and editable in the existing Quick Log form. Ambiguity
 *    never silently picks.
 *  - Nothing here writes anywhere, creates anything, or emits URLs. Grower
 *    content (nickname/note) never leaves the in-memory prefill object.
 *  - Deterministic: stable sorts with explicit name→id tie-breakers.
 */
import {
  isPublicQuickLogStarterDraftFresh,
  type PublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterRules";
import { isActivePlant } from "@/lib/archivedPlantVisibilityRules";

/** Draft resolution for the resume surface. `draft` non-null iff "ready". */
export interface PublicQuickLogHandoffDraftResolution {
  status: "ready" | "missing" | "stale";
  draft: PublicQuickLogStarterDraft | null;
}

/**
 * Decide whether a stored draft may drive the resume surface.
 * - null draft (absent, malformed JSON, unsupported/unknown version — the
 *   parser collapses all of those to null) → "missing".
 * - present but outside the 24h handoff freshness window (or clock-skewed
 *   into the future) → "stale": retained in storage, never auto-prefilled.
 */
export function resolvePublicQuickLogHandoffDraft(args: {
  draft: PublicQuickLogStarterDraft | null;
  now: Date;
}): PublicQuickLogHandoffDraftResolution {
  if (!args.draft) return { status: "missing", draft: null };
  if (!isPublicQuickLogStarterDraftFresh(args.draft, args.now)) {
    return { status: "stale", draft: null };
  }
  return { status: "ready", draft: args.draft };
}

/**
 * Loose plant shape: accepts both raw Supabase rows (snake_case) and mapped
 * app-domain plants (camelCase), same posture as archivedPlantVisibilityRules.
 */
export interface HandoffPlantLike {
  id?: unknown;
  name?: unknown;
  tent_id?: unknown;
  tentId?: unknown;
  grow_id?: unknown;
  growId?: unknown;
  is_archived?: unknown;
  isArchived?: unknown;
  last_note?: unknown;
  lastNote?: unknown;
}

/** Tent shape needed only for the plant→grow fallback. */
export interface HandoffTentLike {
  id?: unknown;
  grow_id?: unknown;
  growId?: unknown;
}

export interface HandoffPlantCandidate {
  id: string;
  name: string;
  tentId: string | null;
  growId: string | null;
}

export type HandoffPlantMatchKind =
  | "none" // zero eligible plants — grower must set up Grow → Tent → Plant first
  | "nickname" // exactly one eligible plant matches the draft nickname
  | "only-plant" // no nickname match, but exactly one eligible plant exists
  | "ambiguous"; // several candidates — the grower must choose, never us

export interface HandoffPlantMatch {
  kind: HandoffPlantMatchKind;
  /** Suggested plant; non-null iff kind is "nickname" or "only-plant". */
  plant: HandoffPlantCandidate | null;
  eligibleCount: number;
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Case/whitespace-insensitive nickname normalization. Deliberately simple —
 * anything fancier risks false positives, and a false match here would
 * suggest logging against the wrong plant.
 */
export function normalizeHandoffNickname(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function toCandidate(
  plant: HandoffPlantLike,
  tents: ReadonlyArray<HandoffTentLike>,
): HandoffPlantCandidate | null {
  const id = asNonEmptyString(plant.id);
  const name = asNonEmptyString(plant.name);
  if (!id || !name) return null;
  const tentId = asNonEmptyString(plant.tent_id) ?? asNonEmptyString(plant.tentId);
  // Legacy rows can miss grow_id; fall back to the owning tent's grow
  // (getEffectivePlantGrowId convention).
  let growId = asNonEmptyString(plant.grow_id) ?? asNonEmptyString(plant.growId);
  if (!growId && tentId) {
    const tent = tents.find(
      (t) => (asNonEmptyString(t.id) ?? "") === tentId,
    );
    if (tent) {
      growId = asNonEmptyString(tent.grow_id) ?? asNonEmptyString(tent.growId);
    }
  }
  return { id, name, tentId, growId };
}

/**
 * List the plants the handoff may suggest from: active (never archived or
 * merged) with a usable id + name, deterministically ordered by
 * name (case-insensitive) then id.
 */
export function listEligibleHandoffPlants(
  plants: ReadonlyArray<HandoffPlantLike> | null | undefined,
  tents: ReadonlyArray<HandoffTentLike> | null | undefined,
): HandoffPlantCandidate[] {
  const safeTents = Array.isArray(tents) ? tents : [];
  const out: HandoffPlantCandidate[] = [];
  for (const plant of Array.isArray(plants) ? plants : []) {
    if (!plant || typeof plant !== "object") continue;
    if (!isActivePlant(plant)) continue;
    const candidate = toCandidate(plant, safeTents);
    if (candidate) out.push(candidate);
  }
  out.sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return out;
}

/**
 * Resolve the plant suggestion for a draft nickname.
 *
 * Order of decisions (each unambiguous or nothing):
 *  1. exactly ONE eligible plant whose normalized name equals the
 *     normalized nickname → suggest it ("nickname");
 *  2. no nickname match but exactly ONE eligible plant overall → suggest
 *     it ("only-plant");
 *  3. several candidates → "ambiguous", no suggestion — grower chooses in
 *     the existing Quick Log plant selector;
 *  4. zero eligible plants → "none".
 */
export function matchHandoffPlant(
  plantNickname: string,
  eligible: ReadonlyArray<HandoffPlantCandidate>,
): HandoffPlantMatch {
  const eligibleCount = eligible.length;
  if (eligibleCount === 0) return { kind: "none", plant: null, eligibleCount };

  const wanted = normalizeHandoffNickname(plantNickname);
  const nicknameMatches =
    wanted.length > 0
      ? eligible.filter((p) => normalizeHandoffNickname(p.name) === wanted)
      : [];
  if (nicknameMatches.length === 1) {
    return { kind: "nickname", plant: nicknameMatches[0], eligibleCount };
  }
  // Several plants share the nickname → never silently choose between them.
  if (nicknameMatches.length > 1) {
    return { kind: "ambiguous", plant: null, eligibleCount };
  }
  if (eligibleCount === 1) {
    return { kind: "only-plant", plant: eligible[0], eligibleCount };
  }
  return { kind: "ambiguous", plant: null, eligibleCount };
}

/**
 * The subset of the existing QuickLogPrefill contract this handoff emits.
 * Field names match QuickLogPrefill (src/components/QuickLog.tsx) exactly;
 * the two starter-specific fields are additive there.
 */
export interface PublicQuickLogHandoffPrefill {
  plantId: string | null;
  plantName: string | null;
  growId: string | null;
  tentId: string | null;
  eventType: string;
  note: string | null;
  wateringVolumeMl: number | null;
  suggestSnapshot: false;
  source: "public-starter";
  publicStarterDraftId: string;
  /**
   * Revision stamp of the exact draft the grower reviewed. Draft ids are
   * stable across edits, so the consume-once clear must match BOTH id and
   * updatedAt — an edit made in another tab after review mints a newer
   * updatedAt and must never be cleared by the stale review's save.
   */
  publicStarterDraftUpdatedAt: string;
  /**
   * True when the handoff carries NO plant suggestion (ambiguous or no
   * eligible plants): the resume card told the grower THEY choose, so the
   * Quick Log dialog's own last-target/only-plant defaulting must not
   * quietly pre-select one either.
   */
  suppressPlantDefault: boolean;
}

/**
 * Map the draft onto the EXISTING Quick Log prefill contract.
 *
 * Mapping is 1:1 with no invention:
 *  - logType passes through as the truthful eventType. "feeding" is not
 *    yet saveable by the unified Quick Log save; the existing form shows
 *    its own "Coming soon" honesty and the grower re-types it themselves.
 *  - note passes through when non-empty; the form seeds it only-if-empty.
 *  - wateringVolumeMl passes through for watering drafts only.
 *  - stage is deliberately NOT mapped: the form derives stage from the
 *    selected plant/grow, and an anonymous draft must never mutate an
 *    existing plant's stage. The card still displays the drafted stage.
 *  - plant identity comes from `match`, never from the nickname text.
 *  - publicStarterDraftId is the ONLY starter-specific field: an opaque id
 *    (no grower content) letting the save path clear the draft after a
 *    CONFIRMED successful write.
 */
export function mapDraftToQuickLogPrefill(args: {
  draft: PublicQuickLogStarterDraft;
  match: HandoffPlantMatch;
}): PublicQuickLogHandoffPrefill {
  const suggested = args.match.plant;
  return {
    plantId: suggested ? suggested.id : null,
    plantName: suggested ? suggested.name : null,
    growId: suggested ? suggested.growId : null,
    tentId: suggested ? suggested.tentId : null,
    eventType: args.draft.logType,
    note: args.draft.note.length > 0 ? args.draft.note : null,
    wateringVolumeMl:
      args.draft.logType === "watering" ? args.draft.wateringVolumeMl : null,
    suggestSnapshot: false,
    source: "public-starter",
    publicStarterDraftId: args.draft.id,
    publicStarterDraftUpdatedAt: args.draft.updatedAt,
    suppressPlantDefault: suggested === null,
  };
}
