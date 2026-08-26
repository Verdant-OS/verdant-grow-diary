/**
 * quickLogSaveErrorMessage — operator-safe Quick Log save error copy.
 *
 * Pure helper. Translates RPC failure `reason` codes into a friendly,
 * non-leaking message for the operator. Never returns raw codes verbatim.
 *
 * Hard rules:
 *   - No tokens, endpoints, or raw payloads in returned copy.
 *   - Unknown reasons fall back to a calm generic message.
 *   - Single source of truth so QuickLog.tsx and QuickLogV2Sheet.tsx stay
 *     consistent.
 */

export type QuickLogSaveReason =
  | "no_selection"
  | "target_unresolved"
  | "selection_not_found"
  | "invalid_volume"
  | "temperature_out_of_range"
  | "humidity_out_of_range"
  | "vpd_out_of_range"
  | "invalid_sensor_value"
  | "photo_saving_not_enabled"
  | "target_not_owned"
  | "grow_not_owned"
  | "not_authenticated"
  | "save_failed"
  | "invalid_logged_at"
  | "invalid_details"
  | "invalid_target_type"
  | "missing_target_id"
  | "unsupported_action"
  | "invalid_idempotency_key"
  | "invalid_uuid_input"
  | "rpc_unavailable"
  | "not_authorized"
  | "network_error"
  | (string & {});

export function quickLogReasonToOperatorMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "no_selection":
    case "target_unresolved":
    case "selection_not_found":
      return "Choose a plant or tent before saving.";
    case "invalid_volume":
      return "Enter a watering volume greater than zero.";
    case "temperature_out_of_range":
      return "Temperature must be between -10 and 60°C.";
    case "humidity_out_of_range":
      return "Humidity must be between 0 and 100.";
    case "vpd_out_of_range":
      return "VPD must be between 0 and 10 kPa.";
    case "invalid_sensor_value":
      return "Sensor values must be numbers.";
    case "photo_saving_not_enabled":
      return "Photo saving is not enabled yet.";
    case "target_not_owned":
    case "grow_not_owned":
      return "Couldn't save this log because the selected grow, tent, or plant no longer matches your workspace. Re-select the plant and try again.";
    case "not_authenticated":
      return "Sign in to log entries.";
    case "invalid_logged_at":
      return "The server rejected the captured date and time for this entry.";
    case "invalid_details":
      return "The server rejected the extra details attached to this entry.";
    case "invalid_target_type":
    case "missing_target_id":
      return "The server could not tell which plant or tent this log belongs to.";
    case "unsupported_action":
      return "The server does not accept this activity type yet.";
    case "invalid_idempotency_key":
      return "The save reference for this entry was rejected.";
    case "invalid_uuid_input":
      return "The selected plant or tent reference is malformed.";
    case "rpc_unavailable":
      return "The save service is not available on this database yet.";
    case "not_authorized":
      return "Your account is not allowed to save this entry.";
    case "network_error":
      return "Could not reach the server.";
    case "save_failed":
      return "Could not save. Try again.";
    default:
      return "Could not save this log. Re-select the plant and try again.";
  }
}

/**
 * Short, imperative "what to do next" per failure reason. Kept separate from
 * the message so surfaces can render it as its own line or action hint.
 * Same no-leak rules as the messages: no raw codes, tokens, or endpoints.
 */
export function quickLogSaveRecoveryAction(reason: string | null | undefined): string {
  switch (reason) {
    case "no_selection":
    case "target_unresolved":
    case "selection_not_found":
    case "target_not_owned":
    case "grow_not_owned":
    case "invalid_target_type":
    case "missing_target_id":
    case "invalid_uuid_input":
      return "Re-select the grow, tent, and plant from the pickers, then save again.";
    case "invalid_volume":
      return "Enter a volume above zero and save again.";
    case "temperature_out_of_range":
    case "humidity_out_of_range":
    case "vpd_out_of_range":
    case "invalid_sensor_value":
      return "Correct the highlighted reading and save again.";
    case "invalid_logged_at":
      return "Re-pick the entry's date and time, or clear it to use the current time, then save again.";
    case "invalid_details":
      return "Remove the extra details from this entry and save again.";
    case "unsupported_action":
      return "Refresh the app to pick up the latest version, then log this as a note or watering.";
    case "invalid_idempotency_key":
      return "Close and reopen the log form, then save again — that creates a fresh save reference.";
    case "not_authenticated":
      return "Sign in again, then retry. Your input stays on this screen.";
    case "not_authorized":
      return "Sign out and back in. If it persists, the account lacks access to this workspace.";
    case "rpc_unavailable":
      return "Refresh the app and retry. If it persists, the database is behind the app version — an operator can confirm it on the Quick Log diagnostics screen.";
    case "network_error":
      return "Check your connection and retry. Your input stays on this screen.";
    case "photo_saving_not_enabled":
      return "Save the entry without the photo for now.";
    case "save_failed":
    default:
      return "Try again. If it keeps failing, an operator can see what the server rejected on the Quick Log diagnostics screen.";
  }
}

export interface QuickLogSaveFailureGuidance {
  message: string;
  recovery: string;
}

/** One call for surfaces that render message + recovery together. */
export function describeQuickLogSaveFailure(
  reason: string | null | undefined,
): QuickLogSaveFailureGuidance {
  return {
    message: quickLogReasonToOperatorMessage(reason),
    recovery: quickLogSaveRecoveryAction(reason),
  };
}

/**
 * Classify a thrown/transport-level `quicklog_save_manual` failure into a
 * reason code the mapper above understands.
 *
 * The RPC reports expected validation failures as `{ ok:false, reason }` —
 * those never reach this classifier. What does reach it:
 *   - PostgREST/Postgres errors (malformed uuid/timestamp literals, missing
 *     function after a migration gap, revoked EXECUTE, expired JWT), and
 *   - fetch-level failures (offline, DNS, proxy).
 * Every unrecognized shape stays the calm generic `save_failed`.
 */
export function classifyQuickLogThrownSaveError(error: unknown): QuickLogSaveReason {
  if (!error || typeof error !== "object") return "save_failed";
  const record = error as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  const status = typeof record.status === "number" ? record.status : null;

  if (code === "22P02") {
    return /uuid/i.test(message) ? "invalid_uuid_input" : "save_failed";
  }
  if (code === "22007" || code === "22008") return "invalid_logged_at";
  if (code === "PGRST202" || code === "42883") return "rpc_unavailable";
  if (code === "42501") return "not_authorized";
  if (code === "PGRST301" || status === 401) return "not_authenticated";
  if (
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)
  ) {
    return "network_error";
  }
  return "save_failed";
}
