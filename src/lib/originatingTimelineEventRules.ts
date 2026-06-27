/**
 * originatingTimelineEventRules — pure helpers for linking timeline event
 * references onto the approval-required Alert → Action Queue handoff.
 *
 * Strict safety envelope:
 *  - No I/O. No React. No Supabase. No fetch.
 *  - Evidence references carry IDs and labels only. No raw payloads.
 *  - No command, setpoint, controller, actuator, device fields.
 *  - Deterministic: dedupe by id, sort by occurred_at then id.
 */

/** Allowed source labels for a linked timeline evidence reference. */
export const ORIGINATING_TIMELINE_EVENT_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "imported",
  "unknown",
] as const;

export type OriginatingTimelineEventSource =
  (typeof ORIGINATING_TIMELINE_EVENT_SOURCES)[number];

/** Trusted-vs-caution split. demo/stale/invalid/unknown are never trusted. */
const TRUSTED_SOURCES = new Set<OriginatingTimelineEventSource>([
  "live",
  "manual",
  "csv",
]);

const KNOWN_SOURCES = new Set<string>(ORIGINATING_TIMELINE_EVENT_SOURCES);

export interface OriginatingTimelineEventRef {
  id: string;
  type?: string | null;
  occurred_at?: string | null;
  source?: OriginatingTimelineEventSource;
}

export interface OriginatingTimelineEventInput {
  id?: string | null;
  type?: string | null;
  occurred_at?: string | null;
  source?: string | null;
}

function normalizeSource(
  raw: string | null | undefined,
): OriginatingTimelineEventSource {
  if (typeof raw !== "string") return "unknown";
  const v = raw.trim().toLowerCase();
  if (!v) return "unknown";
  if (KNOWN_SOURCES.has(v)) return v as OriginatingTimelineEventSource;
  return "unknown";
}

function normalizeOccurredAt(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t;
}

function normalizeType(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t;
}

/**
 * Normalize, dedupe, and deterministically sort a list of timeline event refs.
 * - Drops entries with no usable id.
 * - Dedupe by id (first occurrence wins).
 * - Sort by occurred_at ascending (null-last), then by id ascending.
 */
export function normalizeOriginatingTimelineEvents(
  input: readonly OriginatingTimelineEventInput[] | null | undefined,
): OriginatingTimelineEventRef[] {
  if (!Array.isArray(input)) return [];
  const byId = new Map<string, OriginatingTimelineEventRef>();
  for (const raw of input) {
    if (!raw) continue;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) continue;
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      type: normalizeType(raw.type),
      occurred_at: normalizeOccurredAt(raw.occurred_at),
      source: normalizeSource(raw.source),
    });
  }
  const out = Array.from(byId.values());
  out.sort((a, b) => {
    const ao = a.occurred_at ?? "";
    const bo = b.occurred_at ?? "";
    // null/empty sorts last
    if (ao && !bo) return -1;
    if (!ao && bo) return 1;
    if (ao !== bo) return ao < bo ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return out;
}

export function isTrustedTimelineEventSource(
  src: OriginatingTimelineEventSource,
): boolean {
  return TRUSTED_SOURCES.has(src);
}

/** Human label used for caution copy. */
export function originatingTimelineEventLabel(
  src: OriginatingTimelineEventSource,
): string {
  switch (src) {
    case "live":
      return "Live";
    case "manual":
      return "Manual";
    case "csv":
      return "CSV";
    case "demo":
      return "Demo";
    case "stale":
      return "Stale";
    case "invalid":
      return "Invalid";
    case "imported":
      return "Imported";
    case "unknown":
    default:
      return "Unknown source";
  }
}

/** Safe fallback copy when no timeline event is linked. */
export const TIMELINE_EVIDENCE_NOT_LINKED_COPY =
  "Timeline evidence not linked yet." as const;

/**
 * Provenance-aware fallback copy. Each variant explains which source is not
 * linked yet. Phrasing avoids certainty, automation, and device-control
 * language and never implies data is missing — only that the system has not
 * linked it yet. Approval-required flow is preserved separately.
 */
export const ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY =
  "Alert evidence is not linked to a timeline event yet." as const;

export const ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY =
  "Alert-derived action evidence is not linked to a timeline event yet." as const;

export const ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY =
  "AI Doctor action evidence is not linked to a timeline event yet." as const;
