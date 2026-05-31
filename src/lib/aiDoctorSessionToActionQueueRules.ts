/**
 * aiDoctorSessionToActionQueueRules — pure, deterministic mapping from an
 * AI Doctor session suggestion into an approval-required Action Queue draft.
 *
 * Strict safety envelope:
 *   - No I/O. No React. No Supabase. No fetch. No AI calls.
 *   - No Action Queue inserts. No alert/task writes. No automation.
 *   - No device control. Never emits target_device. Never includes user_id.
 *   - Status always "pending_approval"; source always "ai_doctor".
 *   - Output is review-first advisory text only.
 *
 * Components MUST call these helpers and render/insert the result; mapping
 * tables and idempotency logic MUST NOT be duplicated in JSX or hooks.
 */

export type ActionRisk = "low" | "medium" | "high" | "critical";

export interface AiDoctorSessionLike {
  id: string | null | undefined;
  grow_id: string | null | undefined;
  tent_id?: string | null;
  plant_id?: string | null;
  /** Optional risk hint sourced from the diagnosis envelope. */
  diagnosis?: { riskLevel?: string | null } | null;
}

export interface AiDoctorSuggestedActionLike {
  type?: string | null;
  title?: string | null;
  detail?: string | null;
  priority?: string | null;
  reason?: string | null;
  approvalRequired?: boolean;
}

export interface AiDoctorActionQueueDraft {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  action_type: string;
  target_metric: "general";
  suggested_change: string;
  reason: string;
  risk_level: ActionRisk;
  source: "ai_doctor";
  status: "pending_approval";
  /** Stable back-pointer token embedded in `reason` for auditability/idempotency. */
  session_back_pointer: string;
  /** Normalized suggestion title used for dedupe matching. */
  suggestion_title: string;
  /** Human note for an accompanying audit/event row. */
  audit_note: string;
}

export type AiDoctorDraftResult =
  | { ok: true; draft: AiDoctorActionQueueDraft }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Forbidden language — device control + execution verbs (mirrors AI Doctor sanitizer)
// ---------------------------------------------------------------------------

const DEVICE_CONTROL_PATTERNS: RegExp[] = [
  /\bturn (on|off)\b/i,
  /\bswitch (on|off)\b/i,
  /\bpower (on|off|down|up)\b/i,
  /\bauto[-\s]?(start|stop|on|off|run|toggle)\b/i,
  /\bautomate\b/i,
  /\bautomatically (run|adjust|set|switch|start|stop)\b/i,
  /\bsend (a )?command\b/i,
  /\bactuate\b/i,
  /\brelay\b/i,
  /\bmqtt\b/i,
  /\bhome[-\s]?assistant\b/i,
  /\bpi[-\s]?bridge\b/i,
  /\bsmart plug\b/i,
  /\bcontrol (the )?(fan|light|pump|heater|humidifier|dehumidifier|valve)\b/i,
  /\bdose\b/i,
  /\binject\b/i,
];

function containsDeviceControl(text: string): boolean {
  if (!text) return false;
  return DEVICE_CONTROL_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// Risk + action_type normalization
// ---------------------------------------------------------------------------

const PRIORITY_TO_RISK: Record<string, ActionRisk> = {
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

const DIAGNOSIS_RISK_TO_RISK: Record<string, ActionRisk> = {
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

function normalizeRisk(
  action: AiDoctorSuggestedActionLike,
  session: AiDoctorSessionLike,
): ActionRisk {
  const fromPriority =
    typeof action.priority === "string"
      ? PRIORITY_TO_RISK[action.priority.trim().toLowerCase()]
      : undefined;
  if (fromPriority) return fromPriority;
  const fromDiagnosis =
    session.diagnosis && typeof session.diagnosis.riskLevel === "string"
      ? DIAGNOSIS_RISK_TO_RISK[session.diagnosis.riskLevel.trim().toLowerCase()]
      : undefined;
  if (fromDiagnosis) return fromDiagnosis;
  return "low";
}

const ALLOWED_ACTION_TYPES = new Set(["task", "alert", "note", "advisory"]);

function normalizeActionType(action: AiDoctorSuggestedActionLike): string {
  const raw =
    typeof action.type === "string" ? action.type.trim().toLowerCase() : "";
  if (ALLOWED_ACTION_TYPES.has(raw)) return raw;
  return "advisory";
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isSessionSuggestionEligibleForActionQueue(
  session: AiDoctorSessionLike | null | undefined,
  action: AiDoctorSuggestedActionLike | null | undefined,
): boolean {
  if (!session || !action) return false;
  if (!session.id || typeof session.id !== "string" || !session.id.trim()) return false;
  if (!session.grow_id || typeof session.grow_id !== "string" || !session.grow_id.trim()) return false;
  if (action.approvalRequired !== true) return false;
  const title = typeof action.title === "string" ? action.title.trim() : "";
  const detail = typeof action.detail === "string" ? action.detail.trim() : "";
  if (!title || !detail) return false;
  if (containsDeviceControl(title)) return false;
  if (containsDeviceControl(detail)) return false;
  if (action.reason && containsDeviceControl(action.reason)) return false;
  return true;
}

export function buildActionQueueDraftFromAiDoctorSession(
  session: AiDoctorSessionLike | null | undefined,
  action: AiDoctorSuggestedActionLike | null | undefined,
): AiDoctorDraftResult {
  if (!session || !action) return { ok: false, reason: "missing_input" };
  if (!session.id || typeof session.id !== "string" || !session.id.trim()) {
    return { ok: false, reason: "missing_session_id" };
  }
  if (!session.grow_id || typeof session.grow_id !== "string" || !session.grow_id.trim()) {
    return { ok: false, reason: "missing_grow_id" };
  }
  if (action.approvalRequired !== true) {
    return { ok: false, reason: "not_approval_required" };
  }
  const title = typeof action.title === "string" ? action.title.trim() : "";
  const detail = typeof action.detail === "string" ? action.detail.trim() : "";
  if (!title) return { ok: false, reason: "missing_title" };
  if (!detail) return { ok: false, reason: "missing_detail" };
  if (containsDeviceControl(title) || containsDeviceControl(detail)) {
    return { ok: false, reason: "device_control_language" };
  }
  const rawReason = typeof action.reason === "string" ? action.reason.trim() : "";
  if (rawReason && containsDeviceControl(rawReason)) {
    return { ok: false, reason: "device_control_language" };
  }

  const sessionId = session.id.trim();
  const backPointer = `[session:${sessionId}]`;
  const reasonBody = rawReason || detail;
  // Deterministic, review-first reason copy with durable back-pointer.
  const reason = `${reasonBody} — Review and approve before acting. ${backPointer}`;

  return {
    ok: true,
    draft: {
      grow_id: session.grow_id.trim(),
      tent_id: session.tent_id ?? null,
      plant_id: session.plant_id ?? null,
      action_type: normalizeActionType(action),
      target_metric: "general",
      suggested_change: `${title} — ${detail}`,
      reason,
      risk_level: normalizeRisk(action, session),
      source: "ai_doctor",
      status: "pending_approval",
      session_back_pointer: backPointer,
      suggestion_title: normalizeTitle(title),
      audit_note: `Created from AI Doctor session ${sessionId}`,
    },
  };
}

export interface ExistingActionQueueRowLike {
  source: string | null;
  status: string | null;
  reason: string | null;
  grow_id: string | null;
  suggested_change?: string | null;
}

/**
 * Deterministic idempotency matcher. Returns true when `row` is already
 * derived from the same AI Doctor session + suggestion and is still open.
 *
 * Rows in terminal states (completed, rejected, cancelled) are NOT considered
 * duplicates — the user may safely re-queue if a prior pass was dismissed.
 */
export function sessionActionMatchesExisting(
  row: ExistingActionQueueRowLike | null | undefined,
  session: AiDoctorSessionLike | null | undefined,
  action: AiDoctorSuggestedActionLike | null | undefined,
): boolean {
  if (!row || !session || !action) return false;
  if (row.source !== "ai_doctor") return false;
  if (!session.id || !session.grow_id) return false;
  if (row.grow_id !== session.grow_id) return false;
  const status = (row.status ?? "").toLowerCase();
  const openish = status === "pending_approval" || status === "approved" || status === "simulated";
  if (!openish) return false;

  const sessionToken = `[session:${session.id}]`;
  const reason = row.reason ?? "";
  if (reason.includes(sessionToken)) return true;

  // Fallback: match on normalized title within same grow when token is missing.
  const rowTitle = normalizeTitle(row.suggested_change ?? "");
  const actionTitle = normalizeTitle(action.title ?? "");
  if (!rowTitle || !actionTitle) return false;
  return rowTitle.includes(actionTitle) || actionTitle.includes(rowTitle);
}
