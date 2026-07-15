/**
 * publicQuickLogStarterRules — pure rules for the PUBLIC 30-second Quick Log
 * Starter (/quick-log).
 *
 * The starter is a pre-auth surface: an anonymous visitor drafts one grow
 * note that is stored ONLY in this browser's localStorage. Nothing here (or
 * in the page importing this) may reach Supabase, storage, AI, the Action
 * Queue, or any device surface — the draft is honest local state, and the
 * signup CTA is the only way it can ever become diary data.
 *
 * Vocabulary is deliberately closed and reused from the authenticated world
 * so a future post-signup import maps 1:1 with zero translation:
 *  - stage validates through the EXISTING `normalizeQuickLogStage`
 *    (unknown stays "" — never silently defaulted to "veg"),
 *  - log types are exactly the four server-supported event types,
 *  - numeric parsing uses the EXISTING `parseOptionalNumber`
 *    (empty input → null, never 0; non-finite rejected),
 *  - attribution is exactly the SAFE_UTM_KEYS allow-list.
 *
 * Pure: no React, no Supabase, no I/O, no time reads (callers pass `now`).
 */
import { normalizeQuickLogStage, UNKNOWN_STAGE } from "@/lib/quickLogStageDefaultRules";
import { parseOptionalNumber } from "@/lib/quickLogRules";
import { SAFE_UTM_KEYS, type SafeUtmKey } from "@/lib/utm/preserveUtm";

/**
 * localStorage key for the single starter draft. Versioned per repo
 * convention ("verdant." prefix, ".v1" suffix) so a future shape change
 * ships as .v2 with an explicit migration instead of silent breakage.
 */
export const PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY = "verdant.quickLogStarter.draft.v1";

/**
 * Closed log-type vocabulary: exactly the event types the authenticated
 * save path already accepts server-side. Nothing invented, so the later
 * authed import needs no mapping table.
 */
export const PUBLIC_QUICK_LOG_STARTER_LOG_TYPES = [
  "observation",
  "watering",
  "feeding",
  "environment",
] as const;

export type PublicQuickLogStarterLogType = (typeof PUBLIC_QUICK_LOG_STARTER_LOG_TYPES)[number];

/**
 * Starter log type → canonical Quick Log activity id, so the page reuses
 * labels + safety copy from QUICK_LOG_ACTIVITY_DEFINITIONS verbatim instead
 * of minting new public wording ("observation" is the "note" activity;
 * "environment" is "environment_check").
 */
export const PUBLIC_QUICK_LOG_STARTER_TYPE_TO_ACTIVITY_ID: Record<
  PublicQuickLogStarterLogType,
  "note" | "watering" | "feeding" | "environment_check"
> = {
  observation: "note",
  watering: "watering",
  feeding: "feeding",
  environment: "environment_check",
};

/** Mirrors MAX_NAME_LENGTH used by saved views / plant naming surfaces. */
export const PUBLIC_QUICK_LOG_STARTER_MAX_NICKNAME_LENGTH = 60;

/** Mirrors the authenticated Quick Log note budget. */
export const PUBLIC_QUICK_LOG_STARTER_MAX_NOTE_LENGTH = 500;

/**
 * Freshness cap for the FUTURE authed handoff (checkoutPlanIntent pattern:
 * consume-once + freshness-capped). Display of a saved draft never expires —
 * the truth copy promises the draft stays until browser data is cleared —
 * but an eventual post-signup importer must treat drafts older than this
 * as stale and skip the automatic prefill.
 */
export const PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS = 24 * 60 * 60 * 1000;

export interface PublicQuickLogStarterDraft {
  v: 1;
  /** Random id minted at first save; stable across edits of the same draft. */
  id: string;
  /** ISO timestamp of first save. */
  createdAt: string;
  /** ISO timestamp of the latest save. */
  updatedAt: string;
  /** Grower's nickname for the plant. Trimmed, 1..60 chars. */
  plantNickname: string;
  /** "" (unknown — honest) or a canonical STAGES value. */
  stage: string;
  logType: PublicQuickLogStarterLogType;
  /** Trimmed. Required unless logType === "watering". */
  note: string;
  /** Only for watering; finite > 0. null otherwise. */
  wateringVolumeMl: number | null;
  /** Inbound UTM attribution captured on the starter page (allow-listed). */
  attribution: Partial<Record<SafeUtmKey, string>>;
}

/** Raw form values as the page collects them (volume arrives as a string). */
export interface PublicQuickLogStarterInput {
  plantNickname: string;
  stage: string;
  logType: string;
  note: string;
  wateringVolumeRaw: string;
}

export type PublicQuickLogStarterField =
  | "plantNickname"
  | "stage"
  | "logType"
  | "note"
  | "wateringVolumeMl";

/** Fields of a validated draft, ready for buildPublicQuickLogStarterDraft. */
export interface PublicQuickLogStarterDraftFields {
  plantNickname: string;
  stage: string;
  logType: PublicQuickLogStarterLogType;
  note: string;
  wateringVolumeMl: number | null;
}

/**
 * Validation result as a single plain shape (this repo compiles with
 * strict/strictNullChecks OFF, where discriminated-union narrowing is
 * unreliable): `fields` is non-null exactly when validation passed, and
 * `errors` is empty exactly when validation passed.
 */
export interface PublicQuickLogStarterValidation {
  fields: PublicQuickLogStarterDraftFields | null;
  errors: Partial<Record<PublicQuickLogStarterField, string>>;
}

function isStarterLogType(value: string): value is PublicQuickLogStarterLogType {
  return (PUBLIC_QUICK_LOG_STARTER_LOG_TYPES as ReadonlyArray<string>).includes(value);
}

/**
 * Validate raw form input into draft fields.
 *
 * Honesty rules enforced here:
 *  - stage: unknown/blank stays "" (UNKNOWN_STAGE) — never coerced to "veg";
 *  - watering volume: parsed via parseOptionalNumber (empty → null, never 0)
 *    and must be finite > 0 for watering;
 *  - note: required for every type except watering (a watering entry can be
 *    just the volume).
 */
export function validatePublicQuickLogStarterInput(
  input: PublicQuickLogStarterInput,
): PublicQuickLogStarterValidation {
  const errors: Partial<Record<PublicQuickLogStarterField, string>> = {};

  const plantNickname = input.plantNickname.trim();
  if (plantNickname.length === 0) {
    errors.plantNickname = "Give your plant a nickname so the note has a home.";
  } else if (plantNickname.length > PUBLIC_QUICK_LOG_STARTER_MAX_NICKNAME_LENGTH) {
    errors.plantNickname = `Keep the nickname under ${PUBLIC_QUICK_LOG_STARTER_MAX_NICKNAME_LENGTH} characters.`;
  }

  if (!isStarterLogType(input.logType)) {
    errors.logType = "Pick what you want to log.";
  }

  // Unknown stage is honest: "" renders as "Not sure yet" and is stored
  // as-is. normalizeQuickLogStage returns null for anything unrecognized.
  const stage =
    input.stage === UNKNOWN_STAGE
      ? UNKNOWN_STAGE
      : (normalizeQuickLogStage(input.stage) ?? UNKNOWN_STAGE);

  const note = input.note.trim();
  const isWatering = input.logType === "watering";
  if (note.length === 0 && !isWatering) {
    errors.note = "Write a short note — it becomes your first diary entry.";
  } else if (note.length > PUBLIC_QUICK_LOG_STARTER_MAX_NOTE_LENGTH) {
    errors.note = `Keep the note under ${PUBLIC_QUICK_LOG_STARTER_MAX_NOTE_LENGTH} characters.`;
  }

  let wateringVolumeMl: number | null = null;
  if (isWatering) {
    wateringVolumeMl = parseOptionalNumber(input.wateringVolumeRaw);
    if (wateringVolumeMl === null || !Number.isFinite(wateringVolumeMl) || wateringVolumeMl <= 0) {
      errors.wateringVolumeMl = "Enter how much water you gave, in ml (a number above 0).";
      wateringVolumeMl = null;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { fields: null, errors };
  }
  return {
    fields: {
      plantNickname,
      stage,
      logType: input.logType as PublicQuickLogStarterLogType,
      note,
      wateringVolumeMl,
    },
    errors: {},
  };
}

function mintDraftId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the counter-free fallback below */
  }
  // Non-cryptographic fallback — the id only distinguishes drafts locally.
  return `starter-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * Build the draft object for persistence. `previous` (when re-saving) keeps
 * id/createdAt stable so edits do not mint a new identity.
 */
export function buildPublicQuickLogStarterDraft(args: {
  fields: PublicQuickLogStarterDraftFields;
  attribution: Partial<Record<SafeUtmKey, string>>;
  now: Date;
  previous?: PublicQuickLogStarterDraft | null;
}): PublicQuickLogStarterDraft {
  const iso = args.now.toISOString();
  return {
    v: 1,
    id: args.previous?.id ?? mintDraftId(),
    createdAt: args.previous?.createdAt ?? iso,
    updatedAt: iso,
    plantNickname: args.fields.plantNickname,
    stage: args.fields.stage,
    logType: args.fields.logType,
    note: args.fields.note,
    wateringVolumeMl: args.fields.wateringVolumeMl,
    attribution: sanitizeAttribution(args.attribution),
  };
}

const MAX_ATTRIBUTION_VALUE_LENGTH = 256;

/** Keep only allow-listed UTM keys with non-empty, length-capped string values. */
export function sanitizeAttribution(raw: unknown): Partial<Record<SafeUtmKey, string>> {
  const out: Partial<Record<SafeUtmKey, string>> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const key of SAFE_UTM_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== "string") continue;
    const capped = value.slice(0, MAX_ATTRIBUTION_VALUE_LENGTH);
    if (capped.length === 0) continue;
    out[key] = capped;
  }
  return out;
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Parse a stored draft. NEVER throws; returns null for anything that is not
 * a structurally valid v1 draft (malformed JSON, wrong types, unknown log
 * type, bad timestamps). Overlong text is truncated rather than rejected so
 * a grower never loses a rescuable note; an unrecognized stage degrades to
 * "" (unknown) rather than invalidating the draft.
 */
export function parsePublicQuickLogStarterDraft(
  raw: string | null | undefined,
): PublicQuickLogStarterDraft | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.v !== 1) return null;
  if (typeof d.id !== "string" || d.id.length === 0) return null;
  if (!isIsoDateString(d.createdAt) || !isIsoDateString(d.updatedAt)) return null;
  if (typeof d.plantNickname !== "string") return null;
  const plantNickname = d.plantNickname
    .trim()
    .slice(0, PUBLIC_QUICK_LOG_STARTER_MAX_NICKNAME_LENGTH);
  if (plantNickname.length === 0) return null;
  if (typeof d.logType !== "string" || !isStarterLogType(d.logType)) return null;
  if (typeof d.note !== "string") return null;
  const note = d.note.slice(0, PUBLIC_QUICK_LOG_STARTER_MAX_NOTE_LENGTH);
  const stage =
    typeof d.stage === "string" && d.stage !== UNKNOWN_STAGE
      ? (normalizeQuickLogStage(d.stage) ?? UNKNOWN_STAGE)
      : UNKNOWN_STAGE;
  let wateringVolumeMl: number | null = null;
  if (
    typeof d.wateringVolumeMl === "number" &&
    Number.isFinite(d.wateringVolumeMl) &&
    d.wateringVolumeMl > 0
  ) {
    wateringVolumeMl = d.wateringVolumeMl;
  }
  return {
    v: 1,
    id: d.id,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    plantNickname,
    stage,
    logType: d.logType,
    note,
    wateringVolumeMl,
    attribution: sanitizeAttribution(d.attribution),
  };
}

/** Deterministic key order so tests can pin exact stored strings. */
export function serializePublicQuickLogStarterDraft(draft: PublicQuickLogStarterDraft): string {
  return JSON.stringify({
    v: draft.v,
    id: draft.id,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    plantNickname: draft.plantNickname,
    stage: draft.stage,
    logType: draft.logType,
    note: draft.note,
    wateringVolumeMl: draft.wateringVolumeMl,
    attribution: draft.attribution,
  });
}

/**
 * Freshness gate for the FUTURE authed handoff. Displaying a saved draft
 * never expires; only automatic post-signup consumption must respect this.
 */
export function isPublicQuickLogStarterDraftFresh(
  draft: PublicQuickLogStarterDraft,
  now: Date,
): boolean {
  const updated = Date.parse(draft.updatedAt);
  if (Number.isNaN(updated)) return false;
  const age = now.getTime() - updated;
  return age >= 0 && age <= PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS;
}
