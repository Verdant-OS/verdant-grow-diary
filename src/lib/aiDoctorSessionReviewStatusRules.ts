/**
 * Pure helpers for projecting AI Doctor session review event history into a
 * latest-status view model.
 *
 * Safety invariants:
 * - No I/O (no Supabase, no fetch, no React).
 * - Read-only projection; no side effects of any kind.
 * - Deterministic: same input array → same output regardless of input order.
 * - Defensive: unknown event types and malformed/null inputs never throw.
 */

export type AiDoctorSessionReviewEventType =
  | "marked_reviewed"
  | "needs_follow_up"
  | "cleared";

export type AiDoctorSessionReviewStatus =
  | "not_reviewed"
  | "reviewed"
  | "needs_follow_up";

export type AiDoctorSessionReviewStatusFilter =
  | "any"
  | "not_reviewed"
  | "reviewed"
  | "needs_follow_up";

export interface AiDoctorSessionReviewEvent {
  id: string;
  user_id: string;
  session_id: string;
  event_type: AiDoctorSessionReviewEventType;
  note: string | null;
  created_at: string; // ISO timestamp
}

export interface AiDoctorSessionReviewState {
  status: AiDoctorSessionReviewStatus;
  latestEventId: string | null;
  latestEventAt: string | null; // ISO
  latestNote: string | null;
}

const KNOWN_EVENT_TYPES: ReadonlySet<AiDoctorSessionReviewEventType> = new Set([
  "marked_reviewed",
  "needs_follow_up",
  "cleared",
]);

export const DEFAULT_REVIEW_STATE: AiDoctorSessionReviewState = Object.freeze({
  status: "not_reviewed",
  latestEventId: null,
  latestEventAt: null,
  latestNote: null,
});

/**
 * Map a single event type to its projected status. Unknown types fall back to
 * `not_reviewed` so old clients are forward-compatible with future event types.
 */
export function eventTypeToStatus(
  eventType: unknown,
): AiDoctorSessionReviewStatus {
  switch (eventType) {
    case "marked_reviewed":
      return "reviewed";
    case "needs_follow_up":
      return "needs_follow_up";
    case "cleared":
      return "not_reviewed";
    default:
      return "not_reviewed";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceEvent(input: unknown): AiDoctorSessionReviewEvent | null {
  if (!isPlainObject(input)) return null;
  const id = input.id;
  const sessionId = input.session_id;
  const userId = input.user_id;
  const eventType = input.event_type;
  const createdAt = input.created_at;

  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof sessionId !== "string" || sessionId.length === 0) return null;
  if (typeof userId !== "string" || userId.length === 0) return null;
  if (typeof createdAt !== "string" || createdAt.length === 0) return null;
  if (
    typeof eventType !== "string" ||
    !KNOWN_EVENT_TYPES.has(eventType as AiDoctorSessionReviewEventType)
  ) {
    return null;
  }

  const note =
    typeof input.note === "string"
      ? input.note
      : input.note === null || input.note === undefined
        ? null
        : null;

  return {
    id,
    user_id: userId,
    session_id: sessionId,
    event_type: eventType as AiDoctorSessionReviewEventType,
    note,
    created_at: createdAt,
  };
}

/**
 * Sort ascending by created_at, then ascending by id as a deterministic
 * tie-breaker. The last element after sort is the winning event.
 *
 * created_at is compared via Date.parse; if parsing fails for either side, we
 * fall back to lexical string comparison so ordering remains total.
 */
function compareEvents(
  a: AiDoctorSessionReviewEvent,
  b: AiDoctorSessionReviewEvent,
): number {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (Number.isFinite(ta) && Number.isFinite(tb)) {
    if (ta !== tb) return ta - tb;
  } else {
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
  }
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Project a list of events for a single session into the latest review state.
 * Order-independent. Null/undefined/empty input → DEFAULT_REVIEW_STATE.
 */
export function projectLatestReviewState(
  events: ReadonlyArray<unknown> | null | undefined,
): AiDoctorSessionReviewState {
  if (!Array.isArray(events) || events.length === 0) {
    return { ...DEFAULT_REVIEW_STATE };
  }
  const coerced: AiDoctorSessionReviewEvent[] = [];
  for (const raw of events) {
    const ev = coerceEvent(raw);
    if (ev) coerced.push(ev);
  }
  if (coerced.length === 0) return { ...DEFAULT_REVIEW_STATE };

  coerced.sort(compareEvents);
  const latest = coerced[coerced.length - 1];
  return {
    status: eventTypeToStatus(latest.event_type),
    latestEventId: latest.id,
    latestEventAt: latest.created_at,
    latestNote: latest.note,
  };
}

/**
 * Group events by session_id and project the latest state per session.
 */
export function projectLatestReviewStateBySession(
  events: ReadonlyArray<unknown> | null | undefined,
): Map<string, AiDoctorSessionReviewState> {
  const result = new Map<string, AiDoctorSessionReviewState>();
  if (!Array.isArray(events) || events.length === 0) return result;

  const bySession = new Map<string, AiDoctorSessionReviewEvent[]>();
  for (const raw of events) {
    const ev = coerceEvent(raw);
    if (!ev) continue;
    const bucket = bySession.get(ev.session_id);
    if (bucket) bucket.push(ev);
    else bySession.set(ev.session_id, [ev]);
  }

  for (const [sessionId, bucket] of bySession) {
    result.set(sessionId, projectLatestReviewState(bucket));
  }
  return result;
}

/**
 * Whether a review-status filter selection should be treated as actively
 * narrowing the result set. "any" (default) is not active.
 */
export function isReviewStatusFilterActive(
  filter: unknown,
): filter is Exclude<AiDoctorSessionReviewStatusFilter, "any"> {
  return (
    filter === "not_reviewed" ||
    filter === "reviewed" ||
    filter === "needs_follow_up"
  );
}

/**
 * Read-only display indicator for a session row's review status chip.
 *
 * Pure: deterministic from state alone. No I/O, no formatting beyond strings
 * already on the state. Tone is a semantic label that the UI maps to styles —
 * never embed Tailwind class strings here.
 */
export type AiDoctorSessionReviewIndicatorTone = "muted" | "amber";

export interface AiDoctorSessionReviewIndicator {
  /** Whether the UI should render the chip at all. */
  show: boolean;
  status: AiDoctorSessionReviewStatus;
  /** Short chip text (only set when show=true). */
  label: string | null;
  /** Semantic tone for chip styling (only set when show=true). */
  tone: AiDoctorSessionReviewIndicatorTone | null;
  /** Tooltip/title text combining latest event time + optional note. */
  title: string | null;
  latestEventAt: string | null;
  latestNote: string | null;
}

const HIDDEN_INDICATOR: AiDoctorSessionReviewIndicator = Object.freeze({
  show: false,
  status: "not_reviewed",
  label: null,
  tone: null,
  title: null,
  latestEventAt: null,
  latestNote: null,
});

function buildTitle(
  label: string,
  latestEventAt: string | null,
  latestNote: string | null,
): string {
  const parts: string[] = [label];
  if (latestEventAt) parts.push(`Last update: ${latestEventAt}`);
  if (latestNote && latestNote.trim().length > 0) {
    parts.push(`Note: ${latestNote.trim()}`);
  }
  return parts.join(" · ");
}

export function buildSessionReviewStatusIndicator(
  state: AiDoctorSessionReviewState | null | undefined,
): AiDoctorSessionReviewIndicator {
  if (!state) return { ...HIDDEN_INDICATOR };
  if (state.status === "reviewed") {
    const label = "Reviewed";
    return {
      show: true,
      status: "reviewed",
      label,
      tone: "muted",
      title: buildTitle(label, state.latestEventAt, state.latestNote),
      latestEventAt: state.latestEventAt,
      latestNote: state.latestNote,
    };
  }
  if (state.status === "needs_follow_up") {
    const label = "Needs follow-up";
    return {
      show: true,
      status: "needs_follow_up",
      label,
      tone: "amber",
      title: buildTitle(label, state.latestEventAt, state.latestNote),
      latestEventAt: state.latestEventAt,
      latestNote: state.latestNote,
    };
  }
  return { ...HIDDEN_INDICATOR };
}

/**
 * Display labels for the projected review status. Centralized here so UI
 * components never embed status strings directly.
 */
export const REVIEW_STATUS_DISPLAY_LABEL: Record<
  AiDoctorSessionReviewStatus,
  string
> = {
  not_reviewed: "Not reviewed",
  reviewed: "Reviewed",
  needs_follow_up: "Needs follow-up",
};

export type AiDoctorSessionReviewPanelTone = "neutral" | "muted" | "amber";

export const REVIEW_STATUS_PANEL_TONE: Record<
  AiDoctorSessionReviewStatus,
  AiDoctorSessionReviewPanelTone
> = {
  not_reviewed: "neutral",
  reviewed: "muted",
  needs_follow_up: "amber",
};

const EVENT_TYPE_DISPLAY_LABEL: Record<
  AiDoctorSessionReviewEventType,
  string
> = {
  marked_reviewed: "Marked reviewed",
  needs_follow_up: "Flagged: needs follow-up",
  cleared: "Cleared review status",
};

export interface AiDoctorSessionReviewHistoryItem {
  id: string;
  eventType: AiDoctorSessionReviewEventType;
  eventLabel: string;
  createdAt: string;
  note: string | null;
}

export interface AiDoctorSessionReviewHistoryViewModel {
  status: AiDoctorSessionReviewStatus;
  statusLabel: string;
  statusTone: AiDoctorSessionReviewPanelTone;
  isEmpty: boolean;
  emptyText: string;
  /** Newest-first, deterministically ordered. */
  items: AiDoctorSessionReviewHistoryItem[];
}

/**
 * Build a read-only history view model for a single session's review events.
 *
 * - `state` overrides the projected status when supplied (lets callers pass a
 *   precomputed map entry). Otherwise we recompute from `events`.
 * - Items are sorted newest-first using the same total order as
 *   `projectLatestReviewState` so the head matches the projected latest event.
 */
export function buildSessionReviewHistoryViewModel(
  events: ReadonlyArray<unknown> | null | undefined,
  state?: AiDoctorSessionReviewState | null,
): AiDoctorSessionReviewHistoryViewModel {
  const coerced: AiDoctorSessionReviewEvent[] = [];
  if (Array.isArray(events)) {
    for (const raw of events) {
      const ev = coerceEvent(raw);
      if (ev) coerced.push(ev);
    }
  }
  coerced.sort(compareEvents); // ascending
  const newestFirst = coerced.slice().reverse();

  const projected =
    state ?? projectLatestReviewState(coerced);

  const items: AiDoctorSessionReviewHistoryItem[] = newestFirst.map((e) => ({
    id: e.id,
    eventType: e.event_type,
    eventLabel: EVENT_TYPE_DISPLAY_LABEL[e.event_type],
    createdAt: e.created_at,
    note: e.note,
  }));

  return {
    status: projected.status,
    statusLabel: REVIEW_STATUS_DISPLAY_LABEL[projected.status],
    statusTone: REVIEW_STATUS_PANEL_TONE[projected.status],
    isEmpty: items.length === 0,
    emptyText: "No review activity yet.",
    items,
  };
}

/**
 * Pure copy + disabled-state model for the detail-page review action group.
 *
 * Centralized so the UI never embeds review-status strings, disabled-reason
 * strings, or safety-note copy directly in JSX. Deterministic from the
 * projected status alone — no I/O, no time-based logic.
 */
export interface AiDoctorSessionReviewActionsCopy {
  /** Short button labels. */
  markReviewedLabel: string;
  needsFollowUpLabel: string;
  clearLabel: string;
  /** True when the corresponding button should be disabled by status alone. */
  isMarkReviewedDisabledByStatus: boolean;
  isNeedsFollowUpDisabledByStatus: boolean;
  isClearDisabledByStatus: boolean;
  /** Reason text used for title + aria-label when a button is status-disabled. */
  markReviewedDisabledReason: string | null;
  needsFollowUpDisabledReason: string | null;
  clearDisabledReason: string | null;
  /** Calm helper sentences shown beneath the action group. */
  appendOnlyHelperText: string;
  noSideEffectsHelperText: string;
}

export const REVIEW_ACTIONS_APPEND_ONLY_HELPER_TEXT =
  "Review status is saved as an append-only event.";
export const REVIEW_ACTIONS_NO_SIDE_EFFECTS_HELPER_TEXT =
  "This does not change alerts, tasks, or action queue items.";

export function buildSessionReviewActionsCopy(
  status: AiDoctorSessionReviewStatus,
): AiDoctorSessionReviewActionsCopy {
  const isReviewed = status === "reviewed";
  const isNeedsFollowUp = status === "needs_follow_up";
  const isNotReviewed = status === "not_reviewed";
  return {
    markReviewedLabel: "Mark reviewed",
    needsFollowUpLabel: "Needs follow-up",
    clearLabel: "Clear review status",
    isMarkReviewedDisabledByStatus: isReviewed,
    isNeedsFollowUpDisabledByStatus: isNeedsFollowUp,
    isClearDisabledByStatus: isNotReviewed,
    markReviewedDisabledReason: isReviewed
      ? "Already marked as reviewed."
      : null,
    needsFollowUpDisabledReason: isNeedsFollowUp
      ? "Already marked as needs follow-up."
      : null,
    clearDisabledReason: isNotReviewed ? "No review status is set." : null,
    appendOnlyHelperText: REVIEW_ACTIONS_APPEND_ONLY_HELPER_TEXT,
    noSideEffectsHelperText: REVIEW_ACTIONS_NO_SIDE_EFFECTS_HELPER_TEXT,
  };
}

