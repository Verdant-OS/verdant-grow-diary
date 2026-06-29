/**
 * originatingTimelineEventAdapter — read-path adapter for safe originating
 * timeline event refs persisted on `alerts.originating_timeline_events` and
 * `action_queue.originating_timeline_events`.
 *
 * Strict safety envelope:
 *  - Pure. No I/O. No React. No Supabase. No fetch.
 *  - Accepts unknown row JSON and returns the normalized presenter type.
 *  - Rejects malformed refs, raw-payload-like fields, and unknown sources.
 *  - Deterministic dedupe and sort. Empty/invalid inputs return [].
 *  - Never infers refs from timestamps, plant/tent ids, metrics, or prose.
 */
import {
  normalizeOriginatingTimelineEvents,
  type OriginatingTimelineEventInput,
  type OriginatingTimelineEventRef,
} from "./originatingTimelineEventRules";

/**
 * Field names that must NEVER appear inside a persisted ref. Their presence
 * marks the ref as unsafe (raw payload bleed, tokens, prompts, etc.) and the
 * adapter drops the entire entry rather than trying to sanitize it.
 */
export const FORBIDDEN_REF_FIELDS: readonly string[] = Object.freeze([
  "raw_payload",
  "rawPayload",
  "payload",
  "raw",
  "service_role",
  "service_role_key",
  "bridge_token",
  "bridge_secret",
  "api_token",
  "api_key",
  "access_token",
  "refresh_token",
  "jwt",
  "secret",
  "prompt",
  "completion",
  "model_output",
  "user_id",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function containsForbiddenField(obj: Record<string, unknown>): boolean {
  for (const key of FORBIDDEN_REF_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return true;
  }
  return false;
}

function coerceInput(entry: unknown): OriginatingTimelineEventInput | null {
  if (!isPlainObject(entry)) return null;
  if (containsForbiddenField(entry)) return null;
  const id = typeof entry.id === "string" ? entry.id : null;
  if (!id || !id.trim()) return null;
  // `kind` is the persisted name; fold it into `type` for the rules helper.
  const kindRaw =
    typeof entry.kind === "string"
      ? entry.kind
      : typeof entry.type === "string"
        ? entry.type
        : null;
  const source = typeof entry.source === "string" ? entry.source : null;
  const occurred_at =
    typeof entry.occurred_at === "string" ? entry.occurred_at : null;
  return {
    id,
    type: kindRaw,
    source,
    occurred_at,
  };
}

/**
 * Adapt the raw value of an `originating_timeline_events` JSON column into a
 * deterministic list of badge-ready refs. Returns `[]` for any unsafe or
 * unrecognized input.
 */
export function adaptOriginatingTimelineEventsColumn(
  raw: unknown,
): OriginatingTimelineEventRef[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) return [];
  const cleaned: OriginatingTimelineEventInput[] = [];
  for (const entry of raw) {
    const safe = coerceInput(entry);
    if (safe) cleaned.push(safe);
  }
  return normalizeOriginatingTimelineEvents(cleaned);
}

/** Convenience: pull the column off any row-like object and adapt it. */
export function adaptOriginatingTimelineEventsFromRow(
  row: { originating_timeline_events?: unknown } | null | undefined,
): OriginatingTimelineEventRef[] {
  if (!row) return [];
  return adaptOriginatingTimelineEventsColumn(row.originating_timeline_events);
}

/**
 * Empty-list literal used by writers that have no safe refs to persist yet.
 * Exporting the literal keeps writers from inventing a substitute.
 */
export const EMPTY_ORIGINATING_TIMELINE_EVENTS: readonly OriginatingTimelineEventRef[] =
  Object.freeze([]);
