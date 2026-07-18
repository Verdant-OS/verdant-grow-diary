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
  | "note_too_long"
  | "invalid_sensor_value"
  | "photo_saving_not_enabled"
  | "target_not_owned"
  | "grow_not_owned"
  | "not_authenticated"
  | "save_failed"
  | (string & {});

export function quickLogReasonToOperatorMessage(
  reason: string | null | undefined,
): string {
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
    case "note_too_long":
      return "Note is too long. Shorten it and try again.";
    case "invalid_sensor_value":
      return "Sensor values must be numbers.";
    case "photo_saving_not_enabled":
      return "Photo saving is not enabled yet.";
    case "target_not_owned":
    case "grow_not_owned":
      return "Couldn't save this log because the selected grow, tent, or plant no longer matches your workspace. Re-select the plant and try again.";
    case "not_authenticated":
      return "Sign in to log entries.";
    case "save_failed":
      return "Could not save. Try again.";
    default:
      return "Could not save this log. Re-select the plant and try again.";
  }
}
