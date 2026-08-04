/**
 * Shared Action Queue transition rules + immutable audit-event payload builders.
 *
 * SCOPE:
 *  - Suggest-only workflow. Equipment / device execution surfaces of any kind
 *    are intentionally OUT OF SCOPE and must never be added here. "approve"
 *    records grower intent only; it does NOT execute any equipment command.
 *    "complete" means the grower handled the action manually outside Verdant.

 *
 * SECURITY GUARANTEES (do not break):
 *  - Pure data only. No device-execution surface of any kind is ever produced
 *    here.
 *  - No service_role. user_id is never written from the client; the DB default
 *    (auth.uid()) is the sole source of truth.
 *  - Terminal statuses (completed, rejected, cancelled) cannot be transitioned.
 */

export type ActionStatus =
  "pending_approval" | "approved" | "rejected" | "simulated" | "completed" | "cancelled";

export type ActionEventType =
  "created" | "simulated" | "approved" | "rejected" | "completed" | "cancelled" | "note";

export type TransitionKind = "approve" | "reject" | "simulate" | "complete" | "cancel";

export interface ActionQueueTransitionRpcArgs {
  p_action_queue_id: string;
  p_transition: TransitionKind;
  p_expected_status: ActionStatus;
  p_note: string | null;
}

export interface ActionQueueTransitionRpcSuccess {
  ok: true;
  action_queue_id: string;
  previous_status: ActionStatus;
  new_status: ActionStatus;
  event_id: string;
  transitioned_at: string;
  reused: boolean;
}

export interface ActionQueueTransitionRpcFailure {
  ok: false;
  reason: ActionQueueTransitionFailureReason;
}

export type ActionQueueTransitionRpcResult =
  ActionQueueTransitionRpcSuccess | ActionQueueTransitionRpcFailure;

const ACTION_STATUS_VALUES: readonly ActionStatus[] = [
  "pending_approval",
  "approved",
  "rejected",
  "simulated",
  "completed",
  "cancelled",
];

export const ACTION_QUEUE_TRANSITION_FAILURE_REASONS = [
  "not_authenticated",
  "invalid_action",
  "invalid_transition",
  "illegal_transition",
  "action_not_found",
  "status_conflict",
] as const;

export type ActionQueueTransitionFailureReason =
  (typeof ACTION_QUEUE_TRANSITION_FAILURE_REASONS)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function isActionStatus(value: unknown): value is ActionStatus {
  return typeof value === "string" && ACTION_STATUS_VALUES.includes(value as ActionStatus);
}

function isTransitionFailureReason(value: unknown): value is ActionQueueTransitionFailureReason {
  return (
    typeof value === "string" &&
    ACTION_QUEUE_TRANSITION_FAILURE_REASONS.includes(value as ActionQueueTransitionFailureReason)
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRfc3339Timestamp(value: unknown): value is string {
  return (
    typeof value === "string" && RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
  );
}

/**
 * Build the complete public RPC input. Identity, grow lineage, destination
 * status, event type, and lifecycle timestamps are intentionally absent:
 * PostgreSQL derives every one from the locked owner row and transition kind.
 */
export function buildActionQueueTransitionRpcArgs(args: {
  actionQueueId: string;
  transition: TransitionKind;
  expectedStatus: ActionStatus;
  note?: string | null;
}): ActionQueueTransitionRpcArgs {
  return {
    p_action_queue_id: args.actionQueueId,
    p_transition: args.transition,
    p_expected_status: args.expectedStatus,
    p_note: normalizeNote(args.note) ?? null,
  };
}

/**
 * Parse the untrusted JSON result returned by PostgREST. Callers must never
 * update local state or run post-transition bookkeeping unless this returns a
 * validated success result.
 */
export function parseActionQueueTransitionRpcResult(
  value: unknown,
  expected: ActionQueueTransitionRpcArgs,
): ActionQueueTransitionRpcResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  if (row.ok === false) {
    return isTransitionFailureReason(row.reason) ? { ok: false, reason: row.reason } : null;
  }

  if (
    row.ok !== true ||
    !isUuid(row.action_queue_id) ||
    !isActionStatus(row.previous_status) ||
    !isActionStatus(row.new_status) ||
    !isUuid(row.event_id) ||
    !isRfc3339Timestamp(row.transitioned_at) ||
    typeof row.reused !== "boolean" ||
    row.action_queue_id !== expected.p_action_queue_id ||
    row.previous_status !== expected.p_expected_status ||
    row.new_status !== nextStatusFor(expected.p_transition)
  ) {
    return null;
  }

  return {
    ok: true,
    action_queue_id: row.action_queue_id,
    previous_status: row.previous_status,
    new_status: row.new_status,
    event_id: row.event_id,
    transitioned_at: row.transitioned_at,
    reused: row.reused,
  };
}

/**
 * Terminal statuses: no further transitions are allowed from these. The UI
 * must render zero transition buttons and the helpers below all return false.
 */
export const TERMINAL_STATUSES: readonly ActionStatus[] = ["completed", "rejected", "cancelled"];

export function isTerminalStatus(s: ActionStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

/**
 * Allowed transition source-status rules — single source of truth.
 *   pending_approval -> simulate / approve / reject / cancel
 *   simulated        -> approve / complete / cancel
 *   approved         -> complete / cancel
 *   rejected | completed | cancelled -> none (terminal)
 * Approve records grower intent only; it never executes equipment.
 */
export const canApprove = (s: ActionStatus): boolean =>
  s === "pending_approval" || s === "simulated";
export const canSimulate = (s: ActionStatus): boolean => s === "pending_approval";
export const canReject = (s: ActionStatus): boolean => s === "pending_approval";
export const canComplete = (s: ActionStatus): boolean => s === "approved" || s === "simulated";
export const canCancel = (s: ActionStatus): boolean =>
  s === "pending_approval" || s === "approved" || s === "simulated";

/**
 * Returns the ordered list of transitions allowed from a given status. Used by
 * the UI to render exactly the right set of buttons. Terminal -> [].
 */
export function allowedTransitions(s: ActionStatus): TransitionKind[] {
  if (isTerminalStatus(s)) return [];
  const out: TransitionKind[] = [];
  if (canApprove(s)) out.push("approve");
  if (canSimulate(s)) out.push("simulate");
  if (canComplete(s)) out.push("complete");
  if (canReject(s)) out.push("reject");
  if (canCancel(s)) out.push("cancel");
  return out;
}

export interface ActionRowPatch {
  status: ActionStatus;
  approved_at?: string;
  rejected_at?: string;
  completed_at?: string;
}

/**
 * Build the action_queue UPDATE payload for a transition.
 *  - approve   -> status=approved, approved_at=now (approval only; no device exec)
 *  - reject    -> status=rejected, rejected_at=now
 *  - complete  -> status=completed, completed_at=now (grower handled manually)
 *  - cancel    -> status=cancelled
 *  - simulate  -> status=simulated
 * No device-control fields are ever written here.
 */

export function buildTransitionPatch(kind: TransitionKind, now: Date = new Date()): ActionRowPatch {
  const iso = now.toISOString();
  switch (kind) {
    case "approve":
      return { status: "approved", approved_at: iso };
    case "reject":
      return { status: "rejected", rejected_at: iso };
    case "complete":
      return { status: "completed", completed_at: iso };
    case "cancel":
      return { status: "cancelled" };
    case "simulate":
      return { status: "simulated" };
  }
}

/** Final status after a transition (mirrors buildTransitionPatch). */
export function nextStatusFor(kind: TransitionKind): ActionStatus {
  return buildTransitionPatch(kind).status;
}

/** Event type recorded in action_queue_events for a transition. */
export function eventTypeFor(kind: TransitionKind): ActionEventType {
  return kind === "approve"
    ? "approved"
    : kind === "reject"
      ? "rejected"
      : kind === "complete"
        ? "completed"
        : kind === "cancel"
          ? "cancelled"
          : "simulated";
}

export interface AuditEventPayload {
  action_queue_id: string;
  grow_id: string;
  event_type: ActionEventType;
  previous_status: ActionStatus | null;
  new_status: ActionStatus | null;
  note: string | null;
}

/**
 * Build the immutable action_queue_events INSERT payload.
 * Audit rows are append-only — no UPDATE/DELETE policy exists for this table.
 * SECURITY: user_id is intentionally omitted — DB default auth.uid() wins.
 * Never include device-control fields.
 */

export function buildAuditEventPayload(args: {
  action_queue_id: string;
  grow_id: string;
  event_type: ActionEventType;
  previous_status: ActionStatus | null;
  new_status: ActionStatus | null;
  note?: string | null;
}): AuditEventPayload {
  return {
    action_queue_id: args.action_queue_id,
    grow_id: args.grow_id,
    event_type: args.event_type,
    previous_status: args.previous_status,
    new_status: args.new_status,
    note: args.note ?? null,
  };
}

/**
 * Normalize a free-text note from a dialog/textarea:
 *  - null/undefined/"" -> undefined (caller writes null into audit row)
 *  - whitespace-only   -> undefined
 *  - otherwise         -> trimmed string
 */

export function normalizeNote(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : undefined;
}
