import {
  ACTION_QUEUE_TRANSITION_FAILURE_REASONS,
  type ActionQueueTransitionFailureReason,
} from "../../src/lib/actionQueueTransitions";

export type ActionQueueTransitionDiagnosticBodyKind =
  "unobserved" | "success" | "expected_failure" | "error" | "malformed";

export interface ActionQueueTransitionDiagnostic {
  observed: boolean;
  http_status: number | null;
  body_kind: ActionQueueTransitionDiagnosticBodyKind;
  ok: boolean | null;
  reason: ActionQueueTransitionFailureReason | null;
  code: string | null;
}

const SAFE_ERROR_CODE = /^(?:PGRST[0-9]{3}|[0-9A-Z]{5})$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeHttpStatus(value: number | null): number | null {
  return Number.isInteger(value) && value !== null && value >= 100 && value <= 599 ? value : null;
}

function safeReason(value: unknown): ActionQueueTransitionFailureReason | null {
  return typeof value === "string" &&
    ACTION_QUEUE_TRANSITION_FAILURE_REASONS.includes(value as ActionQueueTransitionFailureReason)
    ? (value as ActionQueueTransitionFailureReason)
    : null;
}

function safeCode(value: unknown): string | null {
  return typeof value === "string" && SAFE_ERROR_CODE.test(value) ? value : null;
}

export function isActionQueueTransitionResponse(method: string, url: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  try {
    return new URL(url).pathname === "/rest/v1/rpc/action_queue_transition";
  } catch {
    return false;
  }
}

/**
 * Reduce the untrusted PostgREST response to a fixed, secret-safe receipt.
 * Raw messages, details, hints, URLs, identifiers, timestamps, headers, and
 * response payloads are never retained.
 */
export function buildActionQueueTransitionDiagnostic(
  httpStatus: number | null,
  body: unknown,
): ActionQueueTransitionDiagnostic {
  const status = safeHttpStatus(httpStatus);
  if (status === null) {
    return {
      observed: false,
      http_status: null,
      body_kind: "unobserved",
      ok: null,
      reason: null,
      code: null,
    };
  }

  const row = asRecord(body);
  const code = safeCode(row?.code);
  const isSuccessStatus = status >= 200 && status < 300;
  if (isSuccessStatus && row?.ok === true) {
    return {
      observed: true,
      http_status: status,
      body_kind: "success",
      ok: true,
      reason: null,
      code: null,
    };
  }

  const reason = safeReason(row?.reason);
  if (isSuccessStatus && row?.ok === false && reason !== null) {
    return {
      observed: true,
      http_status: status,
      body_kind: "expected_failure",
      ok: false,
      reason,
      code: null,
    };
  }

  if (!isSuccessStatus || code !== null) {
    return {
      observed: true,
      http_status: status,
      body_kind: "error",
      ok: null,
      reason: null,
      code,
    };
  }

  return {
    observed: true,
    http_status: status,
    body_kind: "malformed",
    ok: null,
    reason: null,
    code: null,
  };
}

export function deriveActionQueueTransitionBlockerReason(
  diagnostic: ActionQueueTransitionDiagnostic,
): string | null {
  if (!diagnostic.observed) return "action_queue_transition_not_observed";
  if (diagnostic.code === "PGRST202") return "action_queue_transition_unavailable";
  if (
    diagnostic.http_status === 401 ||
    diagnostic.http_status === 403 ||
    diagnostic.code === "42501"
  ) {
    return "action_queue_transition_forbidden";
  }
  if (
    diagnostic.http_status === null ||
    diagnostic.http_status < 200 ||
    diagnostic.http_status >= 300
  ) {
    return "action_queue_transition_http_error";
  }
  if (diagnostic.body_kind === "expected_failure" && diagnostic.reason !== null) {
    return `action_queue_transition_${diagnostic.reason}`;
  }
  if (diagnostic.body_kind === "success") return null;
  if (diagnostic.body_kind === "error") return "action_queue_transition_rpc_error";
  return "action_queue_transition_malformed_response";
}

export function renderActionQueueTransitionDiagnostic(
  diagnostic: ActionQueueTransitionDiagnostic,
): string {
  return JSON.stringify(diagnostic);
}
