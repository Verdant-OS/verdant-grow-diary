/**
 * actionQueueCreateRules — pure helpers for the atomic Action Queue create
 * path (#586).
 *
 * Builds RPC args and interprets RPC results. No I/O. No React. No Supabase.
 * Never invents user_id or target_device.
 */

export type ActionQueueCreateSource = "environment_alert" | "ai_doctor" | "manual" | "grower";

export type ActionQueueCreateRisk = "low" | "medium" | "high" | "critical";

export interface ActionQueueCreateDraft {
  grow_id: string;
  tent_id?: string | null;
  plant_id?: string | null;
  action_type: string;
  target_metric?: string | null;
  suggested_change: string;
  reason: string;
  risk_level: ActionQueueCreateRisk | string;
  source: ActionQueueCreateSource | string;
  /** Optional stable server-side idempotency key. */
  dedupe_key?: string | null;
  audit_note?: string | null;
  originating_timeline_events?: readonly unknown[] | null;
}

export interface ActionQueueCreateRpcArgs {
  p_grow_id: string;
  p_action_type: string;
  p_suggested_change: string;
  p_reason: string;
  p_risk_level: string;
  p_source: string;
  p_target_metric: string | null;
  p_tent_id: string | null;
  p_plant_id: string | null;
  p_originating_timeline_events: unknown[];
  p_audit_note: string | null;
  p_dedupe_key: string | null;
}

export type ActionQueueCreateOk = {
  ok: true;
  action_queue_id: string;
  grow_id: string;
  status: string;
  event_id: string | null;
  reused: boolean;
  created_at?: string | null;
};

export type ActionQueueCreateErr = {
  ok: false;
  reason: string;
};

export type ActionQueueCreateResult = ActionQueueCreateOk | ActionQueueCreateErr;

/** Stable dedupe key for an environment-alert handoff. */
export function buildEnvironmentAlertDedupeKey(alertId: string | null | undefined): string | null {
  const id = typeof alertId === "string" ? alertId.trim() : "";
  if (!id) return null;
  return `env_alert:${id}`;
}

/** Stable dedupe key for an AI Doctor session handoff (session-scoped). */
export function buildAiDoctorSessionDedupeKey(sessionId: string | null | undefined): string | null {
  const id = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!id) return null;
  return `ai_doctor_session:${id}`;
}

/**
 * Map a UI draft into RPC args. Never includes user_id or target_device.
 */
export function buildActionQueueCreateRpcArgs(
  draft: ActionQueueCreateDraft,
): ActionQueueCreateRpcArgs | { ok: false; reason: string } {
  if (!draft) return { ok: false, reason: "missing_draft" };
  const grow_id = typeof draft.grow_id === "string" ? draft.grow_id.trim() : "";
  if (!grow_id) return { ok: false, reason: "missing_grow_id" };

  const suggested = typeof draft.suggested_change === "string" ? draft.suggested_change.trim() : "";
  if (!suggested) return { ok: false, reason: "missing_suggested_change" };

  const reason = typeof draft.reason === "string" ? draft.reason.trim() : "";
  if (!reason) return { ok: false, reason: "missing_reason" };

  const action_type =
    typeof draft.action_type === "string" ? draft.action_type.trim().toLowerCase() : "";
  if (!action_type) return { ok: false, reason: "missing_action_type" };

  const source = typeof draft.source === "string" ? draft.source.trim().toLowerCase() : "";
  if (!source) return { ok: false, reason: "missing_source" };

  const risk =
    typeof draft.risk_level === "string" && draft.risk_level.trim()
      ? draft.risk_level.trim().toLowerCase()
      : "low";

  const events = Array.isArray(draft.originating_timeline_events)
    ? [...draft.originating_timeline_events]
    : [];

  const dedupe =
    typeof draft.dedupe_key === "string" && draft.dedupe_key.trim()
      ? draft.dedupe_key.trim()
      : null;

  const audit =
    typeof draft.audit_note === "string" && draft.audit_note.trim()
      ? draft.audit_note.trim()
      : null;

  return {
    p_grow_id: grow_id,
    p_action_type: action_type,
    p_suggested_change: suggested,
    p_reason: reason,
    p_risk_level: risk,
    p_source: source,
    p_target_metric:
      typeof draft.target_metric === "string" && draft.target_metric.trim()
        ? draft.target_metric.trim()
        : null,
    p_tent_id:
      typeof draft.tent_id === "string" && draft.tent_id.trim() ? draft.tent_id.trim() : null,
    p_plant_id:
      typeof draft.plant_id === "string" && draft.plant_id.trim() ? draft.plant_id.trim() : null,
    p_originating_timeline_events: events,
    p_audit_note: audit,
    p_dedupe_key: dedupe,
  };
}

/** Parse the jsonb RPC payload into a typed result. Never throws. */
export function parseActionQueueCreateResult(raw: unknown): ActionQueueCreateResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "invalid_response" };
  }
  const row = raw as Record<string, unknown>;
  if (row.ok === false) {
    const reason =
      typeof row.reason === "string" && row.reason.trim() ? row.reason.trim() : "error";
    return { ok: false, reason };
  }
  if (row.ok !== true) {
    return { ok: false, reason: "invalid_response" };
  }
  const action_queue_id = typeof row.action_queue_id === "string" ? row.action_queue_id.trim() : "";
  const grow_id = typeof row.grow_id === "string" ? row.grow_id.trim() : "";
  if (!action_queue_id || !grow_id) {
    return { ok: false, reason: "invalid_response" };
  }
  return {
    ok: true,
    action_queue_id,
    grow_id,
    status: typeof row.status === "string" ? row.status : "pending_approval",
    event_id: typeof row.event_id === "string" ? row.event_id : null,
    reused: row.reused === true,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
  };
}

/** Grower-safe error copy for known RPC reason codes. */
export function actionQueueCreateFailureCopy(reason: string | null | undefined): string {
  switch ((reason ?? "").trim()) {
    case "not_authenticated":
      return "Sign in to add an action.";
    case "missing_grow_id":
    case "grow_not_found":
      return "This grow is not available.";
    case "tent_not_in_grow":
    case "plant_not_in_grow":
      return "This action cannot be queued until the plant or tent is assigned to this grow.";
    case "invalid_source":
    case "invalid_risk_level":
    case "invalid_timeline_events":
    case "missing_suggested_change":
    case "missing_reason":
    case "missing_action_type":
      return "This suggestion could not be prepared.";
    case "dedupe_conflict":
      return "A matching action is already in the queue.";
    default:
      return "Could not add this action to the queue. Please try again.";
  }
}
